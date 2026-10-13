/** Shared L1–2 library-photo rule. Listening, reading, speaking, and writing all use this mapping. */

export const ONE_PHOTO_L12 = `
ONE PHOTO (levels 1–2): this app has one library photograph, not extra image files.
has_library_image true → a photo is on screen. Write about THAT photo. Map picture.count onto image_tags in THIS photo (compare = two tags, not two files). image_tags are the only object names you may use.
has_library_image false → no photo. Do not say look / picture / what do you see.
Do not invent objects. Do not copy poses from image_description into questions.
`.trim();
