import type { ImageFactorySubject } from "../../../db/schema/image_generation";
import type { AcademicSubjectId } from "../../lib/claude/standards/2020/select";

/** ELP levels aligned with writing content (pools keyed by subject × level). */
export const IMAGE_FACTORY_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type ImageFactoryLevel = typeof IMAGE_FACTORY_LEVELS[number];

export function clampImageFactoryLevel(level: number): ImageFactoryLevel {
  const n = Math.min(6, Math.max(1, Math.round(level)));
  return n as ImageFactoryLevel;
}

const STEP_LABELS = ["entry", "early", "mid", "late", "advanced"] as const;

export function maxComplexityStep(): number {
  const raw = Number(process.env.IMAGE_GEN_MAX_COMPLEXITY_STEP ?? 4);
  return Number.isFinite(raw) ? Math.min(4, Math.max(0, raw)) : 4;
}

export function resolveNextComplexityStep(
  lastStep: number,
  override?: number | null,
): number {
  const max = maxComplexityStep();
  if (override != null && Number.isFinite(override)) {
    return Math.min(max, Math.max(0, Math.floor(override)));
  }
  return Math.min(max, Math.max(0, lastStep + 1));
}

export function complexityLabel(level: number, step: number): string {
  const label = STEP_LABELS[Math.min(step, STEP_LABELS.length - 1)] ?? "entry";
  return `L${level}_${label}`;
}

/** Standard Framework subject → same id for library contexts and academic engines. */
export function factorySubjectToAcademicId(subject: ImageFactorySubject): AcademicSubjectId {
  return subject as AcademicSubjectId;
}

/** Library `contexts` tag (academic:ela, academic:math, …). */
export function academicContextForSubject(subject: ImageFactorySubject): string {
  return `academic:${factorySubjectToAcademicId(subject)}`;
}

export function subjectDisplayName(subject: ImageFactorySubject): string {
  switch (subject) {
    case "math": return "Mathematics";
    case "ela": return "English Language Arts";
    case "science": return "Science";
    case "social_studies": return "Social Studies / History";
    default: return subject;
  }
}

/** Visual guidance for HF prompts — image complexity, not WIDA text complexity. */
export function visualComplexityGuidance(level: number, step: number): string {
  const l1 = level <= 1;
  const guides: Record<number, string> = l1
    ? {
        0: "1–2 large isolated objects on a plain neutral background. Minimal clutter.",
        1: "2–3 clear objects with a little context, still very simple.",
        2: "3 objects in a simple scene (e.g. desk corner, garden patch).",
        3: "3–4 objects in a small everyday scene; uncluttered.",
        4: "Up to 4 distinct objects in a simple scene; still ESL-friendly and not busy.",
      }
    : {
        0: "2–3 objects in a simple educational setting.",
        1: "3–4 objects with a readable classroom or lab context.",
        2: "4–5 objects; mild background detail but foreground objects stay clear.",
        3: "5–6 objects in a coherent scene (science table, math center, etc.).",
        4: "6–8 objects max in a richer scene; still no text labels in the image.",
      };

  return guides[Math.min(step, 4)] ?? guides[0];
}
