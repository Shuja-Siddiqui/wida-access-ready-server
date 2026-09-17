/**
 * Writing content generators:
 *   - generateWritingContent  — produces a writing prompt; scaffolding is the model's choice
 *   - getWritingFeedback      — scores a student's response and provides coaching
 */

import { callClaude, toDisplayText } from "./client";
import { rethrowIfClaudeCapacity } from "./queue";
import { parseVisual } from "./prompts/optional-line-visuals";
import { buildSystemPrompt } from "./prompts/compose";
import { contentGenPrompt } from "./prompts/content";
import { feedbackCoachPrompt } from "./prompts/wida-feedback-guide";
import {
  formatExpressivePldBlock,
  serializeFrameworkTask,
  selectExpressivePld,
  type FrameworkTask,
} from "./standards/2020";
import { mergePriorPractice, type PracticeReport } from "../practice-report";
import { dumpContentGenRequest } from "./dump-content-gen";
import { logger } from "../../config/logger";
import {
  applyWritingScore0,
  serializeWritingRubricForPrompt,
  writingDescriptorBullets,
  writingScoreMeetsTask,
  writingZeroCoach,
  rubricPromptAudit,
} from "../wida-access-rubric";

// ── Per-level schema tables ───────────────────────────────────────────────────

// ── Schema builder ────────────────────────────────────────────────────────────

/**
 * Builds the OUTPUT SCHEMA section for this specific call.
 * word_bank and sentence_frame are the model's choice (array/string or null).
 */
