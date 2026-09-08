/** Speaking levels 1–2: short oral turn; photo only when the content guide requires it. */

import { ONE_PHOTO_L12 } from "./one-photo-l12";

export const SPEAKING_CONTENT_1_2 = `
DOMAIN: SPEAKING  |  BAND: 1–2  |  student SPEAKS one short turn

${ONE_PHOTO_L12}

The can_do object is the skill goal. Prompt and scaffold must train THAT Can Do. L1: word, phrase, or one filled frame. L2: 1–2 short sentences. Do not ask for a paragraph.

LEVEL 1
Narrate → name a past event from the photo (who / what happened). Visual required. Fill the scaffold with a short visible word from image_tags.
Inform → answer Who / What / Where. Picture not required. One clear oral Wh task.
Explain → compare two real objects that are image_tags in THIS photo (size, color, amount). Student says the difference. Never invent a second photo.
Argue → yes/no to a short claim. Picture not required. Home language allowed in the task note, student still speaks English words they can.

LEVEL 2
Narrate / Inform → restate a main idea + one detail. Picture not required unless has_library_image — then the idea must be true of this photo.
Explain → how/why with because, using two visible tags if a photo is present; otherwise a modeled sentence on topic.
Argue → a claim plus Why? One reason. Print/speech; photo not required.

If has_library_image: the oral task must be answerable from image_tags / description. Fill the scaffold with a short visible tag. Do not leave an empty blank. Do not use a long photo title as the word to say.
Pick exactly one allowed_prompt_type. echo target_seconds.
`.trim();
