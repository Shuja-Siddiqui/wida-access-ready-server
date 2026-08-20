/**
 * Speaking Content Engine
 *
 * Assembles the full context used to generate a targeted speaking session:
 *   - WIDA Can Do descriptors for the student's current ELP level (SPEAKING domain)
 *   - Curriculum topics scaled to the student's level (from speakingCurriculum.json)
 *   - Sub-step complexity instruction calibrated from the student's fractional score
 *
 * This module is pure data transformation — no DB calls.
 * DB fetching happens in the session route (sessions.ts) and the result
 * is passed here for assembly, keeping this layer testable without mocks.
 */

import canDoData from "../data/canDo.json";
import curriculumData from "../data/speakingCurriculum.json";

import { KEY_USE_ROTATION, nextKeyUse, clampLevel } from "./listeningContentEngine";
import type { CanDoEntry } from "./listeningContentEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpeakingContext {
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
  /** Oral production type the student is expected to generate at this level */
  discourseType: string;
  /** Whether a sentence frame scaffold should be provided */
  scaffoldRequired: boolean;
  /** Expected oral output length, derived from CanDo level descriptor */
  responseLength: string;
  /** Prompt type options Claude may use, derived from key use + level CanDo */
  allowedPromptTypes: string[];
  /** Target speaking duration at this level */
  targetSeconds: { min: number; max: number };
  /**
   * The single WIDA Can Do targeted this session — one per key use, rotates across sessions.
   * Contains: keyUse (Recount|Explain|Argue), action ("Recount by"), items (the sub-skill bullet points).
   */
  canDo: CanDoEntry;
  /** Single pre-selected topic — persisted from a failed session or randomly chosen */
  selectedTopic: string;
}

// ── Level metadata ────────────────────────────────────────────────────────────

/** What the student PRODUCES orally at each WIDA level */
const SPEAKING_DISCOURSE_TYPE: Record<number, string> = {
  1: "1–2 word answers, labeling, or naming; gestures and visual support expected",
  2: "2–3 word phrases or short simple sentences; familiar vocabulary with visual support",
  3: "3–5 sentences with transition words; familiar Tier-2 academic vocabulary",
  4: "one developed paragraph with hedging language, Tier-2 vocabulary, and connectors",
  5: "extended organized response; academic vocabulary; complex sentences with logical connectors",
  6: "sophisticated oral discourse; nuanced vocabulary; idiomatic language; varied sentence structures",
};

/**
 * Expected response length label by WIDA level — derived from CanDo oral production descriptors.
 * Sent to Claude so it sizes the prompt and scaffold to the right production demand.
 */
export const SPEAKING_RESPONSE_LENGTH: Record<number, string> = {
  1: "word_or_phrase",      // 1–2 word answers, labeling, naming, yes/no
  2: "1_2_sentences",       // short statements, modeled sentences
  3: "3_5_sentences",       // multi-sentence with transitions and tenses
  4: "paragraph",           // one developed paragraph with hedging/connectors
  5: "extended",            // extended organized discourse
  6: "extended",            // sophisticated oral discourse
};

/**
 * Prompt type options allowed per key use + level — derived from CanDo production verbs.
 * Claude must pick exactly one; this steers the task design to match what the CanDo targets.
 *
 *  Recount L1 → answer Wh-questions           → wh_answer
 *  Recount L2 → state main ideas              → narrative
 *  Recount L3 → relate series of events       → narrative
 *  Recount L4 → paraphrase/summarize          → summary
 *  Recount L5-6 → oral reports from sources   → extended_report
 *
 *  Explain L1 → compare attributes of objects → descriptive
 *  Explain L2 → describe from modeled sentences → descriptive
 *  Explain L3-6 → state why/how, demonstrate  → explanatory
 *
 *  Argue L1 → respond yes/no to claims        → yes_no
 *  Argue L2-6 → state evidence, critique, debate → argumentative
 */
export const SPEAKING_ALLOWED_PROMPT_TYPES: Record<string, Record<number, string[]>> = {
  Recount: {
    1: ["wh_answer"],
    2: ["narrative"],
    3: ["narrative"],
    4: ["summary"],
    5: ["extended_report"],
    6: ["extended_report"],
  },
  Explain: {
    1: ["descriptive"],
    2: ["descriptive"],
    3: ["explanatory"],
    4: ["explanatory"],
    5: ["explanatory"],
    6: ["explanatory"],
  },
  Argue: {
    1: ["yes_no"],
    2: ["argumentative"],
    3: ["argumentative"],
    4: ["argumentative"],
    5: ["argumentative"],
    6: ["argumentative"],
  },
};

/** Whether a sentence frame scaffold is appropriate at each level */
const SPEAKING_SCAFFOLD_REQUIRED: Record<number, boolean> = {
  1: true,
  2: true,
  3: true,
  4: false,
  5: false,
  6: false,
};

/** Target speaking duration at each level in seconds */
const SPEAKING_TARGET_SECONDS: Record<number, { min: number; max: number }> = {
  1: { min: 10, max: 20 },
  2: { min: 20, max: 35 },
  3: { min: 30, max: 60 },
  4: { min: 45, max: 90 },
  5: { min: 60, max: 120 },
  6: { min: 90, max: 150 },
};

