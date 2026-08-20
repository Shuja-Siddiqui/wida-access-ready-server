/**
 * Writing Content Engine
 *
 * Assembles the full context used to generate a targeted writing session:
 *   - WIDA Can Do descriptors for the student's current ELP level (WRITING domain)
 *   - Curriculum topics scaled to the student's level (from writingCurriculum.json)
 *   - Sub-step complexity instruction calibrated from the student's fractional score
 *
 * This module is pure data transformation — no DB calls.
 * DB fetching happens in the session route (sessions.ts) and the result
 * is passed here for assembly, keeping this layer testable without mocks.
 */

import canDoData from "../data/canDo.json";
import curriculumData from "../data/writingCurriculum.json";

import { KEY_USE_ROTATION, nextKeyUse, clampLevel } from "./listeningContentEngine";
import type { CanDoEntry } from "./listeningContentEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WritingContext {
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
  /** Writing genre and length description for this level */
  writingFormat: string;
  /** Minimum sentences expected in the student's response */
  minSentences: number;
  /** Whether a sentence frame should be provided */
  sentenceFrameRequired: boolean;
  /** Whether a word bank should be included (levels 1–3) */
  wordBankRequired: boolean;
  /**
   * Writing task type derived from CanDo key use + level.
   * Drives the genre and structure Claude uses to design the prompt.
   */
  taskType: string;
  /**
   * The single WIDA Can Do targeted this session — one per key use, rotates across sessions.
   * Contains: keyUse (Recount|Explain|Argue), action ("Recount by"), items (the sub-skill bullet points).
   */
  canDo: CanDoEntry;
  /** Single pre-selected topic — persisted from a failed session or randomly chosen */
  selectedTopic: string;
}

// ── Level metadata ────────────────────────────────────────────────────────────

/**
 * Writing task type by key use + level — derived directly from WRITING CanDo descriptors.
 *
 *  Recount L1 → reproducing words/phrases              → word_phrase
 *  Recount L2 → completing sentences using word banks   → sentence_completion
 *  Recount L3 → short paragraphs with main idea        → paragraph
 *  Recount L4 → content-related reports with transitions → report
 *  Recount L5 → research reports from multiple sources  → research_report
 *  Recount L6 → analytical writing with concluding stmt → analytical_essay
 *
 *  Explain L1 → labeling with relational connectors    → word_phrase
 *  Explain L2 → connecting short sentences             → connected_sentences
 *  Explain L3 → comparing/contrasting paragraphs       → comparison_paragraph
 *  Explain L4 → describing relationships between ideas → explanatory_paragraphs
 *  Explain L5 → informational text / multi-source essays → informational_essay
 *  Explain L6 → central ideas + evaluation             → critical_essay
 *
 *  Argue L1  → opinion words/phrases ("I think…")      → word_phrase
 *  Argue L2  → opinions with evaluative language       → opinion_sentence
 *  Argue L3  → opinions substantiated with examples    → opinion_paragraph
 *  Argue L4  → persuasive pieces with substantiated claims → persuasive
 *  Argue L5  → persuasive essays backed by research    → persuasive_essay
 *  Argue L6  → argumentative essays, claims + counterclaims → argumentative_essay
 */
export const WRITING_TASK_TYPE: Record<string, Record<number, string>> = {
  Recount: {
    1: "word_phrase",
    2: "sentence_completion",
    3: "paragraph",
    4: "report",
    5: "research_report",
    6: "analytical_essay",
  },
  Explain: {
    1: "word_phrase",
    2: "connected_sentences",
    3: "comparison_paragraph",
    4: "explanatory_paragraphs",
    5: "informational_essay",
    6: "critical_essay",
  },
  Argue: {
    1: "word_phrase",
    2: "opinion_sentence",
    3: "opinion_paragraph",
    4: "persuasive",
    5: "persuasive_essay",
    6: "argumentative_essay",
  },
};

/** What the student WRITES at each WIDA level — genre and length descriptor */
const WRITING_FORMAT: Record<number, string> = {
  1: "labeled items, phrases, or completed sentence frames (5–15 words); word bank required",
  2: "2–4 simple connected sentences using a word bank or sentence frame (15–40 words)",
  3: "one short paragraph with a main idea and 2–3 supporting details (4–6 sentences, 50–90 words)",
  4: "two organized paragraphs with topic sentences and supporting evidence (7–10 sentences, 100–150 words)",
  5: "3–4 paragraphs with introduction, body, and conclusion; topic sentences per paragraph (150–250 words)",
  6: "4–6 thesis-driven paragraphs with supporting evidence, counterargument, and conclusion (250–400+ words)",
};

