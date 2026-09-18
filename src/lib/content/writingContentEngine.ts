/**
 * Writing Content Engine
 *
 * Assembles the full context used to generate a targeted writing session:
 *   - WIDA 2020 ELD standard × Key Language Use × expressive functions + PLDs
 *   - Curriculum topics scaled to the student's level (from writingCurriculum.json)
 *   - Sub-step complexity instruction calibrated from the student's fractional score
 *
 * This module is pure data transformation — no DB calls.
 * DB fetching happens in the session route (sessions.ts) and the result
 * is passed here for assembly, keeping this layer testable without mocks.
 */

import curriculumData from "../../data/writingCurriculum.json";
import {
  hasExpressiveCell,
  selectFrameworkTask,
  type AcademicSubjectId,
  type FrameworkTask,
} from "../claude/standards/2020";

import {
  clampLevel,
  KEY_USE_ROTATION,
  normalizeRotationKeyUse,
  ACADEMIC_SUBJECT_ROTATION,
  lastKeyUseForSubject,
  nextAcademicSubject,
  nextKeyUseForSubject,
  subjectKluCycleComplete,
  type AcademicSubject,
  type AcademicSessionRef,
  type KeyUse,
} from "./listeningContentEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WritingContext {
  /** ELP integer level (1–6), floored from fractional score */
  elpLevel: number;
  /** The student's exact fractional score (e.g. 2.4) */
  fractionalLevel: number;
  /** 0 = Entry … 4 = Advanced within this integer level */
  stepWithinLevel: number;
  /** Human-readable step label: "Entry" | "Early" | "Mid" | "Late" | "Advanced" */
  stepLabel: string;
  /** Exact difficulty instruction derived from sub-step — primary calibration signal */
  complexityInstruction: string;
  /** Fallback task size label — not sent to the content generator. */
  taskType: string;
  /** Fallback min sentences — not sent to the content generator. */
  minSentences: number;
  keyUse: string;
  /** 2020 Standard × KLU × expressive functions + this-level PLDs. */
  framework: FrameworkTask;
  /** Single pre-selected topic — persisted from a failed session or randomly chosen */
  selectedTopic: string;
}

// ── Level metadata ────────────────────────────────────────────────────────────

/**
 * Writing task size by key use + level — ACCESS practice length/genre, not 2016 Can-Do bullets.
 *
 *  Inform/Narrate L1 → reproducing words/phrases / labeled events → word_phrase
 *  Inform/Narrate L2 → completing sentences using word banks   → sentence_completion
 *  Inform L3 → short paragraphs with main idea        → paragraph
 *  Narrate L3 → dialogues/blogs from experience       → paragraph
 *  Inform L4 → content-related reports                → report
 *  Narrate L4 → sequence of events with transitions   → report
 *  Inform L5 → research reports from multiple sources  → research_report
 *  Narrate L5 → summarize experiment/event sequence    → research_report
 *  Inform L6 → concluding section supporting information → analytical_essay
 *  Narrate L6 → sequence and time-frame shifts        → analytical_essay
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
const RECOUNT_WRITING_TASK: Record<number, string> = {
  1: "word_phrase",
  2: "sentence_completion",
  3: "paragraph",
  4: "report",
  5: "research_report",
  6: "analytical_essay",
};

export const WRITING_TASK_TYPE: Record<string, Record<number, string>> = {
  Recount: RECOUNT_WRITING_TASK,
  Narrate: RECOUNT_WRITING_TASK,
  Inform: RECOUNT_WRITING_TASK,
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

/** Fallback length floor when the model omits min_sentences — not sent to Claude. */
const WRITING_MIN_SENTENCES: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
  5: 8,
  6: 12,
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
  0: (l) => `ENTRY of Level ${l}: English at the floor of this level. Simple words and short sentences. Aim at framework.pld.`,
  1: (l) => `EARLY Level ${l}: Still this level's English, a little more variety. Aim at framework.pld.`,
  2: (l) => `MID Level ${l}: Typical English for this level. Aim at framework.pld.`,
  3: (l) => `LATE Level ${l}: Toward the ceiling of this level. Denser sentences and more precise words, still matching framework.pld — not the next level.`,
  4: (l) => `ADVANCED Level ${l}: At the end-of-level writing in framework.pld. Ready to leave this level. Do not write English from level ${l + 1}.`,
};

