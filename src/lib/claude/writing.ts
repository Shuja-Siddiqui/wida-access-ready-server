/**
 * Writing content generators:
 *   - generateWritingContent  — produces a writing prompt with sentence frame
 *   - getWritingFeedback      — scores a student's response and provides coaching
 *
 * Schema is built dynamically per call (level + taskType + wordBankRequired +
 * sentenceFrameRequired) so Claude always sees the exact field shapes and expected
 * structure for this session.
 */

import { callClaude, BASE_PROMPT, toDisplayText, toDisplayTextOrNull } from "./client";
import { LIBRARY_IMAGE_GROUNDS_CONTENT, OPTIONAL_LINE_VISUALS_BLOCK, parseVisual } from "./prompts/optional-line-visuals";
import type { CanDoEntry } from "../listeningContentEngine";

// ── Per-level schema tables ───────────────────────────────────────────────────

/**
 * Human-readable description of each task_type — embedded in the schema so
 * Claude understands the genre it must produce.
 */
const TASK_TYPE_DESCRIPTIONS: Record<string, string> = {
  word_phrase:              "labeled words and phrases; minimal sentence construction",
  sentence_completion:      "complete 2–4 sentences using the provided word bank",
  connected_sentences:      "2–3 short connected sentences with subject-area vocabulary",
  opinion_sentence:         "one opinion statement with evaluative language (e.g. 'I believe…')",
  paragraph:                "short paragraph: main idea + 2–3 supporting details",
  comparison_paragraph:     "compare/contrast paragraph with at least two perspectives",
  opinion_paragraph:        "opinion paragraph: claim + supporting examples/evidence",
  report:                   "content-related report: 2 paragraphs with transitions",
  explanatory_paragraphs:   "multi-paragraph: describes relationships between ideas",
  persuasive:               "persuasive piece: claim + substantiated evidence",
  research_report:          "research report drawing from multiple sources",
  informational_essay:      "informational essay comparing ideas from multiple sources",
  persuasive_essay:         "persuasive essay backed by research evidence",
  analytical_essay:         "analytical essay: sequence + concluding analytical statement",
  critical_essay:           "critical essay: central ideas + evaluation of interactions",
  argumentative_essay:      "argumentative essay: claim + counterclaims + evidence",
};

// ── Schema builder ────────────────────────────────────────────────────────────

/**
 * Builds the OUTPUT SCHEMA section for this specific call.
 * Shows the exact task_type, whether word_bank and sentence_frame are required,
 * and the minimum sentence count.
 */
