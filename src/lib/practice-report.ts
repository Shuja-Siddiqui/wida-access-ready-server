/**
 * End-of-session practice report: strengths/weaknesses saved on the session,
 * then passed into the next content-generate call as a helper.
 * WIDA level + framework/factors always win over this report.
 */

import type { AttemptFeedback } from "./claude/attempt-feedback";

const MAX_SENTENCE = 400;
/** Max list items kept when persisting or passing a practice report between sessions. */
export const PRACTICE_REPORT_LIST_LIMIT = 4;

export interface PracticeReport {
  domain: string;
  level: number;
  /** Exact fractional level at session end (e.g. 1.4). */
  fractionalLevel?: number;
  /** Sub-step within the integer level (0=Entry … 4=Advanced). */
  stepWithinLevel?: number;
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

function clipList(values: string[] | undefined, maxItems = PRACTICE_REPORT_LIST_LIMIT): string[] {
  return (values ?? []).map((v) => clip(v, 240)).filter(Boolean).slice(0, maxItems);
}

export function buildPracticeReport(params: {
  domain: string;
  level: number;
  fractionalLevel?: number;
  stepWithinLevel?: number;
  scorePct: number;
  keyUse?: string | null;
  topic?: string | null;
  feedback: AttemptFeedback;
}): PracticeReport {
  const weaknesses = (params.feedback.mistakes ?? [])
    .map((m) => [m.whatHappened, m.howToImprove].filter(Boolean).join(" — "))
    .filter(Boolean);
  const fractional = params.fractionalLevel ?? params.level;
  const floor = Math.floor(fractional);
  const step = params.stepWithinLevel ?? Math.min(4, Math.round((fractional - floor) / 0.2));
  return {
    domain: params.domain,
    level: floor,
    fractionalLevel: fractional,
    stepWithinLevel: step,
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
  const level = typeof r.level === "number" ? r.level : 0;
  const fractionalLevel = typeof r.fractionalLevel === "number" ? r.fractionalLevel : level;
  const stepWithinLevel = typeof r.stepWithinLevel === "number" ? r.stepWithinLevel : undefined;
  return {
    domain: typeof r.domain === "string" ? r.domain : "",
    level,
    fractionalLevel,
    stepWithinLevel,
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
    level: report.level,
    fractional_level: report.fractionalLevel ?? report.level,
    step_within_level: report.stepWithinLevel,
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
