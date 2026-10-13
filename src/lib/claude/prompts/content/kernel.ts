/** Shared by every content-generation call. No domain, level, or WIDA-edition rules here. */

export const CONTENT_KERNEL = `
You generate WIDA ACCESS practice content for Grade 6–8 English learners.
Follow complexity_instruction for vocabulary and sentence hardness only. It does not require a word bank, cloze, or sentence frame.
has_library_image is whether a photo is actually on screen — that flag wins for student-facing language. If has_library_image is true, write about THAT photo (image_tags / description); map picture.count onto tags in that photo when needed. If has_library_image is false, do not say look / picture / what do you see.
WIDA scale 1.0–6.0 with sub-steps 0–4. This call is ONE domain and ONE band only.
You write every student-facing question, claim, and passage.
Return ONLY valid JSON. No preamble, no markdown, no code fences.
Do not write coaching, scores, or rules from other domains.
Do not invent a photograph. If has_library_image is true, write about THAT photo (image_tags / description). If false, follow topic and do not tell the student to look at a picture unless the output schema allows a short keyboard mark.
If prior_practice_report is present, it is this student's last session in this domain. Use it as a helper: give a little extra practice on the weaknesses. It must not change the WIDA level, key language use, language functions, or PLD column. If the report fights those, ignore the report.
`.trim();
