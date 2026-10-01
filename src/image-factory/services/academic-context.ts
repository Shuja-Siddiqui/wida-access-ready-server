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
  academic_scenario: string | null;
  tier3_vocabulary: string[];
  topic_label: string | null;
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
Your hf_prompt must show the real-world scene for academic_scenario with visible tier3-related objects.
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
  let scenario: string | null = null;
  let tier3: string[] = [];
  let topicLabel: string | null = null;

  switch (academicId) {
    case "math": {
      const ctx = buildMathSessionContext(level, null, []);
      unit = ctx.unit;
      scenario = ctx.scenario;
      tier3 = ctx.tier3Vocabulary;
      topicLabel = ctx.topicLabel;
      break;
    }
    case "science": {
      const ctx = buildScienceSessionContext(level, null, []);
      unit = ctx.unit;
      scenario = ctx.scenario;
      tier3 = ctx.tier3Vocabulary;
      topicLabel = ctx.topicLabel;
      break;
    }
    case "social_studies": {
      const ctx = buildSocialStudiesSessionContext(level, null, []);
      unit = ctx.unit;
      scenario = ctx.scenario;
      tier3 = ctx.tier3Vocabulary;
      topicLabel = ctx.topicLabel;
      break;
    }
    case "ela": {
      const ctx = buildElaSessionContext(level, null, []);
      unit = ctx.unit;
      scenario = ctx.scenario;
      tier3 = ctx.tier3Vocabulary;
      topicLabel = ctx.topicLabel;
      break;
    }
    default:
      return null;
  }

  const anchorTags = SUBJECT_VISUAL_ANCHOR_TAGS[academicId] ?? [];

  return {
    academic_unit: unit,
    academic_scenario: scenario,
    tier3_vocabulary: tier3,
    topic_label: topicLabel,
    complexity_instruction: complexityInstruction(level, opts.complexityStep),
    visual_anchor_tags: anchorTags,
    content_compose_goal: CONTENT_COMPOSE_GOAL,
  };
}
