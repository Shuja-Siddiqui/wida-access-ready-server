/** Speaking levels 1–2: short oral turn; framework-driven. */

import { ONE_PHOTO_L12 } from "./one-photo-l12";
import { FRAMEWORK_EXPRESSIVE_BUILD_ORDER, FRAMEWORK_FORMAT_SELECTION } from "./framework-driven-content";

export const SPEAKING_CONTENT_1_2 = `
DOMAIN: SPEAKING  |  BAND: 1–2  |  student SPEAKS one short turn

${ONE_PHOTO_L12}

${FRAMEWORK_EXPRESSIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION.replace("available_question_formats", "available_prompt_types")}

• You choose scaffold, response_length, and prompt shape from framework.pld.
• Pick prompt_type from available_prompt_types that fits framework.language_functions.
`.trim();
