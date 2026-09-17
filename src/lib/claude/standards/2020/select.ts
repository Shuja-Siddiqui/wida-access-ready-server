/**
 * Slice one 2020 ELD cell + matching PLDs for Claude.
 * Writing is expressive. Blank Standard × KLU cells are not invented.
 */
import languageFunctions6to8 from "./data/wida_eld_language_functions_6-8.json";
import proficiencyLevelDescriptors6to8 from "./data/wida_eld_proficiency_level_descriptors_6-8.json";

export type EldStandardId = "1" | "2" | "3" | "4" | "5";
export type FrameworkMode = "interpretive" | "expressive";
export type KeyLanguageUse = "Narrate" | "Inform" | "Explain" | "Argue";
export type AcademicSubjectId = "ela" | "math" | "science" | "social_studies";

export interface FrameworkFunction {
  function: string;
  language_features: string[];
}

export interface FrameworkTask {
  edition: "2020";
  eld_standard: { id: EldStandardId; name: string };
  key_language_use: KeyLanguageUse;
  mode: FrameworkMode;
  reference_code: string | null;
  language_expectations: string[];
  language_functions: FrameworkFunction[];
  pld: {
    level: number;
    framing: string;
    discourse_organization: string;
    discourse_cohesion: string;
    discourse_density: string;
    sentence: string;
    word_phrase: string;
  };
}

const SUBJECT_TO_STANDARD: Record<AcademicSubjectId, EldStandardId> = {
  ela: "2",
  math: "3",
  science: "4",
  social_studies: "5",
};

const STANDARD_NAMES: Record<EldStandardId, string> = {
  "1": "Language for Social and Instructional Purposes",
  "2": "Language for Language Arts",
  "3": "Language for Mathematics",
  "4": "Language for Science",
  "5": "Language for Social Studies",
};

const MAX_FUNCTIONS = 8;
const MAX_FEATURES = 8;

type KluCell = {
  reference_code?: string;
  reference_code_expressive?: string;
  language_expectations?: string[];
  expressive?: { intro?: string; language_expectations?: string[] };
  language_functions?: Array<{ function?: string; language_features?: string[] }>;
};

type StandardsPack = {
  standards: Record<string, {
    standard_name?: string;
    key_language_uses?: Record<string, KluCell>;
  }>;
};

type PldDimension = {
  dimension?: string;
  criterion_prompt?: string;
  end_of_level_1?: string;
  end_of_level_2?: string;
  end_of_level_3?: string;
  end_of_level_4?: string;
  end_of_level_5?: string;
  level_6?: string;
};

const pack = languageFunctions6to8 as StandardsPack;
const plds = proficiencyLevelDescriptors6to8 as {
  expressive_communication_mode?: { framing?: string; dimensions?: PldDimension[] };
};

function asKeyUse(keyUse: string | null | undefined): KeyLanguageUse {
  if (keyUse === "Recount") return "Narrate";
  if (keyUse === "Inform" || keyUse === "Explain" || keyUse === "Argue" || keyUse === "Narrate") {
    return keyUse;
  }
  return "Inform";
}

function kluCell(standardId: EldStandardId, klu: KeyLanguageUse): KluCell | null {
  return pack.standards[standardId]?.key_language_uses?.[klu] ?? null;
}

export function hasExpressiveCell(
  subject: AcademicSubjectId | null | undefined,
  keyUse: string | null | undefined,
): boolean {
  if (!subject) return false;
  const cell = kluCell(SUBJECT_TO_STANDARD[subject], asKeyUse(keyUse));
  if (!cell) return false;
  const functions = cell.language_functions?.length ?? 0;
  const expectations = cell.expressive?.language_expectations?.length ?? 0;
  return functions > 0 || expectations > 0;
}

function resolveStandardId(
  keyUse: KeyLanguageUse,
  academicSubject?: AcademicSubjectId | null,
): EldStandardId {
  if (academicSubject) {
    const preferred = SUBJECT_TO_STANDARD[academicSubject];
    if (kluCell(preferred, keyUse)) return preferred;
  }
  return "1";
}

