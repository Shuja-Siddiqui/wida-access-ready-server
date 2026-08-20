/**
 * Listening Content Engine
 *
 * Assembles the full context used to generate a targeted listening session:
 *   - WIDA Can Do descriptors for the student's current ELP level
 *   - Curriculum topics scaled to the student's level (from listeningCurriculum.json)
 *   - Student's accumulated weakness profile (ordered by frequency)
 *
 * This module is pure data transformation — no DB calls.
 * DB fetching happens in the session route (sessions.ts) and the result
 * is passed here for assembly, keeping this layer testable without mocks.
 */

import canDoData from "../data/canDo.json";
import curriculumData from "../data/listeningCurriculum.json";

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
  /**
   * The single WIDA Can Do targeted this session — one per key use, rotates across sessions.
   * Contains: keyUse (Recount|Explain|Argue), action ("Process recounts by"), items (the sub-skill bullet points).
   */
  canDo: CanDoEntry;
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

/** Question formats permitted at each level — derived from CanDo task verbs */
const LEVEL_PERMITTED_FORMATS: Record<number, string[]> = {
  1: ["image_object_tap"], // Level 1: image-library object tap — visual-only interaction
  2: ["image_object_tap"], // Level 2: image-library object tap — visual-only interaction
  3: ["multiple_choice", "pair_matching", "sequence_ordering", "agree_disagree"],
  4: ["multiple_choice", "pair_matching", "agree_disagree"],
  5: ["multiple_choice", "category_sorting", "sequence_ordering", "pair_matching"],
  6: ["multiple_choice", "agree_disagree"],
};

// ── Sub-step helpers ──────────────────────────────────────────────────────────

const STEP_LABELS = ["Entry", "Early", "Mid", "Late", "Advanced"] as const;

/**
 * Each WIDA integer level (1–6) is divided into 5 sub-steps of 0.2.
 * We floor (not round) so that 1.8 stays in Level 1, not Level 2.
 * Level 1 is the entry point; Level 6.0 is the exit.
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
  0: (l) => `ENTRY of Level ${l}: Maximum scaffolding. Simplest vocabulary and sentence structures for this level. Student just entered — keep it accessible.`,
  1: (l) => `EARLY Level ${l}: Strong scaffolding. Slightly more varied vocabulary, short compound sentences. Student is building confidence.`,
  2: (l) => `MID Level ${l}: Standard difficulty. Balanced academic vocabulary, moderate sentence complexity, some inference required.`,
  3: (l) => `LATE Level ${l}: Reduced scaffolding. More complex sentences, higher Tier-2 vocabulary. Student is consolidating mastery.`,
  4: (l) => `ADVANCED Level ${l}: Minimal scaffolding. Push to the ceiling of Level ${l} — approach Level ${l + 1} complexity. Prepare the student to graduate this level.`,
};

// ── Can Do helpers ────────────────────────────────────────────────────────────

/** Ordered rotation of key uses across listening sessions. Discuss is Oral Language only — not in Listening. */
export const KEY_USE_ROTATION = ["Recount", "Explain", "Argue"] as const;
export type KeyUse = typeof KEY_USE_ROTATION[number];

/**
 * Returns the next key use in the rotation.
 * @param lastKeyUse - The key use from the student's last completed listening session, or null for their first.
 * @param isRetry    - If true, keep the same key use (student is re-practising the same skill).
 */
export function nextKeyUse(lastKeyUse: string | null, isRetry: boolean): KeyUse {
  if (isRetry && lastKeyUse && KEY_USE_ROTATION.includes(lastKeyUse as KeyUse)) {
    return lastKeyUse as KeyUse;
  }
  const lastIndex = KEY_USE_ROTATION.indexOf(lastKeyUse as KeyUse);
  return KEY_USE_ROTATION[(lastIndex + 1) % KEY_USE_ROTATION.length];
}

export interface CanDoEntry {
  /** The key use category — Recount | Explain | Argue */
  keyUse: string;
  /** The action framing — e.g. "Process recounts by" / "Process explanations by" / "Process arguments by" */
  action: string;
  /**
   * The sub-skill bullet points that describe HOW the student demonstrates this Can Do.
   * Together with `action`, these form ONE complete Can Do — not separate Can Dos.
   * Example: action="Process recounts by" + items=["Identifying familiar objects...", "Pointing to objects..."]
   */
  items: string[];
}

/**
 * Returns the single Can Do for LISTENING at a given ELP level for the given key use.
 * There is exactly one Can Do per key use — action + items together describe the full skill.
 */
