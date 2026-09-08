/** Writing levels 1–2: frame + word bank; photo only when the content guide requires it. */

import { ONE_PHOTO_L12 } from "./one-photo-l12";

export const WRITING_CONTENT_1_2 = `
DOMAIN: WRITING  |  BAND: 1–2  |  student WRITES using a frame and word bank

${ONE_PHOTO_L12}

Prompt: one clear writing task. NEVER mention the word bank or sentence frame inside the prompt.

LEVEL 1
Narrate → student writes labels for what is in the photo (amounts, more/less, names of tags). Picture required. Word bank from image_tags.
Inform → copy/reproduce topic words (cognates OK). Picture not required. Word bank of topic words.
Explain → label parts/jobs of objects in the photo, or compare two image_tags (this is bigger / this is for ___). Picture required. Word bank from tags.
Argue → I think ___ plus two printed choices. Picture not required.

LEVEL 2
Narrate / Inform → complete sentences with a word bank (First… Then… or a fact sentence). Picture not required. Word bank of topic words; if a photo is present, include visible tags.
Explain → join short sentences (because/so) AND compare two illustrated ideas using two image_tags in THIS photo. Picture required. Word bank includes those two tags.
Argue → I agree/disagree because… Picture not required.

If has_library_image: write about visible tags only. Do not invent objects.
Follow OUTPUT SCHEMA. Frame is a starter, not fill-in-the-blank. echo min_sentences.
`.trim();
