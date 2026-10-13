/**
 * image-pipeline.ts
 *
 * Shared AI enrichment pipeline for any image uploaded to the platform:
 *
 *   Step 1 — Claude vision   : image → candidate noun list (description)
 *   Step 2 — Grounding DINO  : run detection against candidates + any
 *                               caller-supplied tags (merged, deduplicated)
 *   Step 3 — Filter          : keep only labels DINO could locate in the image
 *
 * Both steps always run.  Caller-supplied description / tags are respected
 * (description overrides the stored value; tags are merged into the DINO
 * query so DINO still verifies them).  The confirmed tags DINO found are
 * always the authoritative `tags` field stored in the library table.
 *
 * Used by:
 *  - POST /api/images/generate-object-question  (detect page)
 *  - POST /api/admin/library/upload             (super-admin dashboard)
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config/index";
import { logger } from "../../config/logger";
import { runClaudeJob } from "../claude/queue";
import {
  runDetection,
  type NormalisedDetection,
  type DetectionModel,
} from "../../api/images/detect-core";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupportedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

export interface TopicHint {
  id: string;
  name: string;
  contentCategoryName: string;
}

export interface PipelineResult {
  /** Raw noun list Claude identified in the image. */
  candidates: string[];
  /** Labels DINO could locate — stored as the authoritative tags. */
  confirmedTags: string[];
  /** Claude candidates joined as a string, unless overridden by caller. */
  description: string;
  /** Short topic label, e.g. "Chromosomes", "School Cafeteria". */
  imageConcept: string | null;
  /** Full DINO payload (detections + model name). */
  detectionResults: {
    detections: NormalisedDetection[];
    model: DetectionModel;
  };
  /** Topic IDs from the provided hint list that Claude thinks apply. Empty when no hints given. */
  suggestedTopicIds: string[];
}

// ── Anthropic client (lazy singleton) ────────────────────────────────────────

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

// ── Step 1: Claude vision → prose description + candidate noun list ────────────

interface DescribeResult {
  /** One or two sentence human-readable description of the image. */
  description: string;
  /** Short noun/noun-phrase list for Grounding DINO to locate. */
  nouns: string[];
  /** 1–4 word topic of what the image is about, Title Case. */
  concept: string | null;
}

