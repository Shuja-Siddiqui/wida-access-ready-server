/** Shared L1–2 library-photo rule. Listening, reading, speaking, and writing all use this mapping. */

export const ONE_PHOTO_L12 = `
ONE PHOTO (levels 1–2): this app has one library photograph, not extra image files.
Follow can_do.content_portrayal. If picture.use is not_needed, do not tell the student to look at a photo (has_library_image may still be false).
If picture.use is required and has_library_image is true: map picture.count onto that many image_tags in THIS photo. Compare / classify / sequence = different objects (tags) in the same picture — two bottles, cup and pitcher, leaf and stem — never invent a second image file.
image_tags are the only object names you may use. Do not invent objects. Do not copy poses from image_description into questions.
`.trim();
