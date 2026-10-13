/**
 * Slice one 2020 ELD cell + matching PLDs for Claude.
 * Blank Standard × KLU cells are not invented.
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
  reference_code_interpretive?: string;
  reference_code_expressive?: string;
  language_expectations?: string[];
  interpretive?: { intro?: string; language_expectations?: string[] };
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
  interpretive_communication_mode?: { framing?: string; dimensions?: PldDimension[] };
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

export function hasInterpretiveCell(
  subject: AcademicSubjectId | null | undefined,
  keyUse: string | null | undefined,
): boolean {
  if (!subject) return false;
  const cell = kluCell(SUBJECT_TO_STANDARD[subject], asKeyUse(keyUse));
  if (!cell) return false;
  const interp = cell.interpretive?.language_expectations?.length ?? 0;
  const topLevel = cell.language_expectations?.length ?? 0;
  return interp > 0 || topLevel > 0;
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

function pldLineFromMode(
  mode: FrameworkMode,
  dimensionName: string,
  level: number,
): string {
  const modePack = mode === "interpretive"
    ? plds.interpretive_communication_mode
    : plds.expressive_communication_mode;
  const dims = modePack?.dimensions ?? [];
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

function selectPld(level: number, mode: FrameworkMode): FrameworkTask["pld"] {
  const clamped = Math.min(6, Math.max(1, Math.round(level)));
  const modePack = mode === "interpretive"
    ? plds.interpretive_communication_mode
    : plds.expressive_communication_mode;
  return {
    level: clamped,
    framing: modePack?.framing
      ?? "Toward the end of each proficiency level, when scaffolded appropriately, multilingual learners will...",
    discourse_organization: pldLineFromMode(mode, "Discourse - Organization of language", clamped),
    discourse_cohesion: pldLineFromMode(mode, "Discourse - Cohesion of language", clamped),
    discourse_density: pldLineFromMode(mode, "Discourse - Density of language", clamped),
    sentence: pldLineFromMode(mode, "Sentence - Grammatical complexity", clamped),
    word_phrase: pldLineFromMode(mode, "Word, Phrase - Precision of language", clamped),
  };
}

export function selectExpressivePld(level: number): FrameworkTask["pld"] {
  return selectPld(level, "expressive");
}

export function selectInterpretivePld(level: number): FrameworkTask["pld"] {
  return selectPld(level, "interpretive");
}

function expectationsFromCell(cell: KluCell, mode: FrameworkMode): string[] {
  if (mode === "interpretive") {
    if (cell.interpretive?.language_expectations?.length) {
      return cell.interpretive.language_expectations;
    }
    return cell.language_expectations ?? [];
  }
  if (cell.expressive?.language_expectations?.length) {
    return cell.expressive.language_expectations;
  }
  return cell.language_expectations ?? [];
}

function functionsFromCell(cell: KluCell, mode: FrameworkMode): FrameworkFunction[] {
  if (mode === "interpretive") {
    const bullets = expectationsFromCell(cell, "interpretive");
    return bullets.slice(0, MAX_FUNCTIONS).map((text) => ({
      function: text,
      language_features: [],
    })).filter((row) => row.function.length > 0);
  }
  if (Array.isArray(cell.language_functions) && cell.language_functions.length > 0) {
    return cell.language_functions.slice(0, MAX_FUNCTIONS).map((row) => ({
      function: String(row.function ?? "").trim(),
      language_features: (row.language_features ?? []).map((f) => String(f)).slice(0, MAX_FEATURES),
    })).filter((row) => row.function.length > 0);
  }
  const bullets = expectationsFromCell(cell, "expressive");
  return bullets.slice(0, MAX_FUNCTIONS).map((text) => ({
    function: text,
    language_features: [],
  }));
}

function referenceCodeFromCell(cell: KluCell, mode: FrameworkMode): string | null {
  if (mode === "interpretive") {
    return cell.reference_code_interpretive ?? cell.reference_code ?? null;
  }
  return cell.reference_code_expressive ?? cell.reference_code ?? null;
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
    throw new Error(`No WIDA 2020 ELD cell for key language use "${klu}" (standard ${standardId})`);
  }
  const expectations = expectationsFromCell(cell, mode);
  const level = Math.min(6, Math.max(1, Math.round(opts.level)));

  return {
    edition: "2020",
    eld_standard: {
      id: standardId,
      name: STANDARD_NAMES[standardId],
    },
    key_language_use: klu,
    mode,
    reference_code: referenceCodeFromCell(cell, mode),
    language_expectations: expectations.slice(0, 8),
    language_functions: functionsFromCell(cell, mode),
    pld: selectPld(level, mode),
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

function formatPldBlock(pld: FrameworkTask["pld"], mode: FrameworkMode): string {
  const column = pld.level >= 6 ? "level_6" : `end_of_level_${pld.level}`;
  const modeLabel = mode === "interpretive"
    ? "interpretive (listening/reading/viewing)"
    : "expressive (speaking/writing)";
  const action = mode === "interpretive"
    ? "Write one comprehension task so the student can practice understanding THIS column."
    : "Write one student prompt so they can practice producing THIS column.";
  return [
    `LEVEL TEXT FROM JSON — wida_eld_proficiency_level_descriptors_6-8.json`,
    `Mode: ${modeLabel}. Column: ${column}. Other level columns are not in this call.`,
    `Language expectations and functions are the SAME job at every level. Only these five lines change the English.`,
    pld.framing,
    `organization: ${pld.discourse_organization}`,
    `cohesion: ${pld.discourse_cohesion}`,
    `density: ${pld.discourse_density}`,
    `sentence: ${pld.sentence}`,
    `word_phrase: ${pld.word_phrase}`,
    `${action} Do not write to a different level's column.`,
  ].join("\n");
}

/** The five PLD lines we sliced from JSON for this integer level — the only level-specific WIDA text. */
export function formatExpressivePldBlock(pld: FrameworkTask["pld"]): string {
  return formatPldBlock(pld, "expressive");
}

export function formatInterpretivePldBlock(pld: FrameworkTask["pld"]): string {
  return formatPldBlock(pld, "interpretive");
}

/** Compact descriptor from framework functions for client/feedback compat. */
export function frameworkTaskDescriptor(task: FrameworkTask): string {
  const fns = task.language_functions.map((f) => f.function).filter(Boolean);
  if (fns.length > 0) return fns.slice(0, 3).join("; ");
  return task.language_expectations.slice(0, 2).join("; ");
}

export { SUBJECT_TO_STANDARD };
