/** Writing content prompt — base + optional library-image block. */

import { LANGUAGE_FORMS_ACCURACY_FOR_CONTENT } from "../grammar-correction-rules";
import { LIBRARY_PHOTO_CORE, LIBRARY_PHOTO_NO_LOOK } from "./library-photo-policy";

const WRITING_BUILD_ORDER = `
BUILD ORDER
1. Job = framework.language_functions + key_language_use. Hardness = framework.pld + complexity_instruction.
2. You choose word_bank, sentence_frame, task_type, and min_sentences from framework.
3. SEPARATE FIELDS: prompt = job only; sentence_frame = starter only; word_bank = vocabulary only — never duplicate across fields.
`.trim();

export const WRITING_CONTENT_NO_IMAGE = `
DOMAIN: WRITING  |  Grade 6–8  |  expressive

${LIBRARY_PHOTO_NO_LOOK}
• passage MUST be null. Write from academic_unit, content_standards, tier3_vocabulary.

${WRITING_BUILD_ORDER}
`.trim();

export const WRITING_CONTENT_WITH_LIBRARY = `
DOMAIN: WRITING  |  Grade 6–8  |  expressive

${LIBRARY_PHOTO_CORE}
• Level 1–2: when library_candidates exist, MUST set selected_image_id — content is image-led.
• Level 3+: no library photo — write from unit + standards only.
• Pick selected_image_id FIRST from library_candidates, then compose passage, then prompt.
• passage follows passage_sentence_target when an image is selected; null when selected_image_id is null.

${WRITING_BUILD_ORDER}
`.trim();

/** @deprecated Router fallback when library flag unknown */
export const WRITING_CONTENT = WRITING_CONTENT_WITH_LIBRARY;

export function buildWritingContentSlice(hasLibraryCandidates: boolean): string {
  const base = hasLibraryCandidates ? WRITING_CONTENT_WITH_LIBRARY : WRITING_CONTENT_NO_IMAGE;
  return `${base}\n\n${LANGUAGE_FORMS_ACCURACY_FOR_CONTENT}`;
}
