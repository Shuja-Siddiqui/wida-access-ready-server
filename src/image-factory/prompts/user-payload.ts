/**
 * Claude user JSON for Image Factory — aligned with writing content compose inputs.
 */

import type { ImageFactorySubject } from "../../../db/schema/image_generation";
import {
  imageFactoryAcademicSubject,
  resolveImageFactoryKeyUse,
  selectFrameworkTask,
  serializeFrameworkTask,
  writingTaskTypeForImagePool,
} from "../standards/2020";
import {
  complexityLabel,
  subjectDisplayName,
  visualComplexityGuidance,
  type ImageFactoryLevel,
} from "../lib/utils";
import type { ImageFactoryAcademicBundle } from "../services/academic-context";

export type ImageFactoryPoolScope = "subject_general" | "klu_specific";

export interface ImageFactoryPromptUserPayload {
  task: string;
  /** subject_general = shared across all KLUs for this SF; klu_specific = manual KLU pick */
  pool_scope: ImageFactoryPoolScope;
  pool_subject: ImageFactorySubject;
  pool_subject_display: string;
  elp_level: ImageFactoryLevel;
  complexity_step: number;
  complexity_label: string;
  previous_complexity_step: number;
  visual_complexity_guidance: string;
  key_language_use: string;
  writing_task_type: string;
  framework: Record<string, unknown>;
  academic_unit: string | null;
  scenario_example: string | null;
  tier3_vocabulary: string[];
  topic_label: string | null;
  unit_id: string | null;
  content_framework: string | null;
  content_standards: string[];
  content_guidelines: string | null;
  domain_code: string | null;
  strand: string | null;
  complexity_instruction: string | null;
  visual_anchor_tags: string[];
  content_compose_goal: string;
  notes: string[];
}

export function buildImageFactoryPromptUserPayload(opts: {
  subject: ImageFactorySubject;
  level: ImageFactoryLevel;
  complexityStep: number;
  previousComplexityStep: number;
  keyUse?: string | null;
  /** When true, image is for the whole SF — not tied to one KLU (cron default). */
  generalPool?: boolean;
  academic?: ImageFactoryAcademicBundle | null;
}): ImageFactoryPromptUserPayload {
  const generalPool = opts.generalPool ?? !opts.keyUse?.trim();
  const keyLanguageUse = resolveImageFactoryKeyUse(opts.subject, opts.keyUse);
  const academicSubject = imageFactoryAcademicSubject(opts.subject);

  const framework = selectFrameworkTask({
    level: opts.level,
    keyUse: keyLanguageUse,
    mode: "expressive",
    academicSubject,
  });

  const academic = opts.academic;

  const generalNotes = generalPool
    ? [
        "GENERAL SF POOL: This image is shared across ALL key language uses for this Standard Framework.",
        "Show a neutral academic scene (unit + tier3 objects). Do NOT bias toward one rhetorical mode (e.g. debate-only for Argue, story arc for Narrate).",
        "framework.key_language_use is for PLD visual-complexity only — the library row is NOT tagged to one KLU.",
      ]
    : [];

  return {
    task: generalPool
      ? "Create an HF image prompt for the general Standard Framework library pool. The scene must work when the content model later generates writing under ANY key language use for this subject."
      : "Create an HF image prompt for the writing library. The image supports later content generation — no readable text in the picture.",
    pool_scope: generalPool ? "subject_general" : "klu_specific",
    pool_subject: opts.subject,
    pool_subject_display: subjectDisplayName(opts.subject),
    elp_level: opts.level,
    complexity_step: opts.complexityStep,
    complexity_label: complexityLabel(opts.level, opts.complexityStep),
    previous_complexity_step: opts.previousComplexityStep,
    visual_complexity_guidance: visualComplexityGuidance(opts.level, opts.complexityStep),
    key_language_use: keyLanguageUse,
    writing_task_type: writingTaskTypeForImagePool(keyLanguageUse, opts.level),
    framework: serializeFrameworkTask(framework),
    academic_unit: academic?.academic_unit ?? null,
    scenario_example: academic?.scenario_example ?? null,
    tier3_vocabulary: academic?.tier3_vocabulary ?? [],
    topic_label: academic?.topic_label ?? null,
    unit_id: academic?.unit_id ?? null,
    content_framework: academic?.content_framework ?? null,
    content_standards: academic?.content_standards ?? [],
    content_guidelines: academic?.content_guidelines ?? null,
    domain_code: academic?.domain_code ?? null,
    strand: academic?.strand ?? null,
    complexity_instruction: academic?.complexity_instruction ?? null,
    visual_anchor_tags: academic?.visual_anchor_tags ?? [],
    content_compose_goal: generalPool
      ? (academic?.content_compose_goal ?? (
        "General Standard Framework pool: scene + tags support content generation under any key language use for this subject."
      ))
      : (academic?.content_compose_goal ?? (
        "General pool: everyday school scene; tags must support simple Inform/Narrate writing."
      )),
    notes: [
      "framework = WIDA 2020 ELD (eld_standard, key_language_use, language_functions, pld) — same layer as generateWritingContent.",
      "academic_unit, scenario_example (one sample), tier3_vocabulary, topic_label, content_framework, and content_standards come from the CCSS/NGSS/C3 curriculum for pool_subject + elp_level.",
      "scenario_example shows tone only — invent a totally different new scene; do not copy or paraphrase the sample.",
      "Honor content_guidelines and content_standards when choosing scene objects — the image must support later writing in this unit.",
      "Use academic_unit + tier3_vocabulary + content_standards to choose WHAT to show; use framework.pld + complexity_instruction for how rich the scene is.",
      "hf_prompt: photorealistic invented scene for this unit. NO letters, numbers, labels, or formulas in the image.",
      "suggested_objects: concrete nouns from the scene; overlap tier3_vocabulary and visual_anchor_tags when possible (for library search + DINO).",
      "image_concept: 2–6 words matching topic_label / unit theme so writingLibraryCandidates can retrieve this row.",
      "Do not illustrate the exact word-problem numbers — illustrate the setting and objects so the content model can add math/science language in text.",
      ...generalNotes,
    ],
  };
}