function buildWritingOutputSchema(params: {
  level: number;
  minSentences: number;
  keyUse: string;
}): string {
  const { level, minSentences } = params;

  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "task_descriptor": "<echo the 2–3 language_functions this prompt assesses>",`,
    ``,
    `  "task_type": "<short name for this writing job>",`,
    `  /* Primary key_use: ${params.keyUse} */`,
    ``,
    `  "prompt": "<one academic writing job on THIS topic — never say look/see/photo>",`,
    `  /* Level ${level}: follow pld.level. Level 2 must not copy a level-1 name-objects pattern. */`,
    `  /* If language_functions need two short sources, put two Grade 6–8 blurbs IN this prompt. Otherwise do not add sources. */`,
    `  /* Do NOT mention the word bank or sentence frame inside the prompt */`,
    `  "visual": null,`,
    ``,
    `  "word_bank": null,`,
    `  /* Default null. Only replace with a short word list if this student cannot reach the pld without it. Do not add a bank because the field exists. */`,
    ``,
    `  "sentence_frame": null,`,
    `  /* Default null. Only replace with a starter if needed. Do not invent fill-in-the-blank because this field exists. */`,
    ``,
    `  "min_sentences": <number>`,
    `  /* Suggested floor from our app: ${minSentences}. Raise it if the pld needs more connected text. Do not shrink below what the pld needs. */`,
    `}`,
    ``,
    `SCHEMA ENFORCEMENT RULES`,
    `• Return task_descriptor, task_type, prompt, visual, word_bank, sentence_frame, min_sentences. word_bank and sentence_frame should be null unless you have a reason they are needed.`,
    `• Do not add a word bank or fill-in-the-blank just because those keys exist. Prefer an open writing prompt that matches the pld (simple sentences the student writes).`,
    `• Academic text-only. Do NOT say look, picture, photo, "what do you see", or "places you see". Write from the topic and academic_subject only.`,
    ...(level >= 2
      ? [`• ALIGN: prompt assesses language_functions for key_use ${params.keyUse}. Follow pld.level ${level}. Do not add printed sources unless the functions require them.`]
      : []),
    `• prompt must NOT mention the word bank, sentence frame, or their absence.`,
  ].join("\n");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WritingContent {
  canDoDescriptor: string;
  /** Writing task genre — size from key use × level, not a 2016 skill bullet */
  taskType: string;
  prompt: string;
  visual?: string;
  wordBank: string[] | null;
  sentenceFrame: string | null;
  minSentences: number;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

function mergeWritingWordBank(raw: unknown): string[] | null {
  const fromModel = Array.isArray(raw)
    ? raw.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim())
    : [];
  if (fromModel.length === 0) return null;
  return [...new Set(fromModel)];
}

function tidyWritingPrompt(prompt: string): string {
  return prompt
    .replace(/\s*Use words from the (word )?bank\.?/gi, "")
    .replace(/\s*Use the (word )?bank( and (the )?sentence frame)?( to help you)?\.?/gi, "")
    .replace(/\s*Use the sentence frame( to help you)?\.?/gi, "")
    .replace(/\s+to help you\.?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tidyWritingFrame(frame: string): string {
  return frame.replace(/_+/g, "_____").replace(/\s+/g, " ").trim();
}

/** Keep the model's frame. Do not invent a frame if they sent null. */
export function normalizeWritingSentenceFrame(
  _prompt: string,
  frame: string | null | undefined,
): string | null {
  const raw = toDisplayText(frame).trim();
  if (!raw) return null;
  return tidyWritingFrame(raw);
}

const FALLBACK_WRITING: WritingContent = {
  canDoDescriptor: "Explain by comparing and contrasting information, events, or characters",
  taskType: "comparison_paragraph",
  prompt: "Explain why learning a new language is important. Give at least one reason with an example.",
  wordBank: null,
  sentenceFrame: "Learning a new language is important because...",
  minSentences: 3,
};

// ── Writing prompt generator ──────────────────────────────────────────────────

export async function generateWritingContent(params: {
  assessment: string;
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  writingFormat: string;
  taskType: string;
  minSentences: number;
  sentenceFrameRequired: boolean;
  wordBankRequired: boolean;
  framework: FrameworkTask;
  topic: string;
  gradeBand: string;
  mode: "standard" | "exit_proximity";
  academicContentLayer?: string;
  academicSubject: string;
  priorPracticeReport?: PracticeReport | null;
}): Promise<WritingContent> {
  const keyUse = params.framework.key_language_use;
  const schemaSection = buildWritingOutputSchema({
    level:        params.level,
    minSentences: params.minSentences,
    keyUse,
  });
  const systemPrompt = buildSystemPrompt(
    contentGenPrompt("writing", params.level, "2020"),
    formatExpressivePldBlock(params.framework.pld),
    params.academicContentLayer ?? "",
    schemaSection,
  );

  const userPrompt = JSON.stringify(mergePriorPractice({
    domain:                  "writing",
    assessment:              params.assessment,
    level:                   params.level,
    fractional_level:        params.fractionalLevel,
    step_within_level:       params.stepWithinLevel,
    grade_band:              params.gradeBand,
    mode:                    params.mode,
    topic:                   params.topic,
    framework:               serializeFrameworkTask(params.framework),
    goal:                    "Create one writing task this student can do so they become able to produce the writing in framework.pld (end of this integer level). Default: no word bank and no fill-in-the-blank.",
    complexity_instruction:  params.complexityInstruction,
    size_hint: {
      writing_format: params.writingFormat,
      min_sentences:  params.minSentences,
    },
    required_key_use:        keyUse,
    has_library_image:       false,
    academic_subject:        params.academicSubject,
  }, params.priorPracticeReport));

  dumpContentGenRequest("writing", systemPrompt, userPrompt);
  try {
    const result = (await callClaude(systemPrompt, userPrompt, 2000)) as {
      task_descriptor?: string;
      can_do_descriptor?: string;
      task_type: string;
      prompt: string;
      word_bank: string[] | null;
      sentence_frame: string | null;
      min_sentences: number;
    };
    const promptRaw = tidyWritingPrompt(toDisplayText(result.prompt));
    logger.info(
      {
        stage:           "writing-content ← Claude",
        topic:           params.topic,
        academicSubject: params.academicSubject,
        prompt:          promptRaw.slice(0, 240),
        wordBank:        result.word_bank,
      },
      "writing content generated",
    );
    const modelMin = Number(result.min_sentences);
    return {
      canDoDescriptor: result.task_descriptor ?? result.can_do_descriptor
        ?? params.framework.language_functions.map((f) => f.function).join("; "),
      taskType:        result.task_type ?? params.taskType,
      prompt:          promptRaw,
      visual:          parseVisual((result as { visual?: unknown }).visual),
      wordBank:        mergeWritingWordBank(result.word_bank),
      sentenceFrame:   normalizeWritingSentenceFrame(promptRaw, result.sentence_frame),
      minSentences:    Number.isFinite(modelMin) && modelMin > 0 ? modelMin : params.minSentences,
    };
  } catch (err) {
    logger.error({ err }, "generateWritingContent failed, using fallback");
    return {
      ...FALLBACK_WRITING,
      canDoDescriptor: params.framework.language_functions.map((f) => f.function).join("; ")
        || FALLBACK_WRITING.canDoDescriptor,
      taskType: params.taskType,
      prompt: FALLBACK_WRITING.prompt,
      wordBank: null,
      sentenceFrame: null,
      minSentences: params.minSentences,
    };
  }
}

// ── Writing feedback scorer ───────────────────────────────────────────────────

export interface WritingFeedback {
  /** ACCESS writing score point 0–7 (not a 0–100 mix). */
  score: number;
  passed: boolean;
  strengths: string[];
  improvements: string[];
  coachingNote: string;
}

export async function getWritingFeedback(params: {
  canDoDescriptor: string;
  prompt: string;
  studentResponse: string;
  level: number;
  taskType: string;
  minSentences: number;
}): Promise<WritingFeedback> {
  const zero = applyWritingScore0({
    response: params.studentResponse,
    prompt: params.prompt,
  });
  if (zero.isZero) {
    return {
      score: 0,
      passed: false,
      strengths: [],
      improvements: writingDescriptorBullets(0),
      coachingNote: writingZeroCoach(),
    };
  }

  const userPrompt = JSON.stringify({
    task_descriptor:        params.canDoDescriptor,
    prompt:                 params.prompt,
    student_response:       params.studentResponse,
    level:                  params.level,
    task_type:              params.taskType,
    min_sentences:          params.minSentences,
    end_of_level_writing:   selectExpressivePld(params.level),
    key_language_uses:      ["Narrate", "Inform", "Explain", "Argue"],
  });

  const systemPrompt = buildSystemPrompt(
    serializeWritingRubricForPrompt(),
    feedbackCoachPrompt("writing", params.level),
    `Score holistically on ACCESS score points 0–7 only. Do not use a 100-point weighted mix.
