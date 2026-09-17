/**
 * WIDA domain content engines: Can Do + curriculum + session context.
 * Academic subject engines live in lib/academic/. Claude generators stay in lib/claude/.
 */
export * from "./listeningContentEngine";
export type { ReadingContext } from "./readingContentEngine";
export {
  READING_PERMITTED_FORMATS,
  READING_QUESTION_COUNT,
  READING_PASSAGE_WORD_MAX,
  readingFormatsForKeyUse,
  getReadingCanDoForKeyUse,
  selectReadingTopic,
  buildReadingContext,
} from "./readingContentEngine";
export type { SpeakingContext } from "./speakingContentEngine";
export {
  SPEAKING_DISCOURSE_TYPE,
  SPEAKING_RESPONSE_LENGTH,
  SPEAKING_ALLOWED_PROMPT_TYPES,
  getSpeakingCanDoForKeyUse,
  speakingCanDoCoachNote,
  selectSpeakingTopic,
  buildSpeakingContext,
} from "./speakingContentEngine";
export type { WritingContext } from "./writingContentEngine";
export {
  WRITING_TASK_TYPE,
  nextWritingAcademicSubject,
  nextWritingKeyUseForSubject,
  lastWritingKeyUseForSubject,
  expressiveKeyUsesForWritingSubject,
  selectWritingTopic,
  buildWritingContext,
} from "./writingContentEngine";
