/**
 * Academic Image Tap content generator — WIDA levels 1–2.
 *
 * Produces a short ACADEMIC passage grounded in real objects visible in a
 * library photo, followed by image-tap comprehension questions.
 *
 * KEY DIFFERENCE from general image-library.ts:
 *   - Passage teaches an ACADEMIC CONCEPT (not just a scene description)
 *   - Subject guidelines frame the concept (math/science/social_studies/ela)
 *   - canDo + key use drive passage style AND question format (Recount/Explain/Argue)
 *   - DINO tags are the ONLY valid question targets (verbatim)
 *   - image_description provides the academic concept story for the passage only
 */

import { callClaude, toDisplayText } from "./client";
import { logger } from "../../config/logger";
import type { ImagePassageContent } from "./image-library";

// ── Subject guidelines (academic framing per subject) ─────────────────────────

const SUBJECT_GUIDELINES: Record<string, string> = {
  math: `━━ SUBJECT: Mathematics ━━
PASSAGE FORMAT — Teacher reading a math scenario through real objects in the image
• Use visible objects (coins, rulers, food items, containers, trays, etc.) as the concrete math anchor
• Describe a simple real-world situation involving quantities, measurement, comparison, or counting
• Define any math term inline: "The total, which is everything added together, is…"
• Do NOT ask the student to compute — describe the situation only
• Key use framing:
  Recount → name WHICH math-relevant objects are present and their quantities
  Explain → state the MATHEMATICAL PURPOSE of each object ("People measure length with a ruler")
  Argue   → make a claim about a mathematical property or quantity ("A scale measures weight")`,

  science: `━━ SUBJECT: Science ━━
PASSAGE FORMAT — Teacher connecting visible objects to a science concept
• Use the image's objects as anchors for the concept (plant → photosynthesis, rock → erosion, etc.)
• Explain the academic concept the objects illustrate; define Tier-3 terms inline
• Do NOT require prior science knowledge — the passage teaches the idea
• Key use framing:
  Recount → name WHICH science objects or organisms are present in the setting
  Explain → state the SCIENTIFIC FUNCTION or process each object represents
  Argue   → make a testable scientific claim about what is shown in the image`,

  social_studies: `━━ SUBJECT: Social Studies ━━
PASSAGE FORMAT — Teacher narrating the cultural, geographic, or civic context shown
• Connect visible objects to community, culture, geography, civics, or economics concepts
• Define academic vocabulary inline: "A community, which is a group of people who live and work together…"
• Do NOT require prior knowledge — passage teaches the concept
• Key use framing:
  Recount → name WHICH community objects or places are present
  Explain → state the CIVIC or CULTURAL PURPOSE of each visible object
  Argue   → make a claim about a community value or social concept`,

  ela: `━━ SUBJECT: English Language Arts ━━
PASSAGE FORMAT — Teacher introducing literacy tools or storytelling elements shown
• Connect visible objects (books, pencils, paper, etc.) to ELA concepts: reading, writing, genre, text structure
• Define literary terms inline: "A narrative, which is a story that describes events…"
• Do NOT require prior knowledge — passage teaches the concept
• Key use framing:
  Recount → name WHICH literacy objects are present ("There are books and pencils in the room")
  Explain → state the LITERARY PURPOSE of each object ("People read books to learn new ideas")
  Argue   → make a claim about literacy or communication ("Reading every day builds vocabulary")`,
};

// ── System prompt (built per-subject so guidelines are concrete) ───────────────

