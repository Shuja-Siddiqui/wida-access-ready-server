/**
 * Writing library retrieval — subject-scoped candidate search for retrieve→compose.
 *
 * Server hard-filters by academic subject (`academic:science`, etc.), gathers a topic-
 * relevant pool, then returns the top N least-used images for Claude to pick from.
 * No cross-subject images.
 */

/** Shortlist size passed to Claude compose (AI picks one id or null). */
export const WRITING_LIBRARY_CANDIDATE_LIMIT = 3;

/** Max rows collected before least-used ranking. */
const WRITING_LIBRARY_POOL_SIZE = 15;

import { and, asc, eq, or, sql, notInArray } from "drizzle-orm";
import { db } from "../../../db";
import {
  libraryTable,
  libraryTopicsTable,
  topicsTable,
  type AcademicVisionResult,
} from "../../../db/schema";
import { SUBJECT_VISUAL_ANCHOR_TAGS } from "../claude/prompts";

const TOPIC_STOP_WORDS = new Set([
  "this", "that", "with", "from", "about", "show", "shows", "what", "does",
  "have", "into", "and", "the", "for", "are", "your", "their", "them",
]);

const LIBRARY_COLS = {
  id:               libraryTable.id,
  tags:             libraryTable.tags,
  s3Key:            libraryTable.s3Key,
  description:      libraryTable.description,
  imageConcept:     libraryTable.imageConcept,
  detectionResults: libraryTable.detectionResults,
  contexts:         libraryTable.contexts,
  academicVision:   libraryTable.academicVision,
  useCount:         libraryTable.useCount,
} as const;

export type WritingAcademicSubject = "math" | "science" | "social_studies" | "ela";

export type WritingLibraryMatchTier = "topic_link" | "topic_meta" | "subject_tags" | "recycle";

export interface WritingLibraryCandidate {
  id: string;
  tags: string[];
  s3Key: string;
  imageConcept: string | null;
  description: string | null;
  detectionResults: unknown;
  contexts: string[];
  matchTier: WritingLibraryMatchTier;
}

function topicSearchTerms(topic: string): string[] {
  return topic
    .replace(/[\[\]]/g, " ")
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 4 && !TOPIC_STOP_WORDS.has(w));
}

/** Rich search string for library retrieval — unit + vocab + topic label. */
export function buildLibrarySearchTopic(params: {
  topicLabel: string;
  unit?: string;
  tier3Vocabulary?: string[];
  scenarioExamples?: string[];
}): { topic: string; scenarioHint: string } {
  const vocabTerms = (params.tier3Vocabulary ?? [])
    .map((v) => v.toLowerCase().trim())
    .filter((v) => v.length >= 3);
  const parts = [
    params.unit,
    params.topicLabel,
    ...vocabTerms.slice(0, 6),
  ].filter(Boolean);
  return {
    topic:        parts.join(" "),
    scenarioHint: params.scenarioExamples?.[0] ?? params.topicLabel,
  };
}

function scoreLibraryCandidateForTerms(
  candidate: WritingLibraryCandidate,
  terms: string[],
): number {
  const haystack = [
    candidate.imageConcept ?? "",
    candidate.description ?? "",
    ...candidate.tags,
  ].join(" ").toLowerCase();
  let score = (3 - TIER_RANK[candidate.matchTier]) * 5;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (t.length < 3) continue;
    if (haystack.includes(t)) score += 12;
  }
  return score;
}

export type LibraryComposeMode = "curriculum_matched" | "image_led";

export interface LibraryComposeCurriculum {
  unit?: string;
  topicLabel?: string;
  tier3Vocabulary?: string[];
  scenarioExamples?: string[];
}

export interface LibraryComposePrepared {
  candidates: WritingLibraryCandidate[];
  mode: LibraryComposeMode;
  lockedImageId: string | null;
  suppressCurriculumScenarios: boolean;
}

