import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import {
  IMAGE_FACTORY_SUBJECTS,
  imageGenerationPoolsTable,
  type ImageFactorySubject,
} from "../../../db/schema/image_generation";
import { libraryTable } from "../../../db/schema/library";
import {
  IMAGE_FACTORY_LEVELS,
  academicContextForSubject,
  type ImageFactoryLevel,
} from "../lib/utils";

export interface ImageFactoryPoolSummary {
  subject: ImageFactorySubject;
  level: ImageFactoryLevel;
  lastComplexityStep: number;
  lastGeneratedAt: string | null;
  libraryImageCount: number;
  academicContext: string;
}

async function countLibraryImages(subject: ImageFactorySubject): Promise<number> {
  const context = academicContextForSubject(subject);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(libraryTable)
    .where(sql`${libraryTable.contexts} @> ARRAY[${context}]::text[]`);
  return row?.count ?? 0;
}

export async function getPoolRow(subject: ImageFactorySubject, level: number) {
  const [row] = await db
    .select()
    .from(imageGenerationPoolsTable)
    .where(and(
      eq(imageGenerationPoolsTable.subject, subject),
      eq(imageGenerationPoolsTable.level, level),
    ))
    .limit(1);
  return row ?? null;
}

export async function listImageFactoryPools(): Promise<ImageFactoryPoolSummary[]> {
  const rows = await db.select().from(imageGenerationPoolsTable);
  const byKey = new Map(rows.map((r) => [`${r.subject}:${r.level}`, r]));

  const summaries: ImageFactoryPoolSummary[] = [];
  for (const subject of IMAGE_FACTORY_SUBJECTS) {
    for (const level of IMAGE_FACTORY_LEVELS) {
      const row = byKey.get(`${subject}:${level}`);
      summaries.push({
        subject,
        level,
        lastComplexityStep: row?.lastComplexityStep ?? 0,
        lastGeneratedAt: row?.lastGeneratedAt?.toISOString() ?? null,
        libraryImageCount: await countLibraryImages(subject),
        academicContext: academicContextForSubject(subject),
      });
    }
  }
  return summaries;
}

/** After a successful library ingest, advance visual complexity for this pool. */
export async function bumpPoolAfterIngest(
  subject: ImageFactorySubject,
  level: number,
  complexityStep: number,
): Promise<void> {
  const existing = await getPoolRow(subject, level);
  if (existing) {
    await db
      .update(imageGenerationPoolsTable)
      .set({
        lastComplexityStep: complexityStep,
        lastGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(imageGenerationPoolsTable.id, existing.id));
    return;
  }

  await db.insert(imageGenerationPoolsTable).values({
    subject,
    level,
    lastComplexityStep: complexityStep,
    lastGeneratedAt: new Date(),
  });
}
