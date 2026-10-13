/**
 * Content-framework metadata (CCSS / NGSS / C3) extracted from curriculum units
 * and serialized for Claude + Image Factory prompts.
 */

import type { MathUnit } from "./academicMathEngine";
import type { ScienceUnit } from "./academicScienceEngine";
import type { SocialStudiesUnit } from "./academicSocialStudiesEngine";
import type { ElaUnit } from "./academicElaEngine";

export type ContentFramework = "CCSS-Math" | "NGSS" | "C3" | "CCSS-ELA";

export interface AcademicFrameworkFields {
  unitId: string;
  contentFramework: ContentFramework;
  contentStandards: string[];
  contentGuidelines: string;
  domainCode?: string;
  grade?: number;
  strand?: string;
  practices?: string[];
  crosscuttingConcepts?: string[];
  inquiryDimensions?: string[];
}

export function mathFrameworkFromUnit(unit: MathUnit): AcademicFrameworkFields {
  const standards = unit.standards ?? [];
  return {
    unitId: unit.id,
    contentFramework: "CCSS-Math",
    contentStandards: standards,
    domainCode: unit.ccs,
    grade: unit.grade,
    contentGuidelines:
      `Align to CCSS domain ${unit.ccs} (${unit.unit}). ` +
      `Cover concepts from: ${standards.slice(0, 4).join(", ") || unit.ccs}. ` +
      "Invent a fresh unit-aligned situation; define tier-3 terms inline.",
  };
}

export function scienceFrameworkFromUnit(unit: ScienceUnit): AcademicFrameworkFields {
  const standards = unit.standards ?? [];
  return {
    unitId: unit.id,
    contentFramework: "NGSS",
    contentStandards: standards,
    domainCode: unit.ngssDomain,
    strand: unit.strand,
    practices: unit.practices,
    crosscuttingConcepts: unit.crosscuttingConcepts,
    contentGuidelines:
      `Align to NGSS ${unit.ngssDomain ?? unit.strand} — ${unit.unit}. ` +
      `Performance expectations: ${standards.slice(0, 3).join(", ") || "MS middle school"}. ` +
      (unit.practices?.length
        ? `Reflect practices: ${unit.practices.join("; ")}. `
        : "") +
      "Teach the phenomenon in the passage; no prior knowledge required.",
  };
}

export function socialStudiesFrameworkFromUnit(unit: SocialStudiesUnit): AcademicFrameworkFields {
  const standards = unit.standards ?? [];
  return {
    unitId: unit.id,
    contentFramework: "C3",
    contentStandards: standards,
    domainCode: unit.c3Discipline,
    strand: unit.strand,
    inquiryDimensions: unit.inquiryDimensions,
    contentGuidelines:
      `Align to C3 ${unit.c3Discipline ?? unit.strand} — ${unit.unit}. ` +
      `Indicators: ${standards.slice(0, 3).join(", ") || "D2 middle grades"}. ` +
      (unit.inquiryDimensions?.length
        ? `Touch inquiry dimensions ${unit.inquiryDimensions.join(", ")} when natural. `
        : "") +
      "Supply all historical/civic context in the passage.",
  };
}

export function elaFrameworkFromUnit(unit: ElaUnit, genre?: string): AcademicFrameworkFields {
  const standards = unit.standards ?? [];
  const domains = unit.ccssDomains?.join("/") ?? "RL/RI/W/L";
  const genreLabel = genre ?? unit.primaryGenre;
  return {
    unitId: unit.id,
    contentFramework: "CCSS-ELA",
    contentStandards: standards,
    domainCode: domains,
    contentGuidelines:
      `Align to CCSS ELA ${domains} — ${unit.unit} (${genreLabel}). ` +
      `Standards: ${standards.slice(0, 4).join(", ") || domains}. ` +
      "Questions must come from THIS text only.",
  };
}