function curriculumSearchTerms(curriculum: LibraryComposeCurriculum): string[] {
  return [
    ...topicSearchTerms(curriculum.unit ?? ""),
    ...topicSearchTerms(curriculum.topicLabel ?? ""),
    ...(curriculum.tier3Vocabulary ?? []).map((v) => v.toLowerCase().trim()),
    ...topicSearchTerms(curriculum.scenarioExamples?.[0] ?? ""),
  ].filter((t, i, arr) => arr.indexOf(t) === i);
}

function imageSearchTerms(candidate: WritingLibraryCandidate): string[] {
  return [
    ...topicSearchTerms(candidate.imageConcept ?? ""),
    ...topicSearchTerms(candidate.description ?? ""),
    ...candidate.tags.map((t) => t.toLowerCase().trim()),
  ].filter((t, i, arr) => arr.indexOf(t) === i && t.length >= 3);
}

/** Rank, filter, and decide curriculum-matched vs image-led compose. */
export function prepareLibraryComposeSession(
  candidates: WritingLibraryCandidate[],
  curriculum: LibraryComposeCurriculum,
  limit = 3,
): LibraryComposePrepared {
  if (candidates.length === 0) {
    return {
      candidates: [],
      mode:         "image_led",
      lockedImageId: null,
      suppressCurriculumScenarios: true,
    };
  }

  const terms = curriculumSearchTerms(curriculum);
  const ranked = [...candidates].sort(
    (a, b) => scoreLibraryCandidateForTerms(b, terms) - scoreLibraryCandidateForTerms(a, terms),
  );
  const topScore = scoreLibraryCandidateForTerms(ranked[0], terms);

  // At least one curriculum term appears in photo metadata.
  if (topScore >= 12) {
    const minScore = Math.max(12, topScore - 6);
    const filtered = ranked
      .filter((c) => scoreLibraryCandidateForTerms(c, terms) >= minScore)
      .slice(0, limit);
    return {
      candidates:                  filtered.length > 0 ? filtered : [ranked[0]],
      mode:                        "curriculum_matched",
      lockedImageId:               filtered.length === 1 ? filtered[0].id : null,
      suppressCurriculumScenarios: false,
    };
  }

  // No photo matches this unit — image-led: content follows the photo, not the unit scenario.
  return {
    candidates:                  [ranked[0]],
    mode:                        "image_led",
    lockedImageId:               ranked[0].id,
    suppressCurriculumScenarios: true,
  };
}

/** True when audio follows curriculum but not the selected photo topic. */
export function detectLibraryContentMismatch(
  candidate: WritingLibraryCandidate,
  text: string,
  curriculum: LibraryComposeCurriculum,
): boolean {
  const audio = text.toLowerCase();
  const curriculumTerms = curriculumSearchTerms(curriculum);
  const imageTerms = imageSearchTerms(candidate);

  const curriculumHits = curriculumTerms.filter(
    (t) => t.length >= 4 && audio.includes(t),
  ).length;
  const imageHits = imageTerms.filter(
    (t) => t.length >= 4 && audio.includes(t),
  ).length;

  if (imageHits >= 1) return false;
  if (curriculumHits >= 2 && imageHits === 0) return true;

  // Strong curriculum vocabulary with zero image overlap at L1–2.
  const strongCurriculum = (curriculum.tier3Vocabulary ?? []).filter(
    (t) => t.length >= 5 && audio.includes(t.toLowerCase()),
  ).length;
  return strongCurriculum >= 2 && imageHits === 0;
}

/** Server-side best match when compose returns null or for pre-ranking. */
export function pickBestLibraryCandidateForCurriculum(
  candidates: WritingLibraryCandidate[],
  params: {
    unit?: string;
    topicLabel?: string;
    tier3Vocabulary?: string[];
    scenarioExamples?: string[];
  },
): WritingLibraryCandidate | null {
  if (candidates.length === 0) return null;
  const terms = [
    ...topicSearchTerms(params.unit ?? ""),
    ...topicSearchTerms(params.topicLabel ?? ""),
    ...(params.tier3Vocabulary ?? []),
    ...topicSearchTerms(params.scenarioExamples?.[0] ?? ""),
  ].filter((t, i, arr) => arr.indexOf(t) === i);
  if (terms.length === 0) return candidates[0] ?? null;
  return [...candidates].sort(
    (a, b) => scoreLibraryCandidateForTerms(b, terms) - scoreLibraryCandidateForTerms(a, terms),
  )[0] ?? null;
}

