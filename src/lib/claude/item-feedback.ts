/**
 * Immediate, item-level coaching after one student answer.
 * Used for picture taps (levels 1–2) and for speaking/writing/selected-response
 * so the student knows what to do on the next try.
 */

import { callClaude, toDisplayText, limitSentences } from "./client";
import { selectExpressivePld } from "./standards/2020";
import { rethrowIfClaudeCapacity } from "./queue";
import { logger } from "../../config/logger";
import { cluePacing, feedbackCoachPrompt } from "./prompts/wida-feedback-guide";
import { speakingCanDoCoachNote, getKeyLanguageUseGuide } from "../content";
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

function followedLastWritingTip(answer: string, lastTip?: string | null): boolean {
  const tip = (lastTip ?? "").trim();
  if (!tip) return false;
  const after = tip.split(/you can write:\s*/i)[1] ?? "";
  const model = after.replace(/\btap (try again|next).*$/i, "").trim().toLowerCase();
  if (model.length < 8) return false;
  const tokens = model.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  if (tokens.length < 2) return false;
  const text = answer.toLowerCase();
  const hits = tokens.filter((w) => text.includes(w)).length;
  return hits >= Math.min(3, tokens.length);
}

function stripWritingPassAssignments(text: string): string {
  return text
    .replace(/\s*you can write:[\s\S]*/i, "")
    .replace(/\s*now add more[^.?!]*[.?!]?/gi, "")
    .replace(/\s*now write why[^.?!]*[.?!]?/gi, "")
    .replace(/\s*add more sentences[^.?!]*[.?!]?/gi, "")
    .replace(/\bgood start!?\s*/gi, "")
    .trim();
}

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
    const model = extra?.modelResponse?.trim();
    return model ? `You can write: ${model}` : "";
  }
  if (extra?.objectClue) return extra.objectClue;
  return "Not yet. Listen or read again, then try again.";
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
        ? `Yes. You found ${correct || "it"}. Well done.`
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

const ITEM_OUTPUT_SCHEMA = `
OUTPUT SCHEMA — return every key. Never omit a field. Use "" or [] only when that field does not apply to THIS domain. Do not drop coaching into a missing key.
{
  "judgment": "agree | partial | rejected",
  "spoken_text": "<required: what the student hears — praise if done; how to meet THIS Can Do if not>",
  "headline": "<required short title>",
  "why_wrong": "<levels 3–6: what missed; levels 1–2: empty string>",
  "correct_answer": "<selected-response label or empty>",
  "object_clue": "<listening picture: same words as spoken_text when they missed; else empty>",
  "model_response": "<speaking/writing not yet: one model line they can copy; empty on agree>",
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
• Do not skip model_response or try_again_tip on a not-yet speaking/writing item. Put the model line in model_response; put the hearable coach in spoken_text (they may overlap).
• strengths and next_steps: [] for item coaching (end-of-session uses those keys). keep_in_mind: fill if useful, else [].
• meets_task is true only when judgment is agree.
• Do not name ACCESS categories or 0–7 numbers in student-facing strings.
`.trim();

