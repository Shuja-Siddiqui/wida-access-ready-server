/** Writing levels 1–2: expressive WIDA tasks; library photo when the content guide requires it. */

import { ONE_PHOTO_L12 } from "./one-photo-l12";

export const WRITING_CONTENT_1_2 = `
DOMAIN: WRITING  |  BAND: 1–2  |  Grade 6–8 ELL  |  ACCESS-style PRACTICE  |  ACADEMIC WIDA

${ONE_PHOTO_L12}

BUILD ORDER
1. Apply the six 2020 framework parts. The job is language_functions + key_language_use. English hardness is pld.level.
2. When has_library_image: the photo is already on screen. Write one open prompt about image_tags.
   • word_bank and sentence_frame in JSON MUST be null — never output a word list or fill-in frame UI.
   • Do not say look / look at the diagram / picture / what do you see.
   • Ignore static-guide references to printed word banks or blank label diagrams.
   When has_library_image is false: write from topic and academic_subject only.
3. Write one prompt from framework.pld and language_functions. You choose item shape only when there is no library photo.
4. Prompt must NEVER say word bank, sentence frame, "use the bank," or "start here."
5. Self-check: Level 2 prompt that only asks to name objects without a photo → START OVER.

Return ONLY the JSON in OUTPUT SCHEMA.
`.trim();
