/**
 * Image-library listening content generator — WIDA levels 0-2.
 * Takes a real library photo + DINO-confirmed object tags and produces:
 *   - A short spoken passage describing the scene
 *   - 2 object-tap comprehension questions
 */

import { callClaude, BASE_PROMPT, toDisplayText } from "./client";
import { logger } from "../../config/logger";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a WIDA image-based listening content generator for Grade 6–8 ELL students (levels 1–2). Generate a short audio passage and comprehension questions based on a real photograph.

${BASE_PROMPT}

INPUT FIELDS
can_do                 → key_use (Recount|Explain|Argue), action (WIDA framing), items (sub-skills at this level)
integer_level          → 1 (Entering) or 2 (Emerging)
current_score          → fractional score, e.g. 1.4
step_within_level      → 0–4 intra-level difficulty
complexity_instruction   → vocabulary ceiling and scaffolding — follow exactly
passage_sentence_target → HARD LIMIT on audio_script length — targets take priority; add one sentence if needed
level_label            → plain English label for this level (context only)
topic                  → image setting/category — echo back unchanged
last_session_score     → prior session score (0–100 or null)
question_count         → always 2
image_description      → FOR PASSAGE ONLY — gives scene context so the passage sounds natural. Never use it to write question text. It may mention actions or relationships (e.g. "a girl looks out the window") — ignore those entirely when writing questions.
image_tags             → FOR QUESTIONS ONLY — the exact object labels DINO confirmed are visible. Every question target must be one of these strings, copied verbatim. Do not use any word from image_description as a question target.

BUILD ORDER

1. SKILL TARGET
Pick the item from can_do.items that best fits the image topic. Write action+item as can_do_descriptor.

2. PICK QUESTION TARGETS AND FORMAT (do this before writing the passage):
   Step 2a — open image_tags and choose 2 entries as targets. These exact strings become the answers.
   Step 2b — pick the format for can_do.key_use (see below).
   ⚠ Do NOT look at image_description when choosing targets or writing question text.

━━ Recount ━━
  Format: image_object_tap
  Pick 2 objects from image_tags as targets.
  Passage style: describe WHAT objects are present in the setting (existence, not function).
  Question text: "Find the [exact image_tags string] in the picture."
  options: 4 strings from image_tags (wrong options are other real objects in the photo)
  target_label = options[correct] = the exact image_tags string

━━ Explain ━━
  Format: image_object_tap
  Pick 2 objects from image_tags as targets.
  Passage style: explain the PURPOSE or FUNCTION of each target object
    (e.g., "People sit on chairs." / "Students use pencils to write.")
    The passage must teach what each object is FOR before the question is asked.
  Question text: ask about FUNCTION, not name.
    Pattern: "What do people [verb] [on/with/in]?" or "What do students use to [verb]?"
    Examples:
      target = "chair"   → passage says "People sit on chairs."  → question: "What do people sit on?"
      target = "pencil"  → passage says "Students write with pencils." → question: "What do students write with?"
      target = "plate"   → passage says "People put food on a plate." → question: "What do people put food on?"
  options: 4 strings from image_tags (wrong options are other real objects in the photo)
  target_label = options[correct] = the exact image_tags string
  ⚠ The question must be answerable ONLY from the passage — the function verb/phrase in the
    question must appear word-for-word in the passage first.

QUESTION TEXT RULES:
  Recount: question must be EXACTLY "Find the [exact image_tags string] in the picture."
    NEVER add actions, poses, gestures, or qualifying descriptions.
      ✗ WRONG: "Find the person who sits and looks at the leaves."
      ✗ WRONG: "Find the boy who is smiling."
      ✓ RIGHT:  "Find the boy in the picture."
      ✓ RIGHT:  "Find the banana in the picture."
  Explain: question must ask about a function established in the passage.
    NEVER use "Find the…" for Explain questions.
    NEVER ask about a function that was not explicitly stated in the passage.
  The image_description field provides scene context for writing the PASSAGE only.
  Never copy its action verbs, poses, or descriptions into question text.

━━ Argue ━━
  Format: image_yes_no
  Generate 2 agree/disagree statements about the image:
    - Question 1: pick a real object from image_tags → statement says it IS in the picture → correct_answer = "agree"
    - Question 2: pick a PLAUSIBLE but ABSENT object (not in image_tags, common in this setting) → statement says it IS in the picture → correct_answer = "disagree"
  Question text pattern: "There is a [object] in the picture."
  No options array needed. No target_label needed.
  CRITICAL PASSAGE RULE FOR ARGUE: The passage MUST name BOTH the Q1 object AND the Q2 (absent) object.
    - Introduce the absent object naturally: e.g. "Some children like to ride skateboards, but today they are playing with a basketball."
    - If the student has not heard a word in the passage, they cannot agree or disagree about it — every question word must appear in audio_script first.

