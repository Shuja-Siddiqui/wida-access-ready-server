/** Writing levels 1–2: retrieve→compose — model picks library image + scaffolds per key language use. */

import { ONE_PHOTO_L12 } from "./one-photo-l12";

export const WRITING_CONTENT_1_2 = `
DOMAIN: WRITING  |  BAND: 1–2  |  Grade 6–8 ELL  |  ACCESS-style PRACTICE  |  ACADEMIC WIDA

${ONE_PHOTO_L12}

BUILD ORDER
1. Apply the six 2020 framework parts. The job is language_functions + key_language_use. English hardness is pld.level.
2. library_candidates (when present) are already filtered to academic_subject — each has id, tags, concept, and description.
   • Pick selected_image_id or null for this key_use; use that candidate's tags and description when composing passage + prompt.
   • When null: passage null; write from topic and academic_subject only — no look / picture / what do you see.
   • You decide passage, prompt, word_bank, and sentence_frame — follow content_portrayal and framework; output is used as-is.
3. Choose word_bank, sentence_frame, and task shape from content_portrayal + picture_use_hint (Inform → words, Argue → frame, etc.).

SEPARATE FIELDS FOR LISTEN-ALOUD (do not repeat the same words in two JSON keys)
• passage — background context ONLY (what happened, what the picture shows). No writing instructions. No sentence_frame text. No word_bank words.
• prompt — the writing JOB only: what to write, how many sentences, which skill. Do NOT paste sentence_frame into prompt. Do NOT list word_bank words in prompt. Do NOT say "use the frame" or "use the word bank."
• sentence_frame — the starter/scaffold ONLY (one frame with blanks if needed). The app reads this aloud AFTER the task — never duplicate it inside prompt.
• word_bank — vocabulary list ONLY. Words must not appear in passage or prompt.

4. Prompt and passage must NEVER say word bank, sentence frame, "use the bank," or "start here."
5. Self-check: Level 2 prompt that only asks to name objects without context → START OVER.
6. Self-check: If sentence_frame is non-null, prompt must not contain that frame text (even paraphrased).

Return ONLY the JSON in OUTPUT SCHEMA.
`.trim();
