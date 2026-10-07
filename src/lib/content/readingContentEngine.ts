/**
 * Reading Content Engine
 *
 * Assembles the full context used to generate a targeted reading session:
 *   - WIDA 2020 ELD standard × Key Language Use × interpretive functions + PLDs
 *   - SF academic topics come from lib/academic/* (sessions.ts)
 *
 * This module is pure data transformation — no DB calls.
 */

import {
  selectFrameworkTask,
  type AcademicSubjectId,
  type FrameworkTask,
} from "../claude/standards/2020";
import { interpretiveKeyUsesForSubject } from "./frameworkRotation";
import { readingAvailableFormats } from "./formatCapabilities";
import {
  nextKeyUse,
  clampLevel,
  normalizeRotationKeyUse,
  type AcademicSubject,
  type KeyUse,
} from "./listeningContentEngine";

export type { KeyUse } from "./listeningContentEngine";
export { KEY_USE_ROTATION, nextKeyUse, clampLevel } from "./listeningContentEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReadingContext {
  elpLevel: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  stepLabel: string;
  complexityInstruction: string;
  textFormat: string;
  permittedFormats: string[];
  keyUse: string;
  /** 2020 Standard × KLU × interpretive functions + this-level PLDs. */
  framework: FrameworkTask;
  selectedTopic: string;
  questionCount: number;
  passageWordMax: number;
}

// ── Level metadata ────────────────────────────────────────────────────────────

/** @deprecated Use readingAvailableFormats — kept for imports that still reference the name. */
export const READING_PERMITTED_FORMATS: Record<number, string[]> = {
  1: readingAvailableFormats(1),
  2: readingAvailableFormats(2),
  3: readingAvailableFormats(3),
  4: readingAvailableFormats(4),
  5: readingAvailableFormats(5),
  6: readingAvailableFormats(6),
};

const READING_TEXT_FORMAT: Record<number, string> = {
  1: "HARD LIMIT: 2–4 sentences, at most 40 words total. One idea only. Subject-verb-object. No example lists, no number lines printed out, no 'Example 1/2/3'. High-frequency words only.",
  2: "HARD LIMIT: 3–5 sentences, at most 60 words. One idea per sentence. No multi-example walkthroughs.",
  3: "HARD LIMIT: 4–6 sentences, at most 90 words. One clear main idea with 2 supporting details.",
  4: "HARD LIMIT: 2 short paragraphs, at most 140 words. Topic sentence plus details.",
  5: "HARD LIMIT: 3 paragraphs, at most 200 words. Some inference allowed.",
  6: "HARD LIMIT: 3–4 paragraphs, at most 280 words. Grade-level academic text.",
};

export const READING_QUESTION_COUNT: Record<number, number> = {
  1: 2,
  2: 3,
  3: 3,
  4: 4,
  5: 5,
  6: 5,
};

export const READING_PASSAGE_WORD_MAX: Record<number, number> = {
  1: 40,
  2: 60,
  3: 90,
  4: 140,
  5: 200,
  6: 280,
};

const STEP_LABELS = ["Entry", "Early", "Mid", "Late", "Advanced"] as const;

function floorLevel(fractional: number): number {
  return Math.min(6, Math.max(1, Math.floor(fractional)));
}

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
  4: (l) => `ADVANCED Level ${l}: At the end-of-level reading in framework.pld. Ready to leave this level. Do not write English from level ${l + 1}.`,
};

function nextReadingKeyUse(
  lastKeyUse: string | null,
  isRetry: boolean,
  academicSubject: AcademicSubject,
): KeyUse {
  const pool = interpretiveKeyUsesForSubject(academicSubject);
  const last = normalizeRotationKeyUse(lastKeyUse);
  if (isRetry && last && pool.includes(last)) return last;
  if (!last || !pool.includes(last)) return pool[0] ?? "Inform";
  return pool[(pool.indexOf(last) + 1) % pool.length];
}

export function buildReadingContext(
  fractionalLevel: number,
  topicsUsedToday: string[] = [],
  persistedTopic: string | null = null,
  lastKeyUse: string | null = null,
  academicSubject: AcademicSubject,
  keyUseOverride?: string | null,
): ReadingContext {
  const elpLevel = floorLevel(fractionalLevel);
  const step     = subStep(fractionalLevel);
  const isRetry  = persistedTopic !== null;
  const keyUse   = keyUseOverride ?? nextReadingKeyUse(lastKeyUse, isRetry, academicSubject);

  return {
    elpLevel,
    fractionalLevel,
    stepWithinLevel:       step,
    stepLabel:             STEP_LABELS[step],
    complexityInstruction: (COMPLEXITY_INSTRUCTIONS[step] ?? COMPLEXITY_INSTRUCTIONS[2])(elpLevel),
    textFormat:            READING_TEXT_FORMAT[elpLevel]         ?? "",
    permittedFormats:      readingAvailableFormats(elpLevel),
    keyUse,
    framework:             selectFrameworkTask({
      level: elpLevel,
      keyUse,
      mode: "interpretive",
      academicSubject: academicSubject as AcademicSubjectId,
    }),
    selectedTopic:         persistedTopic ?? "",
    questionCount:         READING_QUESTION_COUNT[elpLevel]      ?? 3,
    passageWordMax:        READING_PASSAGE_WORD_MAX[elpLevel]    ?? 90,
  };
}
