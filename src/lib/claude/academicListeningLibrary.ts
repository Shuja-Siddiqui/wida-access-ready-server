/**
 * Shared library-compose helpers for academic listening L1–2.
 * Ensures the heard audio_script matches the selected library photo.
 */

import { logger } from "../../config/logger";
import { buildLibraryComposeUserFields } from "./prompts/academic-image-anchor";
import { buildLevel1PassageFromLibraryMeta } from "./prompts/content/writing-image-passage";
import {
  academicPromptFieldsFromContext,
  type AcademicFrameworkFields,
} from "../academic/academicFrameworkContext";
import {
  detectLibraryContentMismatch,
  prepareLibraryComposeSession,
  resolveWritingLibrarySelectionWithPolicy,
  type LibraryComposeCurriculum,
  type LibraryComposePrepared,
  type WritingLibraryCandidate,
} from "../content/writingLibraryCandidates";

export function buildAcademicListeningLibraryCurriculum(params: {
  unit: string;
  topic: string;
  tier3Vocabulary: string[];
  scenarioExamples: string[];
}): LibraryComposeCurriculum {
  return {
    unit:             params.unit,
    topicLabel:       params.topic,
    tier3Vocabulary:  params.tier3Vocabulary,
    scenarioExamples: params.scenarioExamples,
  };
}

export function buildAcademicListeningLibraryPromptFields(params: {
  libraryCandidates: WritingLibraryCandidate[];
  level: number;
  keyUse: string;
  academicSubject: "math" | "science" | "social_studies" | "ela";
  domainNote: string;
  curriculum: LibraryComposeCurriculum;
  passageSentenceTarget: string;
  frameworkContext?: Partial<AcademicFrameworkFields>;
  unitField: { unit: string; scenarioExamples: string[]; tier3Vocabulary: string[] };
}): {
  prepared: LibraryComposePrepared;
  fields: Record<string, unknown>;
} {
  const prepared = prepareLibraryComposeSession(params.libraryCandidates, params.curriculum);
  const hasCompose = prepared.candidates.length > 0;

  const composeFields = hasCompose
    ? buildLibraryComposeUserFields({
        candidates:      prepared.candidates,
        level:           params.level,
        keyUse:          params.keyUse,
        academicSubject: params.academicSubject,
        domainNote:      params.domainNote,
        curriculumTopic: params.curriculum.topicLabel,
        academicUnit:    params.curriculum.unit,
        composeMode:     prepared.mode,
        lockedImageId:   prepared.lockedImageId,
      })
    : {
        has_library_image:       false,
        passage_sentence_target: params.passageSentenceTarget,
      };

  const academicFields = hasCompose && prepared.suppressCurriculumScenarios
    ? academicPromptFieldsFromContext({
        unit:            params.unitField.unit,
        tier3Vocabulary: params.unitField.tier3Vocabulary,
        ...params.frameworkContext,
      })
    : academicPromptFieldsFromContext({
        unit:             params.unitField.unit,
        scenarioExamples: params.unitField.scenarioExamples,
        tier3Vocabulary:  params.unitField.tier3Vocabulary,
        ...params.frameworkContext,
      });

  return {
    prepared,
    fields: { ...composeFields, ...academicFields },
  };
}

/** Server fallback audio when Claude writes about the wrong topic. */
export function buildListeningAudioFromLibraryMeta(
  candidate: WritingLibraryCandidate,
  keyUse: string,
): string {
  const concept = candidate.imageConcept?.trim()
    || candidate.description?.trim()
    || candidate.tags.slice(0, 3).join(", ")
    || "this topic";
  const base = buildLevel1PassageFromLibraryMeta({
    tags:         candidate.tags,
    description:  candidate.description,
    imageConcept: candidate.imageConcept,
  });

  switch (keyUse) {
    case "Argue":
      return (
        `A teacher presents two ideas about ${concept.replace(/\.$/, "")}. ` +
        `First idea: ${base} Second idea: daily life in this setting depended on trade and shared work. ` +
        `Which idea has stronger evidence from how people lived?`
      );
    case "Explain":
      return (
        `A teacher explains to students: ${base} ` +
        `This shows how ${concept.replace(/\.$/, "")} worked in daily life.`
      );
    case "Inform":
      return (
        `Listen carefully. ${base} ` +
        `These are important facts about ${concept.replace(/\.$/, "")}.`
      );
    default:
      return `A teacher tells the class a short story. ${base}`;
  }
}

export function finalizeAcademicListeningLibraryResult(params: {
  rawSelectedId: string | null;
  audioScript: string;
  prepared: LibraryComposePrepared;
  allCandidates: WritingLibraryCandidate[];
  curriculum: LibraryComposeCurriculum;
  level: number;
  keyUse: string;
  logLabel: string;
}): {
  selectedLibraryImageId: string | null;
  audioScript: string;
} {
  const pool = params.prepared.candidates.length > 0
    ? params.prepared.candidates
    : params.allCandidates;

  const selectedCandidate = pool.length > 0
    ? resolveWritingLibrarySelectionWithPolicy(
        params.rawSelectedId ?? params.prepared.lockedImageId,
        pool,
        params.level,
        params.curriculum,
      )
    : null;

  let audioScript = params.audioScript;
  let selectedLibraryImageId = selectedCandidate?.id ?? null;

  if (selectedCandidate && detectLibraryContentMismatch(selectedCandidate, audioScript, params.curriculum)) {
    logger.warn(
      {
        imageId:        selectedCandidate.id,
        concept:        selectedCandidate.imageConcept,
        curriculumUnit: params.curriculum.unit,
        audioPreview:   audioScript.slice(0, 120),
        generator:      params.logLabel,
        composeMode:    params.prepared.mode,
      },
      "Listening audio may misalign with library photo — keeping AI audio_script unchanged",
    );
  }

  return { selectedLibraryImageId, audioScript };
}
