/**
 * Reading Content Engine
 *
 * Assembles the full context used to generate a targeted reading session:
 *   - WIDA Can Do descriptors for the student's current ELP level (READING domain)
 *   - Curriculum topics scaled to the student's level (from readingCurriculum.json)
 *   - Sub-step complexity instruction calibrated from the student's fractional score
 *
 * This module is pure data transformation — no DB calls.
 * DB fetching happens in the session route (sessions.ts) and the result
 * is passed here for assembly, keeping this layer testable without mocks.
 */

import canDoData from "../data/canDo.json";
import curriculumData from "../data/readingCurriculum.json";

// Re-use shared types from the listening engine — the key use rotation is the same
// across all domains (Recount → Explain → Argue cycles continuously).
export type { CanDoEntry, KeyUse } from "./listeningContentEngine";
export { KEY_USE_ROTATION, nextKeyUse, clampLevel } from "./listeningContentEngine";

import { KEY_USE_ROTATION, nextKeyUse, clampLevel } from "./listeningContentEngine";
import type { CanDoEntry } from "./listeningContentEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReadingContext {
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
  /** Text type and length descriptor for this level */
  textFormat: string;
  /** Question formats Claude is allowed to use — derived from CanDo at this level */
  permittedFormats: string[];
  /**
   * The single WIDA Can Do targeted this session — one per key use, rotates across sessions.
   * Contains: keyUse (Recount|Explain|Argue), action ("Process recounts by"), items (the sub-skill bullet points).
   */
  canDo: CanDoEntry;
  /** Single pre-selected topic — persisted from a failed session or randomly chosen */
  selectedTopic: string;
  /** How many comprehension questions to generate */
  questionCount: number;
  /** Hard max words for the passage */
  passageWordMax: number;
}

// ── Level metadata ────────────────────────────────────────────────────────────

/**
 * Question formats permitted at each WIDA level — derived directly from the
 * READING CanDo descriptors (Key Uses Edition, Grades 6–8):
 *
 *  L1 Recount → identify Wh-question responses        → multiple_choice
 *  L1 Explain → match objects/media to words           → match_columns
 *  L1 Argue   → classify true from false statements    → classify
 *  L2 Recount → sequence illustrated events            → sequence_order
 *  L2 Explain → compare ideas (same topic)             → multiple_choice
 *  L2 Argue   → distinguish facts from opinions        → classify
 *  L3 Recount → identify topic sentences/main ideas    → multiple_choice
 *  L3 Explain → sequence steps or events               → sequence_order
 *  L3 Argue   → identify claims and reasons            → multiple_choice
 *  L4 Recount → order paragraphs / identify summaries  → sequence_order, multiple_choice
 *  L4 Explain → match cause to effect                  → match_columns
 *  L4 Argue   → classify pros and cons                 → classify
 *  L5 Recount → sequence main ideas / conclusions      → sequence_order
 *  L5 Argue   → evaluate evidence / develop stance     → multiple_choice
 *  L6 Recount → identify central idea + details        → multiple_choice
 *  L6 Argue   → distinguish fact/reasoned judgment/speculation → classify
 */
export const READING_PERMITTED_FORMATS: Record<number, string[]> = {
  1: ["multiple_choice", "match_columns", "classify"],
  2: ["multiple_choice", "sequence_order", "classify"],
  3: ["multiple_choice", "sequence_order"],
  4: ["multiple_choice", "sequence_order", "match_columns", "classify"],
  5: ["multiple_choice", "sequence_order"],
  6: ["multiple_choice", "classify"],
};

/** Text format and length by WIDA level — what students READ at each level */
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
  0: (l) => `ENTRY of Level ${l}: Maximum scaffolding. Simplest vocabulary and sentence structures for this reading level. Student just entered — keep the passage highly accessible.`,
  1: (l) => `EARLY Level ${l}: Strong scaffolding. Slightly more varied vocabulary, short compound sentences. Student is building reading confidence.`,
  2: (l) => `MID Level ${l}: Standard difficulty. Balanced academic vocabulary, moderate sentence complexity, some inference required from the text.`,
  3: (l) => `LATE Level ${l}: Reduced scaffolding. More complex sentences, higher Tier-2 vocabulary. Student is consolidating reading mastery.`,
  4: (l) => `ADVANCED Level ${l}: Minimal scaffolding. Push to the ceiling of Level ${l} reading complexity — approach Level ${l + 1}. Prepare the student to graduate this level.`,
};

// ── Can Do lookup ─────────────────────────────────────────────────────────────

/**
 * Returns the single Can Do for READING at a given ELP level for the given key use.
 * Level 1 READING is present in canDo.json — all 6 levels are covered.
 */
export function getReadingCanDoForKeyUse(level: number, keyUse: string): CanDoEntry {
  const elpLevel = clampLevel(level);
  const levelEntry = (canDoData as any).levels.find(
    (l: any) => l.elpLevel === `ELP Level ${elpLevel}`,
  );
  if (!levelEntry) return { keyUse, action: "", items: [] };

  const readingDomain = levelEntry.domains.find((d: any) => d.domain === "READING");
  if (!readingDomain) return { keyUse, action: "", items: [] };

  const entry = readingDomain.keyUses.find((k: any) => k.keyUse === keyUse);
  if (!entry) return { keyUse, action: "", items: [] };

  return {
    keyUse,
    action: entry.action as string,
    items:  entry.canDo  as string[],
  };
}

// ── Curriculum helpers ────────────────────────────────────────────────────────

/** Returns a flat list of reading curriculum topics for a given ELP level. */
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
 * Picks the topic for a reading session.
 * - Reuses the persisted topic if the last session failed (score < 70).
 * - Otherwise picks a random topic from the curriculum, skipping topics used today.
 */
export function selectReadingTopic(
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
 * Assembles the ReadingContext used to generate one reading session's content.
 *
 * @param fractionalLevel - Student's current reading score (e.g. 2.4)
 * @param topicsUsedToday - Topics used in the last 24 h (for dedup on fresh pick)
 * @param persistedTopic  - Topic from last failed session — reuse it if set
 * @param lastKeyUse      - Key use from last completed reading session (null = first ever)
 */
export function buildReadingContext(
  fractionalLevel: number,
  topicsUsedToday: string[] = [],
  persistedTopic: string | null = null,
  lastKeyUse: string | null = null,
): ReadingContext {
  const elpLevel = floorLevel(fractionalLevel);
  const step     = subStep(fractionalLevel);
  const isRetry  = persistedTopic !== null;
  const keyUse   = nextKeyUse(lastKeyUse, isRetry);

  return {
    elpLevel,
    fractionalLevel,
    stepWithinLevel:       step,
    stepLabel:             STEP_LABELS[step],
    complexityInstruction: (COMPLEXITY_INSTRUCTIONS[step] ?? COMPLEXITY_INSTRUCTIONS[2])(elpLevel),
    textFormat:            READING_TEXT_FORMAT[elpLevel]         ?? "",
    permittedFormats:      READING_PERMITTED_FORMATS[elpLevel]   ?? ["multiple_choice"],
    canDo:                 getReadingCanDoForKeyUse(elpLevel, keyUse),
    selectedTopic:         selectReadingTopic(elpLevel, persistedTopic, topicsUsedToday),
    questionCount:         READING_QUESTION_COUNT[elpLevel]      ?? 3,
    passageWordMax:        READING_PASSAGE_WORD_MAX[elpLevel]    ?? 90,
  };
}
