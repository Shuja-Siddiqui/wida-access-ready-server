/**
 * Cron pool selection — rotate through all Standard Framework subjects and pick
 * the sparsest ELP level within each subject.
 */

import {
  IMAGE_FACTORY_SUBJECTS,
  type ImageFactorySubject,
} from "../../../db/schema/image_generation";
import { listImageFactoryPools, type ImageFactoryPoolSummary } from "../services/pool-service";

let cronSubjectIndex = 0;

/** Reset cursor (tests). */
export function resetCronSubjectRotation(): void {
  cronSubjectIndex = 0;
}

function sparsestLevelForSubject(
  pools: ImageFactoryPoolSummary[],
  subject: ImageFactorySubject,
): number {
  const forSubject = pools.filter((p) => p.subject === subject);
  if (forSubject.length === 0) return 1;

  forSubject.sort((a, b) => {
    if (a.libraryImageCount !== b.libraryImageCount) {
      return a.libraryImageCount - b.libraryImageCount;
    }
    const aTime = a.lastGeneratedAt ? Date.parse(a.lastGeneratedAt) : 0;
    const bTime = b.lastGeneratedAt ? Date.parse(b.lastGeneratedAt) : 0;
    return aTime - bTime;
  });

  return forSubject[0]!.level;
}

/**
 * Next pool for cron: advance round-robin across SF subjects (ela, math, science,
 * social_studies), then pick the sparsest level within that subject.
 */
export async function pickNextCronImageFactoryPool(
  pinnedSubject?: ImageFactorySubject,
  pinnedLevel?: number,
): Promise<{ subject: ImageFactorySubject; level: number }> {
  const pools = await listImageFactoryPools();

  if (pinnedSubject) {
    const level =
      pinnedLevel != null && pinnedLevel >= 1 && pinnedLevel <= 6
        ? pinnedLevel
        : sparsestLevelForSubject(pools, pinnedSubject);
    return { subject: pinnedSubject, level };
  }

  const subject = IMAGE_FACTORY_SUBJECTS[cronSubjectIndex % IMAGE_FACTORY_SUBJECTS.length]!;
  cronSubjectIndex = (cronSubjectIndex + 1) % IMAGE_FACTORY_SUBJECTS.length;

  const level =
    pinnedLevel != null && pinnedLevel >= 1 && pinnedLevel <= 6
      ? pinnedLevel
      : sparsestLevelForSubject(pools, subject);

  return { subject, level };
}

/** When batchSize >= 4, return one target per SF for a single cron tick. */
export async function pickCronBatchTargets(
  batchSize: number,
  pinnedSubject?: ImageFactorySubject,
  pinnedLevel?: number,
): Promise<Array<{ subject: ImageFactorySubject; level: number }>> {
  if (pinnedSubject) {
    const targets: Array<{ subject: ImageFactorySubject; level: number }> = [];
    for (let i = 0; i < batchSize; i++) {
      targets.push(await pickNextCronImageFactoryPool(pinnedSubject, pinnedLevel));
    }
    return targets;
  }

  if (batchSize >= IMAGE_FACTORY_SUBJECTS.length) {
    const pools = await listImageFactoryPools();
    return IMAGE_FACTORY_SUBJECTS.map((subject) => ({
      subject,
      level:
        pinnedLevel != null && pinnedLevel >= 1 && pinnedLevel <= 6
          ? pinnedLevel
          : sparsestLevelForSubject(pools, subject),
    })).slice(0, batchSize);
  }

  const targets: Array<{ subject: ImageFactorySubject; level: number }> = [];
  for (let i = 0; i < batchSize; i++) {
    targets.push(await pickNextCronImageFactoryPool(undefined, pinnedLevel));
  }
  return targets;
}