function buildWritingOutputSchema(params: {
  level: number;
  taskType: string;
  wordBankRequired: boolean;
  sentenceFrameRequired: boolean;
  minSentences: number;
  hasLibraryImage: boolean;
}): string {
  const { level, taskType, wordBankRequired, sentenceFrameRequired, minSentences } = params;

  const wordBankShape = wordBankRequired
    ? params.hasLibraryImage
      ? `["<visible object from image_tags>", "<visible object>", "<useful verb>", "<connector>", "..."]`
      + `\n  /* REQUIRED: 6–10 words. Start with objects actually visible in the photo (image_tags). */`
      + `\n  /* Then add short verbs/connectors the student needs for this Can Do (see, look, because, and). */`
      : `["<content word>", "<key phrase>", "<Tier-2 academic term>", "..."]`
      + `\n  /* Level ${level}: provide 6–10 words the student needs to complete the task */`
    : `null  /* Level ${level}: no word bank — student generates their own vocabulary */`;

  const frameShape = sentenceFrameRequired
    ? `"<sentence starter that models the genre — e.g. 'I think… because…'>"`
    + `\n  /* Level ${level}: sentence frame required — model the ${taskType} genre */`
    + `\n  /* NEVER include blank lines like '___ helps ___' — use a STARTER only */`
    : `null  /* Level ${level}: no sentence frame — student opens independently */`;

  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "can_do_descriptor": "<WIDA action + chosen can_do item>",`,
    ``,
    `  "task_type": "${taskType}",`,
    `  /* Echo this value exactly — do not change it */`,
    `  /* Genre for this session: ${TASK_TYPE_DESCRIPTIONS[taskType] ?? taskType} */`,
    `  /* Full task_type reference (key_use × level):`,
    `       L1 all key uses   → word_phrase`,
    `       L2 Recount        → sentence_completion`,
    `       L2 Explain        → connected_sentences`,
    `       L2 Argue          → opinion_sentence`,
    `       L3 Recount        → paragraph`,
    `       L3 Explain        → comparison_paragraph`,
    `       L3 Argue          → opinion_paragraph`,
    `       L4 Recount        → report`,
    `       L4 Explain        → explanatory_paragraphs`,
    `       L4 Argue          → persuasive`,
    `       L5 Recount        → research_report`,
    `       L5 Explain        → informational_essay`,
    `       L5 Argue          → persuasive_essay`,
    `       L6 Recount        → analytical_essay`,
    `       L6 Explain        → critical_essay`,
    `       L6 Argue          → argumentative_essay */`,
    ``,
    `  "prompt": "${params.hasLibraryImage
      ? "<tell the student to look at the picture and write about what they see — match task_type>"
      : "<writing task text — no mention of word bank or sentence frame>"}",`,
    `  /* Genre must match task_type: ${TASK_TYPE_DESCRIPTIONS[taskType] ?? taskType} */`,
    `  /* Do NOT mention the word bank or sentence frame inside the prompt */`,
    `  "visual": null,`,
    ``,
    `  "word_bank": ${wordBankShape},`,
    ``,
    `  "sentence_frame": ${frameShape},`,
    ``,
    `  "min_sentences": ${minSentences}`,
    `  /* Echo this value exactly — the minimum sentences expected in student response */`,
    `}`,
    ``,
    `SCHEMA ENFORCEMENT RULES`,
    `• task_type MUST be echoed as-is: "${taskType}".`,
    `• min_sentences MUST be echoed as-is: ${minSentences}.`,
    wordBankRequired
      ? `• word_bank MUST be a non-null array of 6–10 items.`
      : `• word_bank MUST be null at Level ${level}.`,
    params.hasLibraryImage
      ? `• A real library photo is on screen. The prompt MUST ask the student to look at the picture and write about it.`
      : `• No library photo. Do not tell the student to look at a picture.`,
    sentenceFrameRequired
      ? `• sentence_frame MUST be a non-null starter string at Level ${level}.`
      : `• sentence_frame MUST be null at Level ${level}.`,
    `• prompt must NOT mention the word bank, sentence frame, or their absence.`,
  ].join("\n");
}

// ── Base system prompt (static) ───────────────────────────────────────────────

