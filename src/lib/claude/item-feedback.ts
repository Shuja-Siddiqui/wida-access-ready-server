/**
 * Immediate, item-level coaching after one student answer.
 * Used for picture taps (levels 1–2) and for speaking/writing/selected-response
 * so the student knows what to do on the next try.
 */

import { callClaude, toDisplayText, limitSentences } from "./client";
import { rethrowIfClaudeCapacity } from "./queue";
import { logger } from "../../config/logger";
import { LANGUAGE_FORMS_NOT_YET_EVIDENCE_LINE } from "./prompts/grammar-correction-rules";
import {
  cluePacing,
  feedbackCoachPrompt,
  normalizeFeedbackDomain,
} from "./prompts/wida-feedback-guide";
import {
  speakingAnswerEchoesCoach,
  stripSpeakingCopyableModels,
} from "./speaking-coach-guard";
import {
  stripWritingCopyableModels,
  writingAnswerEchoesCoach,
} from "./writing-coach-guard";
import { speakingFrameworkCoachNote } from "../content";
import {
  frameworkTaskDescriptor,
  parseFrameworkTask,
  serializeFrameworkForFeedback,
  frameworkFeedbackCoachNote,
  selectExpressivePld,
  type FrameworkTask,
} from "./standards/2020";
import {
  applySpeakingHardRules,
  applyWritingScore0,
  clampSpeakingCategory,
  parseSpeakingCategory,
  serializeSpeakingRubricForPrompt,
  serializeWritingRubricForPrompt,
  speakingCategoryMeetsTask,
  speakingCategoryToJudgment,
  speakingShortCircuitCoach,
  writingScoreMeetsTask,
  writingZeroCoach,
  rubricPromptAudit,
  type SpeakingCategory,
} from "../wida-access-rubric";

export type ItemFeedbackFormat = "picture" | "selected_response" | "speaking" | "writing";
export type SpeakingJudgment = "agree" | "partial" | "rejected";

export interface ItemFeedback {
  headline: string;
  whyWrong: string;
  correctAnswer: string;
  objectClue: string;
  modelResponse: string;
  howToSayIt: string;
  keepInMind: string[];
  tryAgainTip: string;
  spokenText: string;
  judgment: SpeakingJudgment;
  meetsTask: boolean;
  /** ACCESS Speaking category when format is speaking. */
  accessSpeaking?: SpeakingCategory;
  /** ACCESS Writing score point 0–7 when format is writing. */
  accessWriting?: number;
}

export interface ItemFeedbackInput {
  domain: string;
  level: number;
  format: ItemFeedbackFormat;
  question: string;
  studentAnswer: string;
  correctAnswer?: string;
  passage?: string;
  imageDescription?: string;
  imageTags?: string[];
  /** Object the student should find (not agree/disagree). */
  targetObject?: string;
  prompt?: string;
  scaffold?: string;
  canDo?: string;
  keyUse?: string;
  canDoItems?: string[];
  canDoAction?: string;
  framework?: FrameworkTask | Record<string, unknown> | null;
  options?: string[];
  responseLength?: string;
  minSentences?: number;
  correct?: boolean;
  sttConfidence?: number;
  uncertainWords?: string[];
  tryCount?: number;
  lastJudgment?: SpeakingJudgment;
  lastCoachTip?: string;
  lastStudentAnswer?: string;
}

function asStringArray(value: unknown, max = 4): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => toDisplayText(v).trim()).filter(Boolean).slice(0, max);
}

