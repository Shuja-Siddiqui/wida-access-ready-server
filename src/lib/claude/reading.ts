/**
 * Reading content generator — passage + comprehension questions, WIDA levels 1–6.
 *
 * Schema is built dynamically per call (level + permittedFormats + keyUse) so Claude
 * always sees the exact question types, valid enum values, and field shapes for this session.
 */

import { callClaude, BASE_PROMPT, toDisplayText } from "./client";
import { LIBRARY_IMAGE_GROUNDS_CONTENT, OPTIONAL_LINE_VISUALS_BLOCK } from "./prompts/optional-line-visuals";
import type { CanDoEntry } from "../listeningContentEngine";

// ── Per-level schema tables ───────────────────────────────────────────────────

/**
 * Valid can_do_skill values for multiple_choice questions per WIDA level.
 * Derived from READING CanDo descriptors (Key Uses Edition, Grades 6–8).
 */
const READING_MC_SKILLS: Record<number, string[]> = {
  1: ["main_idea", "wh_answer", "detail", "vocabulary"],
  2: ["main_idea", "detail", "vocabulary", "comparison"],
  3: ["main_idea", "detail", "inference", "vocabulary", "comparison"],
  4: ["main_idea", "detail", "inference", "summary", "vocabulary", "comparison"],
  5: ["main_idea", "inference", "summary", "opposing_view", "vocabulary"],
  6: ["claim", "evidence", "inference", "summary", "opposing_view", "vocabulary"],
};

/**
 * Valid can_do_skill values for sequence_order questions per level.
 * Level 4+ adds order_paragraphs (sorting multi-paragraph structure).
 */
const READING_SEQ_SKILLS: Record<number, string[]> = {
  2: ["sequence"],
  3: ["sequence"],
  4: ["sequence", "order_paragraphs"],
  5: ["sequence", "order_paragraphs"],
};

/**
 * Valid can_do_skill values for match_columns questions per level.
 * L1: object-to-word matching; L4+: cause-effect from passage.
 */
const READING_MATCH_SKILLS: Record<number, string[]> = {
  1: ["word_match"],
  4: ["cause_effect", "word_match"],
};

/**
 * Valid can_do_skill values for classify questions per level.
 * Derived from Argue CanDo at each level:
 *   L1 → true/false;  L2 → fact/opinion;  L4 → pros/cons;  L6 → fact/judgment/speculation
 */
const READING_CLASSIFY_SKILLS: Record<number, string[]> = {
  1: ["true_false"],
  2: ["true_false", "fact_opinion"],
  4: ["fact_opinion", "pros_cons"],
  6: ["fact_judgment_speculation", "pros_cons"],
};

/** Example category labels for each classify skill type */
const CLASSIFY_CATEGORIES: Record<string, string[]> = {
  true_false:                  ["True", "False"],
  fact_opinion:                ["Fact", "Opinion"],
  pros_cons:                   ["Pro", "Con"],
  fact_judgment_speculation:   ["Fact", "Reasoned Judgment", "Speculation"],
};

// ── Schema builder ────────────────────────────────────────────────────────────

/**
 * Builds the OUTPUT SCHEMA section of the system prompt for this specific call.
 * Shows only the question types permitted at this level, with valid enum values
 * and concrete structural examples.
 */
