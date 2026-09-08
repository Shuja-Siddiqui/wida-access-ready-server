/**
 * Immediate, item-level coaching after one student answer.
 * Used for picture taps (levels 1–2) and for speaking/writing/selected-response
 * so the student knows what to do on the next try.
 */

import { callClaude, toDisplayText, limitSentences } from "./client";
import { logger } from "../../config/logger";
import { cluePacing, feedbackBand, feedbackCoachPrompt } from "./prompts/wida-feedback-guide";
import { speakingCanDoCoachNote } from "../speakingContentEngine";
import { getKeyLanguageUseGuide } from "../listeningContentEngine";

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
  if (params.format === "speaking" || params.format === "writing") {
    return speakingHelpSpoken(params);
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
  if (params.format === "speaking" || params.format === "writing") {
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
OUTPUT SCHEMA
{
  "judgment": "agree | partial | rejected",
  "spoken_text": "<what the student hears: praise if done; how to meet THIS Can Do if not>",
  "headline": "<short title>",
  "why_wrong": "",
  "correct_answer": "<label or empty>",
  "object_clue": "<listening picture clue only; empty for speaking>",
  "model_response": "",
  "how_to_say_it": "",
  "keep_in_mind": [],
  "strengths": [],
  "next_steps": [],
  "try_again_tip": "",
  "meets_task": true
}
judgment is required for speaking. meets_task is true only when judgment is agree.
Return spoken_text only as student-facing coaching. strengths, keep_in_mind, next_steps, model_response, and try_again_tip must be empty arrays or empty strings. Do not list "what went well".
Empty unused fields. Do not copy rules from other domains.
`.trim();

function itemSystemPrompt(params: ItemFeedbackInput): string {
  const base = `${feedbackCoachPrompt(params.domain, params.level, params.format)}\n\n${ITEM_OUTPUT_SCHEMA}`;
  if (params.format !== "speaking") return base;
  return `${base}\n\n${speakingCanDoCoachNote(params.level, params.keyUse || params.canDo)}`;
}

export async function generateItemFeedback(params: ItemFeedbackInput): Promise<ItemFeedback> {
  const guessedMeet =
    params.format === "speaking"
      ? false
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
    last_coach_tip: params.lastCoachTip ? clip(params.lastCoachTip, 240) : null,
  };

  const speakingEvidencePrompt = [
    "Your job: get this student ready for WIDA Speaking at THIS level. The Can Do below is the target.",
    "If their talk could still be stronger for that Can Do on THIS task, coach them and ask them to try again.",
    "If they already show that Can Do on this task, they are done — praise, no new work.",
    "Stay on this prompt, scaffold, and picture. Do not invent a different task.",
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

  const band = feedbackBand(params.level);
  const userPrompt = params.format === "speaking"
    ? speakingEvidencePrompt
    : guessedMeet
    ? [
        `This student was CORRECT. Write ${maxSpoken} short sentence(s) of warm praise.`,
        `They answered: ${payload.student_tapped || payload.student_answer || "(unknown)"}`,
        "Name what they got right. Do not retell the passage. Do not coach a different domain.",
        JSON.stringify(payload),
      ].join("\n")
    : params.format === "writing"
      ? [
          "Coach this written response only.",
          `Text: ${payload.student_answer || "(empty)"}`,
          `Prompt: ${payload.prompt || payload.question}`,
          `Frame: ${payload.scaffold || "(none)"}`,
          payload.image_tags.length
            ? `Picture shows: ${payload.image_tags.join(", ")}`
            : "",
          `Write ${maxSpoken} short sentence(s). Band ${band}.`,
          JSON.stringify(payload),
        ].filter(Boolean).join("\n")
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
  logger.info(
    {
      stage: "item-feedback → Claude",
      format: params.format,
      domain: params.domain,
      level: params.level,
      keyUse: params.keyUse ?? null,
      canDoFromClient: params.canDo ?? null,
      canDoItems: params.canDoItems ?? [],
      canDoAction: params.canDoAction ?? null,
      canDoPresent: Boolean(params.canDo?.trim()),
      widaSpeakingNote:
        params.format === "speaking"
          ? speakingCanDoCoachNote(params.level, params.keyUse || params.canDo)
          : null,
      prompt: payload.prompt,
      scaffold: payload.scaffold,
      transcript: payload.student_answer,
      guessedMeet,
      responseLength: params.responseLength ?? null,
      imageDescriptionChars: payload.image_description?.length ?? 0,
      imageTags: payload.image_tags,
      systemChars: systemPrompt.length,
      userChars: userPrompt.length,
    },
    "item-feedback request",
  );

  try {
    const result = (await callClaude(systemPrompt, userPrompt, 900)) as Record<string, unknown>;
    const judgment: SpeakingJudgment =
      parseSpeakingJudgment(result.judgment ?? result.status)
      ?? (result.meets_task === true ? "agree" : params.format === "speaking" ? "rejected" : guessedMeet ? "agree" : "rejected");
    const meetsTask = params.format === "speaking" ? judgment === "agree" : (typeof result.meets_task === "boolean" ? result.meets_task : guessedMeet);

    let objectClue = clip(result.object_clue ?? result.objectClue ?? "", 400);
    if (!objectClue && !meetsTask && params.level <= 2 && params.format === "picture") {
      objectClue = looksLikeFallback(params);
    }

    let modelResponse = clip(result.model_response ?? result.modelResponse ?? "", 400);
    if (judgment === "agree" && (params.format === "speaking" || params.format === "writing")) {
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
    if (params.format === "speaking" && spokenFromModel) {
      spokenRaw = spokenFromModel;
      if (judgment === "agree") {
        spokenRaw = spokenRaw.replace(/\s*Tap try again\.?/gi, "").trim();
      } else {
        modelResponse = "";
      }
    }
    if (!spokenRaw && objectClue) spokenRaw = objectClue;
    const spokenText = params.level <= 2 ? limitSentences(spokenRaw, maxSpoken) : spokenRaw;
    logger.info(
      {
        stage: "item-feedback ← Claude",
        format: params.format,
        judgment,
        meetsTask,
        claudeSpoken: clip(result.spoken_text ?? result.spokenText ?? "", 240),
        spokenText: clip(spokenText, 240),
        modelResponse: clip(modelResponse, 160),
        canDoPresent: Boolean(params.canDo?.trim()),
        keyUse: params.keyUse ?? null,
      },
      "item-feedback result",
    );
    return {
      headline: clip(result.headline ?? "", 80) || fallback(params, meetsTask).headline,
      whyWrong: params.level <= 2 ? "" : clip(result.why_wrong ?? result.whyWrong ?? "", 240),
      correctAnswer: clip(result.correct_answer ?? result.correctAnswer ?? "", 80),
      objectClue: params.level <= 2 && params.format === "picture" ? spokenText : objectClue,
      modelResponse: params.level <= 2 && params.format === "picture" ? "" : modelResponse,
      howToSayIt: params.level <= 2 && params.format !== "speaking" ? "" : howToSayIt,
      keepInMind: [],
      tryAgainTip: "",
      spokenText,
      judgment,
      meetsTask,
    };
  } catch (err) {
    logger.error({ err }, "generateItemFeedback failed");
    return fallback(params, guessedMeet);
  }
}