function pldLine(dimensionName: string, level: number): string {
  const dims = plds.expressive_communication_mode?.dimensions ?? [];
  const dim = dims.find((d) => d.dimension === dimensionName);
  if (!dim) return "";
  const clamped = Math.min(6, Math.max(1, Math.round(level)));
  if (clamped === 1) return dim.end_of_level_1 ?? "";
  if (clamped === 2) return dim.end_of_level_2 ?? "";
  if (clamped === 3) return dim.end_of_level_3 ?? "";
  if (clamped === 4) return dim.end_of_level_4 ?? "";
  if (clamped === 5) return dim.end_of_level_5 ?? "";
  return dim.level_6 ?? "";
}

export function selectExpressivePld(level: number): FrameworkTask["pld"] {
  const clamped = Math.min(6, Math.max(1, Math.round(level)));
  return {
    level: clamped,
    framing: plds.expressive_communication_mode?.framing
      ?? "Toward the end of each proficiency level, when scaffolded appropriately, multilingual learners will...",
    discourse_organization: pldLine("Discourse - Organization of language", clamped),
    discourse_cohesion: pldLine("Discourse - Cohesion of language", clamped),
    discourse_density: pldLine("Discourse - Density of language", clamped),
    sentence: pldLine("Sentence - Grammatical complexity", clamped),
    word_phrase: pldLine("Word, Phrase - Precision of language", clamped),
  };
}

function functionsFromCell(cell: KluCell): FrameworkFunction[] {
  if (Array.isArray(cell.language_functions) && cell.language_functions.length > 0) {
    return cell.language_functions.slice(0, MAX_FUNCTIONS).map((row) => ({
      function: String(row.function ?? "").trim(),
      language_features: (row.language_features ?? []).map((f) => String(f)).slice(0, MAX_FEATURES),
    })).filter((row) => row.function.length > 0);
  }
  const bullets = cell.language_expectations ?? [];
  return bullets.slice(0, MAX_FUNCTIONS).map((text) => ({
    function: text,
    language_features: [],
  }));
}

export function selectFrameworkTask(opts: {
  level: number;
  keyUse: string;
  mode?: FrameworkMode;
  academicSubject?: AcademicSubjectId | null;
}): FrameworkTask {
  const klu = asKeyUse(opts.keyUse);
  const mode = opts.mode ?? "expressive";
  let standardId = resolveStandardId(klu, opts.academicSubject);
  let cell = kluCell(standardId, klu);
  if (!cell) {
    standardId = "1";
    cell = kluCell("1", klu);
  }
  if (!cell) {
    throw new Error(`No 2020 ELD cell for ${klu}`);
  }
  const expectations = cell.expressive?.language_expectations?.length
    ? cell.expressive.language_expectations
    : (cell.language_expectations ?? []);
  const level = Math.min(6, Math.max(1, Math.round(opts.level)));

  return {
    edition: "2020",
    eld_standard: {
      id: standardId,
      name: STANDARD_NAMES[standardId],
    },
    key_language_use: klu,
    mode,
    reference_code: cell.reference_code_expressive ?? cell.reference_code ?? null,
    language_expectations: expectations.slice(0, 8),
    language_functions: functionsFromCell(cell),
    pld: selectExpressivePld(level),
  };
}

export function serializeFrameworkTask(task: FrameworkTask): Record<string, unknown> {
  return {
    edition: task.edition,
    eld_standard: task.eld_standard,
    key_language_use: task.key_language_use,
    mode: task.mode,
    reference_code: task.reference_code,
    language_expectations: task.language_expectations,
    language_functions: task.language_functions,
    pld: task.pld,
  };
}

/** The five PLD lines we sliced from JSON for this integer level — the only level-specific WIDA text. */
export function formatExpressivePldBlock(pld: FrameworkTask["pld"]): string {
  const column = pld.level >= 6 ? "level_6" : `end_of_level_${pld.level}`;
  return [
    `LEVEL TEXT FROM JSON — wida_eld_proficiency_level_descriptors_6-8.json`,
    `Mode: expressive (speaking/writing). Column: ${column}. Other level columns are not in this call.`,
    `Language expectations and functions are the SAME job at every level. Only these five lines change the English.`,
    pld.framing,
    `organization: ${pld.discourse_organization}`,
    `cohesion: ${pld.discourse_cohesion}`,
    `density: ${pld.discourse_density}`,
    `sentence: ${pld.sentence}`,
    `word_phrase: ${pld.word_phrase}`,
    `Write one student prompt so they can practice producing THIS column. Do not write to a different level's column.`,
  ].join("\n");
}

export { SUBJECT_TO_STANDARD };
