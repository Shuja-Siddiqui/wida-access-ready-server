/** Speaking levels 3–6: extended oral discourse; framework-driven. */

import { FRAMEWORK_EXPRESSIVE_BUILD_ORDER, FRAMEWORK_FORMAT_SELECTION } from "./framework-driven-content";

export const SPEAKING_CONTENT_3_6 = `
DOMAIN: SPEAKING  |  BAND: 3–6  |  student SPEAKS a longer turn

${FRAMEWORK_EXPRESSIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION.replace("available_question_formats", "available_prompt_types")}

• You choose response_length, scaffold, prompt shape, and target_seconds from framework.pld (typical_* user fields are hints only).
• Pick prompt_type from available_prompt_types based on framework.language_functions.
`.trim();
