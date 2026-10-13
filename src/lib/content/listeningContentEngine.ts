/**
 * Listening Content Engine
 *
 * Assembles the full context used to generate a targeted listening session:
 *   - 2020 framework task (Standard × KLU × interpretive PLD)
 *   - SF academic topics come from lib/academic/* (sessions.ts); selectedTopic here is unused for content.
 *
 * This module is pure data transformation — no DB calls.
 * DB fetching happens in the session route (sessions.ts) and the result
 * is passed here for assembly, keeping this layer testable without mocks.
 */

import {
  prominenceForSubject,
  selectFrameworkTask,
  subjectPoolForKeyUse,
  type AcademicSubjectId,
  type FrameworkTask,
} from "../claude/standards/2020";
import {
  nextFrameworkAcademicSubject,
  nextFrameworkKeyUseForSubject,
} from "./frameworkRotation";
import { listeningAvailableFormats } from "./formatCapabilities";
// ── Types ─────────────────────────────────────────────────────────────────────

export interface ListeningContext {
  /** ELP integer level (1–6), floored from fractional score */
  elpLevel: number;
  /** The student's exact fractional score (e.g. 2.4) */
  fractionalLevel: number;
  /** 0 = just entered (max scaffolding), 4 = about to graduate (min scaffolding) */
  stepWithinLevel: number;
  /** Human-readable step label: "Entry" | "Early" | "Mid" | "Late" | "Advanced" */
  stepLabel: string;
  /** Exact difficulty instruction derived from sub-step — primary calibration signal */
  complexityInstruction: string;
  /** Oral discourse type for this level (from WIDA) */
  oralFormat: string;
  /** Question formats permitted at this level (derived from CanDo task verbs) */
  permittedFormats: string[];
  keyUse: string;
  /** 2020 Standard × KLU × interpretive functions + this-level PLDs. */
  framework: FrameworkTask;
  /** Single pre-selected topic — persisted from a failed session or randomly chosen */
  selectedTopic: string;
}

// ── Level metadata (derived from WIDA CanDo language) ────────────────────────

const LEVEL_LABELS: Record<number, string> = {
  0: "0 — Pre-Entry",
  1: "1 — Entering",
  2: "2 — Emerging",
  3: "3 — Developing",
  4: "4 — Expanding",
  5: "5 — Bridging",
  6: "6 — Reaching",
};

/** Oral discourse type specified by WIDA for each level */
const LEVEL_ORAL_FORMAT: Record<number, string> = {
  1: "short oral statements (1–2 sentences); visual support assumed",
  2: "2–3 sentences; oral directions or descriptions paired with labeled visuals, charts, or cause/effect illustrations",
  3: "short paragraph of familiar text read aloud; narrative or informational oral texts",
  4: "paragraph-length oral discourse; peer-style oral presentations",
  5: "extended oral passages; oral directions for constructing models; video/technology-based oral discourse",
  6: "diverse media and oral formats; multimedia (e.g., video-style narration); complex oral discourse",
};

// ── Sub-step helpers ──────────────────────────────────────────────────────────

const STEP_LABELS = ["Entry", "Early", "Mid", "Late", "Advanced"] as const;

/**
 * Each WIDA integer level (1–6) is divided into 5 sub-steps of 0.2.
 * We floor (not round) so that 1.8 stays in Level 1, not Level 2.
 * Level 1 is the entry point; WIDA practice exit is 4.7.
 */
function floorLevel(fractional: number): number {
  return Math.min(6, Math.max(1, Math.floor(fractional)));
}

/**
 * Which 0-indexed sub-step within the integer level the student is on.
 * 1.0→0  1.2→1  1.4→2  1.6→3  1.8→4
 * 2.0→0  2.2→1  …
 */
function subStep(fractional: number): number {
  const base = floorLevel(fractional);
  if (base >= 6) return 0;
  return Math.min(4, Math.round((fractional - base) / 0.2));
}

const COMPLEXITY_INSTRUCTIONS: Record<number, (level: number) => string> = {
  0: (l) => `ENTRY of Level ${l}: English at the floor of this level. Simple words and short sentences. Aim at framework.pld.`,
  1: (l) => `EARLY Level ${l}: Still this level's English, a little more variety. Aim at framework.pld.`,
  2: (l) => `MID Level ${l}: Typical English for this level. Aim at framework.pld.`,
  3: (l) => `LATE Level ${l}: Toward the ceiling of this level. Denser sentences and more precise words, still matching framework.pld — not the next level.`,
  4: (l) => `ADVANCED Level ${l}: At the end-of-level listening in framework.pld. Ready to leave this level. Do not write English from level ${l + 1}.`,
};

// ── Can Do helpers ────────────────────────────────────────────────────────────

/** Ordered rotation. 2016 Recount is split into Narrate + Inform. Discuss is oral-only — not in this rotation. */
export const KEY_USE_ROTATION = ["Narrate", "Inform", "Explain", "Argue"] as const;
export type KeyUse = typeof KEY_USE_ROTATION[number];

