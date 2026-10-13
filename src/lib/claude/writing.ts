/**
 * Writing content generators:
 *   - generateWritingContent  — retrieve→compose: AI picks library image + scaffolds
 *   - getWritingFeedback      — scores a student's response and provides coaching
 */

import { callClaude, toDisplayText } from "./client";
import { rethrowIfClaudeCapacity } from "./queue";
import { OPTIONAL_LINE_VISUALS_BLOCK, parseVisual } from "./prompts/optional-line-visuals";
import {
  getWritingPortrayalForPrompt,
  type WritingLibraryCandidate,
  resolveWritingLibrarySelection,
  serializeWritingLibraryCandidatesForPrompt,
} from "../content";
import { buildSystemPrompt } from "./prompts/compose";
import { contentGenPrompt } from "./prompts/content";
import {
  buildWritingPassageSentenceTarget,
  writingPassageSchemaHint,
} from "./prompts/content/writing-image-passage";
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

function buildWritingOutputSchema(params: {
  level: number;
  keyUse: string;
  hasLibraryCandidates: boolean;
}): string {
  const { level, hasLibraryCandidates } = params;

  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "task_descriptor": "<echo the 2–3 language_functions this prompt assesses>",`,
    `  "task_type": "<short name for this writing job>",`,
    hasLibraryCandidates
      ? `  "selected_image_id": "<uuid from library_candidates OR null if no photo fits this key_use>",`
      : `  "selected_image_id": null,`,
    hasLibraryCandidates
      ? `  "passage": "<${writingPassageSchemaHint(level)}: image-connected CONTEXT ONLY; null if selected_image_id is null>",`
      : `  "passage": null,`,
    hasLibraryCandidates
      ? `  "prompt": "<writing JOB ONLY — what/how many sentences; do NOT copy sentence_frame or word_bank into this string>",`
      : `  "prompt": "<writing JOB ONLY on THIS topic — no frame text, no word-bank list; do not say look/see/photo>",`,
    `  "visual": null,`,
    `  "word_bank": null,  /* vocabulary ONLY — words must not appear in passage or prompt */`,
    `  "sentence_frame": null,  /* starter ONLY — must not be duplicated inside prompt */`,
    `  "min_sentences": <number>,`,
    `}`,
    ``,
    `SCHEMA ENFORCEMENT RULES`,
    `• Return every key above.`,
    hasLibraryCandidates
      ? `• library_candidates are pre-filtered for academic_subject. Each entry includes id, tags, concept, and description — pick selected_image_id, then compose passage FROM that metadata before writing the prompt.`
      : null,
    hasLibraryCandidates
      ? `• passage must be a connected narrative/informational text about the selected photo (not generic topic text). Hardness follows passage_sentence_target in the JSON payload.`
      : null,
    hasLibraryCandidates
      ? `• You choose selected_image_id (or null), passage, prompt, word_bank, and sentence_frame per content_portrayal and framework — server does not rewrite your output.`
      : null,
    hasLibraryCandidates
      ? `• When selected_image_id is null: passage null; write from topic and academic_subject only.`
      : `• No library images available. Do NOT say look, picture, photo, or "what do you see".`,
    `• You choose word_bank, sentence_frame, and visual — match framework.pld and content_portrayal for required_key_use ${params.keyUse}.`,
    ...(level >= 2
      ? [`• ALIGN: prompt assesses language_functions for key_use ${params.keyUse}. Follow pld.level ${level}.`]
      : []),
    `• prompt and passage must NOT mention the word bank, sentence frame, or their absence.`,
    `• LISTEN-ALOUD: passage = context | prompt = job only | sentence_frame = scaffold only | word_bank = words only. Never paste frame or bank into prompt.`,
    ...(level <= 2
      ? [`• If sentence_frame is set, prompt must not repeat that frame (app reads each field separately).`]
      : []),
  ].filter(Boolean).join("\n");
}

export interface WritingContent {
  canDoDescriptor: string;
  taskType: string;
  prompt: string;
  /** Student-facing context narrative when a library image is selected. */
  passage: string | null;
  visual?: string;
  wordBank: string[] | null;
  sentenceFrame: string | null;
  minSentences: number;
  /** Resolved server-side for session storage — not required on client. */
  selectedLibraryImageId: string | null;
}

function mergeWritingWordBank(raw: unknown): string[] | null {
  const fromModel = Array.isArray(raw)
    ? raw.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim())
    : [];
  if (fromModel.length === 0) return null;
  return [...new Set(fromModel)];
}

/** Display normalization only — do not alter AI wording. */
function displayText(value: string): string {
  return toDisplayText(value).replace(/\s+/g, " ").trim();
}

function tidyWritingFrame(frame: string): string {
  return frame.replace(/_+/g, "_____").replace(/\s+/g, " ").trim();
}

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
  passage: null,
  wordBank: null,
  sentenceFrame: "Learning a new language is important because...",
  minSentences: 3,
  selectedLibraryImageId: null,
};

export async function generateWritingContent(params: {
  assessment: string;
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  taskType?: string;
  minSentences?: number;
  framework: FrameworkTask;
  topic: string;
  gradeBand: string;
  mode: "standard" | "exit_proximity";
  academicContentLayer?: string;
  academicSubject: string;
  academicUnit?: string;
  academicScenario?: string;
  tier3Vocabulary?: string[];
  libraryCandidates?: WritingLibraryCandidate[];
  priorPracticeReport?: PracticeReport | null;
}): Promise<WritingContent> {
  const keyUse = params.framework.key_language_use;
  const libraryCandidates = params.libraryCandidates ?? [];
  const hasLibraryCandidates = libraryCandidates.length > 0;

  const schemaSection = buildWritingOutputSchema({
    level: params.level,
    keyUse,
    hasLibraryCandidates,
  });
  const systemPrompt = buildSystemPrompt(
    contentGenPrompt("writing", params.level, "2020"),
    params.level <= 2 ? OPTIONAL_LINE_VISUALS_BLOCK : "",
    formatExpressivePldBlock(params.framework.pld),
    params.academicContentLayer ?? "",
    schemaSection,
  );

  const contentPortrayal = getWritingPortrayalForPrompt(
    params.level,
    keyUse,
    hasLibraryCandidates,
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
    curriculum_topic:        params.topic,
    framework:               serializeFrameworkTask(params.framework),
    content_portrayal:       contentPortrayal,
    goal:                    "Create one writing task this student can do so they become able to produce the writing in framework.pld (end of this integer level).",
    complexity_instruction:  params.complexityInstruction,
    required_key_use:        keyUse,
    library_candidates:      serializeWritingLibraryCandidatesForPrompt(libraryCandidates),
    library_candidate_note:
      "Each library_candidates entry has tags (detected/subject labels), concept (short topic), and description (what the photo is about). Select an image, then write passage as a connected story/context FROM that metadata before composing the prompt.",
    passage_sentence_target: buildWritingPassageSentenceTarget(params.level, keyUse),
    academic_subject:        params.academicSubject,
    academic_unit:           params.academicUnit ?? null,
    academic_scenario:       params.academicScenario ?? null,
    tier3_vocabulary:        params.tier3Vocabulary ?? [],
    picture_use_hint:        contentPortrayal?.picture ?? null,
    scenario_instruction:    params.academicScenario
      ? "Use academic_scenario for topic context when no library image is selected. Vary details from prior sessions."
      : null,
  }, params.priorPracticeReport));

  dumpContentGenRequest("writing", systemPrompt, userPrompt);
  try {
    const result = (await callClaude(systemPrompt, userPrompt, 2200)) as {
      task_descriptor?: string;
      can_do_descriptor?: string;
      task_type: string;
      selected_image_id?: string | null;
      passage?: string | null;
      prompt: string;
      word_bank: string[] | null;
      sentence_frame: string | null;
      min_sentences: number;
    };

    const rawSelectedId = typeof result.selected_image_id === "string"
      ? result.selected_image_id.trim()
      : null;
    const selectedCandidate = resolveWritingLibrarySelection(rawSelectedId, libraryCandidates);
    const selectedLibraryImageId = selectedCandidate?.id ?? null;

    const passageRaw = result.passage != null && String(result.passage).trim()
      ? displayText(String(result.passage))
      : null;
    const promptRaw = displayText(result.prompt);
    const rawWordBank = mergeWritingWordBank(result.word_bank);
    const rawFrame = result.sentence_frame != null && String(result.sentence_frame).trim()
      ? normalizeWritingSentenceFrame(promptRaw, result.sentence_frame)
      : null;

    logger.info(
      {
        stage:                  "writing-content ← Claude",
        topic:                  params.topic,
        academicSubject:        params.academicSubject,
        candidateCount:         libraryCandidates.length,
        selectedLibraryImageId,
        selectedTags:           selectedCandidate?.tags ?? null,
        selectedDescription:    selectedCandidate?.description?.slice(0, 120) ?? null,
        hasPassage:             Boolean(passageRaw),
        prompt:                 promptRaw.slice(0, 240),
        wordBank:               rawWordBank,
        sentenceFrame:          rawFrame,
      },
      "writing content generated",
    );

    const modelMin = Number(result.min_sentences);
    return {
      canDoDescriptor: result.task_descriptor ?? result.can_do_descriptor
        ?? params.framework.language_functions.map((f) => f.function).join("; "),
      taskType:               result.task_type ?? params.taskType ?? "paragraph",
      prompt:                 promptRaw,
      passage:                passageRaw,
      visual:                 parseVisual((result as { visual?: unknown }).visual),
      wordBank:               rawWordBank,
      sentenceFrame:          rawFrame,
      minSentences:           Number.isFinite(modelMin) && modelMin > 0 ? modelMin : (params.minSentences ?? 1),
      selectedLibraryImageId,
    };
  } catch (err) {
    logger.error({ err }, "generateWritingContent failed, using fallback");
    return {
      ...FALLBACK_WRITING,
      canDoDescriptor: params.framework.language_functions.map((f) => f.function).join("; ")
        || FALLBACK_WRITING.canDoDescriptor,
      taskType: params.taskType ?? FALLBACK_WRITING.taskType,
      prompt: FALLBACK_WRITING.prompt,
      passage: null,
      wordBank: null,
      sentenceFrame: null,
      minSentences: params.minSentences ?? FALLBACK_WRITING.minSentences,
      selectedLibraryImageId: null,
    };
  }
}

export interface WritingFeedback {
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
