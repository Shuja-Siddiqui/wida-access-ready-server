/**
 * Composable academic listening prompt blocks.
 *
 * Assemble with buildSystemPrompt():
 *   const prompt = buildSystemPrompt(role, BASE_BLOCK, LISTENING_CORE_BLOCK, MATH_SUBJECT_BLOCK, MATH_OUTPUT_SCHEMA);
 */

export { BASE_BLOCK }                                               from "./base";
export { LISTENING_CORE_BLOCK }                                     from "./listening-core";
export { OPTIONAL_LINE_VISUALS_BLOCK, LIBRARY_IMAGE_GROUNDS_CONTENT } from "./optional-line-visuals";
export { buildSystemPrompt, blockIf }                               from "./compose";
export { contentGenPrompt, contentBand, CONTENT_KERNEL }            from "./content";
export type { ContentDomain, ContentBand }                          from "./content";
export { ACADEMIC_IMAGE_ANCHOR_BLOCK, buildImageAnchorPromptFields } from "./academic-image-anchor";

// Subject blocks — guidelines, visual anchor tags, output schemas
export { MATH_SUBJECT_BLOCK, MATH_VISUAL_ANCHOR_TAGS, MATH_OUTPUT_SCHEMA }                               from "./subjects/math";
export { SCIENCE_SUBJECT_BLOCK, SCIENCE_VISUAL_ANCHOR_TAGS, SCIENCE_OUTPUT_SCHEMA }                      from "./subjects/science";
export { SOCIAL_STUDIES_SUBJECT_BLOCK, SOCIAL_STUDIES_VISUAL_ANCHOR_TAGS, SOCIAL_STUDIES_OUTPUT_SCHEMA } from "./subjects/social-studies";
export { ELA_SUBJECT_BLOCK, ELA_VISUAL_ANCHOR_TAGS, ELA_OUTPUT_SCHEMA }                                  from "./subjects/ela";

/** All visual anchor tag sets by subject — used by the image-library search. */
import { MATH_VISUAL_ANCHOR_TAGS }           from "./subjects/math";
import { SCIENCE_VISUAL_ANCHOR_TAGS }        from "./subjects/science";
import { SOCIAL_STUDIES_VISUAL_ANCHOR_TAGS } from "./subjects/social-studies";
import { ELA_VISUAL_ANCHOR_TAGS }            from "./subjects/ela";

export const SUBJECT_VISUAL_ANCHOR_TAGS: Record<string, string[]> = {
  math:           MATH_VISUAL_ANCHOR_TAGS,
  science:        SCIENCE_VISUAL_ANCHOR_TAGS,
  social_studies: SOCIAL_STUDIES_VISUAL_ANCHOR_TAGS,
  ela:            ELA_VISUAL_ANCHOR_TAGS,
};