function clip(value: unknown, max = 400): string {
  const text = toDisplayText(value).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function targetNoun(params: ItemFeedbackInput): string {
  const explicit = clip(params.targetObject ?? "", 80);
  if (explicit && !/^(agree|disagree)$/i.test(explicit)) return explicit;
  const answer = clip(params.correctAnswer ?? "", 80);
  if (answer && !/^(agree|disagree)$/i.test(answer)) return answer;
  const fromQuestion = (params.question ?? "").match(
    /(?:there is (?:a|an|no) |find the |tap the |look for the )([^?.!]+)/i,
  );
  return fromQuestion ? clip(fromQuestion[1], 80) : "";
}

function fillScaffoldModel(params: ItemFeedbackInput): string {
  const sc = (params.scaffold ?? "")
    .replace(/^try:\s*/i, "")
    .replace(/["']/g, "")
    .trim();
  return sc.replace(/[…]+/g, " ").replace(/\s+/g, " ").trim();
}

function speakingHelpSpoken(params: ItemFeedbackInput): string {
  const sc = fillScaffoldModel(params);
  const prompt = clip(params.prompt ?? params.question ?? "", 160);
  if (sc) return `Use the starter on the screen: ${sc}`;
  if (prompt) return `Answer the question on the screen: ${prompt}`;
  return "Look at the picture and try again.";
}

function parseSpeakingJudgment(value: unknown): SpeakingJudgment | null {
  const s = String(value ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
  if (s === "agree" || s === "accepted") return "agree";
  if (s === "partial" || s === "partial agree" || s === "partially agree") return "partial";
  if (s === "rejected" || s === "reject") return "rejected";
  return null;
}

function writingPracticeMinSentences(level: number, minSentences?: number): number {
  if (level <= 1) return 1;
  const raw = Math.max(1, minSentences ?? 2);
  if (level <= 2) return Math.min(raw, 2);
  return raw;
}

function parseClaudeMeetsTask(result: Record<string, unknown>): boolean | null {
  if (typeof result.meets_task === "boolean") return result.meets_task;
  if (typeof result.meetsTask === "boolean") return result.meetsTask;
  return null;
}

const SPEAKING_COACH_ALOUD = `
SPEAKING COACHING — TEACHER VOICE (same classroom style as writing)
• spoken_text NOT YET: use " || " between blocks so TTS pauses — praise | "Listen." + mistake with *wrong word* | simple rule | short try-step.
• Example: "You named the place well. || Listen. You said *students* but the picture shows one student. || One person takes *student*, not *students*. || Say that part again with *student*."
• model_response: at most ONE short corrected phrase they can say aloud — never a full paragraph to recite as their answer.
• On retry: meets_task false if they mostly copy prior coaching instead of revising in their own words.
• PASS: praise only in spoken_text; try_again_tip empty; model_response empty.
• Follow LANGUAGE FORMS — CORRECT GRAMMAR. One gap per try. Do not punish accent or STT noise.
`.trim();

const WRITING_COACH_NO_MODEL = `
WRITING COACHING — NO PASTE-READY ANSWERS
• model_response must always be "" for writing.
• spoken_text and try_again_tip: what is wrong, why (simple), one revision hint only.
• Never "You can write:", "Try writing:", "Example response:", or full sentences they could copy.
• On retry: meets_task false if they pasted or lightly edited prior coaching instead of revising in their own words.

SPOKEN ALOUD — separate blocks with " || " (pause between each; student must hear mistake vs rule vs try)
1. Optional brief praise
2. Mistake block — start with "Listen." Point to the error; wrap the wrong word in *asterisks* (e.g. You wrote *is*.)
3. Rule block — one simple why (e.g. Two things take *are*, not *is*.)
4. Try block — one short action (change that word, reread)
Example shape: "You gave a good reason. || Listen. You wrote *is* — line breaks and stanzas are two things. || When you have two things, use *are*. || Change that one word and reread."
`.trim();

function writingLooksComplete(params: ItemFeedbackInput): boolean {
  const text = clip(params.studentAnswer, 1200).toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.join("").replace(/[^a-z]/g, "").length < 6) return false;
  const studentSentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 2).length;
  const minS = params.minSentences ?? (params.level <= 1 ? 1 : 2);
  const bank = (params.options ?? [])
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length >= 3);
  if (bank.length > 0) {
    const usedBankWord = bank.some((t) => text.includes(t) || text.includes(t.split(/\s+/)[0] ?? t));
    if (usedBankWord && studentSentences >= 1) return true;
  }
  return studentSentences >= Math.max(1, minS) || words.length >= 8;
}

function looksLikeFallback(params: ItemFeedbackInput): string {
  const noun = targetNoun(params);
  const direct = params.level < 1.2;
  const inPhoto = (params.imageTags ?? []).some(
    (tag) => noun && (tag.toLowerCase().includes(noun.toLowerCase()) || noun.toLowerCase().includes(tag.toLowerCase())),
  );
  const absent = Boolean(noun) && (
    /^disagree$/i.test(params.correctAnswer ?? "") ||
    ((params.imageTags?.length ?? 0) > 0 && !inPhoto)
  );

  if (absent && noun) {
    return direct ? `There is no *${noun}* in this picture.` : `You will not find a *${noun}* here.`;
  }
  if (noun && direct) {
    return `The *${noun}* is the one that looks like that in the picture.`;
  }
  if (noun) {
    return `Find it by shape and place — that is the *${noun}*.`;
  }
  return "Look again. Find it by how it looks.";
}

function stripStrategy(text: string): string {
  return text
    .replace(/Next time,?\s*point to objects[^.?!]*[.?!]?\s*/gi, "")
    .replace(/Does it match\??\s*/gi, "")
    .replace(/point to objects in the picture as the sentence is read[.?!]?\s*/gi, "")
    .replace(/When you hear the sentence again[,.]?\s*/gi, "")
    .replace(/The audio said[^.?!]*[.?!]\s*/gi, "")
    .trim();
}

function composeSpokenText(params: ItemFeedbackInput, extra?: { objectClue?: string; modelResponse?: string }): string {
  if (params.format === "speaking") {
    return speakingHelpSpoken(params);
  }
  if (params.format === "writing") {
    return "";
  }
  if (extra?.objectClue) return extra.objectClue;
  return "Not yet. Listen or read again, then try again.";
}

function praiseVariantIndex(seed: string, count: number): number {
  if (count <= 1) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h + seed.charCodeAt(i) * (i + 1)) % count;
  }
  return h;
}

function pictureCorrectSpokenText(params: ItemFeedbackInput): string {
  const yesNo = /^(agree|disagree)$/i.test(params.studentAnswer ?? "")
    || /^(agree|disagree)$/i.test(params.correctAnswer ?? "");
  if (yesNo) {
    const choice = clip(params.studentAnswer, 40).toLowerCase();
    const label = choice === "agree" ? "agree" : choice === "disagree" ? "disagree" : choice;
    const templates = [
      `Yes — *${label}* matches what you heard.`,
      `That's right. You said *${label}*.`,
      `Good listening. *${label}* is correct.`,
    ];
    return templates[praiseVariantIndex(`${params.question}:${label}`, templates.length)];
  }
  const noun = targetNoun(params);
  const object = noun || clip(params.studentAnswer, 80) || "the right one";
  const seed = `${params.question}:${object}:${params.level}`;
  const templates = [
    `Yes — you found the *${object}*.`,
    `That's the *${object}*. Nice listening.`,
    `Good — the *${object}* is right.`,
    `You got it. That's the *${object}*.`,
    `Right — the *${object}*.`,
  ];
  return templates[praiseVariantIndex(seed, templates.length)];
}