function buildReadingOutputSchema(level: number, permittedFormats: string[], questionCount: number): string {
  const mcSkills    = READING_MC_SKILLS[level]      ?? ["main_idea", "detail", "vocabulary"];
  const seqSkills   = READING_SEQ_SKILLS[level]     ?? ["sequence"];
  const matchSkills = READING_MATCH_SKILLS[level]   ?? ["cause_effect"];
  const classifySkills = READING_CLASSIFY_SKILLS[level] ?? ["fact_opinion"];
  const exCatKey    = classifySkills[0] ?? "fact_opinion";
  const exCats      = CLASSIFY_CATEGORIES[exCatKey] ?? ["Fact", "Opinion"];

  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `Permitted question types this session: ${permittedFormats.join(" | ")}`,
    `You MUST produce exactly ${questionCount} questions using ONLY the types listed above.`,
    `When 2+ types are permitted, distribute them — do not use the same type for every question.`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "can_do_descriptor": "<WIDA action + chosen can_do item>",`,
    `  "passage": "<reading passage — plain text only; match text_format exactly>",`,
    `  "topic": "<passage topic>",`,
    `  "questions": [`,
    ``,
  ];

  const blocks: string[] = [];

  if (permittedFormats.includes("multiple_choice")) {
    blocks.push(
`    /* ── multiple_choice ── */
    {
      "id": "1",
      "type": "multiple_choice",
      "can_do_skill": "${mcSkills[0]}",
      /* valid can_do_skill values at Level ${level}: ${mcSkills.join(" | ")} */
      "question": "<question answerable from the passage>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "option_diagrams": ["<optional simple line marks for A>", null, null, null],
      /* option_diagrams is OPTIONAL. Same length as options. Use only when a
         few keyboard marks make the choice easier to see (counts, tallies,
         2D outlines). Use null for a choice that stays words-only. Omit the
         whole field when no choice needs a diagram. */
      "correct": 0,
      /* 0-based index of the correct option */
      "explanation": "<max 10 words stating why the correct answer is right>"
    }`,
    );
  }

  if (permittedFormats.includes("sequence_order")) {
    blocks.push(
`    /* ── sequence_order ── */
    /* Use for: Recount=sequencing events/steps; Explain=sequencing a process */
    {
      "id": "2",
      "type": "sequence_order",
      "can_do_skill": "${seqSkills[0]}",
      /* valid can_do_skill values at Level ${level}: ${seqSkills.join(" | ")} */
      "question": "Put these events in the correct order.",
      "items": ["<event B>", "<event A>", "<event C>"],
      /* 3–5 items presented TO THE STUDENT in scrambled order */
      "correct_order": [1, 0, 2]
      /* correct_order[i] = destination position (0-based) of items[i]
         In this example: items[0] goes to position 1,
                          items[1] goes to position 0,
                          items[2] goes to position 2 */
    }`,
    );
  }

  if (permittedFormats.includes("match_columns")) {
    blocks.push(
`    /* ── match_columns ── */
    /* Use for: ${matchSkills.includes("word_match") ? "L1=matching words to pictures/objects" : ""}${matchSkills.includes("cause_effect") ? "Explain=cause-effect matching" : ""} */
    {
      "id": "3",
      "type": "match_columns",
      "can_do_skill": "${matchSkills[0]}",
      /* valid can_do_skill values at Level ${level}: ${matchSkills.join(" | ")} */
      "question": "Match each cause to its effect.",
      "left": ["<cause 1>", "<cause 2>"],
      "right": ["<effect B>", "<effect A>"],
      /* right items are SCRAMBLED — right[0] is NOT the match for left[0] */
      "correct_pairs": [[0, 1], [1, 0]]
      /* each pair is [left_idx, right_idx]:
         left[0] matches right[1];  left[1] matches right[0] */
    }`,
    );
  }

  if (permittedFormats.includes("classify")) {
    blocks.push(
`    /* ── classify ── */
    /* Use for: Argue CanDo at Level ${level} — ${classifySkills.join(" or ")} */
    {
      "id": "4",
      "type": "classify",
      "can_do_skill": "${classifySkills[0]}",
      /* valid can_do_skill values at Level ${level}: ${classifySkills.join(" | ")} */
      "question": "Sort each statement.",
      "categories": ${JSON.stringify(exCats)},
      /* 2–3 category labels */
      "items": ["<statement 1>", "<statement 2>", "<statement 3>"],
      /* 3–5 short statements from or about the passage */
      "correct": [0, 1, 0]
      /* correct[i] = 0-based index into categories for items[i] */
    }`,
    );
  }

  lines.push(blocks.join(",\n\n"));
  lines.push(``);
  lines.push(`  ],`);
  lines.push(`  "vocabulary": [`);
  lines.push(`    /* 2–3 key Tier-2 words from the passage */`);
  lines.push(`    {`);
  lines.push(`      "word": "<Tier-2 word from the passage>",`);
  lines.push(`      "definition": "<brief student-facing definition>",`);
  lines.push(`      "home_lang_hint": "<translation in home_language, or null if English/null>"`);
  lines.push(`    }`);
  lines.push(`  ]`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`SCHEMA ENFORCEMENT RULES`);
  lines.push(`• Only these types are valid this session: ${permittedFormats.join(", ")}.`);
  lines.push(`• "explanation" field ONLY on multiple_choice — omit it on all other types.`);
  lines.push(`• correct_order: correct_order[i] = the 0-based destination position of items[i].`);
  lines.push(`• correct_pairs: every pair [left_idx, right_idx]; cover every left item exactly once.`);
  lines.push(`• correct (classify): correct[i] = 0-based category index for items[i].`);
  lines.push(`• vocabulary: 2–3 words; home_lang_hint is null if home_language input is null or English.`);

  return lines.join("\n");
}

// ── Base system prompt (static) ───────────────────────────────────────────────

const BASE_SYSTEM = `You are a WIDA ACCESS Reading content generator for Grade 6–8 ELL students.
Your task: write a reading passage with comprehension questions calibrated to the student's WIDA ELP level and targeted Can Do descriptor.

${BASE_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PER-CALL INPUT FIELDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
level                   → WIDA ELP level (1–6)
grade_band              → student's grade band (e.g. "6-8")
home_language           → student's home language (for vocabulary hints — null if English)
mode                    → "standard" | "exit_proximity" (exit = push toward next level)
topic                   → pre-selected passage topic — use only when has_library_image is false
has_library_image       → true: a real photo is on screen; write about THAT photo
image_tags              → objects / labels confirmed in the photo
image_description       → what the photo shows
image_concept           → optional academic idea in the photo (e.g. plant vs animal cells)
can_do                  → key_use (Recount|Explain|Argue), action (WIDA framing), items (sub-skills at this level)
complexity_instruction  → vocabulary, sentence complexity, scaffolding level — follow exactly
text_format             → passage length and text type — HARD LIMIT; do not exceed
passage_word_max        → maximum word count for the passage — do not exceed
permitted_formats       → ONLY use question formats listed in the OUTPUT SCHEMA below; no others
question_count          → generate exactly this many questions

${LIBRARY_IMAGE_GROUNDS_CONTENT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SKILL TARGET
   Pick the item from can_do.items that best fits the topic. Write action + item as can_do_descriptor.
   All passage and question decisions follow from this.

2. PASSAGE
   If has_library_image is true: write about the photo (cells, maps, whatever is actually shown). The student can see it — name what is in the picture.
   If has_library_image is false: write a passage on the given topic.
   The Can Do skill must be demonstrable from the text.
   Match text_format, passage_word_max, and complexity_instruction exactly.
   If the topic is academic, still stay inside the word cap — teach ONE idea, not a full lesson.

${OPTIONAL_LINE_VISUALS_BLOCK}
   • Recount → clear sequence of events or narrative; main idea unmistakable
   • Explain  → cause-effect or process; the "how" or "why" is explicit in the text
   • Argue    → a clear position supported by stated evidence; student can evaluate it

3. QUESTIONS — exactly question_count questions, using ONLY the types listed in OUTPUT SCHEMA
   Distribute formats when 2+ are permitted — test the Can Do from multiple angles.
   Each question must be answerable from the passage alone.
   Wrong options / foils are plausible misreadings of the passage, not random distractors.

4. VOCABULARY
   Pick 2–3 Tier-2 words from the passage that help unlock comprehension.
   Provide a brief student-facing definition. Include home_lang_hint only when home_language ≠ null/English.

5. MODE
   mode = "exit_proximity" → increase inference demand and vocabulary complexity.`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReadingQuestionMC {
  id: string;
  type: "multiple_choice";
  canDoSkill: string;
  question: string;
  options: string[];
  /** Optional line marks aligned with options (null = words only). */
  optionDiagrams?: (string | null)[];
  correct: number;
  explanation: string;
}

export interface ReadingQuestionSequence {
  id: string;
  type: "sequence_order";
  canDoSkill: string;
  question: string;
  /** Items presented to the student in scrambled order */
  items: string[];
  /** correct_order[i] = destination position (0-based) of items[i] */
  correct_order: number[];
}

export interface ReadingQuestionMatchColumns {
  id: string;
  type: "match_columns";
  canDoSkill: string;
  question: string;
  left: string[];
  /** Scrambled — indices do NOT align with left */
  right: string[];
  /** [left_idx, right_idx] pairs */
  correct_pairs: [number, number][];
}

export interface ReadingQuestionClassify {
  id: string;
  type: "classify";
  canDoSkill: string;
  question: string;
  categories: string[];
  items: string[];
  /** correct[i] = category index (0-based) for items[i] */
  correct: number[];
}

export type ReadingQuestion =
  | ReadingQuestionMC
  | ReadingQuestionSequence
  | ReadingQuestionMatchColumns
  | ReadingQuestionClassify;

export interface ReadingContent {
  canDoDescriptor: string;
  passage: string;
  topic: string;
  visual?: string;
  questions: ReadingQuestion[];
  vocabulary: Array<{ word: string; definition: string; homeLangHint?: string }>;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

export const FALLBACK_READING: ReadingContent = {
  canDoDescriptor: "Process recounts by identifying settings or time frames in informational text",
  passage:
    "The water cycle is an important process. Water evaporates from oceans and lakes. It rises into the atmosphere as water vapor. Then it cools and forms clouds. Finally, it falls back to earth as rain or snow. This cycle repeats continuously and supports all life on Earth.",
  topic: "The Water Cycle",
  questions: [
    {
      id: "1", type: "multiple_choice", canDoSkill: "main_idea",
      question: "What is this passage mainly about?",
      options: ["The water cycle", "Ocean animals", "Mountain weather", "River pollution"],
      correct: 0, explanation: "The passage explains how water moves through the cycle.",
    },
    {
      id: "2", type: "sequence_order", canDoSkill: "sequence",
      question: "Put these steps of the water cycle in the correct order.",
      items: ["Water forms clouds", "Water evaporates", "Rain falls to earth"],
      correct_order: [1, 0, 2],
    },
    {
      id: "3", type: "multiple_choice", canDoSkill: "vocabulary",
      question: "What does 'evaporates' mean in the passage?",
      options: ["Turns to ice", "Turns to vapor and rises", "Falls as rain", "Forms clouds"],
      correct: 1, explanation: "Evaporates means water turns into vapor and rises.",
    },
    {
      id: "4", type: "classify", canDoSkill: "true_false",
      question: "Mark each statement True or False based on the passage.",
      categories: ["True", "False"],
      items: ["Water vapor rises into the atmosphere.", "The water cycle creates new water.", "The cycle supports all life on Earth."],
      correct: [0, 1, 0],
    },
    {
      id: "5", type: "multiple_choice", canDoSkill: "detail",
      question: "What happens after water vapor cools?",
      options: ["It evaporates again", "It becomes ice", "It forms clouds", "It sinks into soil"],
      correct: 2, explanation: "The passage says it 'cools and forms clouds.'",
    },
  ],
  vocabulary: [
    { word: "evaporates", definition: "When liquid water turns into water vapor and rises into the air" },
    { word: "atmosphere", definition: "The layers of air surrounding the Earth" },
  ],
};

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateReadingContent(params: {
  assessment: string;
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  textFormat: string;
  permittedFormats: string[];
  canDo: CanDoEntry;
  topic: string;
  gradeBand: string;
  homeLanguage?: string;
  mode: "standard" | "exit_proximity";
  academicContentLayer?: string;
  academicSubject?: string;
  questionCount?: number;
  passageWordMax?: number;
  hasLibraryImage?: boolean;
  imageTags?: string[];
  imageDescription?: string;
  imageConcept?: string;
}): Promise<ReadingContent> {
  // Build a level-specific output schema and combine with the static base prompt
  const questionCount = params.questionCount ?? (params.level <= 1 ? 2 : params.level <= 3 ? 3 : 5);
  const schemaSection = buildReadingOutputSchema(params.level, params.permittedFormats, questionCount);
  const academicLayer = params.academicContentLayer ? `\n\n${params.academicContentLayer}` : "";
  const systemPrompt  = `${BASE_SYSTEM}${academicLayer}\n\n${schemaSection}`;

  const userPrompt = JSON.stringify({
    domain:                 "reading",
    assessment:             params.assessment,
    level:                  params.level,
    fractional_level:       params.fractionalLevel,
    step_within_level:      params.stepWithinLevel,
    grade_band:             params.gradeBand,
    home_language:          params.homeLanguage || null,
    mode:                   params.mode,
    topic:                  params.topic,
    can_do:                 params.canDo,
    complexity_instruction: params.complexityInstruction,
    text_format:            params.textFormat,
    permitted_formats:      params.permittedFormats,
    question_count:         questionCount,
    passage_word_max:       params.passageWordMax ?? (params.level <= 1 ? 40 : 90),
    has_library_image:      params.hasLibraryImage ?? false,
    image_tags:             params.imageTags ?? [],
    image_description:      params.imageDescription ?? null,
    image_concept:          params.imageConcept ?? null,
    ...(params.academicSubject ? { academic_subject: params.academicSubject } : {}),
  });

  try {
    const result = (await callClaude(systemPrompt, userPrompt, 2000)) as {
      can_do_descriptor: string;
      passage: string;
      topic: string;
      visual?: string;
      questions: Array<{
        id: string;
        type: string;
        can_do_skill: string;
        // multiple_choice
        question?: string;
        options?: string[];
        option_diagrams?: (string | null)[];
        correct?: number | number[];
        explanation?: string;
        // sequence_order
        items?: string[];
        correct_order?: number[];
        // match_columns
        left?: string[];
        right?: string[];
        correct_pairs?: [number, number][];
        // classify
        categories?: string[];
      }>;
      vocabulary: Array<{ word: string; definition: string; home_lang_hint?: string }>;
    };

    const questions: ReadingQuestion[] = (result.questions || []).map((q) => {
      switch (q.type) {
        case "sequence_order":
          return {
            id: q.id,
            type: "sequence_order" as const,
            canDoSkill: q.can_do_skill ?? "sequence",
            question: toDisplayText(q.question ?? "Put these events in the correct order."),
            items: q.items ?? [],
            correct_order: (q.correct_order ?? []) as number[],
          } satisfies ReadingQuestionSequence;

        case "match_columns":
          return {
            id: q.id,
            type: "match_columns" as const,
            canDoSkill: q.can_do_skill ?? "cause_effect",
            question: toDisplayText(q.question ?? "Match each item to its pair."),
            left: q.left ?? [],
            right: q.right ?? [],
            correct_pairs: (q.correct_pairs ?? []) as [number, number][],
          } satisfies ReadingQuestionMatchColumns;

        case "classify":
          return {
            id: q.id,
            type: "classify" as const,
            canDoSkill: q.can_do_skill ?? "fact_opinion",
            question: toDisplayText(q.question ?? "Sort each statement."),
            categories: q.categories ?? [],
            items: q.items ?? [],
            correct: Array.isArray(q.correct) ? (q.correct as number[]) : [],
          } satisfies ReadingQuestionClassify;

        default: // multiple_choice (fallback)
          return {
            id: q.id,
            type: "multiple_choice" as const,
            canDoSkill: q.can_do_skill ?? "detail",
            question: toDisplayText(q.question ?? ""),
            options: q.options ?? [],
            optionDiagrams: Array.isArray(q.option_diagrams) ? q.option_diagrams : undefined,
            correct: typeof q.correct === "number" ? q.correct : 0,
            explanation: q.explanation ?? "",
          } satisfies ReadingQuestionMC;
      }
    });

    return {
      canDoDescriptor: result.can_do_descriptor ?? "",
      passage:         toDisplayText(result.passage),
      visual:          typeof result.visual === "string" ? result.visual : undefined,
      topic:           result.topic,
      questions,
      vocabulary:      (result.vocabulary ?? []).map((v) => ({
        word:         v.word,
        definition:   v.definition,
        homeLangHint: v.home_lang_hint,
      })),
    };
  } catch {
    if (params.hasLibraryImage && (params.imageTags?.length || params.imageDescription || params.imageConcept)) {
      const label = (params.imageConcept || params.imageTags?.slice(0, 3).join(", ") || "the picture").trim();
      const about = (params.imageDescription || `This picture shows ${label}.`).trim();
      return {
        canDoDescriptor: "Identify details in informational text about a picture",
        passage: `${about} Look at the picture. Find what the words name.`,
        topic: label,
        questions: [
          {
            id: "1",
            type: "multiple_choice",
            canDoSkill: "detail",
            question: "What does the picture show?",
            options: [label, "A city map", "Only water", "A classroom of desks"],
            correct: 0,
            explanation: "The text and picture are about this scene.",
          },
        ],
        vocabulary: (params.imageTags ?? []).slice(0, 2).map((word) => ({
          word,
          definition: `A word from the picture: ${word}.`,
        })),
      };
    }
    return FALLBACK_READING;
  }
}