function dinoLabels(detectionResults: unknown): string[] {
  const detections = ((detectionResults as { detections?: { label?: string }[] } | null)?.detections ?? [])
    .map((d) => d.label)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return [...new Set(detections)];
}

function imageTags(row: {
  tags: unknown;
  detectionResults: unknown;
}): string[] {
  const official = Array.isArray(row.tags)
    ? row.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];
  return [...new Set([...official, ...dinoLabels(row.detectionResults)])];
}

function subjectContextTag(subject: WritingAcademicSubject): string {
  return `academic:${subject}`;
}

function subjectQualityFilter(level: number) {
  const minDetections = Math.floor(level) <= 2 ? 1 : 1;
  return sql`(
    jsonb_array_length(COALESCE(${libraryTable.detectionResults}->'detections', '[]'::jsonb)) >= ${minDetections}
    OR jsonb_array_length(COALESCE(${libraryTable.tags}, '[]'::jsonb)) >= 1
  )`;
}

function subjectContextFilter(subject: WritingAcademicSubject) {
  const tag = subjectContextTag(subject);
  return sql`${libraryTable.contexts} && ARRAY[${tag}]::text[]`;
}

type LibraryRow = {
  id: string;
  tags: unknown;
  s3Key: string;
  description: string | null;
  imageConcept: string | null;
  detectionResults: unknown;
  contexts: string[] | null;
  academicVision: Record<string, AcademicVisionResult> | null;
  useCount: number;
};

const TIER_RANK: Record<WritingLibraryMatchTier, number> = {
  topic_link:   0,
  topic_meta:   1,
  subject_tags: 2,
  recycle:      3,
};

type PooledEntry = {
  row: LibraryRow;
  tier: WritingLibraryMatchTier;
};

/** Prefer topic relevance, then least-used, then random tie-break. */
function rankShortlistByLeastUsed(
  pool: PooledEntry[],
  subject: WritingAcademicSubject,
  limit: number,
): WritingLibraryCandidate[] {
  return [...pool]
    .sort((a, b) => {
      const tierDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
      if (tierDiff !== 0) return tierDiff;
      const countDiff = a.row.useCount - b.row.useCount;
      if (countDiff !== 0) return countDiff;
      return Math.random() - 0.5;
    })
    .slice(0, limit)
    .map(({ row, tier }) => toCandidate(row, subject, tier));
}

function toCandidate(
  row: LibraryRow,
  subject: WritingAcademicSubject,
  matchTier: WritingLibraryMatchTier,
): WritingLibraryCandidate {
  const vision = row.academicVision?.[subject];
  return {
    id: row.id,
    tags: imageTags(row),
    s3Key: row.s3Key,
    imageConcept: vision?.topic?.trim() || row.imageConcept?.trim() || null,
    description: vision?.description?.trim() || row.description?.trim() || null,
    detectionResults: row.detectionResults,
    contexts: row.contexts ?? [],
    matchTier,
  };
}

/** Full library metadata for Claude compose — ids must match library_candidates in the compose step. */
export function serializeWritingLibraryCandidatesForPrompt(
  candidates: WritingLibraryCandidate[],
): Array<{
  id: string;
  tags: string[];
  concept: string | null;
  description: string | null;
  match_tier: WritingLibraryMatchTier;
}> {
  return candidates.map((c) => ({
    id:          c.id,
    tags:        c.tags,
    concept:     c.imageConcept,
    description: c.description,
    match_tier:  c.matchTier,
  }));
}

export function resolveWritingLibrarySelection(
  selectedId: string | null | undefined,
  candidates: WritingLibraryCandidate[],
): WritingLibraryCandidate | null {
  if (!selectedId) return null;
  return candidates.find((c) => c.id === selectedId) ?? null;
}

/** Levels 1–2 use library photos when available; level 3+ is text-only. */
export function sessionUsesLibraryPhotos(level: number): boolean {
  return Math.floor(level) <= 2;
}