If the writing does not match THIS prompt's job, or has a teachable grammar/verb/spelling slip, set passed false.
coaching_note for NOT YET must teach: what is wrong, why it is wrong in simple words, then You can write: plus one or two sentences about THIS prompt. Do not skip the why.
OUTPUT SCHEMA — return every key. Never omit a field.
{
  "score_point": 4,
  "passed": true,
  "strengths": ["<Language Form they showed: Discourse, Sentence, or Word-Phrase>"],
  "improvements": ["<Language Form to work on>"],
  "coaching_note": "<student-facing; no 0–7 numbers>"
}
strengths and improvements must name Language Forms. Use [] only if there is nothing to say; do not drop the keys.
coaching_note is required student coaching.`,
  );
  const audit = rubricPromptAudit(`${systemPrompt}\n${userPrompt}`);
  logger.info(
    {
      stage: "writing/feedback → Claude",
      level: params.level,
      rubricKind: "writing",
      rubricAttached: true,
      ...audit,
    },
    "ACCESS rubric audit (writing/feedback)",
  );

  try {
    const result = (await callClaude(systemPrompt, userPrompt, 800)) as {
      score_point?: number;
      score?: number;
      passed?: boolean;
      strengths: string[];
      improvements: string[];
      coaching_note: string;
    };
    const scorePoint = Math.max(
      1,
      Math.min(7, Math.round(Number(result.score_point ?? result.score) || 1)),
    );
    const passed = writingScoreMeetsTask(scorePoint, params.level, params.minSentences);
    return {
      score:         scorePoint,
      passed,
      strengths:     result.strengths ?? [],
      improvements:  result.improvements ?? writingDescriptorBullets(Math.min(7, scorePoint + 1)).slice(0, 2),
      coachingNote:  result.coaching_note ?? "",
    };
  } catch (err) {
    rethrowIfClaudeCapacity(err);
    return {
      score: 2, passed: writingScoreMeetsTask(2, params.level, params.minSentences),
      strengths: [],
      improvements: writingDescriptorBullets(3).slice(0, 2),
      coachingNote: "Write one more connected sentence in English.",
    };
  }
}