export function getListeningCanDoForKeyUse(level: number, keyUse: string): CanDoEntry {
  const elpLevel = clampLevel(level);
  const levelEntry = (canDoData as any).levels.find(
    (l: any) => l.elpLevel === `ELP Level ${elpLevel}`,
  );
  if (!levelEntry) return { keyUse, action: "", items: [] };

  const listeningDomain = levelEntry.domains.find((d: any) => d.domain === "LISTENING");
  if (!listeningDomain) return { keyUse, action: "", items: [] };

  const entry = listeningDomain.keyUses.find((k: any) => k.keyUse === keyUse);
  if (!entry) return { keyUse, action: "", items: [] };

  return {
    keyUse,
    action: entry.action as string,
    items:  entry.canDo  as string[],
  };
}

// ── Curriculum helpers ────────────────────────────────────────────────────────

/** Returns a flat list of curriculum topics for a given ELP level. */
export function getCurriculumTopicsForLevel(level: number): string[] {
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

/** Returns the recommended question types for a given ELP level. */
export function getRecommendedQuestionTypes(level: number): string[] {
  const elpLevel = clampLevel(level);
  const levelEntry = (curriculumData as any).levels.find(
    (l: any) => l.elpLevel === elpLevel,
  );
  return levelEntry?.recommendedQuestionTypes ?? ["main_idea", "detail"];
}

/** Returns the complexity note for a given ELP level. */
export function getLevelComplexityNote(level: number): string {
  const elpLevel = clampLevel(level);
  const levelEntry = (curriculumData as any).levels.find(
    (l: any) => l.elpLevel === elpLevel,
  );
  return levelEntry?.complexityNote ?? "";
}

// ── Topic selection ───────────────────────────────────────────────────────────

/**
 * Picks the topic to use for a listening session.
 *
 * - If the student's last session failed (persistedTopic is set), reuse that topic.
 *   The same topic continues until they pass, so they build mastery before moving on.
 * - Otherwise (fresh start or last session passed), pick a random topic from the
 *   curriculum for this level, skipping any already used today.
 */
export function selectTopic(
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
): ListeningContext {
  const elpLevel  = floorLevel(fractionalLevel);
  const step      = subStep(fractionalLevel);
  const isRetry   = persistedTopic !== null;
  const keyUse = nextKeyUse(lastKeyUse, isRetry);

  return {
    elpLevel,
    fractionalLevel,
    stepWithinLevel:       step,
    stepLabel:             STEP_LABELS[step],
    complexityInstruction: (COMPLEXITY_INSTRUCTIONS[step] ?? COMPLEXITY_INSTRUCTIONS[2])(elpLevel),
    oralFormat:            LEVEL_ORAL_FORMAT[elpLevel]       ?? "",
    permittedFormats:      LEVEL_PERMITTED_FORMATS[elpLevel] ?? ["multiple_choice"],
    canDo:                 getListeningCanDoForKeyUse(elpLevel, keyUse),
    selectedTopic:         selectTopic(elpLevel, persistedTopic, topicsUsedToday),
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
 * Academic subject areas for the listening_academic tier.
 * Rotates across sessions just like key uses in general listening.
 * When the user provides subject-specific guidelines these will drive
 * different Claude prompts and Can Do descriptors per subject.
 */
export const ACADEMIC_SUBJECTS = ["math", "science", "social_studies", "ela"] as const;
export type AcademicSubject = (typeof ACADEMIC_SUBJECTS)[number];

/** Human-readable labels for each academic subject. */
export const ACADEMIC_SUBJECT_LABELS: Record<AcademicSubject, string> = {
  math:          "Mathematics",
  science:       "Science",
  social_studies: "Social Studies",
  ela:           "English Language Arts",
};

/**
 * Returns the next subject in the rotation.
 * @param lastSubject - The subject from the student's last academic session, or null for their first.
 */
export function nextSubject(lastSubject: string | null): AcademicSubject {
  const lastIndex = ACADEMIC_SUBJECTS.indexOf(lastSubject as AcademicSubject);
  return ACADEMIC_SUBJECTS[(lastIndex + 1) % ACADEMIC_SUBJECTS.length];
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
 * Identical to buildListeningContext but adds subject rotation on top.
 *
 * @param fractionalLevel - Student's current academic listening score
 * @param topicsUsedToday - Topics used in the last 24 h (for dedup)
 * @param persistedTopic  - Topic from last failed session — reuse if set
 * @param lastKeyUse      - Key use from last academic listening session
 * @param lastSubject     - Subject from last academic listening session
 */
export function buildAcademicListeningContext(
  fractionalLevel: number,
  topicsUsedToday: string[] = [],
  persistedTopic: string | null = null,
  lastKeyUse: string | null = null,
  lastSubject: string | null = null,
): AcademicListeningContext {
  const base    = buildListeningContext(fractionalLevel, topicsUsedToday, persistedTopic, lastKeyUse);
  const subject = nextSubject(lastSubject);
  return {
    ...base,
    subject,
    subjectLabel: ACADEMIC_SUBJECT_LABELS[subject],
  };
}
