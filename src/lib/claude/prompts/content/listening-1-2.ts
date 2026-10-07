/** Listening levels 1–2: library photo as visual support; answers from heard text. */

import { ONE_PHOTO_L12 } from "./one-photo-l12";
import { FRAMEWORK_FORMAT_SELECTION, FRAMEWORK_INTERPRETIVE_BUILD_ORDER } from "./framework-driven-content";

export const LISTENING_CONTENT_1_2 = `
DOMAIN: LISTENING  |  BAND: 1–2  |  student HEARS audio_script, then answers

${ONE_PHOTO_L12}

${FRAMEWORK_INTERPRETIVE_BUILD_ORDER}

${FRAMEWORK_FORMAT_SELECTION}

• Questions test language heard in audio_script — not objects visible only in the photo.
• Match oral_format and passage_sentence_target. explanation: max 8 words.
`.trim();
