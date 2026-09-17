/**
 * Claude Haiku Vision verification pass.
 *
 * After Grounding DINO returns bounding boxes, crop each region and ask
 * Claude "Does this image show a [label]? Reply YES or NO."
 * Discard boxes Claude rejects. Fail-open on any Claude error.
 */

import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { config } from "../../config/index";
import { logger } from "../../config/logger";
import { runClaudeJob } from "../claude/queue";
import type { NormalisedDetection } from "../../api/images/detect-core";

// ── Anthropic client (matches the pattern in claude-content.ts) ────────────
//
// config.anthropic already implements the correct selection logic:
//   - ANTHROPIC_API_KEY present → baseUrl is "" → hit api.anthropic.com directly
//   - No direct key → use the Replit AI Integrations proxy URL
//
// Only supply baseURL when non-empty so the SDK doesn't override its default.

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const { baseUrl, apiKey } = config.anthropic;
    _client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
  }
  return _client;
}

// claude-haiku-4-5 is the fastest/cheapest model for a simple yes/no vision check
const MODEL = "claude-haiku-4-5";

// ── Helpers ───────────────────────────────────────────────────────────────────

function dataUriToBuffer(dataUri: string): { buffer: Buffer; mimeType: string } {
  const [header, b64] = dataUri.split(",", 2);
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mimeType = mimeMatch?.[1] ?? "image/jpeg";
  return { buffer: Buffer.from(b64 ?? "", "base64"), mimeType };
}

async function cropDetection(
  imageBuffer: Buffer,
  detection: NormalisedDetection,
  imgWidth: number,
  imgHeight: number,
): Promise<Buffer> {
  const left = Math.max(0, Math.round(detection.box.x * imgWidth));
  const top = Math.max(0, Math.round(detection.box.y * imgHeight));
  const width = Math.min(
    imgWidth - left,
    Math.max(1, Math.round(detection.box.width * imgWidth)),
  );
  const height = Math.min(
    imgHeight - top,
    Math.max(1, Math.round(detection.box.height * imgHeight)),
  );

  return sharp(imageBuffer)
    .extract({ left, top, width, height })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Returns true if the crop is too small to reliably verify.
 * Very small crops (≤ 40×40 px) are ambiguous even to Claude — fail-open.
 */
async function isTooSmall(cropBuffer: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(cropBuffer).metadata();
    return (meta.width ?? 0) <= 40 || (meta.height ?? 0) <= 40;
  } catch {
    return false;
  }
}

async function askClaude(cropBuffer: Buffer, label: string): Promise<boolean> {
  // Grammatically correct question: avoid "a pencils", "a glasses", etc.
  const article = /s$/i.test(label.trim()) ? "" : "a ";
  const question = `Does this image contain ${article}${label}? Reply YES or NO.`;

  const msg = await runClaudeJob("vision.verify", () =>
    getClient().messages.create({
    model: MODEL,
    max_tokens: 10,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: cropBuffer.toString("base64"),
            },
          },
          { type: "text", text: question },
        ],
      },
    ],
  }),
  );

  const block = msg.content[0];
  const text = block?.type === "text" ? block.text.trim().toUpperCase() : "";
  return text.startsWith("YES");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify each DINO detection with Claude Haiku Vision.
 * Returns only the detections Claude confirms. Fails open (keeps detection)
 * if Claude is unavailable or throws.
 */
export async function verifyDetections(
  imageDataUri: string,
  detections: NormalisedDetection[],
): Promise<NormalisedDetection[]> {
  if (detections.length === 0) return detections;

  const { buffer: imageBuffer } = dataUriToBuffer(imageDataUri);
  let imgWidth: number;
  let imgHeight: number;

  try {
    const meta = await sharp(imageBuffer).metadata();
    imgWidth = meta.width ?? 1;
    imgHeight = meta.height ?? 1;
  } catch (err) {
    logger.warn({ err }, "visionVerify: could not read image metadata — skipping verification");
    return detections;
  }

  // Run verifications in parallel with a concurrency cap to avoid rate limits.
  // Sequential was the main bottleneck: 55 boxes × ~1s = 55s → now ~8s.
  const CONCURRENCY = 8;
  let rejected = 0;

  async function verifyOne(detection: NormalisedDetection): Promise<NormalisedDetection | null> {
    try {
      const cropBuffer = await cropDetection(imageBuffer, detection, imgWidth, imgHeight);

      // Skip verification for very small crops — Claude is unreliable on tiny
      // regions (e.g. pencils lying flat, small accessories). Fail-open: keep.
      if (await isTooSmall(cropBuffer)) {
        logger.info({ label: detection.label, score: detection.score }, "visionVerify: crop too small, keeping (fail-open)");
        return detection;
      }

      const ok = await askClaude(cropBuffer, detection.label);
      if (ok) return detection;

      rejected++;
      logger.info(
        { label: detection.label, score: detection.score, box: detection.box },
        "visionVerify: Claude rejected box",
      );
      return null;
    } catch (err) {
      logger.warn({ err, label: detection.label }, "visionVerify: Claude error, keeping detection");
      return detection;
    }
  }

  // Process in chunks of CONCURRENCY
  const verified: NormalisedDetection[] = [];
  for (let i = 0; i < detections.length; i += CONCURRENCY) {
    const chunk = detections.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(verifyOne));
    for (const r of results) {
      if (r !== null) verified.push(r);
    }
  }

  logger.info(
    { before: detections.length, after: verified.length, rejected },
    "visionVerify: complete",
  );
  return verified;
}

// Exported for testing only — allows injecting a mock client
export { getClient as _getClientForTest };
