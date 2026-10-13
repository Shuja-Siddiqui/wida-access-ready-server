/** Reading levels 1–2: short passage + optional library photo; framework-driven. */

import { ONE_PHOTO_L12 } from "./one-photo-l12";
import { FRAMEWORK_FORMAT_SELECTION, FRAMEWORK_INTERPRETIVE_BUILD_ORDER } from "./framework-driven-content";

export const READING_CONTENT_1_2 = `
DOMAIN: READING  |  BAND: 1–2  |  student READS passage, then answers from THIS text

${ONE_PHOTO_L12}

${FRAMEWORK_INTERPRETIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION}

• Passage = mini-story or informational text — stay under passage_word_max / text_format. Questions answerable from passage only. Vocabulary: 2–3 words from the passage.
`.trim();