// ── Sub-step helpers (same logic as listeningContentEngine.ts — keep in sync) ──

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
  0: (l) => `ENTRY of Level ${l}: Maximum scaffolding. Simplest vocabulary and sentence structures for this speaking level. Student just entered — keep the task highly accessible with full sentence frame support.`,
  1: (l) => `EARLY Level ${l}: Strong scaffolding. Slightly more varied vocabulary, short connected sentences. Sentence frame or starter provided. Student is building speaking confidence.`,
  2: (l) => `MID Level ${l}: Standard difficulty. Balanced academic vocabulary, moderate sentence complexity. Some language support provided. Student should attempt multi-sentence responses.`,
  3: (l) => `LATE Level ${l}: Reduced scaffolding. More complex sentences, higher Tier-2 vocabulary. Minimal language support. Student is consolidating speaking mastery.`,
  4: (l) => `ADVANCED Level ${l}: Minimal scaffolding. Push to the ceiling of Level ${l} speaking complexity — approach Level ${l + 1}. Student should produce organized, detailed speech with academic vocabulary.`,
};

// ── Can Do lookup ─────────────────────────────────────────────────────────────

/**
 * Returns the single Can Do for SPEAKING at a given ELP level for the given key use.
 * All 6 levels have SPEAKING entries in canDo.json.
 */
export function getSpeakingCanDoForKeyUse(level: number, keyUse: string): CanDoEntry {
  const elpLevel = clampLevel(level);
  const levelEntry = (canDoData as any).levels.find(
    (l: any) => l.elpLevel === `ELP Level ${elpLevel}`,
  );
  if (!levelEntry) return { keyUse, action: "", items: [] };

  const speakingDomain = levelEntry.domains.find((d: any) => d.domain === "SPEAKING");
  if (!speakingDomain) return { keyUse, action: "", items: [] };

  const entry = speakingDomain.keyUses.find((k: any) => k.keyUse === keyUse);
  if (!entry) return { keyUse, action: "", items: [] };

  return {
    keyUse,
    action: entry.action as string,
    items:  entry.canDo  as string[],
  };
}

// ── Curriculum helpers ────────────────────────────────────────────────────────

/** Returns a flat list of speaking curriculum topics for a given ELP level. */
function getCurriculumTopicsForLevel(level: number): string[] {
  const elpLevel = clampLevel(level);
  const levelEntry = (curriculumData as any).levels.find(
    (l: any) => l.elpLevel === elpLevel,
  );
  if (!levelEntry) return [];

  const topics: string[] = [];
  for (const category of (levelEntry.topicCategories ?? [])) {
    for (const topic of (category.topics ?? [])) {
      topics.push(`[${category.category}] ${topic}`);
    }
  }
  return topics;
}

// ── Topic selection ───────────────────────────────────────────────────────────

/**
 * Picks the topic for a speaking session.
 * - Reuses the persisted topic if the last session failed (score < 70).
 * - Otherwise picks a random topic from the curriculum, skipping topics used today.
 */
export function selectSpeakingTopic(
  elpLevel: number,
  persistedTopic: string | null,
  topicsUsedToday: string[] = [],
): string {
  if (persistedTopic) return persistedTopic;

  const allTopics = getCurriculumTopicsForLevel(elpLevel);
  const usedLower = topicsUsedToday.map((t) => t.toLowerCase());
  const available = allTopics.filter(
    (t) => !usedLower.some((u) => t.toLowerCase().includes(u)),
  );
  const pool = available.length > 0 ? available : allTopics;
  return pool[Math.floor(Math.random() * pool.length)] ?? "";
}

// ── Context assembly ──────────────────────────────────────────────────────────

/**
 * Assembles the SpeakingContext used to generate one speaking session's content.
 *
 * @param fractionalLevel - Student's current speaking score (e.g. 2.4)
 * @param topicsUsedToday - Topics used in the last 24 h (for dedup on fresh pick)
 * @param persistedTopic  - Topic from last failed session — reuse it if set
 * @param lastKeyUse      - Key use from last completed speaking session (null = first ever)
 * @param isTelpas        - Override target seconds for TELPAS assessment timing
 */
export function buildSpeakingContext(
  fractionalLevel: number,
  topicsUsedToday: string[] = [],
  persistedTopic: string | null = null,
  lastKeyUse: string | null = null,
  isTelpas = false,
): SpeakingContext {
  const elpLevel = floorLevel(fractionalLevel);
  const step     = subStep(fractionalLevel);
  const isRetry  = persistedTopic !== null;
  const keyUse   = nextKeyUse(lastKeyUse, isRetry);

  const defaultSeconds = SPEAKING_TARGET_SECONDS[elpLevel] ?? { min: 30, max: 60 };
  const targetSeconds  = isTelpas ? { min: 45, max: 90 } : defaultSeconds;

  return {
    elpLevel,
    fractionalLevel,
    stepWithinLevel:       step,
    stepLabel:             STEP_LABELS[step],
    complexityInstruction: (COMPLEXITY_INSTRUCTIONS[step] ?? COMPLEXITY_INSTRUCTIONS[2])(elpLevel),
    discourseType:         SPEAKING_DISCOURSE_TYPE[elpLevel]                                ?? "",
    scaffoldRequired:      SPEAKING_SCAFFOLD_REQUIRED[elpLevel]                            ?? false,
    responseLength:        SPEAKING_RESPONSE_LENGTH[elpLevel]                              ?? "paragraph",
    allowedPromptTypes:    SPEAKING_ALLOWED_PROMPT_TYPES[keyUse]?.[elpLevel]               ?? ["descriptive"],
    targetSeconds,
    canDo:                 getSpeakingCanDoForKeyUse(elpLevel, keyUse),
    selectedTopic:         selectSpeakingTopic(elpLevel, persistedTopic, topicsUsedToday),
  };
}