3. PASSAGE
Write audio_script in general present-simple style (what people typically do in this setting — not a photo description).

MANDATORY PASSAGE RULES (priority order):
  A. For Recount: EVERY target object MUST appear by its exact name in the passage before being asked about.
     For Explain: EVERY target object MUST appear by its exact name AND its function/purpose must be stated in the passage.
       The question asks about that function — so the function phrase in the question must come from the passage.
     For Argue: both the real object (Q1) AND the absent object (Q2) must be named in the passage.
  B. Do NOT use "In this picture…", "I see…", or "The photo shows…"
  C. Stay within passage_sentence_target. Add one sentence if needed to name all targets.
  D. NEVER invent specific person–object interactions. image_tags only confirm an object EXISTS in the scene — they say nothing about who holds it, uses it, or where it is. Mention objects by their presence in the setting, not by fabricated actions.
     WRONG: "A girl holds a banana." (invents who holds it)
     RIGHT: "Students have bananas and sandwiches on their lunch trays."
  E. NEVER read or quote text from signs, murals, posters, or whiteboards visible in the image. Reference the object only — not what it says.
     WRONG: "A sign says 'Be kind.'" (quotes text from the image)
     RIGHT: "There is a colorful mural on the wall."

4. SCAFFOLDING
- last_session_score null or ≥70 → mention each target object once naturally
- last_session_score <70 → mention each target object at least twice, near the start of its sentence, simplest vocabulary

RULES
- explanation: max 8 words.

OUTPUT — use the correct schema for each format:

For Recount (image_object_tap — name the object):
{
  "can_do_descriptor": "<action + chosen item>",
  "audio_script": "<general present-simple describing what objects are present>",
  "topic": "<echo input topic>",
  "context": "<one sentence: who speaks and to whom>",
  "questions": [
    {
      "id": "1",
      "type": "image_object_tap",
      "question": "Find the [exact image_tags string] in the picture.",
      "options": ["tag1", "tag2", "tag3", "tag4"],
      "target_label": "<exact image_tags string>",
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}

For Explain (image_object_tap — function-framed question):
{
  "can_do_descriptor": "<action + chosen item>",
  "audio_script": "<general present-simple explaining what each target object is USED FOR>",
  "topic": "<echo input topic>",
  "context": "<one sentence: who speaks and to whom>",
  "questions": [
    {
      "id": "1",
      "type": "image_object_tap",
      "question": "What do people [verb from passage] [on/with/in]?",
      "options": ["tag1", "tag2", "tag3", "tag4"],
      "target_label": "<exact image_tags string>",
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}

For Argue (image_yes_no questions):
{
  "can_do_descriptor": "<action + chosen item>",
  "audio_script": "<general present-simple>",
  "topic": "<echo input topic>",
  "context": "<one sentence: who speaks and to whom>",
  "questions": [
    {
      "id": "1",
      "type": "image_yes_no",
      "question": "There is a [real object from image_tags] in the picture.",
      "correct_answer": "agree",
      "target_label": "<exact image_tags string>",
      "explanation": "<max 8 words>"
    },
    {
      "id": "2",
      "type": "image_yes_no",
      "question": "There is a [plausible absent object] in the picture.",
      "correct_answer": "disagree",
      "target_label": "<the absent object name>",
      "explanation": "<max 8 words>"
    }
  ]
}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImagePassageQuestion =
  | {
      id: string;
      type: "image_object_tap";
      question: string;
      targetLabel: string;
      options: string[];
      correct: number;
      explanation: string;
    }
  | {
      id: string;
      type: "image_explain_mc";
      question: string;
      options: string[];
      correct: number;
      targetLabel: string;
      explanation: string;
    }
  | {
      id: string;
      type: "image_yes_no";
      question: string;
      correctAnswer: "agree" | "disagree";
      targetLabel: string;
      explanation: string;
    };

export interface ImagePassageContent {
  passage: string;
  questions: ImagePassageQuestion[];
}

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Generates a short image-based listening passage + object-tap questions
 * for library images used at levels 0–2.
 */
export async function generateImagePassageContent(params: {
  imageDescription: string;
  imageTags: string[];
  level: number;           // integer: 0, 1, or 2
  fractionalLevel: number; // e.g. 1.4
  stepWithinLevel: number; // 0 Entry → 4 Advanced
  complexityInstruction: string;
  canDo: { keyUse: string; action: string; items: string[] };
  topic: string;
  lastSessionScore?: number | null;
}): Promise<ImagePassageContent> {
  const {
    imageDescription,
    imageTags,
    level,
    fractionalLevel,
    stepWithinLevel,
    complexityInstruction,
    canDo,
    topic,
    lastSessionScore,
  } = params;

  const canDoDescriptor =
    level === 1
      ? "Level 1 (Entering): identify named objects in a simple scene using visual and oral support"
      : "Level 2 (Emerging): locate specific objects in a scene after hearing a short descriptive passage";

  const BASE_SENTENCE_TARGETS: Record<number, string> = {
    1: "3–4 short sentences (~30–55 words total). Subject-verb-object structure only. No subordinate clauses.",
    2: "3–4 sentences (~40–65 words total). Simple sentences, one idea each. Familiar everyday vocabulary.",
  };
  const base = BASE_SENTENCE_TARGETS[level] ?? BASE_SENTENCE_TARGETS[2];

  const passageSentenceTarget =
    canDo.keyUse === "Explain"
      ? `${base} Each target object must be named by its exact label AND its function must be stated (e.g. "People sit on chairs." / "Students write with pencils."). The question will ask about the FUNCTION — never repeat the object label in the question text.`
      : `${base} Every question target object must be named by its exact label in the passage.`;

  const prompt = JSON.stringify({
    integer_level: level,
    current_score: fractionalLevel,
    step_within_level: stepWithinLevel,
    level_label: canDoDescriptor,
    can_do: {
      key_use: canDo.keyUse,
      action: canDo.action,
      items: canDo.items,
    },
    complexity_instruction: complexityInstruction,
    passage_sentence_target: passageSentenceTarget,
    topic,
    last_session_score: lastSessionScore ?? null,
    question_count: 2,
    image_description: imageDescription,
    image_tags: imageTags,
  });

  try {
    const result = (await callClaude(SYSTEM_PROMPT, prompt, 2000)) as Record<string, unknown>;
    const questions = (result.questions as Array<Record<string, unknown>>) ?? [];

    const rawPassage = result.audio_script ?? result.passage;
    const passage = toDisplayText(rawPassage);

    logger.info(
      { passage: passage.slice(0, 120), questionCount: questions.length },
      "generateImagePassageContent: raw result",
    );

    if (!passage.trim()) {
      throw new Error("Claude returned an empty audio_script/passage — using fallback");
    }

    return {
      passage,
      questions: questions.map((q, i): ImagePassageQuestion => {
        if (q.type === "image_yes_no") {
          const correctAnswer =
            (q.correct_answer as string) === "disagree" ? "disagree" : "agree";
          return {
            id: String(q.id ?? i + 1),
            type: "image_yes_no",
            question: toDisplayText(q.question),
            correctAnswer,
            targetLabel: toDisplayText(q.target_label ?? ""),
            explanation: toDisplayText(q.explanation ?? ""),
          };
        }
        if (q.type === "image_explain_mc") {
          const correct = typeof q.correct === "number" ? q.correct : 0;
          const options = Array.isArray(q.options) ? (q.options as string[]) : imageTags.slice(0, 4);
          const targetLabel = toDisplayText(q.target_label ?? options[correct] ?? imageTags[i] ?? "");
          return {
            id: String(q.id ?? i + 1),
            type: "image_explain_mc",
            question: toDisplayText(q.question),
            options,
            correct,
            targetLabel,
            explanation: toDisplayText(q.explanation ?? ""),
          };
        }
        // Default: image_object_tap (Recount)
        const correct = typeof q.correct === "number" ? q.correct : 0;
        const options = Array.isArray(q.options) ? (q.options as string[]) : imageTags.slice(0, 4);
        const targetLabel = toDisplayText(q.target_label ?? options[correct] ?? imageTags[i] ?? "");
        return {
          id: String(q.id ?? i + 1),
          type: "image_object_tap",
          question: toDisplayText(q.question),
          targetLabel,
          options,
          correct,
          explanation: toDisplayText(q.explanation ?? ""),
        };
      }),
    };
  } catch (err) {
    logger.error({ err }, "generateImagePassageContent failed, using fallback");
    const [t0 = "object", t1 = "item", t2 = "thing", t3 = "element"] = imageTags;
    return {
      passage: `Look at the picture. There is a ${t0} and a ${t1} in the scene.`,
      questions: [
        {
          id: "1",
          type: "image_object_tap",
          question: `Find the ${t0} in the picture.`,
          targetLabel: t0,
          options: [t0, t1, t2, t3],
          correct: 0,
          explanation: `The ${t0} is in the image.`,
        },
        {
          id: "2",
          type: "image_object_tap",
          question: `Find the ${t1} in the picture.`,
          targetLabel: t1,
          options: [t1, t0, t2, t3],
          correct: 0,
          explanation: `The ${t1} is in the image.`,
        },
      ],
    };
  }
}