function buildSystemPrompt(subject: string): string {
  const subjectGuidelines = SUBJECT_GUIDELINES[subject] ?? SUBJECT_GUIDELINES.science;

  return `You are a WIDA academic listening content generator for Grade 6–8 ELL students (WIDA levels 1–2). Generate a short academic audio passage and image-tap comprehension questions grounded in a real photograph.

WIDA SCALE: 1.0–2.0 range. complexity_instruction governs vocabulary ceiling and sentence length — follow it exactly.
OUTPUT RULE: Return ONLY valid JSON. No preamble, no markdown, no code fences.

━━ WHAT THE STUDENT DOES ━━
The student LISTENS to a short academic passage, then taps objects in the photograph that match the question.
Levels 1–2 require strong visual support — every question target must be physically visible and DINO-confirmed.

━━ INPUT FIELDS ━━
can_do                  → key_use (Recount|Explain|Argue), action (WIDA framing), items (sub-skill bullets at this level)
integer_level           → 1 or 2
current_score           → fractional score, e.g. 1.4
step_within_level       → 0–4 intra-level difficulty
complexity_instruction  → vocabulary ceiling and scaffolding — follow exactly
oral_format             → WIDA-specified passage length and register for this level — follow exactly
passage_sentence_target → HARD LIMIT on audio_script length — do not exceed
topic                   → subject label — echo back unchanged
last_session_score      → prior session score (0–100 or null)
question_count          → always 2
image_description       → FOR PASSAGE ONLY — the academic concept this image illustrates. Never use it to write question targets. It may mention actions, people, or relationships — ignore those when writing questions.
image_tags              → FOR QUESTIONS ONLY — the exact DINO-detected object labels visible in the photo. Every target_label and every option must be one of these strings, copied verbatim. Never use anything from image_description as a question target.
image_concept           → (optional) Specific concept the image depicts, e.g. "Chromosomes", "Westward Expansion". When present, this OVERRIDES any concept you might infer. Ground the entire passage in this exact concept — name it in the first sentence and keep all content anchored to it.
avoid_targets           → (optional) Array of target_label strings used in RECENT sessions for this same image. Do NOT pick any of these as a question target. Pick different objects from image_tags instead.
variation_seed          → Random integer. Use it to vary which objects you pick as targets, which can_do item you focus on, and the wording of your passage. Never produce the same output twice for the same image.

${subjectGuidelines}

━━ BUILD ORDER ━━

STEP 1 — SKILL TARGET
Pick the item from can_do.items that best fits the image topic and subject.
Write action + chosen item as can_do_descriptor (echoed in output).

STEP 2 — PICK QUESTION TARGETS (do this BEFORE writing the passage)
  Step 2a — open image_tags. Choose 2 entries as tap targets. These exact strings become the answers.
  Step 2b — pick the question FORMAT based on can_do.key_use (see routing below).
  ⚠ Do NOT look at image_description when choosing targets or writing question text.

━━ KEY USE ROUTING ━━

── Recount ──
Format: image_object_tap
Passage style: describe WHICH academic objects are present in the setting (existence, not function).
  Frame it through the subject (e.g. math: quantities; science: organisms; SS: community items; ELA: literacy tools).
Question text: EXACTLY "Find the [exact image_tags string] in the picture."
options: 4 strings from image_tags (wrong = other real detected objects)
target_label = options[correct] = the exact image_tags string

── Explain ──
Format: image_object_tap
Passage style: explain the ACADEMIC PURPOSE or FUNCTION of each target object.
  The passage must STATE the function before asking about it.
  Examples (math): "People measure length with a ruler." → Q: "What do people measure length with?"
  Examples (science): "Plants use sunlight to make food." → Q: "What do plants use to make food?"
  Examples (SS): "People use flags to represent their country." → Q: "What do people use to represent their country?"
  Examples (ELA): "Students write stories with pencils." → Q: "What do students use to write stories?"
Question text: ask about the FUNCTION, not the name.
  Pattern: "What do people [verb] [on/with/in]?" or "What do students use to [verb]?"
options: 4 strings from image_tags
target_label = options[correct] = the exact image_tags string
⚠ The function verb/phrase in the question MUST appear word-for-word in the passage first.
⚠ NEVER use "Find the…" for Explain questions.

── Argue ──
Format: image_yes_no
Generate 2 agree/disagree academic claim statements:
  Q1: pick a real object from image_tags → claim says it IS in the picture → correct_answer = "agree"
  Q2: pick a PLAUSIBLE but ABSENT object (not in image_tags, common in this academic setting) → claim says it IS in the picture → correct_answer = "disagree"
Question text pattern: "There is a [object] in the picture."
No options array needed. No target_label needed.
CRITICAL: The passage MUST name BOTH the Q1 object AND the Q2 (absent) object.
  Introduce the absent object naturally: e.g. "Some science labs have microscopes, but today we are looking at a plant and a container of soil."

━━ PASSAGE RULES ━━
A. For Recount: EVERY target object MUST appear by its exact name before being asked about.
   For Explain: EVERY target object MUST be named AND its function stated in the passage.
   For Argue: BOTH the real object (Q1) AND the absent object (Q2) must be named.
B. Do NOT use "In this picture…", "I see…", "The photo shows…", or "As you can see…"
C. Write in general present-simple style (what people typically do in this academic setting — not a photo narration).
D. Stay within oral_format and passage_sentence_target. Add one sentence only if needed to name all targets.
E. NEVER invent specific person–object interactions. image_tags confirm an object EXISTS — not who holds it.
   WRONG: "A girl holds a ruler." → RIGHT: "Students use rulers to measure length."
F. NEVER quote text from signs, posters, or whiteboards visible in the image.
G. Define any opaque academic vocabulary inline within the sentence it appears.

━━ SCAFFOLDING ━━
• last_session_score null or ≥70 → mention each target object once naturally
• last_session_score <70 → mention each target object at least twice, near the start of its sentence, simplest vocabulary

━━ OUTPUT SCHEMAS ━━

For Recount and Explain (image_object_tap):
{
  "can_do_descriptor": "<action + chosen can_do item>",
  "audio_script": "<short academic passage — plain spoken English>",
  "topic": "<echo input topic>",
  "context": "<one sentence: who speaks and setting — e.g. 'Teacher introducing math tools to the class'>",
  "questions": [
    {
      "id": "1",
      "type": "image_object_tap",
      "question": "<Recount: 'Find the [exact tag] in the picture.' | Explain: function-framed question>",
      "options": ["tag1", "tag2", "tag3", "tag4"],
      "target_label": "<exact image_tags string>",
      "correct": 0,
      "explanation": "<max 8 words>"
    }
  ]
}

For Argue (image_yes_no):
{
  "can_do_descriptor": "<action + chosen can_do item>",
  "audio_script": "<short academic passage naming BOTH Q1 object and Q2 absent object>",
  "topic": "<echo input topic>",
  "context": "<one sentence: who speaks and setting>",
  "questions": [
    {
      "id": "1",
      "type": "image_yes_no",
      "question": "There is a [real image_tags object] in the picture.",
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
}`.trim();
}