export function serializeAcademicFrameworkForPrompt(
  fields: AcademicFrameworkFields,
): Record<string, unknown> {
  return {
    content_framework: fields.contentFramework,
    content_standards: fields.contentStandards,
    content_guidelines: fields.contentGuidelines,
    unit_id: fields.unitId,
    ...(fields.domainCode ? { domain_code: fields.domainCode } : {}),
    ...(fields.grade != null ? { grade: fields.grade } : {}),
    ...(fields.strand ? { strand: fields.strand } : {}),
    ...(fields.practices?.length ? { science_practices: fields.practices } : {}),
    ...(fields.crosscuttingConcepts?.length
      ? { crosscutting_concepts: fields.crosscuttingConcepts }
      : {}),
    ...(fields.inquiryDimensions?.length
      ? { c3_inquiry_dimensions: fields.inquiryDimensions }
      : {}),
  };
}

/** System-prompt block appended to ACADEMIC_CONTENT_LAYER when framework fields are known. */
/** Pick ONE curriculum scenario seed per generation call (token savings + variety via shuffle). */
export function scenarioExamplesForPrompt(scenarios: string[], max = 1): string[] {
  const one = pickScenarioExampleForPrompt(scenarios);
  return one ? [one] : [];
}

/** Single scenario example for Claude user JSON — never send the full curriculum list. */
export function pickScenarioExampleForPrompt(scenarios: string[]): string | null {
  if (!scenarios.length) return null;
  const copy = [...scenarios];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy[0]?.trim() || null;
}

export const SCENARIO_EXAMPLES_NOTE =
  "scenario_example is tone-only — invent a new scene for academic_unit + content_standards; do not copy or paraphrase it.";

/** User JSON fields shared by listening, reading, speaking, writing, and image factory. */
export function academicPromptFieldsFromContext(
  ctx: Partial<AcademicFrameworkFields> & {
    unit?: string;
    scenarioExamples?: string[];
    tier3Vocabulary?: string[];
    genre?: string;
  },
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (ctx.unit) fields.academic_unit = ctx.unit;
  const scenarioExample = pickScenarioExampleForPrompt(ctx.scenarioExamples ?? []);
  if (scenarioExample) {
    fields.scenario_example = scenarioExample;
    fields.scenario_examples_note = SCENARIO_EXAMPLES_NOTE;
  }
  if (ctx.tier3Vocabulary?.length) fields.tier3_vocabulary = ctx.tier3Vocabulary;
  if (ctx.genre) fields.genre = ctx.genre;
  if (ctx.contentFramework && ctx.contentStandards?.length) {
    Object.assign(fields, serializeAcademicFrameworkForPrompt(ctx as AcademicFrameworkFields));
  }
  return fields;
}

export function academicFrameworkLayer(fields: AcademicFrameworkFields): string {
  const stdPreview = fields.contentStandards.slice(0, 6).join(", ");
  const stdMore =
    fields.contentStandards.length > 6
      ? ` (+${fields.contentStandards.length - 6} more in user JSON)`
      : "";
  return [
    "━━ CONTENT FRAMEWORK ALIGNMENT ━━",
    `Framework: ${fields.contentFramework}`,
    fields.domainCode ? `Domain / discipline: ${fields.domainCode}` : "",
    fields.contentStandards.length
      ? `Standards: ${stdPreview}${stdMore}`
      : "",
    fields.contentGuidelines,
    fields.practices?.length
      ? `NGSS practices: ${fields.practices.join("; ")}`
      : "",
    fields.crosscuttingConcepts?.length
      ? `Crosscutting concepts: ${fields.crosscuttingConcepts.join("; ")}`
      : "",
    fields.inquiryDimensions?.length
      ? `C3 inquiry dimensions: ${fields.inquiryDimensions.join(", ")}`
      : "",
    "Stay inside academic_unit and content_standards; do not drift to unrelated topics.",
  ]
    .filter(Boolean)
    .join("\n");
}
