/**
 * Student-facing AI output filter (proxy chokepoint).
 *
 * Does NOT change scoring. Does NOT drop output-schema fields the app needs.
 * Claude still returns the full scoring schema (access_category, score_point).
 * We map those to judgment + meetsTask on the server, then send the coaching
 * schema the client already uses.
 *
 * Text scrub is narrow: vendor/reasoning/explicit score labels only.
 * We do not strip ordinary words like "adequate", "attempted", or "strong".
 */

import { logger } from "../config/logger";
import type { ItemFeedback } from "./claude/item-feedback";
import type { WritingFeedback } from "./claude/writing";
import type { AttemptFeedback } from "./claude/attempt-feedback";

/** Matches item-coaching client payload + ITEM_OUTPUT_SCHEMA student fields. */
export const ITEM_FEEDBACK_ALLOWLIST = [
  "headline",
  "whyWrong",
  "correctAnswer",
  "objectClue",
  "modelResponse",
  "howToSayIt",
  "keepInMind",
  "tryAgainTip",
  "spokenText",
  "judgment",
  "meetsTask",
] as const;

/** Matches getWritingFeedback return shape (score kept; it is part of that schema). */
export const WRITING_FEEDBACK_ALLOWLIST = [
  "score",
  "passed",
  "strengths",
  "improvements",
  "coachingNote",
] as const;

/** Matches attempt-feedback OUTPUT SCHEMA. */
export const ATTEMPT_FEEDBACK_ALLOWLIST = [
  "summary",
  "mistakes",
  "strengths",
  "nextSteps",
] as const;

/**
 * Only phrases that are clearly meta — not normal coaching English.
 */
export const STUDENT_DENY_PHRASES: { pattern: RegExp; note: string }[] = [
  {
    pattern: /\b(your\s+)?(access\s+)?(speaking\s+)?(category|score)\s*(is|:)?\s*(exemplary|strong|adequate|attempted|no[\s-]?response)\b/gi,
    note: "explicit ACCESS speaking label",
  },
  {
    pattern: /\bscored\s+(as\s+)?(exemplary|strong|adequate|attempted|no[\s-]?response)\b/gi,
    note: "explicit ACCESS speaking label",
  },
  { pattern: /\b(score\s*point|score-point)\s*[0-7]\b/gi, note: "explicit ACCESS writing score" },
  { pattern: /\b0\s*[–-]\s*7\b/g, note: "writing scale mention" },
  { pattern: /\baccess\s+(speaking|writing)\s+rubric\b/gi, note: "rubric meta" },
  { pattern: /\bwida\s+rubric\b/gi, note: "rubric meta" },
  { pattern: /\bper the rubric\b/gi, note: "rubric meta" },
  { pattern: /\b(chain of thought|chain-of-thought|let'?s think step by step)\b/gi, note: "raw reasoning" },
  { pattern: /\bi reasoned (that)?\b/gi, note: "raw reasoning" },
  { pattern: /\bas an ai\b/gi, note: "model meta" },
  { pattern: /\b(anthropic|claude(?:-[a-z0-9-]+)?|haiku|sonnet|system prompt)\b/gi, note: "vendor/model" },
];

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

/** Scrub meta from one string. Never returns a substitute coach line. */
export function filterStudentFacingText(text: string): string {
  if (!text) return "";
  let out = text;
  for (const { pattern } of STUDENT_DENY_PHRASES) {
    out = out.replace(pattern, " ");
  }
  return collapseSpaces(out);
}

function scrubList(values: string[] | undefined): string[] {
  return (values ?? []).map((v) => filterStudentFacingText(v) || v).filter((v) => v.trim().length > 0);
}

/**
 * Full item-coaching object. Every required UI field is always present.
 * accessSpeaking / accessWriting stay on the server (not in the Claude
 * student-facing schema the UI reads).
 */
export function filterItemFeedbackForStudent(feedback: ItemFeedback): Record<string, unknown> {
  const spoken = filterStudentFacingText(feedback.spokenText);
  logger.info(
    {
      keptJudgment: feedback.judgment,
      keptMeetsTask: feedback.meetsTask,
      spokenScrubbed: spoken !== (feedback.spokenText ?? ""),
    },
    "AI output filter (item-feedback)",
  );
  return {
    headline: filterStudentFacingText(feedback.headline) || feedback.headline,
    whyWrong: filterStudentFacingText(feedback.whyWrong) || feedback.whyWrong,
    correctAnswer: feedback.correctAnswer ?? "",
    objectClue: filterStudentFacingText(feedback.objectClue ?? "") || feedback.objectClue || "",
    modelResponse: filterStudentFacingText(feedback.modelResponse ?? "") || feedback.modelResponse || "",
    howToSayIt: filterStudentFacingText(feedback.howToSayIt ?? "") || feedback.howToSayIt || "",
    keepInMind: scrubList(feedback.keepInMind),
    tryAgainTip: filterStudentFacingText(feedback.tryAgainTip ?? "") || feedback.tryAgainTip || "",
    spokenText: spoken || feedback.spokenText,
    judgment: feedback.judgment,
    meetsTask: feedback.meetsTask,
  };
}

export function filterWritingFeedbackForStudent(feedback: WritingFeedback): Record<string, unknown> {
  return {
    score: feedback.score,
    passed: feedback.passed,
    strengths: scrubList(feedback.strengths),
    improvements: scrubList(feedback.improvements),
    coachingNote: filterStudentFacingText(feedback.coachingNote) || feedback.coachingNote,
  };
}

export function filterAttemptFeedbackForStudent(feedback: AttemptFeedback): AttemptFeedback {
  return {
    summary: filterStudentFacingText(feedback.summary) || feedback.summary,
    mistakes: (feedback.mistakes ?? []).map((m) => ({
      question: filterStudentFacingText(m.question) || m.question,
      whatHappened: filterStudentFacingText(m.whatHappened) || m.whatHappened,
      howToImprove: filterStudentFacingText(m.howToImprove) || m.howToImprove,
    })),
    strengths: scrubList(feedback.strengths),
    nextSteps: scrubList(feedback.nextSteps),
    coachForNextSession: "",
  };
}
