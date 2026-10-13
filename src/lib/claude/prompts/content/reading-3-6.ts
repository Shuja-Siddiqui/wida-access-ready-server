/** Reading levels 3–6: paragraph print; framework-driven. */

import { FRAMEWORK_FORMAT_SELECTION, FRAMEWORK_INTERPRETIVE_BUILD_ORDER } from "./framework-driven-content";

export const READING_CONTENT_3_6 = `
DOMAIN: READING  |  BAND: 3–6  |  student READS this passage only

${FRAMEWORK_INTERPRETIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION}

• Passage hardness from framework.pld, text_format, and passage_word_max.
• Foils = plausible misreadings of THIS passage. Vocabulary: 2–3 Tier-2 words from the passage.
`.trim();
