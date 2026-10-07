/** Listening levels 3–6: oral passage + selected response; framework-driven. */

import { FRAMEWORK_FORMAT_SELECTION, FRAMEWORK_INTERPRETIVE_BUILD_ORDER } from "./framework-driven-content";

export const LISTENING_CONTENT_3_6 = `
DOMAIN: LISTENING  |  BAND: 3–6  |  student hears audio_script, then answers from the AUDIO

${FRAMEWORK_INTERPRETIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION}

• Match oral_format and passage_sentence_target. Plain spoken English — no SSML or "as you can see".
• Selected-response items: exactly 3 options. Foils = plausible mishearings of THIS audio. explanation: max 8 words.
• last_session_score < 70 → clearer signals, same skill. is_retry → new speaker/setting, same skill.
`.trim();
