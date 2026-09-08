/**
 * Post-session attempt feedback for every domain.
 * Sends the student's answers (and what was correct) to Claude and returns
 * short, grade-appropriate remarks the student can use next time.
 */

import { callClaude, toDisplayText } from "./client";
import { logger } from "../../config/logger";
import { feedbackCoachPrompt } from "./prompts/wida-feedback-guide";

const MAX_ANSWER_CHARS = 1200;
const MAX_ITEMS = 8;

export interface AttemptFeedbackItem {
  question: string;
  whatHappened: string;
  howToImprove: string;
}

export interface AttemptFeedback {
  summary: string;
  mistakes: AttemptFeedbackItem[];
  strengths: string[];
  nextSteps: string[];
}

const EMPTY_FEEDBACK: AttemptFeedback = {
  summary: "You finished this practice. Review any missed items and try a similar session tomorrow.",
  mistakes: [],
  strengths: ["You completed the session."],
  nextSteps: ["Practice the same skill again and read each question twice before answering."],
};

function clip(value: unknown, max = MAX_ANSWER_CHARS): string {
  const text = toDisplayText(value).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function pickContent(content: unknown): Record<string, unknown> | undefined {
  if (!content || typeof content !== "object") return undefined;
  const c = content as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof c.type === "string") out.type = c.type;
  if (Array.isArray(c.options)) out.options = c.options.slice(0, 6).map((o) => clip(o, 80));
  if (typeof c.correct === "number" || typeof c.correct === "string") out.correct = c.correct;
  if (typeof c.explanation === "string") out.explanation = clip(c.explanation, 200);
  if (typeof c.prompt === "string") out.prompt = clip(c.prompt, 400);
  return Object.keys(out).length > 0 ? out : undefined;
}

export function serializeAttemptAnswers(
  answers: Array<{
    question?: string;
    content?: unknown;
    submittedAnswer?: unknown;
    correct?: boolean;
  }>,
): Array<{
  question: string;
  submitted: string;
  correct: boolean;
  content?: Record<string, unknown>;
}> {
  return answers.slice(0, MAX_ITEMS).map((a) => ({
    question: clip(a.question ?? "", 300),
    submitted: clip(a.submittedAnswer ?? "", MAX_ANSWER_CHARS),
    correct: Boolean(a.correct),
    content: pickContent(a.content),
  }));
}

function attemptSystemPrompt(domain: string, level: number): string {
  return `${feedbackCoachPrompt(domain, level)}

This is end-of-session feedback for ONE domain and ONE band only. Do not mix in other domains.
- Use only the answers given. Do not invent what the student said.
- Do not mention photos that were not in the questions.
- Correct items are not mistakes.
- At most 4 mistakes. Do not write a strengths / "what went well" list.

OUTPUT SCHEMA
{
  "summary": "<2–3 sentences about this attempt>",
  "mistakes": [
    {
      "question": "<short restatement of the missed item>",
      "what_happened": "<what missed the target>",
      "how_to_improve": "<one specific action>"
    }
  ],
  "strengths": [],
  "next_steps": ["<what to practice next>"]
}`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => toDisplayText(v).trim()).filter(Boolean).slice(0, 4);
}

export async function generateAttemptFeedback(params: {
  domain: string;
  tier?: string;
  level: number;
  scorePct: number;
  topic?: string | null;
  keyUse?: string | null;
  answers: Array<{
    question?: string;
    content?: unknown;
    submittedAnswer?: unknown;
    correct?: boolean;
  }>;
}): Promise<AttemptFeedback> {
  const items = serializeAttemptAnswers(params.answers ?? []);
  const userPrompt = JSON.stringify({
    domain: params.domain,
    tier: params.tier ?? "general",
    level: params.level,
    score_pct: Math.round(params.scorePct),
    topic: params.topic ?? null,
    key_use: params.keyUse ?? null,
    answers: items,
  });

  try {
    const result = (await callClaude(attemptSystemPrompt(params.domain, params.level), userPrompt, 900)) as {
      summary?: unknown;
      mistakes?: unknown;
      strengths?: unknown;
      next_steps?: unknown;
    };

    const mistakesRaw = Array.isArray(result.mistakes) ? result.mistakes : [];
    const mistakes: AttemptFeedbackItem[] = mistakesRaw.slice(0, 4).map((row) => {
      const m = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        question: clip(m.question ?? "", 200) || "Missed item",
        whatHappened: clip(m.what_happened ?? m.whatHappened ?? "", 280),
        howToImprove: clip(m.how_to_improve ?? m.howToImprove ?? "", 280),
      };
    }).filter((m) => m.whatHappened || m.howToImprove);

    return {
      summary: clip(result.summary ?? "", 500) || EMPTY_FEEDBACK.summary,
      mistakes,
      strengths: [],
      nextSteps: asStringArray(result.next_steps).length
        ? asStringArray(result.next_steps)
        : EMPTY_FEEDBACK.nextSteps,
    };
  } catch (err) {
    logger.error({ err }, "generateAttemptFeedback failed");
    return EMPTY_FEEDBACK;
  }
}