/** Table 3-11 6–8: Science/Math/SS = Explain+Argue only. ELA = Narrate+Inform+Argue. */
export function expressiveKeyUsesForWritingSubject(subject: AcademicSubject): KeyUse[] {
  return KEY_USE_ROTATION.filter((k) => hasExpressiveCell(subject as AcademicSubjectId, k));
}

function nextWritingKeyUse(
  lastKeyUse: string | null,
  isRetry: boolean,
  academicSubject: AcademicSubject,
): KeyUse {
  const pool = expressiveKeyUsesForWritingSubject(academicSubject);
  const last = normalizeRotationKeyUse(lastKeyUse);
  if (isRetry && last && pool.includes(last)) return last;
  if (!last || !pool.includes(last)) return pool[0] ?? "Inform";
  return pool[(pool.indexOf(last) + 1) % pool.length];
}

/** Same order as ACADEMIC_SUBJECT_ROTATION (ELA → Math → Science → Social Studies). */
export const WRITING_ACADEMIC_SUBJECT_ROTATION: readonly AcademicSubject[] = ACADEMIC_SUBJECT_ROTATION;

const writingKluPool = (subject: AcademicSubject) => expressiveKeyUsesForWritingSubject(subject);

/** Last key use for this subject only — not the previous session's subject. */
export const lastWritingKeyUseForSubject = lastKeyUseForSubject;

/** True when every KLU in this subject's pool has been used. */
export function writingSubjectKluCycleComplete(
  subject: AcademicSubject,
  lastKeyUseForSubjectValue: string | null,
): boolean {
  return subjectKluCycleComplete(writingKluPool(subject), lastKeyUseForSubjectValue);
}

/** Subject-first rotation for writing (expressive KLU pool per subject). */
export function nextWritingAcademicSubject(
  recent: AcademicSessionRef[],
  isRetry: boolean,
  lastSessionSubject: AcademicSubject | null,
): AcademicSubject {
  return nextAcademicSubject(recent, isRetry, lastSessionSubject, writingKluPool);
}

/** Next KLU for this subject — uses that subject's history. */
export function nextWritingKeyUseForSubject(
  recent: AcademicSessionRef[],
  subject: AcademicSubject,
  isRetry: boolean,
  retryKeyUse: string | null = null,
): KeyUse {
  return nextKeyUseForSubject(recent, subject, isRetry, retryKeyUse, writingKluPool);
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
 * @param lastKeyUse      - Last key use for this subject (null = first ever for that subject)
 * @param academicSubject - ELD Standards 2–5 subject (math, science, social_studies, ela)
 */
export function buildWritingContext(
  fractionalLevel: number,
  topicsUsedToday: string[] = [],
  persistedTopic: string | null = null,
  lastKeyUse: string | null = null,
  academicSubject: AcademicSubject,
): WritingContext {
  const elpLevel = floorLevel(fractionalLevel);
  const step     = subStep(fractionalLevel);
  const isRetry  = persistedTopic !== null;
  const keyUse   = nextWritingKeyUse(lastKeyUse, isRetry, academicSubject);

  return {
    elpLevel,
    fractionalLevel,
    stepWithinLevel:       step,
    stepLabel:             STEP_LABELS[step],
    complexityInstruction: (COMPLEXITY_INSTRUCTIONS[step] ?? COMPLEXITY_INSTRUCTIONS[2])(elpLevel),
    minSentences:          WRITING_MIN_SENTENCES[elpLevel]  ?? 3,
    taskType:              WRITING_TASK_TYPE[keyUse]?.[elpLevel]             ?? "paragraph",
    keyUse,
    framework:             selectFrameworkTask({
      level: elpLevel,
      keyUse,
      mode: "expressive",
      academicSubject: academicSubject as AcademicSubjectId,
    }),
    selectedTopic:         selectWritingTopic(elpLevel, persistedTopic, topicsUsedToday),
  };
}
