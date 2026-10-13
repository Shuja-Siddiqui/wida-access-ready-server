/** Reading levels 1–2: short print + one library photo when the content guide requires it. */

import { ONE_PHOTO_L12 } from "./one-photo-l12";

export const READING_CONTENT_1_2 = `
DOMAIN: READING  |  BAND: 1–2  |  student READS short text, then answers from THIS passage and, when shown, THIS photo

${ONE_PHOTO_L12}

Passage: stay under passage_word_max / text_format. Common words. One idea. You write all question text.

LEVEL 1
Narrate → illustrated Wh. Short labeled captions about people/places in the photo (1 tag). Questions: who/where from the print. type multiple_choice. Options may use image_tags.
Inform → name familiar objects/icons from print that match image_tags. type multiple_choice. Fact naming, not a plot.
Explain → match printed words/phrases to objects in the photo. type match_columns. Left = words; right = exact image_tags. Compare two tags when picture.count is 2.
Argue → printed true/false or topic-choice sentences. type classify. picture.use is not_needed — do not require the photo.

LEVEL 2
Narrate → sequence a mini-story using 3 image_tags (first → then → last) plus short captions. type sequence_order. Items name those tags.
Inform → sequence a FACT process with 3 tags (not a character plot). type sequence_order.
Explain → compare two objects/ideas in the photo (2 tags). Passage states how they differ. type multiple_choice. Answers are image_tags or short phrases about those tags.
Argue → fact vs opinion in print. type classify. No photo required.

Questions: exactly question_count, ONLY types in OUTPUT SCHEMA. Include every schema key. When has_library_image, answers must be grounded in the passage AND the visible tags. Multiple choice: exactly 3 options.
Vocabulary: 2–3 words from the passage.
`.trim();
