/**
 * Image-library listening content generator — WIDA levels 0-2.
 * Takes a real library photo + DINO-confirmed object tags and produces:
 *   - A short spoken passage describing the scene
 *   - 2 object-tap comprehension questions
 */

import { callClaude, toDisplayText, limitSentences } from "./client";
import { logger } from "../../config/logger";
import { contentGenPrompt } from "./prompts/content";
import { buildSystemPrompt } from "./prompts/compose";
import { clampToThreeOptions } from "../choice-options";
import { serializeCanDoForPrompt } from "../listeningContentEngine";

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
  canDo: { keyUse: string; action: string; items: string[] };
  topic: string;
  lastSessionScore?: number | null;
}): Promise<ImagePassageContent> {
  const {
    imageDescription,
    imageTags,
    level,
    fractionalLevel,
    stepWithinLevel,
    complexityInstruction,
    canDo,
    topic,
    lastSessionScore,
  } = params;

  const canDoDescriptor =
    level === 1
      ? "Level 1 (Entering): identify named objects in a simple scene using visual and oral support"
      : "Level 2 (Emerging): locate specific objects in a scene after hearing a short descriptive passage";

  const BASE_SENTENCE_TARGETS: Record<number, string> = {
    1: "1–3 very short sentences (~12–35 words). Subject-verb-object. No extra background.",
    2: "1–3 short sentences (~18–45 words). One idea each. Do not write a paragraph.",
  };
  const base = BASE_SENTENCE_TARGETS[level] ?? BASE_SENTENCE_TARGETS[2];
  const ku = canDo.keyUse;

  let passageSentenceTarget = `${base} Every question target object must be named by its exact label in the passage.`;
  if (level <= 1 && ku === "Explain") {
    passageSentenceTarget = `${base} Name 1 target by its exact label AND its function (e.g. "People sit on chairs."). The question asks the FUNCTION — never repeat the object label in the question text.`;
  } else if (level >= 2 && ku === "Narrate") {
    passageSentenceTarget = `${base} Name 3 image_tags in time order (first, then, last) as a short story. Q1 is the first tag; Q2 is the last tag.`;
  } else if (level >= 2 && ku === "Inform") {
    passageSentenceTarget = `${base} Name 3 image_tags in order as a fact process (first, then, last), not a character plot. Q1 first tag; Q2 last tag.`;
  } else if (level >= 2 && ku === "Explain") {
    passageSentenceTarget = `${base} Name 2 image_tags and compare or classify them (size, job, group) or state cause/effect. The question asks which object matches — do not only say "Find the [tag]."`;
  } else if (level >= 2 && ku === "Argue") {
    passageSentenceTarget = `${base} Use 2 real image_tags as evidence (amount or what is there). Q1 true claim (agree). Q2 false claim (disagree).`;
  } else if (ku === "Explain") {
    passageSentenceTarget = `${base} Each target object must be named by its exact label AND its function must be stated (e.g. "People sit on chairs." / "Students write with pencils."). The question will ask about the FUNCTION — never repeat the object label in the question text.`;
  }

  const prompt = JSON.stringify({
    required_key_use: canDo.keyUse,
    integer_level: level,
    current_score: fractionalLevel,
    step_within_level: stepWithinLevel,
    level_label: canDoDescriptor,
    can_do: serializeCanDoForPrompt(canDo, { level, domain: "LISTENING" }),
    complexity_instruction: complexityInstruction,
    passage_sentence_target: passageSentenceTarget,
    topic,
    last_session_score: lastSessionScore ?? null,
    question_count: 2,
    image_description: imageDescription,
    image_tags: imageTags,
  });

  try {
    const result = (await callClaude(
      buildSystemPrompt(contentGenPrompt("listening", Math.max(1, Math.min(level, 2)))),
      prompt,
      2000,
    )) as Record<string, unknown>;
    const questions = (result.questions as Array<Record<string, unknown>>) ?? [];

    const rawPassage = result.audio_script ?? result.passage;
    const passage = limitSentences(toDisplayText(rawPassage), 3);

    logger.info(
      { keyUse: canDo.keyUse, passage: passage.slice(0, 120), questionCount: questions.length },
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
    logger.error({ err, keyUse: canDo.keyUse }, "generateImagePassageContent failed");
    throw err;
  }
}
