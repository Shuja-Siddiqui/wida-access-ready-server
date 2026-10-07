/**
 * Writing content generators:
 *   - generateWritingContent  — retrieve→compose: AI picks library image + scaffolds
 *   - getWritingFeedback      — scores a student's response and provides coaching
 */

import { callClaude, toDisplayText } from "./client";
import { rethrowIfClaudeCapacity } from "./queue";
import { parseVisual } from "./prompts/optional-line-visuals";
import {
  type WritingLibraryCandidate,
  resolveWritingLibrarySelectionWithPolicy,
  serializeWritingLibraryCandidatesForPrompt,
} from "../content";
import { buildSystemPrompt } from "./prompts/compose";
import { buildContentSystemPrompt } from "./prompts/content/system-prompt";
import {
  buildLevel1PassageFromLibraryMeta,
  buildWritingPassageSentenceTarget,
  writingPassageSchemaHint,
} from "./prompts/content/writing-image-passage";
import { feedbackCoachPrompt } from "./prompts/wida-feedback-guide";
import { stripWritingCopyableModels } from "./writing-coach-guard";
import {
  academicPromptFieldsFromContext,
  type AcademicFrameworkFields,
} from "../academic/academicFrameworkContext";
import {
  frameworkTaskDescriptor,
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
  libraryImageRequired: boolean;
}): string {
  const { level, hasLibraryCandidates, libraryImageRequired } = params;

  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "task_descriptor": "<echo the 2–3 language_functions this prompt assesses>",`,
    `  "task_type": "<short name for this writing job>",`,
    !hasLibraryCandidates
      ? `  "selected_image_id": null,`
      : libraryImageRequired
        ? `  "selected_image_id": "<REQUIRED uuid from library_candidates>",`
        : `  "selected_image_id": null,`,
    !hasLibraryCandidates
      ? `  "passage": null,`
      : libraryImageRequired
        ? `  "passage": "<REQUIRED ${writingPassageSchemaHint(level)} image-connected context>",`
        : `  "passage": "<${writingPassageSchemaHint(level)}: image-connected CONTEXT ONLY; null if selected_image_id is null>",`,
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
    libraryImageRequired
      ? `• selected_image_id is REQUIRED when library_candidates exist. Never return null.`
      : null,
    hasLibraryCandidates
      ? `• passage must be a connected narrative/informational text about the selected photo (not generic topic text). Hardness follows passage_sentence_target in the JSON payload.`
      : null,
    hasLibraryCandidates
      ? `• Compose passage FROM the selected photo's tags/concept/description, then write the prompt. Do not describe objects that are not in that photo.`
      : null,
    !hasLibraryCandidates
      ? `• No library images available. Do NOT say look, picture, photo, or "what do you see".`
      : null,
    `• You choose word_bank, sentence_frame, and visual — match framework.pld and language_functions for required_key_use ${params.keyUse}.`,
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
  /** Short summary of assessed language functions (2020 framework). */
  taskDescriptor: string;
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
  taskDescriptor: "Explain by comparing and contrasting information, events, or characters",
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
  scenarioExamples?: string[];
  tier3Vocabulary?: string[];
  academicFramework?: Partial<AcademicFrameworkFields>;
  libraryCandidates?: WritingLibraryCandidate[];
  priorPracticeReport?: PracticeReport | null;
}): Promise<WritingContent> {
  const keyUse = params.framework.key_language_use;
  const libraryCandidates = params.libraryCandidates ?? [];
  const hasLibraryCandidates = libraryCandidates.length > 0;
  const levelFloor = Math.floor(params.level);
  const libraryImageRequired = Math.floor(params.level) <= 2 && hasLibraryCandidates;

  const schemaSection = buildWritingOutputSchema({
    level: params.level,
    keyUse,
    hasLibraryCandidates,
    libraryImageRequired,
  });
  const systemPrompt = buildContentSystemPrompt("writing", params.level, schemaSection, {
    academicContentLayer: params.academicContentLayer,
    hasLibraryCandidates,
    includeLineVisuals: params.level <= 2,
  });

  const userPayload: Record<string, unknown> = {
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
    goal:                    "Create one writing task this student can do so they become able to produce the writing in framework.pld (end of this integer level).",
    complexity_instruction:  params.complexityInstruction,
    required_key_use:        keyUse,
    academic_subject:        params.academicSubject,
    academic_unit:           params.academicUnit ?? null,
    tier3_vocabulary:        params.tier3Vocabulary ?? [],
    ...academicPromptFieldsFromContext({
      unit: params.academicUnit,
      scenarioExamples: params.scenarioExamples,
      tier3Vocabulary: params.tier3Vocabulary,
      ...params.academicFramework,
    }),
  };

  if (hasLibraryCandidates) {
    Object.assign(userPayload, {
      library_candidates:       serializeWritingLibraryCandidatesForPrompt(libraryCandidates),
      library_image_required:   libraryImageRequired,
      passage_sentence_target:  buildWritingPassageSentenceTarget(params.level, keyUse),
    });
  }

  const userPrompt = JSON.stringify(mergePriorPractice(userPayload, params.priorPracticeReport));

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
    const selectedCandidate = resolveWritingLibrarySelectionWithPolicy(
      rawSelectedId,
      libraryCandidates,
      params.level,
    );
    const selectedLibraryImageId = selectedCandidate?.id ?? null;

    if (libraryImageRequired && !rawSelectedId && selectedLibraryImageId) {
      logger.info(
        { forcedImageId: selectedLibraryImageId, level: params.level },
        "writing: Level 1 required library image — Claude returned null, server picked candidate",
      );
    }

    let passageRaw = result.passage != null && String(result.passage).trim()
      ? displayText(String(result.passage))
      : null;
    if (!passageRaw && selectedCandidate) {
      passageRaw = buildLevel1PassageFromLibraryMeta({
        tags: selectedCandidate.tags,
        description: selectedCandidate.description,
        imageConcept: selectedCandidate.imageConcept,
      });
      logger.info(
        { imageId: selectedCandidate.id, level: params.level },
        "writing: fallback passage from library metadata",
      );
    }
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
      taskDescriptor: result.task_descriptor
        ?? frameworkTaskDescriptor(params.framework),
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
      taskDescriptor: frameworkTaskDescriptor(params.framework) || FALLBACK_WRITING.taskDescriptor,
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
  framework?: FrameworkTask | null;
  taskDescriptor?: string;
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

  const taskDescriptor = params.framework
    ? frameworkTaskDescriptor(params.framework)
    : (params.taskDescriptor ?? "");
  const userPrompt = JSON.stringify({
    framework:              params.framework ? serializeFrameworkTask(params.framework) : null,
    task_descriptor:        taskDescriptor,
    prompt:                 params.prompt,
    student_response:       params.studentResponse,
    level:                  params.level,
    task_type:              params.taskType,
    min_sentences:          params.minSentences,
    end_of_level_writing:   selectExpressivePld(params.level),
  });

  const systemPrompt = buildSystemPrompt(
    serializeWritingRubricForPrompt(),
    feedbackCoachPrompt("writing", params.level),
    `Score holistically on ACCESS score points 0–7 only. Do not use a 100-point weighted mix.
If the writing does not match THIS prompt's job, or has a teachable language slip (grammar, verb, pronoun, spelling), set passed false.
OUTPUT SCHEMA — return every key. Never omit a field.
{
  "score_point": 4,
  "passed": true,
  "strengths": ["<Language Form they showed: Discourse, Sentence, or Word-Phrase>"],
  "improvements": ["<Language Form to work on>"],
  "coaching_note": "<student-facing; no 0–7 numbers; hint-only — never full sentences to paste>"
}
strengths and improvements must name Language Forms. Use [] only if there is nothing to say; do not drop the keys.
coaching_note for NOT YET: what is wrong, why (simple), one revision hint — never "You can write:" or a complete model answer.`,
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
      coachingNote:  stripWritingCopyableModels(result.coaching_note ?? ""),
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
