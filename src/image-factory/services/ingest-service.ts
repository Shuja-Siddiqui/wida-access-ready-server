import { eq } from "drizzle-orm";
import { db } from "../../../db";
import {
  imageGenerationJobsTable,
  type ImageFactorySubject,
  type ImageJobContextSnapshot,
} from "../../../db/schema/image_generation";
import {
  libraryTable,
  type AcademicVisionResult,
  type LibraryGenerationBackend,
} from "../../../db/schema/library";
import { logger } from "../../config/logger";
import { ObjectStorageService } from "../../lib/images/objectStorage";
import { generateImageVariants } from "../../lib/images/imageResize";
import { runFactorySeededPipeline } from "../../lib/images/factory-pipeline";
import type { SupportedMediaType } from "../../lib/images/image-pipeline";
import type { NormalisedDetection } from "../../api/images/detect-core";
import {
  academicContextForSubject,
  complexityLabel,
  factorySubjectToAcademicId,
} from "../lib/utils";
import { bumpPoolAfterIngest } from "./pool-service";
import type { AcademicSubject } from "../../lib/content";

const storage = new ObjectStorageService();

export interface ParsedImageDataUri {
  contentType: SupportedMediaType;
  base64Data: string;
  buffer: Buffer;
}

export function parseImageDataUri(image: string): ParsedImageDataUri {
  const match = image.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    throw new Error("image must be a base64 data URI");
  }
  const contentType = match[1]! as SupportedMediaType;
  const base64Data = match[2]!;
  return { contentType, base64Data, buffer: Buffer.from(base64Data, "base64") };
}

async function loadJob(jobId: string) {
  const [job] = await db
    .select()
    .from(imageGenerationJobsTable)
    .where(eq(imageGenerationJobsTable.id, jobId))
    .limit(1);
  if (!job) throw new Error("Image factory job not found");
  if (job.status === "ingested") {
    throw new Error("This job was already saved to the library");
  }
  return job;
}

function buildDescriptionFromJob(
  snapshot: ImageJobContextSnapshot | null,
  rationale: string | null,
  hfPrompt: string,
): string {
  const parts: string[] = [];
  if (snapshot?.academicScenario?.trim()) {
    parts.push(snapshot.academicScenario.trim());
  }
  if (rationale?.trim()) {
    parts.push(rationale.trim());
  } else if (hfPrompt.trim()) {
    parts.push(hfPrompt.trim().slice(0, 500));
  }
  return parts.join(" ") || "Generated library image";
}

function buildAcademicVisionFromJob(
  subject: ImageFactorySubject,
  snapshot: ImageJobContextSnapshot | null,
  imageConcept: string | null,
  rationale: string | null,
): Record<string, AcademicVisionResult> {
  const academicSubject = factorySubjectToAcademicId(subject) as AcademicSubject;
  const topic =
    snapshot?.topicLabel?.trim()
    || imageConcept?.trim()
    || undefined;

  const concept =
    imageConcept?.trim()
    || snapshot?.topicLabel?.trim()
    || snapshot?.academicUnit?.trim()
    || "Educational scene";

  const descParts: string[] = [];
  if (snapshot?.academicScenario?.trim()) {
    descParts.push(snapshot.academicScenario.trim());
  }
  if (snapshot?.tier3Vocabulary?.length) {
    descParts.push(
      `Students use vocabulary such as ${snapshot.tier3Vocabulary.join(", ")}.`,
    );
  }
  if (rationale?.trim()) {
    descParts.push(rationale.trim());
  }

  const description =
    descParts.join(" ")
    || concept;

  return {
    [academicSubject]: {
      concept,
      description,
      ...(topic ? { topic } : {}),
    },
  };
}

function contextsForSubject(subject: ImageFactorySubject): string[] {
  return [academicContextForSubject(subject)];
}

export interface FactoryDetectInput {
  jobId: string;
  image: string;
}

export interface FactoryDetectResult {
  candidates: string[];
  confirmedTags: string[];
  description: string;
  imageConcept: string | null;
  detections: NormalisedDetection[];
  model: string;
}

export async function detectGeneratedFactoryImage(
  input: FactoryDetectInput,
): Promise<FactoryDetectResult> {
  const job = await loadJob(input.jobId);
  const { contentType, base64Data } = parseImageDataUri(input.image);
  const snapshot = job.contextSnapshot ?? null;

  const pipeline = await runFactorySeededPipeline(
    input.image,
    base64Data,
    contentType,
    {
      suggestedObjects: job.suggestedObjects ?? [],
      description: buildDescriptionFromJob(snapshot, job.claudeRationale, job.hfPrompt),
      imageConcept: job.imageConcept,
      tier3Vocabulary: snapshot?.tier3Vocabulary,
    },
  );

  return {
    candidates: pipeline.candidates,
    confirmedTags: pipeline.confirmedTags,
    description: pipeline.description,
    imageConcept: pipeline.imageConcept,
    detections: pipeline.detectionResults.detections,
    model: pipeline.detectionResults.model,
  };
}

export interface FactoryIngestInput {
  jobId: string;
  image: string;
  /** users.id — null for cron ingests without INTERNAL_JOB_UPLOADER_USER_ID. */
  uploaderId: string | null;
  detections?: NormalisedDetection[];
  generationBackend?: LibraryGenerationBackend | null;
}