const WRITING_PROMPT_BASE = `You are a WIDA ACCESS Writing prompt generator for Grade 6–8 ELL students.
Your task: write one writing task calibrated to the student's WIDA ELP level and targeted Can Do descriptor.

${BASE_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PER-CALL INPUT FIELDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
assessment              → assessment type
level                   → WIDA ELP level (1–6)
grade_band              → student's grade band
mode                    → "standard" | "exit_proximity"
topic                   → pre-selected writing topic — design the prompt around this
can_do                  → key_use (Recount|Explain|Argue), action (WIDA framing), items (sub-skills at this level)
complexity_instruction  → vocabulary, sentence complexity, scaffolding level — follow exactly
writing_format          → genre and length description — hard limit; follow precisely
task_type               → the exact writing genre for this session — see OUTPUT SCHEMA
min_sentences           → minimum sentences expected; echo in output
sentence_frame_required → see OUTPUT SCHEMA for whether to provide or null-out sentence_frame
word_bank_required      → see OUTPUT SCHEMA for whether to provide or null-out word_bank
has_library_image       → true: a real photo is on screen; write about THAT photo
image_tags              → objects confirmed in the photo — use these in the word bank
image_description       → short scene context for you only; do not narrate it as if the student cannot see the photo
image_concept           → optional academic concept shown in the photo

${LIBRARY_IMAGE_GROUNDS_CONTENT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SKILL TARGET
   Pick the item from can_do.items that best fits the picture (if present) or the topic.
   Write action + item as can_do_descriptor.

2. PROMPT
   If has_library_image is true:
     The student can see the photograph. Ask them to look at the picture and write about it.
     Align with key_use using what is in the photo:
       Recount  → tell what you see / what is happening in the picture
       Explain  → explain how or why something in the picture works or matters
       Argue    → give an opinion about something in the picture
     Do not invent objects that are not in image_tags.
     Do not replace the photo with a text-only topic.
   If has_library_image is false:
     Write one clear writing task on the given topic.
   Structure it according to task_type. Match writing_format exactly.
   NEVER mention the word bank or sentence frame inside the prompt text.

3. WORD BANK
   Follow the OUTPUT SCHEMA exactly — provide array or null as shown.
   If a photo is present: word bank MUST be grounded in image_tags (visible nouns first), then useful verbs/connectors.

4. SENTENCE FRAME
   Follow the OUTPUT SCHEMA exactly — provide starter string or null as shown.
   Frame should model the genre (not fill-in-the-blank; starter only).

RULES
- mode = "exit_proximity" → increase prompt complexity; push toward the next level's genre.
- min_sentences is a floor, not a limit — echo the exact input value.

${OPTIONAL_LINE_VISUALS_BLOCK}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WritingContent {
  canDoDescriptor: string;
  /** Writing task genre — derived from CanDo key use + level */
  taskType: string;
  prompt: string;
  visual?: string;
  wordBank: string[] | null;
  sentenceFrame: string | null;
  minSentences: number;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

function mergeWritingWordBank(
  raw: unknown,
  imageTags: string[] | undefined,
  required: boolean,
): string[] | null {
  const fromModel = Array.isArray(raw)
    ? raw.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim())
    : [];
  const fromTags = (imageTags ?? []).filter((t) => t.trim().length > 0);
  const merged = [...new Set([...fromModel, ...fromTags])].slice(0, 10);
  if (merged.length > 0) return merged;
  if (!required) return null;
  return ["I see", "and", "because", "look", "picture"];
}

const FALLBACK_WRITING: WritingContent = {
  canDoDescriptor: "Explain by comparing and contrasting information, events, or characters",
  taskType: "comparison_paragraph",
  prompt: "Explain why learning a new language is important. Give at least one reason with an example.",
  wordBank: null,
  sentenceFrame: "Learning a new language is important because...",
  minSentences: 3,
};

// ── Writing prompt generator ──────────────────────────────────────────────────

export async function generateWritingContent(params: {
  assessment: string;
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  writingFormat: string;
  taskType: string;
  minSentences: number;
  sentenceFrameRequired: boolean;
  wordBankRequired: boolean;
  canDo: CanDoEntry;
  topic: string;
  gradeBand: string;
  mode: "standard" | "exit_proximity";
  academicContentLayer?: string;
  academicSubject?: string;
  hasLibraryImage?: boolean;
  imageTags?: string[];
  imageDescription?: string;
  imageConcept?: string;
}): Promise<WritingContent> {
  const hasLibraryImage = params.hasLibraryImage ?? false;
  const wordBankRequired = params.wordBankRequired || hasLibraryImage;
  // Build a level-specific output schema and combine with the static base prompt
  const schemaSection = buildWritingOutputSchema({
    level:                 params.level,
    taskType:              params.taskType,
    wordBankRequired,
    sentenceFrameRequired: params.sentenceFrameRequired,
    minSentences:          params.minSentences,
    hasLibraryImage,
  });
  const academicLayer = params.academicContentLayer ? `\n\n${params.academicContentLayer}` : "";
  const systemPrompt = `${WRITING_PROMPT_BASE}${academicLayer}\n\n${schemaSection}`;

  const userPrompt = JSON.stringify({
    domain:                  "writing",
    assessment:              params.assessment,
    level:                   params.level,
    fractional_level:        params.fractionalLevel,
    step_within_level:       params.stepWithinLevel,
    grade_band:              params.gradeBand,
    mode:                    params.mode,
    topic:                   params.topic,
    can_do:                  params.canDo,
    complexity_instruction:  params.complexityInstruction,
    writing_format:          params.writingFormat,
    task_type:               params.taskType,
    min_sentences:           params.minSentences,
    sentence_frame_required: params.sentenceFrameRequired,
    word_bank_required:      wordBankRequired,
    has_library_image:        hasLibraryImage,
    image_tags:              params.imageTags ?? [],
    image_description:       params.imageDescription ?? "",
    image_concept:           params.imageConcept ?? "",
    ...(params.academicSubject ? { academic_subject: params.academicSubject } : {}),
  });

  try {
    const result = (await callClaude(systemPrompt, userPrompt)) as {
      can_do_descriptor: string;
      task_type: string;
      prompt: string;
      word_bank: string[] | null;
      sentence_frame: string | null;
      min_sentences: number;
    };
    return {
      canDoDescriptor: result.can_do_descriptor ?? "",
      taskType:        result.task_type ?? params.taskType,
      prompt:          toDisplayText(result.prompt),
      visual:          parseVisual((result as { visual?: unknown }).visual),
      wordBank:        mergeWritingWordBank(result.word_bank, params.imageTags, wordBankRequired),
      sentenceFrame:   toDisplayTextOrNull(result.sentence_frame),
      minSentences:    result.min_sentences || params.minSentences,
    };
  } catch {
    if (hasLibraryImage) {
      return {
        canDoDescriptor: params.canDo.action,
        taskType:        params.taskType,
        prompt:          "Look at the picture. Write about what you see.",
        wordBank:        mergeWritingWordBank(null, params.imageTags, true),
        sentenceFrame:   params.sentenceFrameRequired ? "I see..." : null,
        minSentences:    params.minSentences,
      };
    }
    return FALLBACK_WRITING;
  }
}

// ── Writing feedback scorer ───────────────────────────────────────────────────

const FEEDBACK_SYSTEM_PROMPT = `You are a WIDA ACCESS Writing feedback specialist for Grade 6–8 ELL students.
Score a student's written response on a 0–100 scale and provide specific, actionable coaching.

