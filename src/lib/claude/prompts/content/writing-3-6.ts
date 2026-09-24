/** Writing levels 3–6: retrieve→compose when library_candidates are present. */

import { WRITING_IMAGE_PASSAGE_RULES } from "./writing-image-passage";

export const WRITING_CONTENT_3_6 = `
DOMAIN: WRITING  |  BAND: 3–6  |  Grade 6–8 ELL  |  ACCESS-style PRACTICE

${WRITING_IMAGE_PASSAGE_RULES}

Size the prompt so a student can finish at this pld. When library_candidates exist, pick selected_image_id or null; add passage when an image is selected.
Passage length and language hardness MUST follow passage_sentence_target (higher level = longer, more connected narrative).
Choose task_type, min_sentences, word_bank, and sentence_frame from framework.pld and content_portrayal.
SEPARATE FIELDS: passage = image-connected context only | prompt = job only | sentence_frame = scaffold only | word_bank = words only. Do not duplicate frame or bank text inside prompt or passage.

Return ONLY the JSON in OUTPUT SCHEMA.
`.trim();