// ── Passage-length targets (matches WIDA oral format for levels 1–2) ──────────

const PASSAGE_SENTENCE_TARGETS: Record<number, string> = {
  1: "3–4 short sentences (~30–55 words). Subject-verb-object structure only. No subordinate clauses. High-frequency vocabulary plus any academic term defined inline.",
  2: "3–4 sentences (~40–65 words). Simple sentences, one idea each. Familiar vocabulary with academic terms defined inline.",
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
  const passageSentenceTarget =
    params.canDo.keyUse === "Explain"
      ? `${base} Each target object must be named by its exact label AND its academic function must be stated (e.g. "People measure length with a ruler."). The question will ask about that function.`
      : params.canDo.keyUse === "Argue"
      ? `${base} The passage MUST name BOTH the agreed object (Q1) AND the absent object (Q2 — plausible but not in image_tags).`
      : base;

  const prompt = JSON.stringify({
    integer_level:          params.level,
    current_score:          params.fractionalLevel,
    step_within_level:      params.stepWithinLevel,
    complexity_instruction: params.complexityInstruction,
    oral_format:            params.oralFormat,
    passage_sentence_target: passageSentenceTarget,
    can_do: {
      key_use: params.canDo.keyUse,
      action:  params.canDo.action,
      items:   params.canDo.items,
    },
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

  const systemPrompt = buildSystemPrompt(params.academicSubject);

  try {
    const result = (await callClaude(systemPrompt, prompt, 2000)) as Record<string, unknown>;
    const questions = (result.questions as Array<Record<string, unknown>>) ?? [];
    const rawPassage = result.audio_script ?? result.passage;
    const passage = toDisplayText(rawPassage);

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

    return {
      passage,
      questions: questions.map((q, i): import("./image-library").ImagePassageQuestion => {
        // Argue format → image_yes_no
        if (q.type === "image_yes_no") {
          const correctAnswer =
            (q.correct_answer as string) === "disagree" ? "disagree" : "agree";
          return {
            id:           String(q.id ?? i + 1),
            type:         "image_yes_no",
            question:     toDisplayText(q.question),
            correctAnswer,
            targetLabel:  toDisplayText(q.target_label ?? ""),
            explanation:  toDisplayText(q.explanation ?? ""),
          };
        }

        // Recount / Explain → image_object_tap
        const correct     = typeof q.correct === "number" ? q.correct : 0;
        const options     = Array.isArray(q.options) ? (q.options as string[]) : params.imageTags.slice(0, 4);
        const targetLabel = toDisplayText(q.target_label ?? options[correct] ?? params.imageTags[i] ?? "");
        return {
          id:          String(q.id ?? i + 1),
          type:        "image_object_tap" as const,
          question:    toDisplayText(q.question),
          targetLabel,
          options,
          correct,
          explanation: toDisplayText(q.explanation ?? ""),
        };
      }),
    };
  } catch (err) {
    logger.error(
      { err, subject: params.academicSubject, keyUse: params.canDo.keyUse },
      "generateAcademicImageTapContent failed, using fallback",
    );

    // Fallback: basic Recount using first two DINO tags
    const [t0 = "object", t1 = "item", t2 = "thing", t3 = "element"] = params.imageTags;
    return {
      passage: `In ${params.subjectLabel}, we work with objects like a ${t0} and a ${t1}. These objects help us learn important ideas.`,
      questions: [
        {
          id:          "1",
          type:        "image_object_tap",
          question:    `Find the ${t0} in the picture.`,
          targetLabel: t0,
          options:     [t0, t1, t2, t3],
          correct:     0,
          explanation: `The ${t0} is visible in the image.`,
        },
        {
          id:          "2",
          type:        "image_object_tap",
          question:    `Find the ${t1} in the picture.`,
          targetLabel: t1,
          options:     [t1, t0, t2, t3],
          correct:     0,
          explanation: `The ${t1} is also in the image.`,
        },
      ],
    };
  }
}
