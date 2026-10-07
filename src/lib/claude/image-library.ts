/**
 * Image-library listening content generator — WIDA levels 0-2.
 * Takes a real library photo + DINO-confirmed object tags and produces:
 *   - A short spoken passage describing the scene
 *   - 2 object-tap comprehension questions
 */

import { callClaude, toDisplayText } from "./client";
import { logger } from "../../config/logger";
import { contentGenPrompt } from "./prompts/content";
import { clampToThreeOptions } from "../choice-options";
import { serializeFrameworkTask, type FrameworkTask } from "./standards/2020";
import { dumpContentGenRequest } from "./dump-content-gen";
import { mergePriorPractice, type PracticeReport } from "../practice-report";
import { buildWritingPassageSentenceTarget } from "./prompts/content/writing-image-passage";
import { listeningL12AvailableFormats } from "../content/formatCapabilities";

/** Prefer Claude's own stem. Do not invent student-facing question text. */
export function resolvePictureListeningQuestion(
  raw: unknown,
  _kind: "yes_no" | "tap",
  _targetLabel: string,
): string {
  return toDisplayText(
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).question
        ?? (raw as Record<string, unknown>).statement
        ?? (raw as Record<string, unknown>).claim
        ?? (raw as Record<string, unknown>).prompt
      : raw,
  ).trim();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImagePassageQuestion =
  | {
      id: string;
      type: "image_object_tap";
      question: string;
      targetLabel: string;
      options: string[];
      correct: number;
      explanation: string;
    }
  | {
      id: string;
      type: "image_explain_mc";
      question: string;
      options: string[];
      correct: number;
      targetLabel: string;
      explanation: string;
    }
  | {
      id: string;
      type: "image_yes_no";
      question: string;
      correctAnswer: "agree" | "disagree";
      targetLabel: string;
      explanation: string;
    };

export interface ImagePassageContent {
  passage: string;
  questions: ImagePassageQuestion[];
}

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Generates a short image-based listening passage + object-tap questions
 * for library images used at levels 0–2.
 */
export async function generateImagePassageContent(params: {
  imageDescription: string;
  imageTags: string[];
  level: number;           // integer: 0, 1, or 2
  fractionalLevel: number; // e.g. 1.4
  stepWithinLevel: number; // 0 Entry → 4 Advanced
  complexityInstruction: string;
  framework: FrameworkTask;
  topic: string;
  lastSessionScore?: number | null;
  priorPracticeReport?: PracticeReport | null;
}): Promise<ImagePassageContent> {
  const {
    imageDescription,
    imageTags,
    level,
    fractionalLevel,
    stepWithinLevel,
    complexityInstruction,
    framework,
    topic,
    lastSessionScore,
    priorPracticeReport,
  } = params;

  const canDoDescriptor =
    level === 1
      ? "Level 1 (Entering): identify named objects in a simple scene using visual and oral support"
      : "Level 2 (Emerging): locate specific objects in a scene after hearing a short descriptive passage";

  const BASE_SENTENCE_TARGETS: Record<number, string> = {
    1: "3–4 short sentences (~40–70 words). Subject-verb-object. Minimal extra background.",
    2: "4–5 short sentences (~55–90 words). One idea each. Still short — this is not a full paragraph.",
  };
  const base = BASE_SENTENCE_TARGETS[level] ?? BASE_SENTENCE_TARGETS[2];
  const ku = framework.key_language_use;

  const passageSentenceTarget = `${base} ${buildWritingPassageSentenceTarget(level, ku)} Choose question types from available_question_formats using framework.language_functions. Tap targets must be exact image_tags named in the audio.`;

  const prompt = JSON.stringify(mergePriorPractice({
    required_key_use: ku,
    integer_level: level,
    current_score: fractionalLevel,
    step_within_level: stepWithinLevel,
    level_label: canDoDescriptor,
    framework: serializeFrameworkTask(framework),
    complexity_instruction: complexityInstruction,
    passage_sentence_target: passageSentenceTarget,
    topic,
    last_session_score: lastSessionScore ?? null,
    question_count: 2,
    available_question_formats: listeningL12AvailableFormats(),
    image_description: imageDescription,
    image_tags: imageTags,
  }, priorPracticeReport));

  const systemPrompt = contentGenPrompt("listening", Math.max(1, Math.min(level, 2)));
  dumpContentGenRequest("listening-image", systemPrompt, prompt);
  try {
    const result = (await callClaude(
      systemPrompt,
      prompt,
      2000,
    )) as Record<string, unknown>;
    const questions = (result.questions as Array<Record<string, unknown>>) ?? [];

    const rawPassage = result.audio_script ?? result.passage;
    const passage = toDisplayText(rawPassage);

    logger.info(
      { keyUse: ku, passage: passage.slice(0, 120), questionCount: questions.length },
      "generateImagePassageContent: raw result",
    );

    if (!passage.trim()) {
      throw new Error("Claude returned an empty audio_script/passage — using fallback");
    }

    const mapped = questions.map((q, i): ImagePassageQuestion => {
        if (q.type === "image_yes_no") {
          const correctAnswer =
            (q.correct_answer as string) === "disagree" ? "disagree" : "agree";
          const targetLabel = toDisplayText(q.target_label ?? "");
          return {
            id: String(q.id ?? i + 1),
            type: "image_yes_no",
            question: resolvePictureListeningQuestion(q, "yes_no", targetLabel),
            correctAnswer,
            targetLabel,
            explanation: toDisplayText(q.explanation ?? ""),
          };
        }
        if (q.type === "image_explain_mc") {
          const three = clampToThreeOptions(
            Array.isArray(q.options) ? q.options : imageTags.slice(0, 3),
            q.correct,
          );
          const targetLabel = toDisplayText(q.target_label ?? three.options[three.correct] ?? imageTags[i] ?? "");
          return {
            id: String(q.id ?? i + 1),
            type: "image_explain_mc",
            question: resolvePictureListeningQuestion(q, "tap", targetLabel),
            options: three.options,
            correct: three.correct,
            targetLabel,
            explanation: toDisplayText(q.explanation ?? ""),
          };
        }
        const three = clampToThreeOptions(
          Array.isArray(q.options) ? q.options : imageTags.slice(0, 3),
          q.correct,
        );
        const targetLabel = toDisplayText(q.target_label ?? three.options[three.correct] ?? imageTags[i] ?? "");
        return {
          id: String(q.id ?? i + 1),
          type: "image_object_tap",
          question: resolvePictureListeningQuestion(q, "tap", targetLabel),
          targetLabel,
          options: three.options,
          correct: three.correct,
          explanation: toDisplayText(q.explanation ?? ""),
        };
      });
    if (mapped.some((q) => !q.question.trim())) {
      throw new Error("Claude omitted student-facing question text");
    }
    return {
      passage,
      questions: mapped,
    };
  } catch (err) {
    logger.error({ err, keyUse: ku }, "generateImagePassageContent failed");
    throw err;
  }
}