${BASE_PROMPT}

INPUT FIELDS
can_do_descriptor → the WIDA Can Do the prompt targeted
prompt            → the writing task the student was given
student_response  → the student's actual written text
level             → WIDA ELP level (1–6)
task_type         → writing genre (word_phrase | sentence_completion | paragraph | argumentative_essay | etc.)
min_sentences     → minimum sentence floor for this level/genre

SCORING RUBRIC (apply all criteria)
- Can Do alignment    (30 pts): Does the response demonstrate the targeted Can Do skill?
- Task completion     (25 pts): Does the response address the prompt fully?
- Language production (25 pts): Does vocabulary, grammar, and sentence structure match the expected level?
- Length/format       (20 pts): Does the response meet min_sentences and match the genre?

SCORE THRESHOLDS
- ≥80 → mastery; student is ready to advance
- 70–79 → approaching mastery; minor skill gaps
- 60–69 → developing; clear gaps in target skill
- <60 → emerging; significant reteach needed

OUTPUT SCHEMA
{
  "score": 75,              /* integer 0–100 */
  "passed": true,           /* true if score ≥ 70 */
  "strengths": ["<specific strength observed in the response>"],
  "improvements": ["<specific, actionable suggestion>"],
  "coaching_note": "<1–2 sentences: what to focus on next session>"
}`;

export interface WritingFeedback {
  score: number;
  passed: boolean;
  strengths: string[];
  improvements: string[];
  coachingNote: string;
}

export async function getWritingFeedback(params: {
  canDoDescriptor: string;
  prompt: string;
  studentResponse: string;
  level: number;
  taskType: string;
  minSentences: number;
}): Promise<WritingFeedback> {
  const userPrompt = JSON.stringify({
    can_do_descriptor: params.canDoDescriptor,
    prompt:            params.prompt,
    student_response:  params.studentResponse,
    level:             params.level,
    task_type:         params.taskType,
    min_sentences:     params.minSentences,
  });

  try {
    const result = (await callClaude(FEEDBACK_SYSTEM_PROMPT, userPrompt, 800)) as {
      score: number;
      passed: boolean;
      strengths: string[];
      improvements: string[];
      coaching_note: string;
    };
    return {
      score:         typeof result.score === "number" ? result.score : 50,
      passed:        result.passed ?? result.score >= 70,
      strengths:     result.strengths ?? [],
      improvements:  result.improvements ?? [],
      coachingNote:  result.coaching_note ?? "",
    };
  } catch {
    return {
      score: 65, passed: false,
      strengths: ["Response submitted"],
      improvements: ["Review the Can Do descriptor and try again"],
      coachingNote: "Keep practicing — you can do it!",
    };
  }
}
