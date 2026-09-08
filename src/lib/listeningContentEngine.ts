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
import contentGuideData from "../data/can-do-content-guide.json";
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
   * Contains: keyUse (Narrate|Inform|Explain|Argue), action, items, plus sourceKeyUse/focus when split from 2016 Recount.
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
  0: (l) => `ENTRY of Level ${l}: Maximum scaffolding. Simplest vocabulary and sentence structures for this level. Student just entered — keep it accessible.`,
  1: (l) => `EARLY Level ${l}: Strong scaffolding. Slightly more varied vocabulary, short compound sentences. Student is building confidence.`,
  2: (l) => `MID Level ${l}: Standard difficulty. Balanced academic vocabulary, moderate sentence complexity, some inference required.`,
  3: (l) => `LATE Level ${l}: Reduced scaffolding. More complex sentences, higher Tier-2 vocabulary. Student is consolidating mastery.`,
  4: (l) => `ADVANCED Level ${l}: Minimal scaffolding. Push to the ceiling of Level ${l} — approach Level ${l + 1} complexity. Prepare the student to graduate this level.`,
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

export interface CanDoEntry {
  /** App key use — Narrate | Inform | Explain | Argue (legacy lookups may still pass Recount) */
  keyUse: string;
  /** 2016 booklet name when this cell was split from Recount */
  sourceKeyUse?: string;
  /** Passage/task lens when Narrate and Inform share the same official bullets */
  focus?: "narrative" | "informational";
  /** The action framing — e.g. "Process recounts by" / "Process explanations by" */
  action: string;
  /**
   * Official Can Do bullets. Together with `action`, these form ONE complete Can Do.
   */
  items: string[];
}

export function findKeyUseBlock(keyUses: any[] | undefined, keyUse: string): any | undefined {
  if (!Array.isArray(keyUses)) return undefined;
  const exact = keyUses.find((k: any) => k.keyUse === keyUse);
  if (exact) return exact;
  if (keyUse === "Narrate" || keyUse === "Inform") {
    return keyUses.find((k: any) => k.keyUse === "Recount");
  }
  if (keyUse === "Recount") {
    return keyUses.find((k: any) => k.keyUse === "Narrate")
      ?? keyUses.find((k: any) => k.keyUse === "Inform");
  }
  return undefined;
}

export function toCanDoEntry(requestedKeyUse: string, entry: any | undefined): CanDoEntry {
  if (!entry) return { keyUse: requestedKeyUse, action: "", items: [] };
  return {
    keyUse: requestedKeyUse,
    sourceKeyUse: entry.sourceKeyUse,
    focus: entry.focus,
    action: (entry.action as string) ?? "",
    items: (entry.canDo as string[]) ?? [],
  };
}

/** Official 2020 Key Language Use guide for this session (from canDo.json). */
export function getKeyLanguageUseGuide(keyUse: string | null | undefined): Record<string, unknown> | null {
  const klu = (canDoData as any).keyLanguageUses;
  if (!klu) return null;
  const name =
    keyUse === "Recount" ? "Narrate"
      : keyUse && klu[keyUse] ? keyUse
        : null;
  if (!name) return null;
  const entry = klu[name];
  const table = klu.prominenceTable;
  const standards = table?.standards as Record<string, Record<string, string>> | undefined;
  const prominence: Record<string, string> = {};
  if (standards) {
    for (const [std, uses] of Object.entries(standards)) {
      if (uses[name]) prominence[std] = uses[name];
    }
  }
  return {
    name,
    grade_band: klu.gradeBand ?? "6-8",
    mapping: klu.mapping ?? null,
    overlap_note: klu.overlapNote ?? null,
    definition: entry.definition,
    table_definition: entry.tableDefinition ?? null,
    source_2016: entry.source2016 ?? null,
    genres: entry.genres ?? [],
    grade_6_8: entry.gradeBand6_8 ?? [],
    content_must: entry.contentMust ?? [],
    content_must_not: entry.contentMustNot ?? [],
    prominence_grades_6_8: Object.keys(prominence).length > 0
      ? {
          source: table.source ?? null,
          note: table.note ?? null,
          by_standard: prominence,
          preferred_academic_subjects: subjectPoolForKeyUse(name as KeyUse),
        }
      : null,
  };
}

export type PortrayalDomain = "LISTENING" | "SPEAKING" | "READING" | "WRITING";

/** How to write this cell (from can-do-content-guide.json). Sent on generate with Can Do + Key Language Use. */
export function getContentPortrayal(
  level: number | undefined,
  domain: string | undefined,
  keyUse: string | null | undefined,
): Record<string, unknown> | null {
  if (level == null || !domain) return null;
  const elp = clampLevel(level);
  const dom = domain.toUpperCase() as PortrayalDomain;
  const ku = normalizeRotationKeyUse(keyUse) ?? keyUse;
  if (!ku) return null;
  const lvl = (contentGuideData as { levels?: Array<Record<string, unknown>> }).levels
    ?.find((row) => row.level === elp);
  const cell = (lvl?.[dom] as Record<string, { contentThatHelps?: string; picture?: unknown }> | undefined)?.[ku];
  if (!cell) return null;
  return {
    how_to_portray: cell.contentThatHelps ?? null,
    picture: cell.picture ?? null,
  };
}