/** Instant praise when the student tapped the right picture — no AI round-trip. */
function pictureCorrectFeedback(params: ItemFeedbackInput): ItemFeedback {
  const base = fallback(params, true);
  const yesNo = /^(agree|disagree)$/i.test(params.studentAnswer ?? "")
    || /^(agree|disagree)$/i.test(params.correctAnswer ?? "");
  const spokenText = pictureCorrectSpokenText(params);
  return {
    ...base,
    spokenText,
    headline: yesNo ? "Yes — that's right." : "Yes — that is the one.",
    objectClue: "",
  };
}

/** Instant praise when the student picked the right MC option — no AI round-trip. */
function selectedResponseCorrectSpokenText(params: ItemFeedbackInput): string {
  const choice = clip(params.studentAnswer ?? params.correctAnswer ?? "", 140);
  if (!choice) return "Yes — that's the right answer.";
  const seed = `${params.question}:${choice}:${params.level}`;
  const templates = [
    `Yes — *${choice}* matches what you heard.`,
    `That's right. You chose *${choice}*.`,
    `Good listening. *${choice}* is correct.`,
    `You got it. *${choice}* is the right answer.`,
  ];
  return templates[praiseVariantIndex(seed, templates.length)];
}

function selectedResponseCorrectFeedback(params: ItemFeedbackInput): ItemFeedback {
  const base = fallback(params, true);
  return {
    ...base,
    spokenText: selectedResponseCorrectSpokenText(params),
    headline: "Yes — that's right.",
    correctAnswer: clip(params.correctAnswer ?? params.studentAnswer ?? "", 120),
  };
}

function fallback(params: ItemFeedbackInput, meetsTask: boolean): ItemFeedback {
  const correct = clip(params.correctAnswer ?? "", 120);
  const scaffold = clip(params.scaffold ?? "", 160);
  const judgment: SpeakingJudgment = meetsTask ? "agree" : "rejected";
  if (params.format === "picture") {
    const clue = looksLikeFallback(params);
    return {
      headline: meetsTask ? "Yes — that is the one." : "Look again.",
      whyWrong: "",
      correctAnswer: correct,
      objectClue: meetsTask ? "" : clue,
      modelResponse: "",
      howToSayIt: "",
      keepInMind: [],
      tryAgainTip: "",
      spokenText: meetsTask
        ? pictureCorrectSpokenText(params)
        : clue,
      judgment,
      meetsTask,
    };
  }
  if (params.format === "speaking") {
    const model = fillScaffoldModel(params) || scaffold;
    return {
      headline: meetsTask ? "Yes — that works." : "Try the starter.",
      whyWrong: "",
      correctAnswer: "",
      objectClue: "",
      modelResponse: meetsTask ? "" : model,
      howToSayIt: "",
      keepInMind: [],
      tryAgainTip: "",
      spokenText: meetsTask
        ? `Yes. ${clip(params.studentAnswer, 80)} That matches the starter.`
        : speakingHelpSpoken(params),
      judgment,
      meetsTask,
    };
  }
  if (params.format === "writing") {
    return {
      headline: meetsTask ? "Yes — that works." : "Not yet.",
      whyWrong: "",
      correctAnswer: "",
      objectClue: "",
      modelResponse: "",
      howToSayIt: "",
      keepInMind: [],
      tryAgainTip: "",
      spokenText: meetsTask
        ? clip(params.studentAnswer, 80)
        : "",
      judgment,
      meetsTask,
    };
  }
  return {
    headline: meetsTask ? "Correct." : "Not yet.",
    whyWrong: meetsTask ? "" : "That choice does not match the passage.",
    correctAnswer: correct,
    objectClue: "",
    modelResponse: "",
    howToSayIt: "",
    keepInMind: meetsTask ? [] : ["Read or listen again before you choose."],
    tryAgainTip: "",
    spokenText: meetsTask
      ? `Yes. You chose ${correct || "the right answer"}. Well done.`
      : composeSpokenText(params),
    judgment,
    meetsTask,
  };
}

/** Item coaching JSON is short — cap output to avoid paying for unused headroom. */
const ITEM_FEEDBACK_MAX_TOKENS = 400;

function omitEmptyFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

function payloadText(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function payloadStringList(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) return [];
  return value.map((entry) => toDisplayText(entry).trim()).filter(Boolean);
}

