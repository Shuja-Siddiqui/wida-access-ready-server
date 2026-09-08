/**
 * Object-detect content generator — single tap question from a list of visible nouns.
 * Used in the legacy generate-question route for inline image annotation.
 */

import { callClaude } from "./client";
import { logger } from "../../config/logger";
import { clampToThreeOptions } from "../choice-options";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an object-detection question generator for an ELL app.
Given image_description (a comma-separated list of visible objects), produce one tap question.

RULES
1. Pick exactly 3 objects from image_description as options (1 correct + 2 distractors). Never invent objects.
2. Ask the student to tap one specific object: "Tap the [object]."
3. options[correct] must match the object in the question exactly.
4. options are lowercase 1–3 word nouns taken directly from image_description.
5. Return ONLY valid JSON — flat object, no wrapper. No preamble, no markdown, no code fences.

OUTPUT SCHEMA
{"question": "Tap the [object].", "options": ["obj1", "obj2", "obj3"], "correct": 0}`;

// ── Type ──────────────────────────────────────────────────────────────────────

export interface ObjectDetectContent {
  question: string;
  options: string[];
  correct: number;
}

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Generates an object-detect tap question.
 * imageDescription is the comma-separated noun list produced by the vision call.
 */
export async function generateObjectDetectContent(
  imageDescription: string,
  /** Force this label to be the correct answer. */
  targetLabel?: string,
): Promise<ObjectDetectContent> {
  const prompt = JSON.stringify({
    image_description: imageDescription,
    ...(targetLabel ? { forced_correct_label: targetLabel } : {}),
  });

  try {
    const raw = (await callClaude(SYSTEM_PROMPT, prompt)) as Record<string, unknown>;

    // Claude may return the flat shape directly OR wrap it in a questions array.
    if (
      typeof raw.question === "string" &&
      Array.isArray(raw.options) &&
      typeof raw.correct === "number"
    ) {
      return {
        question: raw.question,
        ...clampToThreeOptions(raw.options, raw.correct),
      };
    }

    const questions = Array.isArray(raw.questions) ? raw.questions : [];
    const first = questions[0] as Record<string, unknown> | undefined;
    if (
      first &&
      typeof first.question === "string" &&
      Array.isArray(first.options) &&
      typeof first.correct === "number"
    ) {
      return {
        question: first.question,
        ...clampToThreeOptions(first.options, first.correct),
      };
    }

    logger.error({ raw }, "generateObjectDetectContent: unrecognised shape");
    throw new Error("Unexpected shape from model");
  } catch (err) {
    logger.error({ err }, "generateObjectDetectContent failed");
    throw err;
  }
}