/** Minimum sentences expected at each level */
const WRITING_MIN_SENTENCES: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 6,
  5: 8,
  6: 12,
};

/** Whether a sentence frame is appropriate at each level */
const SENTENCE_FRAME_REQUIRED: Record<number, boolean> = {
  1: true,
  2: true,
  3: true,
  4: false,
  5: false,
  6: false,
};

/**
 * Whether a word bank is required at each level.
 * Levels 1–2: full word bank (students need content words to produce anything).
 * Level 3: partial word bank (key Tier-2 vocabulary only).
 * Levels 4–6: no word bank; students generate their own language.
 */
const WORD_BANK_REQUIRED: Record<number, boolean> = {
  1: true,
  2: true,
  3: true,
  4: false,
  5: false,
  6: false,
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
  0: (l) => `ENTRY of Level ${l}: Maximum scaffolding. Simplest vocabulary and sentence structures for this writing level. Sentence frame required. Student just entered — keep the task highly accessible.`,
  1: (l) => `EARLY Level ${l}: Strong scaffolding. Slightly more varied vocabulary, short connected sentences. Sentence frame or word bank provided. Student is building writing confidence.`,
  2: (l) => `MID Level ${l}: Standard difficulty. Balanced academic vocabulary, moderate sentence complexity. Optional sentence starter. Student should attempt a full paragraph response.`,
  3: (l) => `LATE Level ${l}: Reduced scaffolding. More complex sentences, higher Tier-2 vocabulary. Minimal language support. Student is consolidating writing mastery.`,
  4: (l) => `ADVANCED Level ${l}: Minimal scaffolding. Push to the ceiling of Level ${l} writing complexity — approach Level ${l + 1}. Prepare the student to graduate this level with organized, evidence-supported writing.`,
};

// ── Can Do lookup ─────────────────────────────────────────────────────────────

/**
 * Returns the single Can Do for WRITING at a given ELP level for the given key use.
 * All 6 levels have WRITING entries in canDo.json.
 */
export function getWritingCanDoForKeyUse(level: number, keyUse: string): CanDoEntry {
  const elpLevel = clampLevel(level);
  const levelEntry = (canDoData as any).levels.find(
    (l: any) => l.elpLevel === `ELP Level ${elpLevel}`,
  );
  if (!levelEntry) return { keyUse, action: "", items: [] };

  const writingDomain = levelEntry.domains.find((d: any) => d.domain === "WRITING");
  if (!writingDomain) return { keyUse, action: "", items: [] };

  const entry = writingDomain.keyUses.find((k: any) => k.keyUse === keyUse);
  if (!entry) return { keyUse, action: "", items: [] };

  return {
    keyUse,
    action: entry.action as string,
    items:  entry.canDo  as string[],
  };
}

// ── Curriculum helpers ────────────────────────────────────────────────────────

/** Returns a flat list of writing curriculum topics for a given ELP level. */
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
 * Picks the topic for a writing session.
 * - Reuses the persisted topic if the last session failed (score < 70).
 * - Otherwise picks a random topic from the curriculum, skipping topics used today.
 */
export function selectWritingTopic(
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
 * Assembles the WritingContext used to generate one writing session's content.
 *
 * @param fractionalLevel - Student's current writing score (e.g. 2.4)
 * @param topicsUsedToday - Topics used in the last 24 h (for dedup on fresh pick)
 * @param persistedTopic  - Topic from last failed session — reuse it if set
 * @param lastKeyUse      - Key use from last completed writing session (null = first ever)
 */
export function buildWritingContext(
  fractionalLevel: number,
  topicsUsedToday: string[] = [],
  persistedTopic: string | null = null,
  lastKeyUse: string | null = null,
): WritingContext {
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
    writingFormat:         WRITING_FORMAT[elpLevel]         ?? "",
    minSentences:          WRITING_MIN_SENTENCES[elpLevel]  ?? 3,
    sentenceFrameRequired: SENTENCE_FRAME_REQUIRED[elpLevel] ?? false,
    wordBankRequired:      WORD_BANK_REQUIRED[elpLevel]                     ?? false,
    taskType:              WRITING_TASK_TYPE[keyUse]?.[elpLevel]             ?? "paragraph",
    canDo:                 getWritingCanDoForKeyUse(elpLevel, keyUse),
    selectedTopic:         selectWritingTopic(elpLevel, persistedTopic, topicsUsedToday),
  };
}
