/**
 * End-of-session practice report: strengths/weaknesses saved on the session,
 * then passed into the next content-generate call as a helper.
 * WIDA level + framework/factors always win over this report.
 */

import type { AttemptFeedback } from "./claude/attempt-feedback";

const MAX_SENTENCE = 400;

export interface PracticeReport {
  domain: string;
  level: number;
  scorePct: number;
  keyUse: string | null;
  topic: string | null;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  nextSteps: string[];
  coachForNextSession: string;
}

function clip(text: string, max = MAX_SENTENCE): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function clipList(values: string[] | undefined, maxItems = 4): string[] {
  return (values ?? []).map((v) => clip(v, 240)).filter(Boolean).slice(0, maxItems);
}

export function buildPracticeReport(params: {
  domain: string;
  level: number;
  scorePct: number;
  keyUse?: string | null;
  topic?: string | null;
  feedback: AttemptFeedback;
}): PracticeReport {
  const weaknesses = (params.feedback.mistakes ?? [])
    .map((m) => [m.whatHappened, m.howToImprove].filter(Boolean).join(" — "))
    .filter(Boolean);
  return {
    domain: params.domain,
    level: params.level,
    scorePct: Math.round(params.scorePct),
    keyUse: params.keyUse ?? null,
    topic: params.topic ?? null,
    summary: clip(params.feedback.summary ?? ""),
    strengths: clipList(params.feedback.strengths),
    weaknesses: clipList(weaknesses),
    nextSteps: clipList(params.feedback.nextSteps),
    coachForNextSession: clip(params.feedback.coachForNextSession ?? "", 600),
  };
}

export function parsePracticeReport(raw: unknown): PracticeReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = typeof r.summary === "string" ? r.summary : "";
  const coach = typeof r.coachForNextSession === "string" ? r.coachForNextSession : "";
  const strengths = Array.isArray(r.strengths) ? r.strengths.filter((s): s is string => typeof s === "string") : [];
  const weaknesses = Array.isArray(r.weaknesses) ? r.weaknesses.filter((s): s is string => typeof s === "string") : [];
  if (!summary && !coach && strengths.length === 0 && weaknesses.length === 0) return null;
  return {
    domain: typeof r.domain === "string" ? r.domain : "",
    level: typeof r.level === "number" ? r.level : 0,
    scorePct: typeof r.scorePct === "number" ? r.scorePct : 0,
    keyUse: typeof r.keyUse === "string" ? r.keyUse : null,
    topic: typeof r.topic === "string" ? r.topic : null,
    summary: clip(summary),
    strengths: clipList(strengths),
    weaknesses: clipList(weaknesses),
    nextSteps: clipList(Array.isArray(r.nextSteps) ? r.nextSteps.filter((s): s is string => typeof s === "string") : []),
    coachForNextSession: clip(coach, 600),
  };
}

/** Compact payload for the next generate() call. */
export function priorPracticeForGenerator(report: PracticeReport | null | undefined): Record<string, unknown> | undefined {
  if (!report) return undefined;
  return {
    from_last_session: true,
    score_pct: report.scorePct,
    key_use: report.keyUse,
    topic: report.topic,
    summary: report.summary,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    next_steps: report.nextSteps,
    coach: report.coachForNextSession,
    rule: "Helper only. Give a bit more practice on weaknesses. Do not change level, key language use, language functions, or PLD. If this report fights those, ignore it.",
  };
}

export function mergePriorPractice<T extends Record<string, unknown>>(
  user: T,
  report: PracticeReport | null | undefined,
): T {
  const prior = priorPracticeForGenerator(report);
  if (!prior) return user;
  return { ...user, prior_practice_report: prior };
}
