/**

 * 2020 pack — WIDA ELD Standards Framework, Grades 6–8

 *

 * data/     Language functions/features + proficiency level descriptors

 * prompts/  Extra Claude instructions for this edition

 * select.ts Slices one Standard × KLU × mode × PLD level for generate()

 */

import type { FrameworkBand, FrameworkDomain } from "../types";

import { FRAMEWORK_2020_PROMPT_SLICE } from "./prompts/shared";

import languageFunctions6to8 from "./data/wida_eld_language_functions_6-8.json";

import proficiencyLevelDescriptors6to8 from "./data/wida_eld_proficiency_level_descriptors_6-8.json";



export { FRAMEWORK_2020_PROMPT_SLICE, languageFunctions6to8, proficiencyLevelDescriptors6to8 };

export {

  selectFrameworkTask,

  serializeFrameworkTask,

  selectExpressivePld,

  selectInterpretivePld,

  formatExpressivePldBlock,

  formatInterpretivePldBlock,

  frameworkTaskDescriptor,

  hasExpressiveCell,

  hasInterpretiveCell,

} from "./select";

export type { FrameworkTask, AcademicSubjectId, FrameworkMode } from "./select";

export { prominenceForSubject, subjectPoolForKeyUse } from "./prominence";
export type { KeyLanguageUseProminence } from "./prominence";

export {

  FEEDBACK_2020_SHARED,

  FEEDBACK_2020_SPEAKING_1_2,

  FEEDBACK_2020_SPEAKING_3_6,

} from "./prompts/feedback";

export {
  parseFrameworkTask,
  serializeFrameworkForFeedback,
  serializeFrameworkForFeedbackFromRecord,
  frameworkFeedbackCoachNote,
} from "./feedback-framework";
export type { FeedbackFrameworkDomain } from "./feedback-framework";



/** @deprecated Domain slices live in prompts/content/{domain}-{band}.ts — assembled via buildContentSystemPrompt. */
export function framework2020DomainSlice(
  _domain: FrameworkDomain,
  _band: FrameworkBand,
  _opts?: { hasLibraryCandidates?: boolean },
): string {
  return "";
}