/** Map stored session values (including legacy Recount) onto the current rotation. */
export function normalizeRotationKeyUse(keyUse: string | null | undefined): KeyUse | null {
  if (!keyUse) return null;
  if (keyUse === "Recount") return "Narrate";
  if (KEY_USE_ROTATION.includes(keyUse as KeyUse)) return keyUse as KeyUse;
  return null;
}

/**
 * Returns the next key use in the rotation.
 * @param lastKeyUse - The key use from the student's last completed session, or null for their first.
 * @param isRetry    - If true, keep the same key use (student is re-practising the same skill).
 */
export function nextKeyUse(lastKeyUse: string | null, isRetry: boolean): KeyUse {
  const last = normalizeRotationKeyUse(lastKeyUse);
  if (isRetry && last) return last;
  const lastIndex = last ? KEY_USE_ROTATION.indexOf(last) : -1;
  return KEY_USE_ROTATION[(lastIndex + 1) % KEY_USE_ROTATION.length];
}

export { prominenceForSubject, subjectPoolForKeyUse };

// ── Context assembly ──────────────────────────────────────────────────────────

/**
 * Assembles the ListeningContext used to generate one session's content.
 *
 * @param fractionalLevel - Student's current score (e.g. 2.4)
 * @param topicsUsedToday - Topics used in the last 24 h (for dedup on fresh pick)
 * @param persistedTopic  - Topic from last failed session — reuse it if set
 * @param lastKeyUse      - Key use from last completed listening session (null = first ever session)
 */
