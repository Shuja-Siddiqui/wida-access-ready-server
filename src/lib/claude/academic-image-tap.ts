/**
 * Academic Image Tap content generator — WIDA levels 1–2.
 *
 * Produces a short ACADEMIC passage grounded in real objects visible in a
 * library photo, followed by image-tap comprehension questions.
 *
 * KEY DIFFERENCE from general image-library.ts:
 *   - Passage teaches an ACADEMIC CONCEPT (not just a scene description)
 *   - Subject guidelines frame the concept (math/science/social_studies/ela)
 *   - canDo + key use drive passage style AND question format (Narrate/Inform/Explain/Argue)
 *   - DINO tags are the ONLY valid question targets (verbatim)
 *   - image_description provides the academic concept story for the passage only
 */

import { callClaude, toDisplayText, limitSentences } from "./client";
import { logger } from "../../config/logger";
import type { ImagePassageContent } from "./image-library";
import { resolvePictureListeningQuestion } from "./image-library";
import { buildSystemPrompt } from "./prompts/compose";
import { contentGenPrompt } from "./prompts/content";
import { clampToThreeOptions } from "../choice-options";
import { serializeCanDoForPrompt } from "../listeningContentEngine";
import { kluSubjectPairingLine } from "../academicSubjectContent";

// ── Subject guidelines (academic framing per subject) ─────────────────────────

const SUBJECT_GUIDELINES: Record<string, string> = {
  math: `━━ SUBJECT: Mathematics ━━
PASSAGE FORMAT — Teacher reading a math scenario through real objects in the image
• Use visible objects (coins, rulers, food items, containers, trays, etc.) as the concrete math anchor
• Describe a simple real-world situation involving quantities, measurement, comparison, or counting
• Define any math term inline: "The total, which is everything added together, is…"
• Do NOT ask the student to compute — describe the situation only
• Never put "Find the …" in the spoken passage. That is a question, not the story.
• Key use framing:
  Narrate → a short event using those objects (what happened)
  Inform → name WHICH math-relevant objects are present and their quantities
  Explain → state the MATHEMATICAL PURPOSE of each object. Question example: "What do people use to measure length?" → tap ruler. NEVER "Find the ruler."
  Argue   → make a claim about a mathematical property or quantity ("A scale measures weight")`,

  science: `━━ SUBJECT: Science ━━
PASSAGE FORMAT — Teacher connecting visible objects to a science concept
• Use the image's objects as anchors for the concept (plant → photosynthesis, rock → erosion, etc.)
• Do NOT require prior science knowledge — the passage teaches the idea
• Never put "Find the …" in the spoken passage.
• Key use framing:
  Narrate → a short observed event (what happened), then who/where tap — not "Find the leaf"
  Inform → ONLY name what is there. Do not explain how/why. Write an identify question (your wording) whose answer is an image_tag.
  Explain → PASSAGE states the function ("Leaves release oxygen."). QUESTION is a function Wh-question. The object name must NOT be in the question. Example: "What releases oxygen?" Student taps the leaf. NEVER "Find the leaf."
  Argue   → a testable scientific claim about what is shown in the image (agree/disagree)`,

  social_studies: `━━ SUBJECT: Social Studies ━━
PASSAGE FORMAT — Teacher narrating the cultural, geographic, or civic context shown
• Connect visible objects to community, culture, geography, civics, or economics concepts
• Define academic vocabulary inline: "A community, which is a group of people who live and work together…"
• Do NOT require prior knowledge — passage teaches the concept
• Key use framing:
  Narrate → a short community event shown in the picture
  Inform → name WHICH community objects or places are present
  Explain → state the CIVIC or CULTURAL PURPOSE. Question example: "What do people use to show their country?" NEVER "Find the flag."
  Argue   → make a claim about a community value or social concept`,

  ela: `━━ SUBJECT: English Language Arts ━━
PASSAGE FORMAT — Teacher introducing literacy tools or storytelling elements shown
• Connect visible objects (books, pencils, paper, etc.) to ELA concepts: reading, writing, genre, text structure
• Define literary terms inline: "A narrative, which is a story that describes events…"
• Do NOT require prior knowledge — passage teaches the concept
• Key use framing:
  Narrate → a short literacy event (“The student opened a book.”)
  Inform → name WHICH literacy objects are present ("There are books and pencils in the room")
  Explain → state the LITERARY PURPOSE. Question example: "What do people use to write?" NEVER "Find the pencil."
  Argue   → make a claim about literacy or communication ("Reading every day builds vocabulary")`,
};

// ── System prompt (kernel + listening 1-2 + this subject only)

function academicTapSystem(subject: string, keyUse?: string, subjectLabel?: string): string {
  const pairing = subjectLabel
    ? kluSubjectPairingLine(keyUse, subject as "math" | "science" | "social_studies" | "ela", subjectLabel)
    : "Frame Narrate/Inform/Explain/Argue through THIS subject.";
  return buildSystemPrompt(
    contentGenPrompt("listening", 1),
    SUBJECT_GUIDELINES[subject] ?? SUBJECT_GUIDELINES.science,
    `Academic extras: image_concept overrides inferred topic. avoid_targets = do not reuse as tap targets. variation_seed = vary objects and wording. ${pairing} Never put "Find the" in the spoken passage.`,
  );
}

// ── Passage-length targets (matches WIDA oral format for levels 1–2) ──────────