function buildItemFeedbackPayload(
  params: ItemFeedbackInput,
  ctx: {
    pacing: ReturnType<typeof cluePacing>;
    feedbackFramework: Record<string, unknown> | null;
    frameworkTask: FrameworkTask | null;
    taskDescriptor: string | null;
    guessedMeet: boolean;
  },
): Record<string, unknown> {
  const { pacing, feedbackFramework, frameworkTask, taskDescriptor, guessedMeet } = ctx;
  const keyUse = params.keyUse ?? frameworkTask?.key_language_use ?? null;
  const question = clip(params.question, 400);
  const studentAnswer = clip(params.studentAnswer, 1200);

  if (params.format === "selected_response") {
    return omitEmptyFields({
      domain: params.domain,
      level: params.level,
      format: params.format,
      question,
      student_answer: clip(params.studentAnswer, 200),
      correct_answer: params.correctAnswer ? clip(params.correctAnswer, 200) : null,
      options: (params.options ?? []).slice(0, 6).map((o) => clip(o, 80)),
      passage: params.passage ? clip(params.passage, 400) : null,
      key_use: keyUse,
      framework: feedbackFramework,
      answer_correct: guessedMeet,
    });
  }

  if (params.format === "picture") {
    return omitEmptyFields({
      domain: params.domain,
      level: params.level,
      format: params.format,
      question,
      student_answer: clip(params.studentAnswer, 120),
      correct_answer: params.correctAnswer ? clip(params.correctAnswer, 120) : null,
      target_object: targetNoun(params) || null,
      clue_pace: pacing.style,
      image_description: params.imageDescription ? clip(params.imageDescription, 220) : null,
      image_tags: (params.imageTags ?? []).slice(0, 8),
      key_use: keyUse,
      framework: feedbackFramework,
      answer_correct: guessedMeet,
    });
  }

  const useLegacyCanDoFields = !feedbackFramework;
  return omitEmptyFields({
    domain: params.domain,
    level: params.level,
    format: params.format,
    question,
    student_answer: studentAnswer,
    correct_answer: params.correctAnswer ? clip(params.correctAnswer, 200) : null,
    passage: params.passage ? clip(params.passage, 800) : null,
    clue_pace: pacing.style,
    answer_correct: params.format === "speaking" ? null : guessedMeet,
    image_description: params.imageDescription ? clip(params.imageDescription, 1400) : null,
    image_tags: (params.imageTags ?? []).slice(0, 12),
    target_object: targetNoun(params) || null,
    prompt: params.prompt ? clip(params.prompt, 500) : null,
    scaffold: params.scaffold ? clip(params.scaffold, 240) : null,
    framework: feedbackFramework,
    task_descriptor: taskDescriptor && !feedbackFramework ? taskDescriptor : null,
    can_do: useLegacyCanDoFields && params.canDo ? clip(params.canDo, 400) : null,
    can_do_action: useLegacyCanDoFields ? (params.canDoAction ?? null) : null,
    can_do_items: useLegacyCanDoFields ? (params.canDoItems ?? []).slice(0, 6) : [],
    key_use: keyUse,
    options: (params.options ?? []).slice(0, 6).map((o) => clip(o, 80)),
    response_length: params.responseLength ?? null,
    min_sentences: params.minSentences ?? null,
    stt_confidence: params.sttConfidence ?? null,
    uncertain_words: (params.uncertainWords ?? []).slice(0, 8),
    transcript_source: params.format === "speaking" ? "speech_to_text" : null,
    try_count: params.tryCount ?? 1,
    last_judgment: params.lastJudgment ?? null,
    last_coach_tip: params.lastCoachTip ? clip(params.lastCoachTip, 500) : null,
    last_student_answer: params.lastStudentAnswer ? clip(params.lastStudentAnswer, 1200) : null,
  });
}

const ITEM_OUTPUT_SCHEMA = `
OUTPUT SCHEMA — return every key. Never omit a field. Use "" or [] only when that field does not apply to THIS domain. Do not drop coaching into a missing key.
{
  "judgment": "agree | partial | rejected",
  "spoken_text": "<required: what the student hears — praise if done; how to meet THIS framework job if not>",
  "headline": "<required short title>",
  "why_wrong": "<levels 3–6: what missed; levels 1–2: empty string>",
  "correct_answer": "<selected-response label or empty>",
  "object_clue": "<listening picture: same words as spoken_text when they missed; else empty>",
  "model_response": "<speaking not yet: one short phrase they can try; writing: always empty string>",
  "how_to_say_it": "<speaking: pronunciation/frame hint if needed; else empty>",
  "keep_in_mind": ["<optional short reminder; [] if none>"],
  "strengths": [],
  "next_steps": [],
  "try_again_tip": "<not yet: one next-try line; empty on agree>",
  "meets_task": true,
  "access_category": "Exemplary | Strong | Adequate | Attempted | No Response",
  "score_point": 0
}
SCHEMA ENFORCEMENT
• Always set judgment, spoken_text, headline, meets_task. spoken_text must never be missing.
• Speaking: always set access_category. judgment and meets_task stay in the JSON (code may recompute them).
• Writing: always set score_point 0–7 AND judgment and meets_task.
• Listening/reading/picture: still set judgment, spoken_text, meets_task, headline, correct_answer. access_category and score_point may be unused but keep the keys (use "" / 0).
• Speaking not yet: model_response may hold one short phrase; spoken_text coaches aloud.
• Writing not yet: model_response must be ""; coach only in spoken_text / try_again_tip (hint-only, no full answer).
• strengths and next_steps: [] for item coaching (end-of-session uses those keys). keep_in_mind: fill if useful, else [].
• meets_task is true only when judgment is agree.
• Do not name ACCESS categories or 0–7 numbers in student-facing strings.
`.trim();

