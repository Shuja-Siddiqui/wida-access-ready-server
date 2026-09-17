/** Shared 2016 Can Do rules for every domain. */

export const FRAMEWORK_2016_PROMPT_SLICE = `
EDITION: WIDA Can Do Descriptors, Key Uses Edition (2016).
can_do.items = the 2016 level skill (must assess this). can_do.key_language_use = 2020 purpose (Narrate/Inform/Explain/Argue). Follow both. Do not invent new Can Do bullets.
can_do.content_portrayal = how to write this item (from can-do-content-guide). Follow how_to_portray. picture.use / count / type describe the Can Do visual.
If a domain slice fights can_do.items, the Can Do items win.
Instruction examples show skill type only — never copy example wording; invent new text for THIS can_do, photo, and image_tags.
When academic_subject is set, that subject was chosen from WIDA Table 3-11 (Grades 6–8 Key Language Use prominence). Stay in that subject and that Key Language Use. can_do.key_language_use.prominence_grades_6_8 lists the fit.
`.trim();
