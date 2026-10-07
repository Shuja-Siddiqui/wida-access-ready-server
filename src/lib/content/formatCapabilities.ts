/** Re-export canonical session content schema (shared with frontend). */
export {
  listeningAvailableFormats,
  listeningL12AvailableFormats,
  readingAvailableFormats,
  speakingAvailablePromptTypes,
  formatsForDomain,
  resolveQuestionUi,
  isAllowedQuestionType,
  getAiFormatGuide,
  aiFormatDescriptionsFor,
  validateQuestionShape,
  QUESTION_TYPE_REGISTRY,
  SPEAKING_PROMPT_TYPES,
  WRITING_TASK_TYPES,
  SESSION_DOMAINS,
} from "../../../../shared/session-content-schema.js";

export type {
  SessionDomain,
  SessionUiComponent,
  AiFormatGuide,
  QuestionTypeDefinition,
} from "../../../../shared/session-content-schema.js";
