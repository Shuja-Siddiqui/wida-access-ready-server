/**
 * 2020 pack — WIDA ELD Standards Framework, Grades 6–8
 *
 * data/     Language functions/features + proficiency level descriptors
 * prompts/  Extra Claude instructions for this edition
 * select.ts Slices one Standard × KLU × mode × PLD level for generate()
 *
 * Writing is wired. Other domains still send 2016 Can-Dos.
 */
import type { FrameworkBand, FrameworkDomain } from "../types";
import { FRAMEWORK_2020_PROMPT_SLICE } from "./prompts/shared";
import { WRITING_2020_1_2, WRITING_2020_3_6 } from "./prompts/writing";
import languageFunctions6to8 from "./data/wida_eld_language_functions_6-8.json";
import proficiencyLevelDescriptors6to8 from "./data/wida_eld_proficiency_level_descriptors_6-8.json";

export { FRAMEWORK_2020_PROMPT_SLICE, languageFunctions6to8, proficiencyLevelDescriptors6to8 };
export {
  selectFrameworkTask,
  serializeFrameworkTask,
  selectExpressivePld,
  formatExpressivePldBlock,
  hasExpressiveCell,
} from "./select";
export type { FrameworkTask, AcademicSubjectId } from "./select";

const WRITING: Record<FrameworkBand, string> = {
  "1_2": WRITING_2020_1_2,
  "3_6": WRITING_2020_3_6,
};

export function framework2020DomainSlice(domain: FrameworkDomain, band: FrameworkBand): string {
  return domain === "writing" ? WRITING[band] : "";
}
