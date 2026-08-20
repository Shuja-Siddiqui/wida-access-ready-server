/**
 * Barrel export for all Claude content generators.
 * Import from this file so consumers are isolated from the internal file layout.
 *
 * Usage:
 *   import { generateListeningContent, ListeningContent } from "../../lib/claude";
 */

export type { ListeningContent } from "./listening";
export { generateListeningContent, FALLBACK_LISTENING } from "./listening";

export type { ImagePassageContent, ImagePassageQuestion } from "./image-library";
export { generateImagePassageContent } from "./image-library";

export { generateAcademicMathListeningContent, FALLBACK_ACADEMIC_MATH } from "./academic-math";
export { generateAcademicScienceListeningContent, FALLBACK_ACADEMIC_SCIENCE } from "./academic-science";
export { generateAcademicSocialStudiesListeningContent, FALLBACK_ACADEMIC_SOCIAL_STUDIES } from "./academic-social-studies";
export { generateAcademicElaListeningContent, FALLBACK_ACADEMIC_ELA } from "./academic-ela";
export { generateAcademicImageTapContent } from "./academic-image-tap";

export type { ReadingContent } from "./reading";
export { generateReadingContent, FALLBACK_READING } from "./reading";

export type { SpeakingContent } from "./speaking";
export { generateSpeakingContent } from "./speaking";

export type { WritingContent, WritingFeedback } from "./writing";
export { generateWritingContent, getWritingFeedback } from "./writing";

export type { ObjectDetectContent } from "./object-detect";
export { generateObjectDetectContent } from "./object-detect";

// Shared utilities — re-exported for any file that currently imports them
// directly from claude-content (e.g. visionVerify.ts if it ever needs them).
export { callClaude, BASE_PROMPT, toDisplayText, toDisplayTextOrNull } from "./client";
