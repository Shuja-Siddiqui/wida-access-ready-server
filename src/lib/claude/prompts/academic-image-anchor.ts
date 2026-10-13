import {
  buildWritingPassageSentenceTarget,
  LIBRARY_IMAGE_SCENE_NOTE,
} from "./content/writing-image-passage";
import {
  serializeWritingLibraryCandidatesForPrompt,
  sessionUsesLibraryPhotos,
  type WritingAcademicSubject,
  type WritingLibraryCandidate,
} from "../../content/writingLibraryCandidates";

/** Slim compose policy — core photo rules are in the system prompt. */
export const LIBRARY_COMPOSE_CONTENT_POLICY =
  "Pick selected_image_id FIRST; audio_script/passage must match THAT photo's tags/concept. In image_led mode, the photo is the sole topic source.";

/** Subject-specific anchoring examples — injected only when has_library_image is true. */
export const ACADEMIC_IMAGE_ANCHOR_EXAMPLES = `━━ IMAGE ANCHOR EXAMPLES (by academic_subject) ━━
  math:           countable objects → word-problem setting
  science:        natural objects → phenomenon narration
  social_studies: built environment / cultural objects → historical anchor
  ela:            scene as story setting or informational/argument topic`.trim();

/** @deprecated Use ACADEMIC_IMAGE_ANCHOR_EXAMPLES — kept for imports that expect the old name. */
export const ACADEMIC_IMAGE_ANCHOR_BLOCK = ACADEMIC_IMAGE_ANCHOR_EXAMPLES;

export function buildImageAnchorPromptFields(params: {
  imageDescription: string;
  imageTags: string[];
  academicSubject: string;
}): Record<string, unknown> {
  return {
    image_description: params.imageDescription,
    image_tags:        params.imageTags,
    academic_subject:  params.academicSubject,
  };
}

export function buildLibraryComposeUserFields(params: {
  candidates: WritingLibraryCandidate[];
  level: number;
  keyUse: string;
  academicSubject: WritingAcademicSubject;
  domainNote: string;
  curriculumTopic?: string;
  academicUnit?: string;
  composeMode?: "curriculum_matched" | "image_led";
  lockedImageId?: string | null;
}): Record<string, unknown> {
  if (params.candidates.length === 0) {
    return { has_library_image: false };
  }
  const imageLed = params.composeMode === "image_led";
  return {
    has_library_image:       true,
    compose_mode:            params.composeMode ?? "curriculum_matched",
    library_candidates:      serializeWritingLibraryCandidatesForPrompt(params.candidates),
    library_image_required:  sessionUsesLibraryPhotos(params.level),
    ...(imageLed ? { compose_mode_note: "IMAGE-LED: photo tags/concept are the ONLY topic." } : {}),
    ...(params.lockedImageId ? { locked_selected_image_id: params.lockedImageId } : {}),
    passage_sentence_target: buildWritingPassageSentenceTarget(params.level, params.keyUse),
    library_image_note:      params.domainNote,
    curriculum_topic:        imageLed ? null : (params.curriculumTopic ?? null),
    academic_unit:           imageLed ? null : (params.academicUnit ?? null),
  };
}

export function buildLibraryImageSceneUserFields(params: {
  level: number;
  keyUse: string;
  hasLibraryImage: boolean;
  imageDescription?: string;
  imageTags?: string[];
  imageConcept?: string | null;
  academicSubject?: string;
  libraryImageNote?: string;
}): Record<string, unknown> {
  if (!params.hasLibraryImage) {
    return { has_library_image: false };
  }

  const tags = params.imageTags ?? [];
  const description = params.imageDescription
    ?? (tags.length ? tags.join(", ") : "school scene");

  return {
    has_library_image:       true,
    library_image_note:      params.libraryImageNote || LIBRARY_IMAGE_SCENE_NOTE,
    passage_sentence_target: buildWritingPassageSentenceTarget(params.level, params.keyUse),
    image_concept:           params.imageConcept ?? null,
    ...(params.academicSubject && tags.length
      ? buildImageAnchorPromptFields({
          imageDescription: description,
          imageTags: tags.length ? tags : ["scene"],
          academicSubject: params.academicSubject,
        })
      : {
          image_description: description,
          image_tags:        tags.length ? tags : ["scene"],
        }),
  };
}