function itemSystemPrompt(params: ItemFeedbackInput): string {
  const base = `${feedbackCoachPrompt(params.domain, params.level, params.format)}\n\n${ITEM_OUTPUT_SCHEMA}`;
  if (params.format === "writing") {
    return `${base}\n\n${WRITING_COACH_NO_MODEL}`;
  }
  if (params.format === "speaking") {
    const coachNote =
      params.framework && typeof params.framework === "object" && "language_functions" in params.framework
        ? speakingFrameworkCoachNote(params.framework as FrameworkTask)
        : "";
    return [base, SPEAKING_COACH_ALOUD, coachNote].filter(Boolean).join("\n\n");
  }
  return base;
}

function resolveTaskDescriptor(params: ItemFeedbackInput): string | null {
  const framework = parseFrameworkTask(params.framework);
  if (framework) return clip(frameworkTaskDescriptor(framework), 400);
  if (params.canDo) return clip(params.canDo, 400);
  return null;
}

function interpretiveFrameworkBlock(params: ItemFeedbackInput): string {
  const framework = parseFrameworkTask(params.framework);
  if (!framework) return "";
  const domain = normalizeFeedbackDomain(params.domain, params.format);
  if (domain !== "listening" && domain !== "reading") return "";
  return frameworkFeedbackCoachNote(framework, domain);
}