function itemSystemPrompt(params: ItemFeedbackInput): string {
  const base = `${feedbackCoachPrompt(params.domain, params.level, params.format)}\n\n${ITEM_OUTPUT_SCHEMA}`;
  if (params.format !== "speaking") return base;
  return `${base}\n\n${speakingCanDoCoachNote(params.level, params.keyUse || params.canDo)}`;
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

  const pacing = cluePacing(params.level);
  const maxSpoken =
    params.format === "speaking" && params.level <= 2
      ? 4
      : params.format === "writing" && params.level <= 2
        ? 5
      : params.level <= 2
        ? pacing.maxSentences
        : 4;

  const payload = {
    domain: params.domain,
    level: params.level,
    format: params.format,
    question: clip(params.question, 400),
    student_tapped: clip(params.studentAnswer, 1200),
    student_answer: clip(params.studentAnswer, 1200),
    correct_object: params.correctAnswer ? clip(params.correctAnswer, 200) : null,
    correct_answer: params.correctAnswer ? clip(params.correctAnswer, 200) : null,
    passage: params.passage ? clip(params.passage, 800) : null,
    clue_pace: pacing.style,
    answer_correct: params.format === "speaking" ? null : guessedMeet,
    image_description: params.imageDescription ? clip(params.imageDescription, 1400) : null,
    image_tags: (params.imageTags ?? []).slice(0, 12),
    target_object: targetNoun(params) || null,
    other_objects_in_picture: (params.options ?? []).slice(0, 8).map((o) => clip(o, 80)),
    prompt: params.prompt ? clip(params.prompt, 500) : null,
    scaffold: params.scaffold ? clip(params.scaffold, 240) : null,
    can_do: params.canDo ? clip(params.canDo, 400) : null,
    can_do_action: params.canDoAction ?? null,
    can_do_items: (params.canDoItems ?? []).slice(0, 6),
    key_use: params.keyUse ?? null,
    key_language_use: getKeyLanguageUseGuide(params.keyUse),
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
  };

  const speakingEvidencePrompt = [
    "Score this speaking response on the official ACCESS speaking rubric (5 categories).",
    serializeSpeakingRubricForPrompt(),
    speakingRules?.cap
      ? `HARD CAP: do not score above ${speakingRules.cap}. Reasons: ${speakingRules.reasons.join("; ")}.`
      : "",
    speakingRules?.isP1 ? "This is a P1-style task (ELP 1–2). Single word = Attempted (already applied in code if so)." : "P3–P5: language from the model is allowed without penalty.",
    "Then write spoken_text as coaching. Do not name the ACCESS category to the student.",
    "WIDA CAN DO",
    speakingCanDoCoachNote(params.level, params.keyUse || params.canDo),
    params.canDoAction || params.canDoItems?.length
      ? `Action: ${params.canDoAction ?? ""} Items: ${(params.canDoItems ?? []).join("; ")}`
      : "",
    params.canDo ? `Descriptor: ${params.canDo}` : "",
    "TASK ON SCREEN",
    `Prompt: ${payload.prompt || payload.question || "(none)"}`,
    `Scaffold: ${payload.scaffold || "(none)"}`,
    "PICTURE",
    payload.image_description ? `Description: ${payload.image_description}` : "Description: (none)",
    payload.image_tags.length ? `Tags: ${payload.image_tags.join(", ")}` : "Tags: (none)",
    "STUDENT ANSWER (speech-to-text)",
    payload.student_answer || "(empty)",
    payload.uncertain_words?.length
      ? `Uncertain STT words: ${payload.uncertain_words.join(", ")}`
      : "",
    `Try number: ${payload.try_count}.`,
    payload.last_judgment ? `Previous judgment: ${payload.last_judgment}.` : "",
  ].filter(Boolean).join("\n");

  const writingEvidencePrompt = [
    "READ ALL OF THIS BEFORE YOU SCORE.",
    "1. ACCESS WRITING RUBRIC (use this scale 0–7)",
    serializeWritingRubricForPrompt(),
    "2. END-OF-THIS-LEVEL WRITING (pld — English hardness for this integer level only)",
    JSON.stringify(selectExpressivePld(params.level)),
    "3. WHAT WAS ASKED (the only job — do not invent a second job)",
    `Prompt: ${payload.prompt || payload.question || "(none)"}`,
    payload.scaffold ? `Sentence frame: ${payload.scaffold}` : "",
    payload.options?.length ? `Word bank: ${payload.options.join(", ")}` : "",
    payload.can_do ? `Task job: ${payload.can_do}` : "",
    payload.image_description ? `Picture: ${payload.image_description}` : "",
    payload.image_tags.length ? `Picture tags: ${payload.image_tags.join(", ")}` : "",
    "4. THIS SUBMIT (what the student just wrote)",
    payload.student_answer || "(empty)",
    `Try number: ${payload.try_count}.`,
    payload.last_student_answer
      ? `5. LAST SUBMIT (before they tried again):\n${payload.last_student_answer}`
      : "",
    payload.last_coach_tip
      ? `6. LAST TIP they were asked to apply:\n${payload.last_coach_tip}`
      : "",
    "HOW TO DECIDE",
    "If THIS SUBMIT does the asked job and language is fine for this pld: PASS. spoken_text = praise only. No You can write.",
    "If NOT YET: you MUST teach. (1) what is wrong in their writing (2) why it is wrong in simple words so they can learn (3) You can write: one or two sentences they can copy. Do not skip the why. One gap only (grammar, verb, pronoun, spelling, or missing the job). Do not add a new topic.",
    "If this is a resubmit and they applied the last tip: PASS. Do not invent a new gap.",
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
        `They answered: ${payload.student_tapped || payload.student_answer || "(unknown)"}`,
        "Name what they got right. Do not retell the passage. Do not coach a different domain.",
        JSON.stringify(payload),
      ].join("\n")
    : params.format === "picture"
      ? [
          `Write spoken_text in ${maxSpoken} short sentence(s). Same text in object_clue. Nothing else.`,
          payload.target_object ? `Target: ${payload.target_object}` : "",
          payload.image_description ? `Photo (for look/place words only): ${clip(params.imageDescription, 220)}` : "",
          pacing.style,
          "Do not quote the audio. Do not say what they chose. Do not repeat the clue.",
          JSON.stringify(payload),
        ].filter(Boolean).join("\n")
      : [
          `Write spoken_text in ${maxSpoken} short sentence(s) or fewer. Selected response.`,
          `The student chose: ${payload.student_answer || "(unknown)"}`,
          `The correct answer: ${payload.correct_answer || "(unknown)"}`,
          "Use only this domain's evidence (audio or this passage).",
          JSON.stringify(payload),
        ].join("\n");

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
      wordBank: payload.options ?? [],
      imageTags: payload.image_tags,
      minSentences: payload.min_sentences,
      canDo: payload.can_do,
      keyUse: payload.key_use,
      userPrompt,
    },
    params.format === "writing" ? "ACCESS rubric audit (item writing)" : "ACCESS rubric audit (item feedback)",
  );

  try {
    const result = (await callClaude(systemPrompt, userPrompt, 900)) as Record<string, unknown>;
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
      judgment = speakingCategoryToJudgment(accessSpeaking, params.level);
      meetsTask = speakingCategoryMeetsTask(accessSpeaking, params.level);
    }
    if (params.format === "writing") {
      const raw = Number(result.score_point ?? result.scorePoint ?? result.score);
      accessWriting = Number.isFinite(raw) ? Math.max(1, Math.min(7, Math.round(raw))) : 1;
      const minForPass = writingPracticeMinSentences(params.level, params.minSentences);
      meetsTask = writingScoreMeetsTask(accessWriting, params.level, minForPass);
      if (
        followedLastWritingTip(params.studentAnswer ?? "", params.lastCoachTip)
        && accessWriting >= 2
      ) {
        meetsTask = true;
      } else if (
        (params.tryCount ?? 1) >= 2
        && writingLooksComplete(params)
        && accessWriting >= 2
        && Boolean(params.lastCoachTip)
      ) {
        meetsTask = true;
      }
      judgment = meetsTask ? "agree" : accessWriting >= 2 ? "partial" : "rejected";
    }
    if (params.format === "writing" && !meetsTask) {
      // Keep Claude's coaching; never flip to agree on a filled L1–2 frame alone.
    }

    let objectClue = clip(result.object_clue ?? result.objectClue ?? "", 400);
    if (!objectClue && !meetsTask && params.level <= 2 && params.format === "picture") {
      objectClue = looksLikeFallback(params);
    }

    let modelResponse = clip(result.model_response ?? result.modelResponse ?? "", 400);
    if (judgment === "agree") {
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
    if (params.format === "writing" && meetsTask) {
      spokenRaw = spokenRaw.replace(/\s*Tap try again(?:,? or skip to move on)?\.?/gi, "").trim();
      spokenRaw = stripWritingPassAssignments(spokenRaw);
      if (!spokenRaw) spokenRaw = "Yes. That writing is enough for this level.";
      modelResponse = "";
    }
    if (params.format === "writing" && !meetsTask) {
      if (modelResponse && spokenRaw && !spokenRaw.toLowerCase().includes(modelResponse.toLowerCase().slice(0, 24))) {
        spokenRaw = `${spokenRaw} You can write: ${modelResponse}`.trim();
      } else if (!spokenRaw && modelResponse) {
        spokenRaw = `You can write: ${modelResponse}`;
      }
    }
    if (params.format === "speaking" && spokenFromModel) {
      spokenRaw = spokenFromModel;
      if (judgment === "agree") {
        spokenRaw = spokenRaw.replace(/\s*Tap try again\.?/gi, "").trim();
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