function isEarlyBand(level: number): boolean {
  return sessionUsesLibraryPhotos(level);
}

/** Count unique DINO labels on a candidate (tap sessions need ≥2). */
export function dinoDetectionCount(candidate: WritingLibraryCandidate): number {
  const detections = (
    (candidate.detectionResults as { detections?: { label?: string }[] } | null)?.detections ?? []
  )
    .map((d) => d.label)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return new Set(detections).size;
}

/** First candidate with enough DINO boxes for listening object-tap. */
export function findListeningTapCandidate(
  candidates: WritingLibraryCandidate[],
): WritingLibraryCandidate | null {
  return candidates.find((c) => dinoDetectionCount(c) >= 2) ?? null;
}

export function libraryCandidateToSessionAnchor(candidate: WritingLibraryCandidate) {
  return {
    id:               candidate.id,
    tags:             candidate.tags,
    s3Key:            candidate.s3Key,
    description:      candidate.description,
    imageConcept:     candidate.imageConcept,
    detectionResults: candidate.detectionResults,
    contexts:         candidate.contexts,
  };
}

/**
 * Levels 1–2 always use a library image when candidates exist.
 * Level 3+ never attaches images (callers should pass an empty candidate list).
 */
export function resolveWritingLibrarySelectionWithPolicy(
  selectedId: string | null | undefined,
  candidates: WritingLibraryCandidate[],
  level: number,
  curriculum?: {
    unit?: string;
    topicLabel?: string;
    tier3Vocabulary?: string[];
    scenarioExamples?: string[];
  },
): WritingLibraryCandidate | null {
  if (candidates.length === 0) return null;
  const picked = resolveWritingLibrarySelection(selectedId, candidates);
  if (picked) return picked;
  if (isEarlyBand(level)) {
    return pickBestLibraryCandidateForCurriculum(candidates, curriculum ?? {}) ?? candidates[0] ?? null;
  }
  return null;
}

/** Bump global use count when a writing session commits to this library image. */
export async function incrementLibraryUseCount(libraryImageId: string): Promise<void> {
  await db
    .update(libraryTable)
    .set({ useCount: sql`${libraryTable.useCount} + 1` })
    .where(eq(libraryTable.id, libraryImageId));
}

/** Levels 1–2: when subject pool is empty, still offer photos from the wider library. */
async function fetchEarlyBandBroadCandidates(params: {
  academicSubject: WritingAcademicSubject;
  level: number;
  limit: number;
  excludeImageIds?: string[];
}): Promise<WritingLibraryCandidate[]> {
  const exclude = params.excludeImageIds?.length
    ? notInArray(libraryTable.id, params.excludeImageIds)
    : undefined;
  const quality = subjectQualityFilter(params.level);
  const preferredTag = subjectContextTag(params.academicSubject);

  const rows = await db
    .select(LIBRARY_COLS)
    .from(libraryTable)
    .where(and(quality, ...(exclude ? [exclude] : [])))
    .orderBy(
      sql`CASE WHEN ${libraryTable.contexts} @> ARRAY[${preferredTag}]::text[] THEN 0
           WHEN EXISTS (
             SELECT 1 FROM unnest(${libraryTable.contexts}) AS c WHERE c LIKE 'academic:%'
           ) THEN 1
           ELSE 2 END`,
      asc(libraryTable.useCount),
      sql`RANDOM()`,
    )
    .limit(Math.max(params.limit, WRITING_LIBRARY_POOL_SIZE));

  return rows
    .slice(0, params.limit)
    .map((row) => toCandidate(row as LibraryRow, params.academicSubject, "recycle"));
}

async function fetchRecycleCandidates(params: {
  academicSubject: WritingAcademicSubject;
  level: number;
  limit: number;
  excludeImageIds?: string[];
}): Promise<WritingLibraryCandidate[]> {
  const rows = await db
    .select(LIBRARY_COLS)
    .from(libraryTable)
    .where(
      and(
        subjectContextFilter(params.academicSubject),
        subjectQualityFilter(params.level),
        ...(params.excludeImageIds?.length
          ? [notInArray(libraryTable.id, params.excludeImageIds)]
          : []),
      ),
    )
    .orderBy(asc(libraryTable.useCount), sql`RANDOM()`)
    .limit(params.limit);

  return rows.map((row) => toCandidate(row as LibraryRow, params.academicSubject, "recycle"));
}

