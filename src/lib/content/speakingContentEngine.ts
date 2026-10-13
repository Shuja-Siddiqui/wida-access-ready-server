/**
 * Speaking Content Engine
 *
 * Assembles the full context used to generate a targeted speaking session:
 *   - WIDA 2020 ELD standard × Key Language Use × expressive functions + PLDs
 *   - SF academic topics come from lib/academic/* (sessions.ts)
 */

import {
  selectFrameworkTask,
  type AcademicSubjectId,
  type FrameworkTask,
  frameworkTaskDescriptor,
} from "../claude/standards/2020";
import { expressiveKeyUsesForSubject } from "./frameworkRotation";
import { speakingAvailablePromptTypes } from "./formatCapabilities";
import {
  nextKeyUse,
  clampLevel,
  normalizeRotationKeyUse,
  type AcademicSubject,
  type KeyUse,
} from "./listeningContentEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpeakingContext {
  elpLevel: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  stepLabel: string;
  complexityInstruction: string;
  discourseType: string;
  /** WIDA level hint passed to the model — not enforced in schema. */
  responseLength: string;
  allowedPromptTypes: string[];
  targetSeconds: { min: number; max: number };
  keyUse: string;
  framework: FrameworkTask;
  selectedTopic: string;
}

// ── Level metadata ────────────────────────────────────────────────────────────

export const SPEAKING_DISCOURSE_TYPE: Record<number, string> = {
  1: "1–2 word answers, labeling, or naming; gestures and visual support expected",
  2: "2–3 word phrases or short simple sentences; familiar vocabulary with visual support",
  3: "3–5 sentences with transition words; familiar Tier-2 academic vocabulary",
  4: "one developed paragraph with hedging language, Tier-2 vocabulary, and connectors",
  5: "extended organized response; academic vocabulary; complex sentences with logical connectors",
  6: "sophisticated oral discourse; nuanced vocabulary; idiomatic language; varied sentence structures",
};

export const SPEAKING_RESPONSE_LENGTH: Record<number, string> = {
  1: "word_or_phrase",
  2: "1_2_sentences",
  3: "3_5_sentences",
  4: "paragraph",
  5: "extended",
  6: "extended",
};

const SPEAKING_TARGET_SECONDS: Record<number, { min: number; max: number }> = {
  1: { min: 10, max: 20 },
  2: { min: 20, max: 35 },
  3: { min: 30, max: 60 },
  4: { min: 45, max: 90 },
  5: { min: 60, max: 120 },
  6: { min: 90, max: 150 },
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
  4: (l) => `ADVANCED Level ${l}: At the end-of-level speaking in framework.pld. Ready to leave this level. Do not ask for level ${l + 1} English.`,
};

function nextSpeakingKeyUse(
  lastKeyUse: string | null,
  isRetry: boolean,
  academicSubject: AcademicSubject,
): KeyUse {
  const pool = expressiveKeyUsesForSubject(academicSubject);
  const last = normalizeRotationKeyUse(lastKeyUse);
  if (isRetry && last && pool.includes(last)) return last;
  if (!last || !pool.includes(last)) return pool[0] ?? "Inform";
  return pool[(pool.indexOf(last) + 1) % pool.length];
}

/** Compact WIDA speaking expectation for item coaching. */
export function speakingFrameworkCoachNote(framework: FrameworkTask): string {
  const elp = framework.pld.level;
  const ku = framework.key_language_use;
  const disc = SPEAKING_DISCOURSE_TYPE[elp] ?? "";
  const len = (SPEAKING_RESPONSE_LENGTH[elp] ?? "word_or_phrase").replace(/_/g, " ");
  return [
    `WIDA SPEAKING Level ${elp} Key Use ${ku}. Expected talk: ${disc}. Length: ${len}.`,
    `Language functions: ${frameworkTaskDescriptor(framework)}.`,
  ].join(" ");
}

/** @deprecated Use speakingFrameworkCoachNote with framework snapshot. */
export function speakingCanDoCoachNote(level: number, keyUse?: string): string {
  const elp = clampLevel(level);
  const raw = (keyUse ?? "Narrate").trim();
  const ku = /argue/i.test(raw) ? "Argue" : /explain/i.test(raw) ? "Explain" : /inform/i.test(raw) ? "Inform" : "Narrate";
  const disc = SPEAKING_DISCOURSE_TYPE[elp] ?? "";
  const len = (SPEAKING_RESPONSE_LENGTH[elp] ?? "word_or_phrase").replace(/_/g, " ");
  return `WIDA SPEAKING Level ${elp} Key Use ${ku}. Expected talk: ${disc}. Length: ${len}.`;
}

export function buildSpeakingContext(
  fractionalLevel: number,
  topicsUsedToday: string[] = [],
  persistedTopic: string | null = null,
  lastKeyUse: string | null = null,
  isTelpas = false,
  academicSubject: AcademicSubject,
  keyUseOverride?: string | null,
): SpeakingContext {
  const elpLevel = floorLevel(fractionalLevel);
  const step     = subStep(fractionalLevel);
  const isRetry  = persistedTopic !== null;
  const keyUse   = keyUseOverride ?? nextSpeakingKeyUse(lastKeyUse, isRetry, academicSubject);

  const defaultSeconds = SPEAKING_TARGET_SECONDS[elpLevel] ?? { min: 30, max: 60 };
  const targetSeconds  = isTelpas ? { min: 45, max: 90 } : defaultSeconds;

  return {
    elpLevel,
    fractionalLevel,
    stepWithinLevel:       step,
    stepLabel:             STEP_LABELS[step],
    complexityInstruction: (COMPLEXITY_INSTRUCTIONS[step] ?? COMPLEXITY_INSTRUCTIONS[2])(elpLevel),
    discourseType:         SPEAKING_DISCOURSE_TYPE[elpLevel]                                ?? "",
    responseLength:        SPEAKING_RESPONSE_LENGTH[elpLevel]                              ?? "paragraph",
    allowedPromptTypes:    speakingAvailablePromptTypes(elpLevel),
    targetSeconds,
    keyUse,
    framework:             selectFrameworkTask({
      level: elpLevel,
      keyUse,
      mode: "expressive",
      academicSubject: academicSubject as AcademicSubjectId,
    }),
    selectedTopic:         persistedTopic ?? "",
  };
}