export interface FactoryIngestResult {
  libraryImageId: string;
  tags: string[];
  confirmedTags: string[];
  complexityStep: number;
  complexityLabel: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  mediumUrl: string | null;
}

export async function ingestGeneratedFactoryImage(
  input: FactoryIngestInput,
): Promise<FactoryIngestResult> {
  const job = await loadJob(input.jobId);
  const { contentType, base64Data, buffer } = parseImageDataUri(input.image);
  const snapshot = job.contextSnapshot ?? null;
  const descriptionSeed = buildDescriptionFromJob(
    snapshot,
    job.claudeRationale,
    job.hfPrompt,
  );

  const seed = {
    suggestedObjects: job.suggestedObjects ?? [],
    description: descriptionSeed,
    imageConcept: job.imageConcept,
    tier3Vocabulary: snapshot?.tier3Vocabulary,
  };

  let pipeline;
  if (input.detections && input.detections.length > 0) {
    const tags = [...new Set(input.detections.map((d) => d.label.toLowerCase().trim()))];
    pipeline = {
      candidates: [...new Set(job.suggestedObjects ?? [])],
      confirmedTags: tags,
      description: descriptionSeed,
      imageConcept: job.imageConcept,
      detectionResults: {
        detections: input.detections,
        model: "grounding_dino" as const,
      },
      suggestedTopicIds: [] as string[],
    };
  } else {
    pipeline = await runFactorySeededPipeline(
      input.image,
      base64Data,
      contentType,
      seed,
    );
  }

  if (pipeline.detectionResults.detections.length === 0) {
    throw new Error(
      "No bounding boxes detected. Run DINO again or draw boxes in the library after save.",
    );
  }

  const { key, sizeBytes } = await storage.uploadBuffer(
    buffer,
    contentType,
    "access-ready-files/library",
  );

  const variantId = key.split("/").pop()!;
  const thumbnailS3Key = `access-ready-files/library/thumbnails/${variantId}`;
  const mediumS3Key = `access-ready-files/library/medium/${variantId}`;

  let thumbnailKey: string | null = null;
  let mediumKey: string | null = null;
  try {
    const variants = await generateImageVariants(buffer);
    await Promise.all([
      storage.uploadBufferWithKey(variants.thumbnail, "image/jpeg", thumbnailS3Key)
        .then(() => { thumbnailKey = thumbnailS3Key; })
        .catch((err: unknown) => logger.warn({ err }, "factory-ingest: thumbnail failed")),
      storage.uploadBufferWithKey(variants.medium, "image/jpeg", mediumS3Key)
        .then(() => { mediumKey = mediumS3Key; })
        .catch((err: unknown) => logger.warn({ err }, "factory-ingest: medium failed")),
    ]);
  } catch (err) {
    logger.warn({ err }, "factory-ingest: resize failed");
  }

  const visionTags = [...new Set(pipeline.candidates)];
  const academicVision = buildAcademicVisionFromJob(
    job.subject as ImageFactorySubject,
    snapshot,
    job.imageConcept,
    job.claudeRationale,
  );

  const factorySubject = job.subject as ImageFactorySubject;
  const detectionResults = {
    ...pipeline.detectionResults,
    visionTags,
    factoryJobId: job.id,
    factorySubject,
    hfPrompt: job.hfPrompt,
  };

  const [row] = await db
    .insert(libraryTable)
    .values({
      s3Key: key,
      thumbnailKey: thumbnailKey ?? undefined,
      mediumKey: mediumKey ?? undefined,
      contentType,
      sizeBytes,
      tags: pipeline.confirmedTags,
      description: pipeline.description,
      detectionResults,
      contexts: contextsForSubject(factorySubject),
      imageConcept: job.imageConcept ?? pipeline.imageConcept,
      academicVision,
      uploaderId: input.uploaderId,
      ingestSource: "image_factory",
      generationBackend: input.generationBackend ?? null,
    })
    .returning();

  await db
    .update(imageGenerationJobsTable)
    .set({
      status: "ingested",
      libraryImageId: row!.id,
      error: null,
    })
    .where(eq(imageGenerationJobsTable.id, job.id));

  await bumpPoolAfterIngest(
    job.subject as ImageFactorySubject,
    job.level,
    job.complexityStep,
  );

  const [imageUrl, thumbnailUrl, mediumUrl] = await Promise.all([
    storage.getPresignedGetUrl(row!.s3Key, 3600).catch(() => null),
    row!.thumbnailKey ? storage.getPresignedGetUrl(row!.thumbnailKey, 3600).catch(() => null) : null,
    row!.mediumKey ? storage.getPresignedGetUrl(row!.mediumKey, 3600).catch(() => null) : null,
  ]);

  logger.info(
    { libraryImageId: row!.id, jobId: job.id, tags: pipeline.confirmedTags },
    "factory-ingest: saved to library",
  );

  return {
    libraryImageId: row!.id,
    tags: pipeline.confirmedTags,
    confirmedTags: pipeline.confirmedTags,
    complexityStep: job.complexityStep,
    complexityLabel: complexityLabel(job.level, job.complexityStep),
    imageUrl,
    thumbnailUrl,
    mediumUrl,
  };
}