const PASSAGE_SENTENCE_TARGETS: Record<number, string> = {
  1: "1–3 very short sentences (~12–35 words). Subject-verb-object. No extra history or lists.",
  2: "1–3 short sentences (~18–45 words). One idea each. Do not write a paragraph.",
};

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateAcademicImageTapContent(params: {
  academicSubject:       "math" | "science" | "social_studies" | "ela";
  subjectLabel:          string;
  imageDescription:      string;
  imageTags:             string[];
  level:                 number;           // integer: 1 or 2
  fractionalLevel:       number;
  stepWithinLevel:       number;
  complexityInstruction: string;
  oralFormat:            string;           // WIDA oral format for this level
  canDo:                 { keyUse: string; action: string; items: string[] };
  topic:                 string;
  lastSessionScore?:     number | null;
  /** Explicit concept saved on the library image, e.g. "Chromosomes", "Westward Expansion". */
  imageConcept?:         string;
  /** Target labels used in recent sessions for this image — Claude must avoid repeating them. */
  avoidTargets?:         string[];
  /** Random seed to force variation in Claude's output. */
  variationSeed?:        number;
}): Promise<ImagePassageContent> {
  const base = PASSAGE_SENTENCE_TARGETS[params.level] ?? PASSAGE_SENTENCE_TARGETS[2];

  // For Explain key use, the passage must state functions — add that instruction to target
  const ku = params.canDo.keyUse;
  const passageSentenceTarget =
    params.level >= 2 && ku === "Narrate"
      ? `${base} Name 3 image_tags in time order (first, then, last). Q1 first tag; Q2 last tag.`
      : params.level >= 2 && ku === "Inform"
      ? `${base} Name 3 image_tags as a fact process in order. Q1 first; Q2 last.`
      : params.level >= 2 && ku === "Explain"
      ? `${base} Name 2 image_tags and compare or classify them, or state cause/effect. Question asks which object matches.`
      : params.level >= 2 && ku === "Argue"
      ? `${base} Use 2 real image_tags as evidence. Q1 true claim (agree). Q2 false claim (disagree).`
      : ku === "Explain"
      ? `${base} State the function in the passage. Write a function Wh-question that does NOT name the object. Student taps the matching image_tag. Invent new wording for this photo — do not copy instruction examples.`
      : ku === "Inform"
      ? `${base} Only name what is there. Do not explain how/why. Write identify questions in your own words; answers must be image_tags.`
      : ku === "Argue"
      ? `${base} The passage MUST name BOTH the agreed object (Q1) AND the absent object (Q2 — plausible but not in image_tags).`
      : base;

  const prompt = JSON.stringify({
    required_key_use:       ku,
    integer_level:          params.level,
    current_score:          params.fractionalLevel,
    step_within_level:      params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    oral_format:            params.oralFormat,
    passage_sentence_target: passageSentenceTarget,
    can_do: serializeCanDoForPrompt(params.canDo, { level: params.level, domain: "LISTENING" }),
    academic_subject:  params.academicSubject,
    subject_label:     params.subjectLabel,
    topic:             params.topic,
    last_session_score: params.lastSessionScore ?? null,
    question_count:    2,
    image_description: params.imageDescription,
    image_tags:        params.imageTags,
    // Explicit concept label saved by the admin — anchors the passage to the
    // correct concept, overriding any inference from image_description.
    ...(params.imageConcept  ? { image_concept:   params.imageConcept }  : {}),
    // Anti-repetition: targets used recently for this image — Claude must avoid these.
    ...(params.avoidTargets?.length ? { avoid_targets: params.avoidTargets } : {}),
    // Variation seed — forces different object/wording choices each call.
    variation_seed: params.variationSeed ?? Math.floor(Math.random() * 10000),
  });

  const systemPrompt = academicTapSystem(
    params.academicSubject,
    params.canDo.keyUse,
    params.subjectLabel,
  );

  try {
    const result = (await callClaude(systemPrompt, prompt, 2000)) as Record<string, unknown>;
    const questions = (result.questions as Array<Record<string, unknown>>) ?? [];
    const rawPassage = result.audio_script ?? result.passage;
    const passage = limitSentences(toDisplayText(rawPassage), 3);

    if (!passage.trim()) {
      throw new Error("Claude returned an empty audio_script — using fallback");
    }

    logger.info(
      {
        subject:       params.academicSubject,
        keyUse:        params.canDo.keyUse,
        questionCount: questions.length,
        passage:       passage.slice(0, 100),
      },
      "generateAcademicImageTapContent: generated",
    );

    const questionsOut = questions.map((q, i): import("./image-library").ImagePassageQuestion => {
      if (q.type === "image_yes_no") {
        const correctAnswer =
          (q.correct_answer as string) === "disagree" ? "disagree" : "agree";
        const targetLabel  = toDisplayText(q.target_label ?? "");
        return {
          id:           String(q.id ?? i + 1),
          type:         "image_yes_no",
          question:     resolvePictureListeningQuestion(q, "yes_no", targetLabel),
          correctAnswer,
          targetLabel,
          explanation:  toDisplayText(q.explanation ?? ""),
        };
      }

      const three = clampToThreeOptions(
        Array.isArray(q.options) ? q.options : params.imageTags.slice(0, 3),
        q.correct,
      );
      const targetLabel = toDisplayText(q.target_label ?? three.options[three.correct] ?? params.imageTags[i] ?? "");
      return {
        id:          String(q.id ?? i + 1),
        type:        "image_object_tap" as const,
        question:    resolvePictureListeningQuestion(q, "tap", targetLabel),
        targetLabel,
        options:     three.options,
        correct:     three.correct,
        explanation: toDisplayText(q.explanation ?? ""),
      };
    });
    if (questionsOut.some((q) => !q.question.trim())) {
      throw new Error("Claude omitted student-facing question text");
    }
    return {
      passage,
      questions: questionsOut,
    };
  } catch (err) {
    logger.error(
      { err, subject: params.academicSubject, keyUse: params.canDo.keyUse },
      "generateAcademicImageTapContent failed",
    );
    throw err;
  }
}