/**
 * Retrieve up to `limit` subject-scoped library images for Claude compose.
 * Gathers a topic-relevant pool, then returns the least-used `limit` entries.
 * Never returns images outside `academic:{subject}`.
 * When no topic match exists, falls back to least-used recycle pool.
 */
export async function retrieveWritingLibraryCandidates(params: {
  academicSubject: WritingAcademicSubject;
  topic: string;
  /** Real-world scenario text — boosts meta search (e.g. cylindrical pool ↔ volume photo). */
  scenarioHint?: string;
  excludeImageIds?: string[];
  level: number;
  limit?: number;
}): Promise<WritingLibraryCandidate[]> {
  const limit = params.limit ?? WRITING_LIBRARY_CANDIDATE_LIMIT;
  const exclude = params.excludeImageIds?.length
    ? notInArray(libraryTable.id, params.excludeImageIds)
    : undefined;
  const subjectFilter = and(
    subjectContextFilter(params.academicSubject),
    subjectQualityFilter(params.level),
    ...(exclude ? [exclude] : []),
  );

  const seen = new Set<string>();
  const pool: PooledEntry[] = [];

  const push = (row: LibraryRow, tier: WritingLibraryMatchTier) => {
    if (seen.has(row.id) || pool.length >= WRITING_LIBRARY_POOL_SIZE) return;
    seen.add(row.id);
    pool.push({ row, tier });
  };

  const terms = [
    ...topicSearchTerms(params.topic),
    ...topicSearchTerms(params.scenarioHint ?? ""),
  ].filter((t, i, arr) => arr.indexOf(t) === i);
  const metaMatch = terms.length
    ? or(
        ...terms.map((t) => sql`(
          COALESCE(${libraryTable.description}, '') ILIKE ${"%" + t + "%"}
          OR COALESCE(${libraryTable.imageConcept}, '') ILIKE ${"%" + t + "%"}
          OR COALESCE(${libraryTable.tags}::text, '') ILIKE ${"%" + t + "%"}
        )`),
      )
    : undefined;

  if (terms.length) {
    const topicLinked = await db
      .select(LIBRARY_COLS)
      .from(libraryTable)
      .innerJoin(libraryTopicsTable, eq(libraryTopicsTable.libraryId, libraryTable.id))
      .innerJoin(topicsTable, eq(topicsTable.id, libraryTopicsTable.topicId))
      .where(
        and(
          subjectFilter,
          or(
            ...terms.map((t) =>
              sql`LOWER(${topicsTable.name}) LIKE LOWER(${"%" + t + "%"})`,
            ),
          ),
        ),
      )
      .orderBy(sql`CASE WHEN ${libraryTable.academicVision} != '{}' THEN 0 ELSE 1 END, RANDOM()`)
      .limit(WRITING_LIBRARY_POOL_SIZE);

    for (const row of topicLinked) push(row as LibraryRow, "topic_link");
  }

  if (pool.length < WRITING_LIBRARY_POOL_SIZE && metaMatch) {
    const byMeta = await db
      .select(LIBRARY_COLS)
      .from(libraryTable)
      .where(and(subjectFilter, metaMatch))
      .orderBy(sql`CASE WHEN ${libraryTable.academicVision} != '{}' THEN 0 ELSE 1 END, RANDOM()`)
      .limit(WRITING_LIBRARY_POOL_SIZE);

    for (const row of byMeta) push(row as LibraryRow, "topic_meta");
  }

  const anchorTags = SUBJECT_VISUAL_ANCHOR_TAGS[params.academicSubject] ?? [];
  if (pool.length < WRITING_LIBRARY_POOL_SIZE && anchorTags.length > 0) {
    const byTags = await db
      .select(LIBRARY_COLS)
      .from(libraryTable)
      .where(
        and(
          subjectFilter,
          sql`${libraryTable.tags} IS NOT NULL`,
          sql`ARRAY(SELECT jsonb_array_elements_text(${libraryTable.tags})) && ARRAY[${sql.raw(
            anchorTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(","),
          )}]::text[]`,
        ),
      )
      .orderBy(sql`CASE WHEN ${libraryTable.academicVision} != '{}' THEN 0 ELSE 1 END, RANDOM()`)
      .limit(WRITING_LIBRARY_POOL_SIZE);

    for (const row of byTags) push(row as LibraryRow, "subject_tags");
  }

  if (pool.length === 0) {
    const recycled = await fetchRecycleCandidates({
      academicSubject: params.academicSubject,
      level: params.level,
      limit,
      excludeImageIds: params.excludeImageIds,
    });
    if (recycled.length > 0) return recycled;

    if (isEarlyBand(params.level)) {
      return fetchEarlyBandBroadCandidates({
        academicSubject: params.academicSubject,
        level: params.level,
        limit,
        excludeImageIds: params.excludeImageIds,
      });
    }
    return [];
  }

  return rankShortlistByLeastUsed(pool, params.academicSubject, limit);
}