/** Shape sent to Claude: 2016 Can Do bullets + 2020 Key Language Use + portrayal from the content guide. */
export function serializeCanDoForPrompt(
  canDo: CanDoEntry,
  opts?: { level?: number; domain?: string },
): Record<string, unknown> {
  return {
    key_use: canDo.keyUse,
    source_key_use: canDo.sourceKeyUse ?? null,
    focus: canDo.focus ?? null,
    action: canDo.action,
    items: canDo.items,
    key_language_use: getKeyLanguageUseGuide(canDo.keyUse),
    content_portrayal: getContentPortrayal(opts?.level, opts?.domain, canDo.keyUse),
  };
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

  return toCanDoEntry(keyUse, findKeyUseBlock(listeningDomain.keyUses, keyUse));
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
 * Academic subjects for the academic tier (WIDA ELD Standards 2–5).
 * Standard 1 (Social & Instructional) is the everyday / photo path, not this list.
 */
export const ACADEMIC_SUBJECTS = ["math", "science", "social_studies", "ela"] as const;
export type AcademicSubject = (typeof ACADEMIC_SUBJECTS)[number];

const STANDARD_TO_SUBJECT: Record<string, AcademicSubject> = {
  ela: "ela",
  math: "math",
  science: "science",
  social_studies: "social_studies",
};

const PROMINENCE_RANK: Record<string, number> = {
  most_prominent: 0,
  prominent: 1,
};

/** Human-readable labels for each academic subject. */
export const ACADEMIC_SUBJECT_LABELS: Record<AcademicSubject, string> = {
  math:          "Mathematics",
  science:       "Science",
  social_studies: "Social Studies",
  ela:           "English Language Arts",
};

function prominenceTableStandards(): Record<string, Record<string, string>> | undefined {
  return (canDoData as { keyLanguageUses?: { prominenceTable?: { standards?: Record<string, Record<string, string>> } } })
    .keyLanguageUses?.prominenceTable?.standards;
}

/**
 * Academic subjects where this Key Language Use is most_prominent or prominent
 * (WIDA 2020 Table 3-11). "Present" pairings (e.g. Narrate + math) are excluded.
 * Order: most_prominent first, then prominent.
 */
export function subjectPoolForKeyUse(keyUse: string | null | undefined): AcademicSubject[] {
  const ku = normalizeRotationKeyUse(keyUse);
  const standards = prominenceTableStandards();
  if (!ku || !standards) return [...ACADEMIC_SUBJECTS];

  const scored: { subject: AcademicSubject; rank: number }[] = [];
  for (const [std, subject] of Object.entries(STANDARD_TO_SUBJECT)) {
    const level = standards[std]?.[ku];
    const rank = level ? PROMINENCE_RANK[level] : undefined;
    if (rank === undefined) continue;
    scored.push({ subject, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || ACADEMIC_SUBJECTS.indexOf(a.subject) - ACADEMIC_SUBJECTS.indexOf(b.subject));
  const unique: AcademicSubject[] = [];
  for (const row of scored) {
    if (!unique.includes(row.subject)) unique.push(row.subject);
  }
  return unique.length > 0 ? unique : [...ACADEMIC_SUBJECTS];
}

export function prominenceForSubject(
  keyUse: string | null | undefined,
  subject: AcademicSubject,
): string | null {
  const ku = normalizeRotationKeyUse(keyUse);
  if (!ku) return null;
  return prominenceTableStandards()?.[subject]?.[ku] ?? null;
}

export type AcademicSessionRef = {
  keyUse?: string | null;
  subject?: string | null;
};

function asAcademicSubject(value: string | null | undefined): AcademicSubject | null {
  return ACADEMIC_SUBJECTS.includes(value as AcademicSubject) ? (value as AcademicSubject) : null;
}

/**
 * Pick the academic world for this session's Key Language Use.
 * Rotates inside that use's Table 3-11 pool (last time we practiced THIS key use),
 * so Narrate can move ela → social_studies instead of locking to one subject.
 */
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
  const base = buildListeningContext(fractionalLevel, topicsUsedToday, persistedTopic, lastKeyUse);
  const isRetry = persistedTopic !== null;
  const subject = pickSubjectForKeyUse(base.canDo.keyUse, recentAcademic, isRetry);
  return {
    ...base,
    subject,
    subjectLabel: ACADEMIC_SUBJECT_LABELS[subject],
  };
}
