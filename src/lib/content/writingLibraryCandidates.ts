/**
 * Writing library retrieval — subject-scoped candidate search for retrieve→compose.
 *
 * Server hard-filters by academic subject (`academic:science`, etc.), ranks by topic
 * relevance, and returns a shortlist for Claude to pick from. No cross-subject images.
 */

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
};

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

/** Bump global use count when a writing session commits to this library image. */
export async function incrementLibraryUseCount(libraryImageId: string): Promise<void> {
  await db
    .update(libraryTable)
    .set({ useCount: sql`${libraryTable.useCount} + 1` })
    .where(eq(libraryTable.id, libraryImageId));
}

async function fetchRecycleCandidates(params: {
  academicSubject: WritingAcademicSubject;
  level: number;
  limit: number;
}): Promise<WritingLibraryCandidate[]> {
  const rows = await db
    .select(LIBRARY_COLS)
    .from(libraryTable)
    .where(
      and(
        subjectContextFilter(params.academicSubject),
        subjectQualityFilter(params.level),
      ),
    )
    .orderBy(asc(libraryTable.useCount), sql`RANDOM()`)
    .limit(params.limit);

  return rows.map((row) => toCandidate(row as LibraryRow, params.academicSubject, "recycle"));
}

/**
 * Retrieve up to `limit` subject-scoped library images ranked by topic relevance.
 * Never returns images outside `academic:{subject}`.
 * When every fresh image was recently used, falls back to least-used recycle pool.
 */
export async function retrieveWritingLibraryCandidates(params: {
  academicSubject: WritingAcademicSubject;
  topic: string;
  excludeImageIds?: string[];
  level: number;
  limit?: number;
}): Promise<WritingLibraryCandidate[]> {
  const limit = params.limit ?? 5;
  const exclude = params.excludeImageIds?.length
    ? notInArray(libraryTable.id, params.excludeImageIds)
    : undefined;
  const subjectFilter = and(
    subjectContextFilter(params.academicSubject),
    subjectQualityFilter(params.level),
    ...(exclude ? [exclude] : []),
  );

  const seen = new Set<string>();
  const out: WritingLibraryCandidate[] = [];

  const push = (row: LibraryRow, tier: WritingLibraryMatchTier) => {
    if (seen.has(row.id) || out.length >= limit) return;
    seen.add(row.id);
    out.push(toCandidate(row, params.academicSubject, tier));
  };

  const terms = topicSearchTerms(params.topic);
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
      .limit(limit);

    for (const row of topicLinked) push(row as LibraryRow, "topic_link");
  }

  if (out.length < limit && metaMatch) {
    const byMeta = await db
      .select(LIBRARY_COLS)
      .from(libraryTable)
      .where(and(subjectFilter, metaMatch))
      .orderBy(sql`CASE WHEN ${libraryTable.academicVision} != '{}' THEN 0 ELSE 1 END, RANDOM()`)
      .limit(limit);

    for (const row of byMeta) push(row as LibraryRow, "topic_meta");
  }

  const anchorTags = SUBJECT_VISUAL_ANCHOR_TAGS[params.academicSubject] ?? [];
  if (out.length < limit && anchorTags.length > 0) {
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
      .limit(limit);

    for (const row of byTags) push(row as LibraryRow, "subject_tags");
  }

  if (out.length === 0) {
    return fetchRecycleCandidates({
      academicSubject: params.academicSubject,
      level: params.level,
      limit,
    });
  }

  return out;
}
