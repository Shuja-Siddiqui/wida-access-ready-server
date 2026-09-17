/**
 * claudeLocate.ts
 *
 * Fallback spatial localisation using Claude Haiku Vision.
 *
 * When Grounding DINO cannot locate a label (no bounding box returned),
 * this module sends the full image to Claude Haiku and asks it to estimate
 * normalised bounding-box coordinates for each unconfirmed label.
 *
 * Output boxes are tagged with `source: "claude"` so callers can distinguish
 * them from DINO-produced boxes. Claude's spatial estimates are less precise
 * than DINO's, but they handle semantically rich labels ("girl in purple
 * hoodie", "solar power poster") that DINO cannot ground.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config/index";
import { logger } from "../../config/logger";
import { runClaudeJob } from "../claude/queue";
import type { NormalisedDetection } from "../../api/images/detect-core";

// ── Client ────────────────────────────────────────────────────────────────────

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

const MODEL = "claude-haiku-4-5";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocatedDetection extends NormalisedDetection {
  /** "dino" for Grounding DINO boxes, "claude" for Claude-estimated boxes */
  source: "dino" | "claude";
}

// ── Core: ask Claude to locate multiple labels in one call ────────────────────

interface ClaudeBoxResult {
  label:  string;
  found:  boolean;
  box?:   { x: number; y: number; width: number; height: number };
  score?: number;
}

async function askClaudeToLocate(
  imageDataUri: string,
  labels: string[],
): Promise<ClaudeBoxResult[]> {
  const [header, b64] = imageDataUri.split(",", 2);
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mimeType = (mimeMatch?.[1] ?? "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/gif";

  const labelList = labels.map((l, i) => `${i + 1}. "${l}"`).join("\n");

  const msg = await runClaudeJob("vision.locate", () =>
    getClient().messages.create({
    model:      MODEL,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          {
            type:   "image",
            source: { type: "base64", media_type: mimeType, data: b64 ?? "" },
          },
          {
            type: "text",
            text: `You are a spatial localisation assistant. For each object listed below, determine if it is visible in the image and estimate its bounding box.

Objects to locate:
${labelList}

For each object respond with a JSON array entry:
- "label": the exact label string from the list
- "found": true if clearly visible, false if absent or not clear enough to box
- "box": when found=true, an object with keys x, y, width, height — all normalised 0.0–1.0 where (0,0) is top-left of the image
- "score": your confidence 0.0–1.0 when found=true

Return ONLY a valid JSON array — no markdown, no explanation.

Example:
[
  {"label":"girl in purple hoodie","found":true,"box":{"x":0.05,"y":0.1,"width":0.2,"height":0.6},"score":0.85},
  {"label":"solar power diagram","found":false}
]`,
          },
        ],
      },
    ],
  }),
  );

  const block = msg.content[0];
  const raw   = block?.type === "text" ? block.text.trim() : "[]";
  const clean = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();

  try {
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) throw new Error("Not an array");
    return parsed as ClaudeBoxResult[];
  } catch (err) {
    logger.warn({ err, raw }, "claudeLocate: JSON parse failed");
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Try to locate `labels` in `imageDataUri` using Claude Haiku Vision.
 *
 * Returns a `LocatedDetection[]` for every label Claude found.
 * Labels Claude says are not visible are omitted from the result.
 * Fails open (returns empty array) on any Claude error.
 *
 * @param imageDataUri  Full base64 data URI
 * @param labels        Labels that Grounding DINO could NOT locate
 */
export async function claudeLocateMissed(
  imageDataUri: string,
  labels: string[],
): Promise<LocatedDetection[]> {
  if (labels.length === 0) return [];

  logger.info({ labels }, "claudeLocate: asking Claude Haiku to locate DINO-missed labels");

  try {
    const results = await askClaudeToLocate(imageDataUri, labels);

    const located: LocatedDetection[] = [];

    for (const r of results) {
      if (!r.found || !r.box) continue;

      // Clamp all coordinates to [0, 1]
      const x      = Math.max(0, Math.min(1, r.box.x      ?? 0));
      const y      = Math.max(0, Math.min(1, r.box.y      ?? 0));
      const width  = Math.max(0.01, Math.min(1 - x, r.box.width  ?? 0.1));
      const height = Math.max(0.01, Math.min(1 - y, r.box.height ?? 0.1));

      located.push({
        label:  r.label,
        score:  Math.max(0, Math.min(1, r.score ?? 0.7)),
        box:    { x, y, width, height },
        source: "claude",
      });
    }

    logger.info(
      { located: located.map((d) => d.label), skipped: labels.length - located.length },
      "claudeLocate: done",
    );

    return located;
  } catch (err) {
    logger.warn({ err }, "claudeLocate: error, returning empty (fail-open)");
    return [];
  }
}
