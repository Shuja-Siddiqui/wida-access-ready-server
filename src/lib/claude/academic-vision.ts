/**
 * Claude Vision analysis for academic library images.
 *
 * Produces a concept-accurate description so the passage generator
 * writes about what the image TEACHES, not just what objects are in it.
 *
 * Bounding boxes for tap targets always come from Grounding DINO separately —
 * this module does NOT generate coordinates.
 *
 * Results stored in library.academic_vision keyed by AcademicSubject.
 */

import { getClient } from "./client";
import { db } from "../../../db";
import { libraryTable } from "../../../db/schema/library";
import { eq } from "drizzle-orm";
import { logger } from "../../config/logger";
import { config } from "../../config";
import { ObjectStorageService } from "../objectStorage";
import type { AcademicSubject } from "../listeningContentEngine";
import type { AcademicVisionResult } from "../../../db/schema/library";

export type { AcademicVisionResult };
export type AcademicVisionMap = Partial<Record<AcademicSubject, AcademicVisionResult>>;

const storage = new ObjectStorageService();

const SUBJECT_INSTRUCTIONS: Record<AcademicSubject, string> = {
  math:
    "Focus on mathematical concepts: shapes, measurements, graphs, equations, or numerical relationships.",
  science:
    "Focus on scientific concepts: biological structures, chemical processes, physical phenomena, ecosystems, or instruments.",
  social_studies:
    "Focus on historical, geographic, or civic concepts: events, maps, artifacts, cultural symbols, or government structures.",
  ela:
    "Focus on literacy concepts: text structures, narrative elements, communication tools, or literacy artifacts.",
};

const SYSTEM_PROMPT = `You analyze educational images for ELL curriculum (Grade 6–8, WIDA levels 1–2).
Return ONLY valid JSON. No preamble, no markdown, no code fences.`;

export async function analyzeImageForSubject(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
  subject: AcademicSubject,
): Promise<AcademicVisionResult> {
  const claude = getClient();

  const userPrompt = `Identify the academic idea this educational image is meant to teach. Use visible objects only as anchors for that idea.

${SUBJECT_INSTRUCTIONS[subject]}

Do NOT narrate the photograph. Do NOT say who is in the picture, who is holding an object, poses, gestures, or "a child/student is using X".

Return exactly this JSON:
{
  "topic": "1–4 word Title Case label of the academic topic (e.g. Chromosomes, Cell Membrane, Water Cycle, Oregon Trail). Not a sentence. Not object names like poster or laptop.",
  "concept": "One sentence naming the main academic concept this image illustrates.",
  "description": "2–3 sentences that TEACH the concept in simple present tense for Grade 6–8 ELL students. Name the concept first. Then explain it using generic classroom language (scientists, students, people). You may mention object types that appear (beaker, diagram, map) as tools of the concept — never as a photo caption. Example: 'Laboratory safety means protecting your eyes and skin during experiments. Scientists wear goggles and use beakers to hold liquids.'"
}`;

  const response = await claude.messages.create({
    model:      config.anthropic.visionModel,
    max_tokens: 300,
    system:     SYSTEM_PROMPT,
    messages: [{
      role:    "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
        { type: "text", text: userPrompt },
      ],
    }],
  });

  const text    = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```\s*$/, "").trim();
  const parsed  = JSON.parse(cleaned) as Partial<AcademicVisionResult> & { topic?: unknown };

  if (typeof parsed.concept !== "string" || typeof parsed.description !== "string") {
    throw new Error(`Invalid vision response for subject=${subject}`);
  }

  const topic =
    typeof parsed.topic === "string" && parsed.topic.trim()
      ? parsed.topic.trim().replace(/\.$/, "").split(/\s+/).slice(0, 4).join(" ")
      : undefined;

  return {
    concept: parsed.concept.trim(),
    description: parsed.description.trim(),
    ...(topic ? { topic } : {}),
  };
}

export async function processAcademicVisionForImage(
  imageId:      string,
  s3Key:        string,
  contexts:     string[],
  imageBase64?: string,
  contentType?: string,
): Promise<AcademicVisionMap> {
  const subjects: AcademicSubject[] = contexts
    .map((c) => c.match(/^academic:(.+)$/)?.[1])
    .filter((s): s is AcademicSubject => !!s);

  if (subjects.length === 0) return {};

  let base64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  if (imageBase64) {
    base64    = imageBase64;
    mediaType = (contentType ?? "image/jpeg") as typeof mediaType;
  } else {
    try {
      const { buffer, contentType: ct } = await storage.getImageBuffer(s3Key);
      base64    = buffer.toString("base64");
      mediaType = (ct ?? "image/jpeg") as typeof mediaType;
    } catch (err) {
      logger.error({ err, imageId }, "academic-vision: failed to download image");
      return {};
    }
  }

  const results: AcademicVisionMap = {};
  for (const subject of subjects) {
    try {
      logger.info({ imageId, subject }, "academic-vision: analysing");
      results[subject] = await analyzeImageForSubject(base64, mediaType, subject);
      logger.info({ imageId, subject, concept: results[subject]!.concept }, "academic-vision: done");
    } catch (err) {
      logger.warn({ err, imageId, subject }, "academic-vision: failed, skipping");
    }
  }

  if (Object.keys(results).length > 0) {
    const SUBJECT_PRIORITY: AcademicSubject[] = ["science", "math", "social_studies", "ela"];
    const picked =
      SUBJECT_PRIORITY.map((s) => results[s]).find((r) => r?.topic || r?.concept) ??
      Object.values(results).find((r) => r?.topic || r?.concept);
    const autoConcept = picked?.topic
      ?? picked?.concept?.split(/[.:,]/)[0]?.trim().split(/\s+/).slice(0, 4).join(" ");

    await db
      .update(libraryTable)
      .set({
        academicVision: results,
        ...(autoConcept ? { imageConcept: autoConcept } : {}),
      })
      .where(eq(libraryTable.id, imageId));
  }

  return results;
}
