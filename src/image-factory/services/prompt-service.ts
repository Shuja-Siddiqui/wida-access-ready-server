import { z } from "zod/v4";
import { db } from "../../../db";
import {
  IMAGE_FACTORY_SUBJECTS,
  imageGenerationJobsTable,
  type ImageFactorySubject,
} from "../../../db/schema/image_generation";
import { logger } from "../../config/logger";
import { callClaude } from "../../lib/claude/client";
import { buildImageFactoryAcademicBundle } from "./academic-context";
import { buildImageFactoryPromptUserPayload } from "../prompts/user-payload";
import { IMAGE_FACTORY_CLAUDE_SYSTEM_PROMPT } from "../prompts/system";
import { getPoolRow } from "./pool-service";
import {
  clampImageFactoryLevel,
  complexityLabel,
  resolveNextComplexityStep,
  type ImageFactoryLevel,
} from "../lib/utils";

const claudeResponseSchema = z.object({
  hf_prompt: z.string().min(20).max(2000),
  suggested_objects: z.array(z.string().min(1)).min(2).max(8),
  image_concept: z.string().min(2).max(120),
  rationale: z.string().min(10).max(800),
});

export interface GenerateImagePromptInput {
  subject: ImageFactorySubject;
  level: number;
  createdByUserId: string;
  keyUse?: string | null;
  /** Cron: general SF pool, not one KLU. Manual UI sets keyUse for klu_specific. */
  generalPool?: boolean;
  complexityOverride?: number | null;
}

export interface GenerateImagePromptResult {
  jobId: string;
  hfPrompt: string;
  suggestedObjects: string[];
  imageConcept: string;
  complexityStep: number;
  complexityLabel: string;
  rationale: string;
  previousComplexityStep: number;
  academicUnit: string | null;
  scenarioExample: string | null;
  tier3Vocabulary: string[];
  topicLabel: string | null;
}

function parseClaudeImagePrompt(raw: unknown): z.infer<typeof claudeResponseSchema> {
  const parsed = claudeResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Claude returned invalid image prompt JSON: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function buildAndPersistImagePrompt(
  input: GenerateImagePromptInput,
): Promise<GenerateImagePromptResult> {
  if (!IMAGE_FACTORY_SUBJECTS.includes(input.subject)) {
    throw new Error(`Invalid subject: ${input.subject}`);
  }
  const elpLevel = clampImageFactoryLevel(input.level);

  const pool = await getPoolRow(input.subject, elpLevel);
  const previousComplexityStep = pool?.lastComplexityStep ?? 0;
  const complexityStep = resolveNextComplexityStep(
    previousComplexityStep,
    input.complexityOverride,
  );
  const label = complexityLabel(elpLevel, complexityStep);

  const academic = buildImageFactoryAcademicBundle({
    subject: input.subject,
    level: elpLevel,
    complexityStep,
  });

  const generalPool = input.generalPool ?? !input.keyUse?.trim();

  const promptPayload = buildImageFactoryPromptUserPayload({
    subject: input.subject,
    level: elpLevel,
    complexityStep,
    previousComplexityStep,
    keyUse: generalPool ? null : input.keyUse,
    generalPool,
    academic,
  });
  const userPrompt = JSON.stringify(promptPayload, null, 2);

  logger.info(
    {
      subject: input.subject,
      level: elpLevel,
      poolScope: promptPayload.pool_scope,
      keyLanguageUse: promptPayload.key_language_use,
      eldStandard: (promptPayload.framework as { eld_standard?: { id?: string; name?: string } }).eld_standard,
      academicUnit: promptPayload.academic_unit,
      hasScenarioExample: Boolean(promptPayload.scenario_example),
      tier3Count: promptPayload.tier3_vocabulary.length,
    },
    "image-factory: claude prompt context (2020 framework + academic session)",
  );

  const raw = await callClaude(IMAGE_FACTORY_CLAUDE_SYSTEM_PROMPT, userPrompt, 900);
  const data = parseClaudeImagePrompt(raw);

  const contextSnapshot = {
    academicUnit: promptPayload.academic_unit,
    scenarioExample: promptPayload.scenario_example,
    tier3Vocabulary: promptPayload.tier3_vocabulary,
    topicLabel: promptPayload.topic_label,
    unitId: promptPayload.unit_id,
    contentFramework: promptPayload.content_framework,
    contentStandards: promptPayload.content_standards,
    contentGuidelines: promptPayload.content_guidelines,
    domainCode: promptPayload.domain_code,
    strand: promptPayload.strand,
  };

  const [job] = await db
    .insert(imageGenerationJobsTable)
    .values({
      createdBy: input.createdByUserId,
      subject: input.subject,
      level: elpLevel,
      complexityStep,
      topicId: null,
      keyUse: generalPool ? null : (input.keyUse ?? null),
      focus: null,
      claudeRationale: data.rationale,
      contextSnapshot,
      hfPrompt: data.hf_prompt.trim(),
      suggestedObjects: data.suggested_objects.map((s) => s.toLowerCase().trim()),
      imageConcept: data.image_concept.trim(),
      status: "prompt_ready",
    })
    .returning({ id: imageGenerationJobsTable.id });

  return {
    jobId: job.id,
    hfPrompt: data.hf_prompt.trim(),
    suggestedObjects: data.suggested_objects.map((s) => s.toLowerCase().trim()),
    imageConcept: data.image_concept.trim(),
    complexityStep,
    complexityLabel: label,
    rationale: data.rationale.trim(),
    previousComplexityStep,
    academicUnit: promptPayload.academic_unit,
    scenarioExample: promptPayload.scenario_example,
    tier3Vocabulary: promptPayload.tier3_vocabulary,
    topicLabel: promptPayload.topic_label,
  };
}