async function describeImage(
  base64Data: string,
  mediaType: SupportedMediaType,
): Promise<DescribeResult> {
  const res = await runClaudeJob("vision.describe", () =>
    getClient().messages.create({
    model: config.anthropic.visionModel,
    max_tokens: 350,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data },
          },
          {
            type: "text",
            text: `Examine this image carefully and respond with a JSON object with exactly three keys:

"description": Two to three clear sentences describing the full scene in plain English, suitable as an image caption for an educational platform. The first sentence should name the main people and objects present — who is in the image and what objects are visible. The second (and optional third) sentence should describe the setting and any notable background or secondary details — for example furniture, appliances, fixtures, windows, people in the background, landscaping, or anything else clearly visible. Do NOT describe actions, gestures, poses, or expressions — describe what exists in the scene, not what people are doing.

"concept": A short 1–4 word Title Case label for WHAT THE IMAGE IS ABOUT — the topic a student would study, not a list of objects. If it is a science diagram of chromosomes, return "Chromosomes". If it is the water cycle, return "Water Cycle". If it is a historical map of the Oregon Trail, return "Oregon Trail". If there is no academic topic, name the scene: "School Cafeteria", "Classroom Library". Never a sentence. Never object names like "poster" or "laptop".

"nouns": An array of up to 20 noun/noun-phrase strings (1–3 words) identifying every notable object and person in the image. Use this priority order:
1. PEOPLE — include color/clothing so they can be told apart: "girl in purple hoodie", "boy in blue hoodie", "boy with glasses"
2. FOREGROUND OBJECTS — use simple, generic names: "textbook", "notebook", "water bottle", "laptop", "pencil", "marker"
3. WALL ITEMS — use generic category names only: "poster", "diagram", "sign", "whiteboard"
4. FURNITURE / FIXTURES — "table", "chair", "window", "bookshelf", "door"
5. BACKGROUND — "plant", "globe", "bin"

Rules:
- Use the SIMPLEST possible label for non-person objects: "textbook" not "science textbook"; "poster" not "think big poster"; "diagram" not "solar power diagram"; "bottle" not "water bottle with lightning bolt".
- For people only, add distinguishing color/clothing detail.
- Concrete and visually identifiable only; no verbs; no sentences; lowercase; deduplicated.
- NEVER read, quote, or reference text written on signs, murals, posters, whiteboards, or any other surface. Label the object only ("mural", "sign", "poster", "whiteboard") — not what it says.

Reply with ONLY valid JSON — no markdown fences, no explanation.

Example:
{"description":"A woman in a red dress smiles while standing in a park.","concept":"City Park","nouns":["woman in red dress","park bench","sneakers","handbag","oak tree"]}`,
          },
        ],
      },
    ],
  }),
  );

  const raw = (res.content[0] as { type: string; text: string }).text.trim();
  // Strip any markdown fences Claude might add
  const clean = raw
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(clean) as {
      description?: unknown;
      nouns?: unknown;
      concept?: unknown;
    };
    const description =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : "";
    const rawConcept =
      typeof parsed.concept === "string" ? parsed.concept.trim() : "";
    const concept = rawConcept
      ? rawConcept.replace(/\.$/, "").split(/\s+/).slice(0, 4).join(" ")
      : null;
    const nouns = Array.isArray(parsed.nouns)
      ? (parsed.nouns as unknown[])
          .filter(
            (n): n is string => typeof n === "string" && n.trim().length > 0,
          )
          .map((n) => n.trim().toLowerCase())
      : [];
    if (!description && nouns.length === 0) {
      throw new Error("Empty response");
    }
    return { description, nouns, concept };
  } catch {
    // Fallback: treat the whole text as a comma-separated noun list (old behaviour)
    logger.warn(
      { raw },
      "image-pipeline: describeImage JSON parse failed, falling back to noun list",
    );
    const nouns = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return { description: nouns.join(", "), nouns, concept: null };
  }
}

// ── Step 3: topic matching (text-only, no image re-send) ─────────────────────