export async function generateItemFeedback(params: ItemFeedbackInput): Promise<ItemFeedback> {
  const speakingRules =
    params.format === "speaking"
      ? applySpeakingHardRules({
          transcript: params.studentAnswer ?? "",
          level: params.level,
          prompt: params.prompt ?? params.question,
          modelText: params.scaffold ?? "",
          imageTags: params.imageTags,
        })
      : null;
  if (speakingRules?.shortCircuit) {
    const category = speakingRules.shortCircuit;
    const meetsTask = speakingCategoryMeetsTask(category, params.level);
    logger.info({ category, reasons: speakingRules.reasons, rubricSentToAi: false }, "ACCESS speaking hard-rule short-circuit");
    return {
      ...fallback(params, meetsTask),
      spokenText: speakingShortCircuitCoach(category),
      judgment: speakingCategoryToJudgment(category, params.level),
      meetsTask,
      accessSpeaking: category,
    };
  }

  const writingZero =
    params.format === "writing"
      ? applyWritingScore0({
          response: params.studentAnswer ?? "",
          prompt: params.prompt ?? params.question,
          stimulus: [params.scaffold ?? "", ...(params.options ?? [])].join(" "),
        })
      : null;
  if (writingZero?.isZero) {
    logger.info({ reasons: writingZero.reasons, rubricSentToAi: false }, "ACCESS writing score-point 0 — skip AI");
    return {
      ...fallback(params, false),
      spokenText: writingZeroCoach(),
      judgment: "rejected",
      meetsTask: false,
      accessWriting: 0,
    };
  }

  const writingComplete =
    params.format === "writing" ? writingLooksComplete(params) : false;
  const guessedMeet =
    params.format === "speaking"
      ? false
      : params.format === "writing"
        ? writingComplete
      : typeof params.correct === "boolean"
        ? params.correct
        : params.format === "picture" || params.format === "selected_response"
          ? Boolean(
              params.correctAnswer &&
                params.studentAnswer &&
                params.studentAnswer.trim().toLowerCase() === params.correctAnswer.trim().toLowerCase(),
            )
          : false;

  if (params.format === "picture" && guessedMeet) {
    logger.info(
      {
        target: targetNoun(params),
        studentAnswer: params.studentAnswer,
        rubricSentToAi: false,
      },
      "picture correct — local praise",
    );
    return pictureCorrectFeedback(params);
  }

  if (params.format === "selected_response" && guessedMeet) {
    logger.info(
      {
        studentAnswer: params.studentAnswer,
        correctAnswer: params.correctAnswer,
        rubricSentToAi: false,
      },
      "selected-response correct — local praise",
    );
    return selectedResponseCorrectFeedback(params);
  }

  const pacing = cluePacing(params.level);
  const maxSpoken =
    params.format === "speaking" && params.level <= 2
      ? 4
      : params.format === "writing" && params.level <= 2
        ? 5
      : params.level <= 2
        ? pacing.maxSentences
        : 4;

  const frameworkTask = parseFrameworkTask(params.framework);
  const taskDescriptor = resolveTaskDescriptor(params);
  const feedbackFramework = frameworkTask ? serializeFrameworkForFeedback(frameworkTask) : null;

  const payload = buildItemFeedbackPayload(params, {
    pacing,
    feedbackFramework,
    frameworkTask,
    taskDescriptor,
    guessedMeet,
  });

  const speakingEvidencePrompt = [
    "READ ALL OF THIS BEFORE YOU SCORE.",
    "1. ACCESS SPEAKING RUBRIC (official 5 categories)",
    serializeSpeakingRubricForPrompt(),
    speakingRules?.cap
      ? `HARD CAP: do not score above ${speakingRules.cap}. Reasons: ${speakingRules.reasons.join("; ")}.`
      : "",
    speakingRules?.isP1
      ? "This is a P1-style task (ELP 1–2). Single word = Attempted (already applied in code if so)."
      : "P3–P5: language from the model scaffold is allowed without penalty.",
    "2. END-OF-THIS-LEVEL SPEAKING (pld — English hardness for this integer level only)",
    frameworkTask?.pld
      ? JSON.stringify(frameworkTask.pld)
      : JSON.stringify(selectExpressivePld(params.level)),
    "3. CONTEXT THE STUDENT SAW (when a library image session)",
    payloadText(payload, "passage")
      ? `Context passage: ${payloadText(payload, "passage")}`
      : "Context passage: (none — no image narrative)",
    payloadText(payload, "image_description")
      ? `Picture description: ${payloadText(payload, "image_description")}`
      : "",
    payloadStringList(payload, "image_tags").length
      ? `Picture tags: ${payloadStringList(payload, "image_tags").join(", ")}`
      : "",
    "4. WHAT WAS ASKED (the only job — do not invent a second job)",
    `Prompt: ${payloadText(payload, "prompt") || payloadText(payload, "question") || "(none)"}`,
    payloadText(payload, "scaffold") ? `Sentence starter: ${payloadText(payload, "scaffold")}` : "",
    payloadStringList(payload, "options").length
      ? `Word bank: ${payloadStringList(payload, "options").join(", ")}`
      : "",
    payload.framework ? `WIDA 2020 framework job: ${JSON.stringify(payload.framework)}` : "",
    payloadText(payload, "task_descriptor") && !payload.framework
      ? `Task descriptor: ${payloadText(payload, "task_descriptor")}`
      : "",
    "5. THIS RESPONSE (speech-to-text transcript)",
    payloadText(payload, "student_answer") || "(empty)",
    payloadStringList(payload, "uncertain_words").length
      ? `Uncertain STT words (do not over-penalize): ${payloadStringList(payload, "uncertain_words").join(", ")}`
      : "",
    payload.stt_confidence != null ? `STT confidence: ${payload.stt_confidence}` : "",
    `Try number: ${payload.try_count ?? 1}.`,
    payloadText(payload, "last_student_answer")
      ? `6. LAST RESPONSE (before they tried again):\n${payloadText(payload, "last_student_answer")}`
      : "",
    payloadText(payload, "last_coach_tip")
      ? `7. LAST TIP they were asked to apply:\n${payloadText(payload, "last_coach_tip")}`
      : "",
    "HOW TO DECIDE",
    "Score ACCESS speaking category first, then check if THIS response does the asked job at this pld.",
    LANGUAGE_FORMS_NOT_YET_EVIDENCE_LINE,
    "Also NOT YET when the asked job is missing. Do not add a new topic.",
    "If this is a resubmit: PASS only if they fixed the last tip in their own words — NOT if they recited coaching.",
    (params.tryCount ?? 0) > 1 && params.lastCoachTip
      ? "If THIS RESPONSE mostly copies LAST TIP or prior coaching, meets_task must be false."
      : "",
    "spoken_text NOT YET: separate blocks with \" || \" (praise | Listen.+mistake | rule | try). Do not name ACCESS categories.",
  ].filter(Boolean).join("\n");

  const writingEvidencePrompt = [
    "READ ALL OF THIS BEFORE YOU SCORE.",
    "1. ACCESS WRITING RUBRIC (use this scale 0–7)",
    serializeWritingRubricForPrompt(),
    "2. END-OF-THIS-LEVEL WRITING (pld — English hardness for this integer level only)",
    frameworkTask?.pld
      ? JSON.stringify(frameworkTask.pld)
      : JSON.stringify(selectExpressivePld(params.level)),
    "3. CONTEXT THE STUDENT READ (when a library image session)",
    payloadText(payload, "passage")
      ? `Context passage: ${payloadText(payload, "passage")}`
      : "Context passage: (none — no image narrative)",
    payloadText(payload, "image_description")
      ? `Picture description: ${payloadText(payload, "image_description")}`
      : "",
    payloadStringList(payload, "image_tags").length
      ? `Picture tags: ${payloadStringList(payload, "image_tags").join(", ")}`
      : "",
    "4. WHAT WAS ASKED (the only job — do not invent a second job)",
    `Prompt: ${payloadText(payload, "prompt") || payloadText(payload, "question") || "(none)"}`,
    payloadText(payload, "scaffold") ? `Sentence frame: ${payloadText(payload, "scaffold")}` : "",
    payloadStringList(payload, "options").length
      ? `Word bank: ${payloadStringList(payload, "options").join(", ")}`
      : "",
    payload.framework ? `WIDA 2020 framework job: ${JSON.stringify(payload.framework)}` : "",
    payloadText(payload, "task_descriptor") && !payload.framework
      ? `Task descriptor: ${payloadText(payload, "task_descriptor")}`
      : "",
    "5. THIS SUBMIT (what the student just wrote)",
    payloadText(payload, "student_answer") || "(empty)",
    `Try number: ${payload.try_count ?? 1}.`,
    payloadText(payload, "last_student_answer")
      ? `6. LAST SUBMIT (before they tried again):\n${payloadText(payload, "last_student_answer")}`
      : "",
    payloadText(payload, "last_coach_tip")
      ? `7. LAST TIP they were asked to apply:\n${payloadText(payload, "last_coach_tip")}`
      : "",
    "HOW TO DECIDE",
    payload.passage
      ? "When a context passage was provided, score whether the writing connects to that passage and the prompt — not unrelated topic text."
      : "",
    "If THIS SUBMIT does the asked job and language is fine for this pld: PASS. spoken_text = praise only.",
    LANGUAGE_FORMS_NOT_YET_EVIDENCE_LINE,
    "Also NOT YET when the asked job is missing. Do not add a new topic.",
    "If this is a resubmit: PASS only if they fixed the last tip in their own words — NOT if they pasted coaching text.",
    (params.tryCount ?? 0) > 1 && params.lastCoachTip
      ? "If THIS SUBMIT mostly copies LAST TIP or prior coaching, meets_task must be false."
      : "",
    "If the prompt says OR, one choice is enough. Do not switch topics.",
    "Never praise as finished while also asking to try again. Do not say the 0–7 number to the student.",
  ].filter(Boolean).join("\n");

  const userPrompt = params.format === "speaking"
    ? speakingEvidencePrompt
    : params.format === "writing"
    ? writingEvidencePrompt
    : guessedMeet
    ? [
        `This student was CORRECT. Write ${maxSpoken} short sentence(s) of warm praise.`,
        "Name what they got right. Do not retell the passage. Do not coach a different domain.",
        JSON.stringify(payload),
      ].join("\n")
    : params.format === "picture"
      ? [
          `Write spoken_text in ${maxSpoken} short sentence(s). Same text in object_clue. Nothing else.`,
          interpretiveFrameworkBlock(params),
          pacing.style,
          "Do not quote the audio. Do not say what they chose. Do not repeat the clue.",
          JSON.stringify(payload),
        ].filter(Boolean).join("\n")
      : [
          `Write spoken_text in ${maxSpoken} short sentence(s) or fewer. Selected response.`,
          interpretiveFrameworkBlock(params),
          "Use only this domain's evidence (audio or passage). Point to phrasing that supports the correct option.",
          JSON.stringify(payload),
        ].filter(Boolean).join("\n");

  const systemPrompt = itemSystemPrompt(params);
  const audit = rubricPromptAudit(`${systemPrompt}\n${userPrompt}`);
  const rubricExpected = params.format === "speaking" || params.format === "writing";
  logger.info(
    {
      stage: "item-feedback → Claude",
      format: params.format,
      domain: params.domain,
      level: params.level,
      rubricExpected,
      speakingRubricInPrompt: audit.speakingRubricInPrompt,
      writingRubricInPrompt: audit.writingRubricInPrompt,
      rubricOk:
        params.format === "speaking"
          ? audit.speakingRubricInPrompt
          : params.format === "writing"
            ? audit.writingRubricInPrompt
            : true,
      writingComplete,
      guessedMeet,
      studentAnswer: payload.student_answer,
      prompt: payload.prompt,
      scaffold: payload.scaffold,
      wordBank: payload.options,
      imageTags: payload.image_tags,
      minSentences: payload.min_sentences,
      hasFramework: Boolean(payload.framework),
      keyUse: payload.key_use,
      userPrompt,
    },
    params.format === "writing" ? "ACCESS rubric audit (item writing)" : "ACCESS rubric audit (item feedback)",
  );

  try {
    const result = (await callClaude(systemPrompt, userPrompt, ITEM_FEEDBACK_MAX_TOKENS)) as Record<string, unknown>;
    let accessSpeaking: SpeakingCategory | undefined;
    let accessWriting: number | undefined;
    let judgment: SpeakingJudgment =
      parseSpeakingJudgment(result.judgment ?? result.status)
      ?? (result.meets_task === true ? "agree" : params.format === "speaking" ? "rejected" : guessedMeet ? "agree" : "rejected");
    let meetsTask = params.format === "speaking" ? judgment === "agree" : (typeof result.meets_task === "boolean" ? result.meets_task : guessedMeet);

    if (params.format === "speaking") {
      const parsedCat =
        parseSpeakingCategory(result.access_category ?? result.accessCategory ?? result.category)
        ?? (judgment === "agree" ? "Strong" : judgment === "partial" ? "Adequate" : "Attempted");
      accessSpeaking = clampSpeakingCategory(parsedCat, speakingRules?.cap ?? null);
      const categoryPass = speakingCategoryMeetsTask(accessSpeaking, params.level);
      const claudeMeets = parseClaudeMeetsTask(result);
      const claudeJudgment = parseSpeakingJudgment(result.judgment ?? result.status);

      if (claudeMeets === false || claudeJudgment === "partial" || claudeJudgment === "rejected") {
        meetsTask = false;
      } else if (claudeMeets === true || claudeJudgment === "agree") {
        meetsTask = categoryPass;
      } else {
        meetsTask = categoryPass;
      }

      judgment = meetsTask ? "agree" : accessSpeaking === "Adequate" ? "partial" : "rejected";

      if (
        meetsTask &&
        (params.tryCount ?? 0) > 1 &&
        speakingAnswerEchoesCoach(
          params.studentAnswer ?? "",
          params.lastCoachTip,
          params.lastStudentAnswer,
        )
      ) {
        meetsTask = false;
        judgment = accessSpeaking === "Adequate" ? "partial" : "rejected";
      }
    }
    if (params.format === "writing") {
      const raw = Number(result.score_point ?? result.scorePoint ?? result.score);
      accessWriting = Number.isFinite(raw) ? Math.max(1, Math.min(7, Math.round(raw))) : 1;
      const minForPass = writingPracticeMinSentences(params.level, params.minSentences);
      const scorePass = writingScoreMeetsTask(accessWriting, params.level, minForPass);
      const claudeMeets = parseClaudeMeetsTask(result);
      const claudeJudgment = parseSpeakingJudgment(result.judgment ?? result.status);

      // Claude decides task completion (prompt job done); score gate keeps language bar.
      if (claudeMeets === false || claudeJudgment === "partial" || claudeJudgment === "rejected") {
        meetsTask = false;
      } else if (claudeMeets === true || claudeJudgment === "agree") {
        meetsTask = scorePass;
      } else {
        meetsTask = scorePass;
      }

      judgment = meetsTask ? "agree" : accessWriting >= 2 ? "partial" : "rejected";

      if (
        meetsTask &&
        (params.tryCount ?? 0) > 1 &&
        writingAnswerEchoesCoach(
          params.studentAnswer ?? "",
          params.lastCoachTip,
          params.lastStudentAnswer,
        )
      ) {
        meetsTask = false;
        judgment = accessWriting >= 2 ? "partial" : "rejected";
      }
    }

    let objectClue = clip(result.object_clue ?? result.objectClue ?? "", 400);
    if (!objectClue && !meetsTask && params.level <= 2 && params.format === "picture") {
      objectClue = looksLikeFallback(params);
    }

    let modelResponse = clip(result.model_response ?? result.modelResponse ?? "", 400);
    if (params.format === "writing") {
      modelResponse = "";
    } else if (judgment === "agree") {
      modelResponse = "";
    }

    const howToSayIt = clip(result.how_to_say_it ?? result.howToSayIt ?? "", 200);
    const spokenFromModel = clip(result.spoken_text ?? result.spokenText ?? "", 900);
    let spokenRaw = spokenFromModel;
    if (!spokenRaw && params.format === "picture") spokenRaw = objectClue;
    if (!spokenRaw && params.format === "speaking") spokenRaw = speakingHelpSpoken(params);
    if (!spokenRaw) {
      spokenRaw = composeSpokenText(params, { objectClue, modelResponse });
    }
    if (params.format === "picture") spokenRaw = stripStrategy(spokenRaw);
    if (params.format === "writing") {
      spokenRaw = stripWritingCopyableModels(spokenRaw);
      if (meetsTask) {
        spokenRaw = spokenRaw.replace(/\s*Tap try again(?:,? or skip to move on)?\.?/gi, "").trim();
        if (!spokenRaw) spokenRaw = "Yes. That writing is enough for this level.";
      } else if (
        (params.tryCount ?? 0) > 1 &&
        writingAnswerEchoesCoach(
          params.studentAnswer ?? "",
          params.lastCoachTip,
          params.lastStudentAnswer,
        ) &&
        !spokenRaw.toLowerCase().includes("own words")
      ) {
        spokenRaw =
          `${spokenRaw} Revise in your own words — do not copy the coaching.`.trim();
      }
      modelResponse = "";
    }
    if (params.format === "speaking") {
      spokenRaw = stripSpeakingCopyableModels(spokenRaw);
      if (meetsTask) {
        spokenRaw = spokenRaw.replace(/\s*Tap try again(?:,? or skip to move on)?\.?/gi, "").trim();
        if (!spokenRaw) spokenRaw = "Yes. That answer works for this level.";
      } else if (
        (params.tryCount ?? 0) > 1 &&
        speakingAnswerEchoesCoach(
          params.studentAnswer ?? "",
          params.lastCoachTip,
          params.lastStudentAnswer,
        ) &&
        !spokenRaw.toLowerCase().includes("own words")
      ) {
        spokenRaw =
          `${spokenRaw} Say it in your own words — do not copy the coaching.`.trim();
      }
      if (judgment === "agree") {
        modelResponse = "";
      }
    }
    if (!spokenRaw && objectClue) spokenRaw = objectClue;
    const spokenText = params.level <= 2 ? limitSentences(spokenRaw, maxSpoken) : spokenRaw;
    logger.info(
      {
        stage: "item-feedback ← Claude",
        format: params.format,
        writingComplete,
        guessedMeet,
        claudeMeetsTask: result.meets_task ?? result.meetsTask ?? null,
        claudeJudgment: result.judgment ?? result.status ?? null,
        claudeSpoken: clip(result.spoken_text ?? result.spokenText ?? "", 240),
        judgment,
        meetsTask,
        accessSpeaking,
        accessWriting,
        spokenText: clip(spokenText, 240),
        studentAnswer: payload.student_answer,
        scaffold: payload.scaffold,
        wordBank: payload.options ?? [],
      },
      params.format === "writing" ? "WRITING_FEEDBACK_OUT" : "item-feedback result",
    );
    return {
      headline: clip(result.headline ?? "", 80) || fallback(params, meetsTask).headline,
      whyWrong: params.level <= 2 ? "" : clip(result.why_wrong ?? result.whyWrong ?? "", 240),
      correctAnswer: clip(result.correct_answer ?? result.correctAnswer ?? "", 80),
      objectClue: params.level <= 2 && params.format === "picture" ? spokenText : objectClue,
      modelResponse: params.level <= 2 && params.format === "picture" ? "" : modelResponse,
      howToSayIt: params.level <= 2 && params.format !== "speaking" ? "" : howToSayIt,
      keepInMind: asStringArray(result.keep_in_mind ?? result.keepInMind),
      tryAgainTip: judgment === "agree" ? "" : clip(result.try_again_tip ?? result.tryAgainTip ?? "", 240),
      spokenText,
      judgment,
      meetsTask,
      accessSpeaking,
      accessWriting,
    };
  } catch (err) {
    rethrowIfClaudeCapacity(err);
    logger.error({ err }, "generateItemFeedback failed");
    return fallback(params, guessedMeet);
  }
}