/**
 * L1–2 listening visual anchor: subject-scoped search first, then any usable library photo.
 * Looser than writing retrieval — a photo without DINO/tags still beats text-only at level 1–2.
 */
export async function retrieveListeningLibraryCandidatesForSession(params: {
  academicSubject: WritingAcademicSubject;
  topic: string;
  scenarioHint?: string;
  excludeImageIds?: string[];
  level: number;
  limit?: number;
}): Promise<WritingLibraryCandidate[]> {
  const withExclude = await retrieveWritingLibraryCandidatesForSession(params);
  if (withExclude.length > 0) return withExclude;

  if (!sessionUsesLibraryPhotos(params.level)) return [];

  const retryWithoutExclude = params.excludeImageIds?.length
    ? await retrieveWritingLibraryCandidatesForSession({ ...params, excludeImageIds: undefined })
    : [];
  if (retryWithoutExclude.length > 0) return retryWithoutExclude;

  const limit = params.limit ?? WRITING_LIBRARY_CANDIDATE_LIMIT;
  const exclude = params.excludeImageIds?.length
    ? notInArray(libraryTable.id, params.excludeImageIds)
    : undefined;
  const preferredTag = subjectContextTag(params.academicSubject);

  const rows = await db
    .select(LIBRARY_COLS)
    .from(libraryTable)
    .where(and(
      sql`${libraryTable.s3Key} IS NOT NULL AND length(${libraryTable.s3Key}) > 0`,
      ...(exclude ? [exclude] : []),
    ))
    .orderBy(
      sql`CASE WHEN ${libraryTable.contexts} @> ARRAY[${preferredTag}]::text[] THEN 0
           WHEN EXISTS (
             SELECT 1 FROM unnest(${libraryTable.contexts}) AS c WHERE c LIKE 'academic:%'
           ) THEN 1
           ELSE 2 END`,
      asc(libraryTable.useCount),
      sql`RANDOM()`,
    )
    .limit(Math.max(limit, WRITING_LIBRARY_POOL_SIZE));

  return rows
    .slice(0, limit)
    .map((row) => toCandidate(row as LibraryRow, params.academicSubject, "recycle"));
}

/** Retrieve SF-scoped candidates; if recent-image exclusion empties the pool, retry without it. */
export async function retrieveWritingLibraryCandidatesForSession(params: {
  academicSubject: WritingAcademicSubject;
  topic: string;
  scenarioHint?: string;
  excludeImageIds?: string[];
  level: number;
  limit?: number;
}): Promise<WritingLibraryCandidate[]> {
  const withExclude = await retrieveWritingLibraryCandidates(params);
  if (withExclude.length > 0 || !params.excludeImageIds?.length) {
    return withExclude;
  }
  return retrieveWritingLibraryCandidates({
    ...params,
    excludeImageIds: undefined,
  });
}
