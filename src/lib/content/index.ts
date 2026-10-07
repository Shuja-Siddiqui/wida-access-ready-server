/**
 * WIDA domain content engines: 2020 framework + curriculum + session context.
 * Academic subject engines live in lib/academic/. Claude generators stay in lib/claude/.
 */
export * from "./listeningContentEngine";
export type { ReadingContext } from "./readingContentEngine";
export {
  READING_PERMITTED_FORMATS,
  READING_QUESTION_COUNT,
  READING_PASSAGE_WORD_MAX,
  buildReadingContext,
} from "./readingContentEngine";
export {
  listeningAvailableFormats,
  listeningL12AvailableFormats,
  readingAvailableFormats,
  speakingAvailablePromptTypes,
  formatsForDomain,
  resolveQuestionUi,
  isAllowedQuestionType,
  QUESTION_TYPE_REGISTRY,
  SPEAKING_PROMPT_TYPES,
  WRITING_TASK_TYPES,
} from "./formatCapabilities";
export {
  pickScenarioExampleForPrompt,
  scenarioExamplesForPrompt,
  SCENARIO_EXAMPLES_NOTE,
} from "../academic/academicFrameworkContext";
export type { SpeakingContext } from "./speakingContentEngine";
export {
  SPEAKING_DISCOURSE_TYPE,
  SPEAKING_RESPONSE_LENGTH,
  speakingFrameworkCoachNote,
  speakingCanDoCoachNote,
  buildSpeakingContext,
} from "./speakingContentEngine";
export type { WritingContext } from "./writingContentEngine";
export {
  WRITING_TASK_TYPE,
  nextWritingAcademicSubject,
  nextWritingKeyUseForSubject,
  lastWritingKeyUseForSubject,
  expressiveKeyUsesForWritingSubject,
  buildWritingContext,
} from "./writingContentEngine";
export {
  interpretiveKeyUsesForSubject,
  expressiveKeyUsesForSubject,
  nextFrameworkAcademicSubject,
  nextFrameworkKeyUseForSubject,
  lastFrameworkKeyUseForSubject,
} from "./frameworkRotation";
export type {
  WritingAcademicSubject,
  WritingLibraryCandidate,
  WritingLibraryMatchTier,
} from "./writingLibraryCandidates";
export {
  buildLibrarySearchTopic,
  retrieveWritingLibraryCandidates,
  retrieveWritingLibraryCandidatesForSession,
  retrieveListeningLibraryCandidatesForSession,
  resolveWritingLibrarySelection,
  resolveWritingLibrarySelectionWithPolicy,
  pickBestLibraryCandidateForCurriculum,
  prepareLibraryComposeSession,
  detectLibraryContentMismatch,
  serializeWritingLibraryCandidatesForPrompt,
  incrementLibraryUseCount,
  sessionUsesLibraryPhotos,
  findListeningTapCandidate,
  libraryCandidateToSessionAnchor,
  dinoDetectionCount,
} from "./writingLibraryCandidates";
export { resolveLibraryImageDisplayUrl } from "./libraryImageUrl";