export function buildListeningContext(
  fractionalLevel: number,
  topicsUsedToday: string[] = [],
  persistedTopic: string | null = null,
  lastKeyUse: string | null = null,
  academicSubject: AcademicSubject,
  keyUseOverride?: string | null,
): ListeningContext {
  const elpLevel  = floorLevel(fractionalLevel);
  const step      = subStep(fractionalLevel);
  const isRetry   = persistedTopic !== null;
  const keyUse    = keyUseOverride ?? nextKeyUse(lastKeyUse, isRetry);

  return {
    elpLevel,
    fractionalLevel,
    stepWithinLevel:       step,
    stepLabel:             STEP_LABELS[step],
    complexityInstruction: (COMPLEXITY_INSTRUCTIONS[step] ?? COMPLEXITY_INSTRUCTIONS[2])(elpLevel),
    oralFormat:            LEVEL_ORAL_FORMAT[elpLevel]       ?? "",
    permittedFormats:      listeningAvailableFormats(elpLevel),
    keyUse,
    framework:             selectFrameworkTask({
      level: elpLevel,
      keyUse,
      mode: "interpretive",
      academicSubject: academicSubject as AcademicSubjectId,
    }),
    selectedTopic:         persistedTopic ?? "",
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Clamps a fractional level to the nearest valid ELP integer (1–6) for CanDo/curriculum lookups.
 *  Level 0 maps to 1 (most basic available CanDo/curriculum data). */
export function clampLevel(level: number): number {
  return Math.min(6, Math.max(1, Math.round(Math.max(1, level))));
}

// ── Academic tier ─────────────────────────────────────────────────────────────

/**
 * Academic subjects for the academic tier (WIDA ELD Standards 2–5).
 * Standard 1 (Social & Instructional) is the everyday / photo path, not this list.
 */
/** ELA → Math → Science → Social Studies — subject-first rotation order. */
export const ACADEMIC_SUBJECTS = ["ela", "math", "science", "social_studies"] as const;
export const ACADEMIC_SUBJECT_ROTATION: readonly AcademicSubject[] = ACADEMIC_SUBJECTS;
export type AcademicSubject = (typeof ACADEMIC_SUBJECTS)[number];

/** Human-readable labels for each academic subject. */
export const ACADEMIC_SUBJECT_LABELS: Record<AcademicSubject, string> = {
  math:          "Mathematics",
  science:       "Science",
  social_studies: "Social Studies",
  ela:           "English Language Arts",
};

export type AcademicSessionRef = {
  keyUse?: string | null;
  subject?: string | null;
};

export function asAcademicSubject(value: string | null | undefined): AcademicSubject | null {
  return ACADEMIC_SUBJECTS.includes(value as AcademicSubject) ? (value as AcademicSubject) : null;
}

/**
 * Pick the academic world for this session's Key Language Use.
 * Rotates inside that use's Table 3-11 pool (last time we practiced THIS key use),
 * so Narrate can move ela → social_studies instead of locking to one subject.
 */
/** Last key use practiced for this subject only (ignores other subjects' sessions). */
export function lastKeyUseForSubject(
  recent: AcademicSessionRef[],
  subject: AcademicSubject,
): string | null {
  for (const row of recent) {
    if (asAcademicSubject(row.subject) === subject && row.keyUse) return row.keyUse;
  }
  return null;
}

/** True when every KLU in the pool has been used for this subject. */
export function subjectKluCycleComplete(
  pool: readonly KeyUse[],
  lastKeyUseForSubject: string | null,
): boolean {
  if (pool.length === 0) return true;
  const last = normalizeRotationKeyUse(lastKeyUseForSubject);
  if (!last || !pool.includes(last)) return false;
  return pool[pool.length - 1] === last;
}

function nextKeyUseInPool(
  lastKeyUse: string | null,
  isRetry: boolean,
  pool: readonly KeyUse[],
): KeyUse {
  const last = normalizeRotationKeyUse(lastKeyUse);
  if (isRetry && last && pool.includes(last)) return last;
  if (!last || !pool.includes(last)) return pool[0] ?? "Inform";
  return pool[(pool.indexOf(last) + 1) % pool.length];
}

/**
 * Subject-first rotation: stay on a subject until its KLU pool is exhausted,
 * then advance to the next subject in ACADEMIC_SUBJECT_ROTATION.
 */
export function nextAcademicSubject(
  recent: AcademicSessionRef[],
  isRetry: boolean,
  lastSessionSubject: AcademicSubject | null,
  keyUsePoolForSubject: (subject: AcademicSubject) => readonly KeyUse[],
): AcademicSubject {
  const rotation = ACADEMIC_SUBJECT_ROTATION.filter(
    (s) => keyUsePoolForSubject(s).length > 0,
  );
  const fallback = rotation[0] ?? "ela";

  if (isRetry && lastSessionSubject && rotation.includes(lastSessionSubject)) {
    return lastSessionSubject;
  }

  if (lastSessionSubject && rotation.includes(lastSessionSubject)) {
    const subjectLastKu = lastKeyUseForSubject(recent, lastSessionSubject);
    const pool = keyUsePoolForSubject(lastSessionSubject);
    if (!subjectKluCycleComplete(pool, subjectLastKu)) return lastSessionSubject;
    const idx = rotation.indexOf(lastSessionSubject);
    if (idx >= 0) return rotation[(idx + 1) % rotation.length];
  }

  return fallback;
}

/** Next KLU for this subject — uses that subject's history, not global last session. */
export function nextKeyUseForSubject(
  recent: AcademicSessionRef[],
  subject: AcademicSubject,
  isRetry: boolean,
  retryKeyUse: string | null,
  keyUsePoolForSubject: (subject: AcademicSubject) => readonly KeyUse[],
): KeyUse {
  const pool = keyUsePoolForSubject(subject);
  if (pool.length === 0) return "Inform";

  if (isRetry && retryKeyUse) {
    const retry = normalizeRotationKeyUse(retryKeyUse);
    if (retry && pool.includes(retry)) return retry;
  }

  const subjectLast = lastKeyUseForSubject(recent, subject);
  return nextKeyUseInPool(subjectLast, false, pool);
}

export function pickSubjectForKeyUse(
  keyUse: string | null | undefined,
  recent: AcademicSessionRef[] | string | null = [],
  isRetry = false,
): AcademicSubject {
  const pool = subjectPoolForKeyUse(keyUse);
  const ku = normalizeRotationKeyUse(keyUse);
  const rows: AcademicSessionRef[] = typeof recent === "string" || recent == null
    ? (recent ? [{ subject: recent }] : [])
    : recent;
  const lastAny = asAcademicSubject(rows[0]?.subject);
  if (isRetry && lastAny && pool.includes(lastAny)) return lastAny;

  const lastSame = ku
    ? asAcademicSubject(
        rows.find((r) => normalizeRotationKeyUse(r.keyUse) === ku)?.subject,
      )
    : null;
  if (lastSame && pool.includes(lastSame)) {
    return pool[(pool.indexOf(lastSame) + 1) % pool.length];
  }
  return pool.find((s) => s !== lastAny) ?? pool[0];
}

export function nextSubject(
  lastSubject: string | null,
  keyUse: string | null = null,
  isRetry = false,
): AcademicSubject {
  return pickSubjectForKeyUse(keyUse, lastSubject, isRetry);
}

/**
 * The full context for one academic listening session.
 * Extends the base ListeningContext with subject information.
 */
export interface AcademicListeningContext extends ListeningContext {
  /** The academic subject targeted this session */
  subject: AcademicSubject;
  /** Human-readable subject label, e.g. "Mathematics" */
  subjectLabel: string;
}

/**
 * Assembles the AcademicListeningContext for one academic session.
 * Key use still rotates; the academic subject is chosen from Table 3-11 for that use.
 */
export function buildAcademicListeningContext(
  fractionalLevel: number,
  topicsUsedToday: string[] = [],
  persistedTopic: string | null = null,
  lastKeyUse: string | null = null,
  recentAcademic: AcademicSessionRef[] = [],
): AcademicListeningContext {
  const isRetry = persistedTopic !== null;
  const lastSubject = asAcademicSubject(recentAcademic[0]?.subject);
  const subject = nextFrameworkAcademicSubject(
    recentAcademic,
    isRetry,
    lastSubject,
    "interpretive",
  );
  const keyUse = nextFrameworkKeyUseForSubject(
    recentAcademic,
    subject,
    isRetry,
    lastKeyUse,
    "interpretive",
  );
  const base = buildListeningContext(
    fractionalLevel,
    topicsUsedToday,
    persistedTopic,
    lastKeyUse,
    subject,
    keyUse,
  );
  return {
    ...base,
    subject,
    subjectLabel: ACADEMIC_SUBJECT_LABELS[subject],
  };
}
