/**
 * Same curriculum + framework context the writing content pipeline uses,
 * packaged for Image Factory HF prompt drafting (no text in the image itself).
 */

import type { ImageFactorySubject } from "../../../db/schema/image_generation";
import { buildElaSessionContext } from "../../lib/academic/academicElaEngine";
import { buildMathSessionContext } from "../../lib/academic/academicMathEngine";
import { buildScienceSessionContext } from "../../lib/academic/academicScienceEngine";
import { buildSocialStudiesSessionContext } from "../../lib/academic/academicSocialStudiesEngine";
import { SUBJECT_VISUAL_ANCHOR_TAGS } from "../../lib/claude/prompts";
import { factorySubjectToAcademicId, type ImageFactoryLevel } from "../lib/utils";
import type { AcademicSubjectId } from "../../lib/claude/standards/2020/select";

export interface ImageFactoryAcademicBundle {
  academic_unit: string | null;
  /** One curriculum sample per job — not the full scenario list. */
  scenario_example: string | null;
  tier3_vocabulary: string[];
  topic_label: string | null;
  unit_id: string | null;
  content_framework: string | null;
  content_standards: string[];
  content_guidelines: string | null;
  domain_code: string | null;
  strand: string | null;
  complexity_instruction: string;
  visual_anchor_tags: string[];
  content_compose_goal: string;
}

function complexityInstruction(elpLevel: number, complexityStep: number): string {
  const l = Math.min(6, Math.max(1, Math.round(elpLevel)));
  const step = Math.min(4, Math.max(0, complexityStep));
  const lines: Record<number, string> = {
    0: `ENTRY of Level ${l}: simple scene the student can describe in few words.`,
    1: `EARLY Level ${l}: clear objects the student can name and connect simply.`,
    2: `MID Level ${l}: a coherent scene supporting short explanatory writing at this PLD.`,
    3: `LATE Level ${l}: richer scene detail; still one readable foreground for ESL writers.`,
    4: `ADVANCED Level ${l}: end-of-level scene complexity; supports connected sentences at framework.pld.`,
  };
  return lines[step] ?? lines[2];
}

const CONTENT_COMPOSE_GOAL = `
This photo is ingested into the writing library (tags, concept, description, academicVision).
Later, generateWritingContent picks it by academic_subject and topic, builds a passage FROM that metadata,
then a writing prompt using tier3_vocabulary and framework.pld — numbers and full task wording stay in TEXT, not in the image.
Invent a fresh photorealistic scene for academic_unit + content_standards with visible tier3-related objects. scenario_example is one tone sample — create a completely different new scene; never copy or paraphrase it.
`.trim();

/**
 * Resolve unit, scenario, and tier-3 vocabulary from the same academic engines as session content.
 */
export function buildImageFactoryAcademicBundle(opts: {
  subject: ImageFactorySubject;
  level: ImageFactoryLevel;
  complexityStep: number;
}): ImageFactoryAcademicBundle | null {
  const level = opts.level;
  const academicId: AcademicSubjectId = factorySubjectToAcademicId(opts.subject);
  let unit: string | null = null;
  let scenarioExample: string | null = null;
  let tier3: string[] = [];
  let topicLabel: string | null = null;
  let unitId: string | null = null;
  let contentFramework: string | null = null;
  let contentStandards: string[] = [];
  let contentGuidelines: string | null = null;
  let domainCode: string | null = null;
  let strand: string | null = null;

  switch (academicId) {
    case "math": {
      const ctx = buildMathSessionContext(level, null, []);
      unit = ctx.unit;
      scenarioExample = ctx.scenarioExamples[0] ?? null;
      tier3 = ctx.tier3Vocabulary;
      topicLabel = ctx.topicLabel;
      unitId = ctx.unitId ?? null;
      contentFramework = ctx.contentFramework ?? null;
      contentStandards = ctx.contentStandards ?? [];
      contentGuidelines = ctx.contentGuidelines ?? null;
      domainCode = ctx.domainCode ?? null;
      break;
    }
    case "science": {
      const ctx = buildScienceSessionContext(level, null, []);
      unit = ctx.unit;
      scenarioExample = ctx.scenarioExamples[0] ?? null;
      tier3 = ctx.tier3Vocabulary;
      topicLabel = ctx.topicLabel;
      unitId = ctx.unitId ?? null;
      contentFramework = ctx.contentFramework ?? null;
      contentStandards = ctx.contentStandards ?? [];
      contentGuidelines = ctx.contentGuidelines ?? null;
      domainCode = ctx.domainCode ?? null;
      strand = ctx.strand ?? null;
      break;
    }
    case "social_studies": {
      const ctx = buildSocialStudiesSessionContext(level, null, []);
      unit = ctx.unit;
      scenarioExample = ctx.scenarioExamples[0] ?? null;
      tier3 = ctx.tier3Vocabulary;
      topicLabel = ctx.topicLabel;
      unitId = ctx.unitId ?? null;
      contentFramework = ctx.contentFramework ?? null;
      contentStandards = ctx.contentStandards ?? [];
      contentGuidelines = ctx.contentGuidelines ?? null;
      domainCode = ctx.domainCode ?? null;
      strand = ctx.strand ?? null;
      break;
    }
    case "ela": {
      const ctx = buildElaSessionContext(level, null, []);
      unit = ctx.unit;
      scenarioExample = ctx.scenarioExamples[0] ?? null;
      tier3 = ctx.tier3Vocabulary;
      topicLabel = ctx.topicLabel;
      unitId = ctx.unitId ?? null;
      contentFramework = ctx.contentFramework ?? null;
      contentStandards = ctx.contentStandards ?? [];
      contentGuidelines = ctx.contentGuidelines ?? null;
      domainCode = ctx.domainCode ?? null;
      break;
    }
    default:
      return null;
  }

  const anchorTags = SUBJECT_VISUAL_ANCHOR_TAGS[academicId] ?? [];

  return {
    academic_unit: unit,
    scenario_example: scenarioExample,
    tier3_vocabulary: tier3,
    topic_label: topicLabel,
    unit_id: unitId,
    content_framework: contentFramework,
    content_standards: contentStandards,
    content_guidelines: contentGuidelines,
    domain_code: domainCode,
    strand,
    complexity_instruction: complexityInstruction(level, opts.complexityStep),
    visual_anchor_tags: anchorTags,
    content_compose_goal: CONTENT_COMPOSE_GOAL,
  };
}