async function suggestTopics(
  description: string,
  tags: string[],
  topics: TopicHint[],
): Promise<string[]> {
  if (topics.length === 0) return [];

  const topicList = topics
    .map((t) => `${t.id} | ${t.contentCategoryName} > ${t.name}`)
    .join("\n");

  const res = await runClaudeJob("vision.topics", () =>
    getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are categorising an educational image into content topics.

Image description: "${description}"
Detected objects/tags: ${tags.join(", ")}

Available topics (id | content category > topic):
${topicList}

Select every topic that clearly applies to this image based on the description and tags.
Reply with ONLY a valid JSON array of the matching topic IDs — nothing else.
Example: ["uuid-1", "uuid-2"]
If nothing matches, reply with: []`,
      },
    ],
  }),
  );

  const raw = (res.content[0] as { type: string; text: string }).text.trim();
  // Strip any markdown fences Claude might add
  const clean = raw
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  try {
    const ids: unknown = JSON.parse(clean);
    if (!Array.isArray(ids)) return [];
    // Only keep IDs that actually exist in our topic list
    const validIds = new Set(topics.map((t) => t.id));
    return ids.filter(
      (id): id is string => typeof id === "string" && validIds.has(id),
    );
  } catch {
    logger.warn({ raw }, "image-pipeline: topic suggestion JSON parse failed");
    return [];
  }
}

// ── Public pipeline ───────────────────────────────────────────────────────────

/**
 * Run the full Claude + Grounding DINO pipeline on an image.
 *
 * @param image       Full base64 data URI (data:image/jpeg;base64,...)
 * @param base64Data  The raw base64 portion only (after the comma)
 * @param mediaType   MIME type extracted from the data URI header
 * @param overrides   Optional caller-supplied metadata:
 *                    - `description` overrides what gets stored in the DB
 *                    - `tags` are merged with Claude's candidates as extra
 *                      labels for DINO to verify (DINO still runs regardless)
 *                    - `topics` list of all known topics; when provided Claude
 *                      will suggest which ones apply to this image
 */
export async function runImagePipeline(
  image: string,
  base64Data: string,
  mediaType: SupportedMediaType,
  overrides?: { description?: string; tags?: string[]; topics?: TopicHint[] },
): Promise<PipelineResult> {
  // Step 1 — Claude vision: always run to get prose description + noun list
  logger.info("image-pipeline: step 1 — Claude vision description");
  const {
    description: aiDescription,
    nouns,
    concept: imageConcept,
  } = await describeImage(base64Data, mediaType);
  logger.info(
    { nouns, aiDescription, imageConcept },
    "image-pipeline: step 1 done",
  );

  // `candidates` is the noun list used for DINO and topic suggestion.
  const candidates = nouns;

  if (candidates.length === 0) {
    throw new Error("Could not identify any objects in this image");
  }

  // Small objects that Claude reliably misses when the noun budget is full
  // (e.g. pencils on a busy classroom table).  Always pass these to DINO so it
  // has a chance to locate them even when they don't appear in the description.
  // DINO + visionVerify will reject them if they're not actually present.
  // Small objects Claude tends to drop when its noun budget is full.
  // Now that Claude uses simple labels ("textbook", "pen") these are fewer —
  // we only need the ones Claude still misses most often.
  const ALWAYS_CHECK = ["pencil", "pen", "marker", "eraser", "book"];

  // Step 2 — merge candidates with always-check labels + any caller-supplied tags (DINO input)
  const dinoLabels = [
    ...candidates,
    ...ALWAYS_CHECK,
    ...(overrides?.tags ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  // Step 3 — build description: caller override wins; otherwise use Claude's prose sentence
  const description = overrides?.description?.trim()
    ? overrides.description.trim()
    : aiDescription || candidates.join(", ");

  // Steps 2 & 4 — run DINO verification and topic suggestion concurrently;
  // both only need `candidates` / `dinoLabels` from step 1.
  logger.info(
    { dinoLabels },
    "image-pipeline: steps 2+4 — Grounding DINO + topic suggestion (concurrent)",
  );

  const [dinoResult, suggestedTopicIds] = await Promise.all([
    // Step 2: Grounding DINO — optional; sidecar can be down or started later
    runDetection(image, dinoLabels)
      .then((result) => {
        logger.info(
          {
            confirmedTags: [...new Set(result.detections.map((d) => d.label))],
            model: result.model,
          },
          "image-pipeline: step 2 done",
        );
        return result;
      })
      .catch((err: unknown) => {
        logger.warn({ err }, "image-pipeline: step 2 DINO skipped (sidecar unavailable)");
        return { detections: [] as NormalisedDetection[], model: "grounding_dino" as DetectionModel };
      }),

    // Step 4: topic suggestion — uses candidates (step 1 output), not confirmedTags
    (async (): Promise<string[]> => {
      if (!overrides?.topics || overrides.topics.length === 0) return [];
      logger.info("image-pipeline: step 4 — topic suggestion");
      try {
        const ids = await suggestTopics(
          description,
          candidates,
          overrides.topics,
        );
        logger.info({ suggestedTopicIds: ids }, "image-pipeline: step 4 done");
        return ids;
      } catch (err) {
        logger.warn(
          { err },
          "image-pipeline: step 4 topic suggestion failed (non-fatal)",
        );
        return [];
      }
    })(),
  ]);

  const { detections, model } = dinoResult;
  const confirmedTags = detections.length > 0
    ? [...new Set(detections.map((d) => d.label))]
    : [...candidates];

  return {
    candidates,
    confirmedTags,
    description,
    imageConcept,
    detectionResults: { detections, model },
    suggestedTopicIds,
  };
}
