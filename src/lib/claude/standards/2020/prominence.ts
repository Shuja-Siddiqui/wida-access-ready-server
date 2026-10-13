/**
 * WIDA 2020 Table 3-11 — Key Language Use prominence by ELD Standard (Grades 6–8).
 */
import prominence6to8 from "./data/wida_eld_klu_prominence_6-8.json";
import type { AcademicSubjectId } from "./select";

export type KeyLanguageUseProminence = "most_prominent" | "prominent" | "present";

const ACADEMIC_SUBJECTS: readonly AcademicSubjectId[] = [
  "ela",
  "math",
  "science",
  "social_studies",
];

const STANDARD_TO_SUBJECT: Record<string, AcademicSubjectId> = {
  ela: "ela",
  math: "math",
  science: "science",
  social_studies: "social_studies",
};

const PROMINENCE_RANK: Record<KeyLanguageUseProminence, number> = {
  most_prominent: 0,
  prominent: 1,
  present: 2,
};

function normalizeKeyUse(keyUse: string | null | undefined): string | null {
  if (!keyUse) return null;
  if (keyUse === "Recount") return "Narrate";
  if (["Narrate", "Inform", "Explain", "Argue"].includes(keyUse)) return keyUse;
  return null;
}

function prominenceTable(): Record<string, Record<string, string>> {
  return (prominence6to8 as { standards?: Record<string, Record<string, string>> }).standards ?? {};
}

/**
 * Academic subjects where this Key Language Use is most_prominent or prominent.
 * "Present" pairings are excluded. Order: most_prominent first, then prominent.
 */
export function subjectPoolForKeyUse(keyUse: string | null | undefined): AcademicSubjectId[] {
  const ku = normalizeKeyUse(keyUse);
  const standards = prominenceTable();
  if (!ku) return [...ACADEMIC_SUBJECTS];

  const scored: { subject: AcademicSubjectId; rank: number }[] = [];
  for (const [std, subject] of Object.entries(STANDARD_TO_SUBJECT)) {
    const level = standards[std]?.[ku] as KeyLanguageUseProminence | undefined;
    const rank = level ? PROMINENCE_RANK[level] : undefined;
    if (rank === undefined || rank > PROMINENCE_RANK.prominent) continue;
    scored.push({ subject, rank });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      ACADEMIC_SUBJECTS.indexOf(a.subject) - ACADEMIC_SUBJECTS.indexOf(b.subject),
  );
  const unique: AcademicSubjectId[] = [];
  for (const row of scored) {
    if (!unique.includes(row.subject)) unique.push(row.subject);
  }
  return unique.length > 0 ? unique : [...ACADEMIC_SUBJECTS];
}

export function prominenceForSubject(
  keyUse: string | null | undefined,
  subject: AcademicSubjectId,
): KeyLanguageUseProminence | null {
  const ku = normalizeKeyUse(keyUse);
  if (!ku) return null;
  const level = prominenceTable()[subject]?.[ku];
  if (
    level === "most_prominent" ||
    level === "prominent" ||
    level === "present"
  ) {
    return level;
  }
  return null;
}
