/** Writing content prompt — base + optional library-image block. */

import { LANGUAGE_FORMS_ACCURACY_FOR_CONTENT } from "../grammar-correction-rules";
import { WRITING_IMAGE_PASSAGE_RULES } from "./writing-image-passage";

const WRITING_BUILD_ORDER = `
BUILD ORDER
1. Apply the six 2020 framework parts. Job = language_functions + key_language_use. English hardness = pld.level.
2. Choose word_bank, sentence_frame, task_type, and min_sentences from content_portrayal + framework.pld.

SEPARATE FIELDS FOR LISTEN-ALOUD
• prompt — the writing JOB only. Do NOT paste sentence_frame into prompt. Do NOT list word_bank words in prompt.
• sentence_frame — starter/scaffold ONLY. Never duplicate inside prompt.
• word_bank — vocabulary list ONLY. Words must not appear in prompt.

Levels 1–2: If sentence_frame is non-null, prompt must not contain that frame (even paraphrased).
Levels 3–6: Size the prompt so a student can finish at this pld.

Self-check: prompt must NEVER say word bank, sentence frame, or "use the bank."

Return ONLY the JSON in OUTPUT SCHEMA.
`.trim();

export const WRITING_CONTENT_NO_IMAGE = `
DOMAIN: WRITING  |  Grade 6–8 ELL  |  ACCESS-style PRACTICE  |  ACADEMIC WIDA

No library photo for this session — write from topic and academic_subject only.
• passage MUST be null.
• Never say look / picture / photo / what you see / what you can see.

${WRITING_BUILD_ORDER}
`.trim();

export const WRITING_CONTENT_WITH_LIBRARY = `
DOMAIN: WRITING  |  Grade 6–8 ELL  |  ACCESS-style PRACTICE  |  ACADEMIC WIDA

${WRITING_IMAGE_PASSAGE_RULES}

LIBRARY IMAGE POLICY
• library_image_required true (Level 1 only): MUST set selected_image_id from library_candidates when any exist. Never null.
• Level 2–6: pick selected_image_id when a photo fits this key_use and framework, otherwise null.

WHEN selected_image_id IS SET
Build passage FROM that candidate's tags, concept, and description before writing the prompt.

WHEN selected_image_id IS NULL (Level 2+ only)
• passage MUST be null.
• Write from topic and academic_subject only — never say look / picture / photo / what you see.

${WRITING_BUILD_ORDER.replace(
  "• prompt — the writing JOB only.",
  "• passage — image-connected context ONLY when selected_image_id is set. Follow passage_sentence_target.\n• prompt — the writing JOB only.",
)}
`.trim();

/** @deprecated Router fallback when library flag unknown */
export const WRITING_CONTENT = WRITING_CONTENT_WITH_LIBRARY;

export function buildWritingContentSlice(hasLibraryCandidates: boolean): string {
  const base = hasLibraryCandidates ? WRITING_CONTENT_WITH_LIBRARY : WRITING_CONTENT_NO_IMAGE;
  return `${base}\n\n${LANGUAGE_FORMS_ACCURACY_FOR_CONTENT}`;
}
