/**
 * General Listening content generator — WIDA levels 3–6, text-only passages.
 * For image-based listening (levels 0–2) see image-library.ts.
 * For academic math listening see academic-math.ts.
 *
 * Schema is built dynamically per call (level + permittedFormats + questionCount) so
 * Claude always sees the exact question types, valid "type" field values, and structural
 * examples for this session.
 */

import {
  callClaude,
  toDisplayText,
  PASSAGE_SENTENCE_TARGETS,
  LEVEL_QUESTION_COUNT,
  LEVEL_MAX_TOKENS,
} from "./client";
import { clampToThreeOptions } from "../choice-options";
import { OPTIONAL_LINE_VISUALS_BLOCK, parseOptionDiagrams, parseVisual } from "./prompts/optional-line-visuals";
import { buildSystemPrompt } from "./prompts/compose";
import { contentGenPrompt } from "./prompts/content";
import { serializeCanDoForPrompt } from "../content";
import { dumpContentGenRequest } from "./dump-content-gen";
import { logger } from "../../config/logger";
import { mergePriorPractice, type PracticeReport } from "../practice-report";

// ── Per-level schema tables ───────────────────────────────────────────────────

/**
 * Human-readable description and usage rule for each listening question format.
 * These appear in the schema section so Claude knows when to use each type.
 */
const FORMAT_DESCRIPTIONS: Record<string, { use: string; note: string }> = {
  multiple_choice: {
    use: "Any Can Do skill — main idea, detail, inference, vocabulary, comparison, summary, claim/evidence, opposing_view",
    note: "3 options A–C (1 correct + 2 distractors); correct is 0-based index; explanation max 8 words.",
  },
  pair_matching: {
    use: "Explain — matching spoken terms/concepts to their definitions or examples; Inform — matching speakers to their stated views",
    note: "3 options A–C presented as labeled pairs; student picks the correctly matched pair.",
  },
  sequence_ordering: {
    use: "Narrate — ordering narrative events as heard; Inform — ordering reported facts; Explain — ordering process steps",
    note: "3 options A–C each representing a different ordering of events/steps; student picks the correct order.",
  },
  agree_disagree: {
    use: "Argue — evaluating a speaker's claim; identifying stated evidence; distinguishing claim from opinion",
    note: "3 options A–C (claim evaluation); correct is 0-based index.",
  },
  category_sorting: {
    use: "Inform/Explain — classifying spoken items into categories (e.g. cause vs effect; pros vs cons; step type)",
    note: "3 options A–C each representing a different grouping; student picks the correct categorization.",
  },
};

/**
 * Valid can_do_skill values that can appear in the `type` field of each question
 * at each listening level (levels 3–6 only; levels 1–2 use image_library).
 *
 * Note: for listening, the question "type" field echoes the format name, not a skill.
 * Skill alignment is expressed by what the question asks.
 */
const LEVEL_MC_SKILLS: Record<number, string[]> = {
  3: ["main_idea", "detail", "vocabulary", "sequence", "comparison"],
  4: ["main_idea", "inference", "vocabulary", "comparison", "summary"],
  5: ["main_idea", "inference", "summary", "opposing_view", "vocabulary"],
  6: ["claim", "evidence", "inference", "summary", "opposing_view", "vocabulary"],
};

// ── Schema builder ────────────────────────────────────────────────────────────

/**
 * Builds the OUTPUT SCHEMA section for this specific call.
 * Shows only the question format types permitted at this level with correct structural
 * examples and enforcement rules.
 */
function buildListeningOutputSchema(
  level: number,
  permittedFormats: string[],
  questionCount: number,
): string {
  const mcSkills = LEVEL_MC_SKILLS[level] ?? ["main_idea", "detail", "vocabulary"];

  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `Permitted question formats this session: ${permittedFormats.join(" | ")}`,
    `You MUST produce exactly ${questionCount} questions using ONLY the formats listed above.`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "can_do_descriptor": "<WIDA action + chosen can_do item>",`,
    `  "audio_script": "<spoken passage — plain English, no stage directions or SSML>",`,
    `  "topic": "<echo input topic>",`,
    `  "context": "<one sentence: who speaks and to whom — e.g. 'A science teacher explains to students'>",`,
    `  "format": "${permittedFormats[0]}",`,
    `  /* Echo the primary format used — the first format in permitted_formats */`,
    `  "questions": [`,
    ``,
  ];

  const blocks: string[] = [];

  if (permittedFormats.includes("multiple_choice")) {
    const d = FORMAT_DESCRIPTIONS.multiple_choice;
    blocks.push(
`    /* ── multiple_choice ── */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "1",
      "type": "multiple_choice",
      "question": "<question that tests the Can Do skill directly from the audio>",
      "options": ["<A>", "<B>", "<C>"],
      "option_diagrams": [null, null, null],
      "correct": 0,
      /* 0-based index of the correct option */
      "explanation": "<max 8 words stating why>"
    }
    /* Valid skill targets at Level ${level}: ${mcSkills.join(" | ")} */`,
    );
  }

  if (permittedFormats.includes("pair_matching")) {
    const d = FORMAT_DESCRIPTIONS.pair_matching;
    blocks.push(
`    /* ── pair_matching ── */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "2",
      "type": "pair_matching",
      "question": "<ask student to identify the correctly matched pair from the audio>",
      "options": [
        "<Term A → Definition 1, Term B → Definition 2>",
        "<Term A → Definition 2, Term B → Definition 1>",
        "<Term A → Definition 3, Term B → Definition 1>"
      ],
      "correct": 0,
      "explanation": "<max 8 words>"
    }`,
    );
  }

  if (permittedFormats.includes("sequence_ordering")) {
    const d = FORMAT_DESCRIPTIONS.sequence_ordering;
    blocks.push(
`    /* ── sequence_ordering ── */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "3",
      "type": "sequence_ordering",
      "question": "<ask student to identify the correct order of events/steps heard in the audio>",
      "options": [
        "<Step A → Step B → Step C>",
        "<Step B → Step A → Step C>",
        "<Step C → Step A → Step B>"
      ],
      "correct": 0,
      /* 0-based index of the option that lists events in the correct order */
      "explanation": "<max 8 words>"
    }`,
    );
  }

  if (permittedFormats.includes("agree_disagree")) {
    const d = FORMAT_DESCRIPTIONS.agree_disagree;
    blocks.push(
`    /* ── agree_disagree ── */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "4",
      "type": "agree_disagree",
      "question": "<present a claim from the audio and ask if the speaker agrees/disagrees — or ask student to evaluate it>",
      "options": [
        "Agree — <brief reason that matches what the speaker said>",
        "Disagree — <plausible but incorrect reason>",
        "Agree — <plausible but incorrect reason>"
      ],
      "correct": 0,
      "explanation": "<max 8 words>"
    }`,
    );
  }

  if (permittedFormats.includes("category_sorting")) {
    const d = FORMAT_DESCRIPTIONS.category_sorting;
    blocks.push(
`    /* ── category_sorting ── */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "5",
      "type": "category_sorting",
      "question": "<ask student to identify which grouping correctly categorizes items from the audio>",
      "options": [
        "<Category A: item1, item2 | Category B: item3, item4>  ← correct",
        "<Category A: item1, item3 | Category B: item2, item4>",
        "<Category A: item2, item3 | Category B: item1, item4>"
      ],
      "correct": 0,
      "explanation": "<max 8 words>"
    }`,
    );
  }

  lines.push(blocks.join(",\n\n"));
  lines.push(``);
  lines.push(`  ]`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`SCHEMA ENFORCEMENT RULES`);
  lines.push(`• Return every key in this OUTPUT SCHEMA. Never omit a field. Use null only where this schema shows null.`);
  lines.push(`• Only these question formats are valid: ${permittedFormats.join(", ")}.`);
  lines.push(`• Produce exactly ${questionCount} questions.`);
  lines.push(`• The "type" field in each question MUST match one of the permitted formats.`);
  lines.push(`• "correct" is always a 0-based integer index into the "options" array.`);
  lines.push(`• Every selected-response item has exactly 3 options (1 correct + 2 distractors).`);
  lines.push(`• "explanation" is max 8 words — a brief factual reason, not a full sentence.`);
  lines.push(`• "audio_script" must be plain spoken English — no stage directions, SSML, or image references.`);
  lines.push(`• Do NOT include image_tags, imageUrls, or target_label in any field.`);

  return lines.join("\n");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ListeningContent {
  audioScript: string;
  topic: string;
  context: string;
  visual?: string;
  questions: Array<{
    id: string;
    type: string;
    question: string;
    visual?: string;
    optionDiagrams?: (string | null)[];
    /** multiple_choice / image_grid */
    options?: string[];
    /** Populated for image_grid questions — one Pixabay URL per option */
    imageUrls?: string[];
    /** multiple_choice / image_grid: 0-based index of correct option */
    correct?: number;
    explanation?: string;
    /** pair_matching */
    left_items?: string[];
    right_items?: string[];
    correct_pairs?: [number, number][];
    /** sequence_ordering */
    items?: string[];
    correct_order?: number[];
    /** agree_disagree */
    answer?: "agree" | "disagree";
    /** category_sorting */
    categories?: string[];
    correct_categories?: number[];
  }>;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

export const FALLBACK_LISTENING: ListeningContent = {
  audioScript:
    "Today in science class, Ms. Chen explained photosynthesis. She said plants use sunlight, water, and carbon dioxide to make their own food. This process produces oxygen, which animals need to breathe. That is why plants are so important for life on Earth.",
  topic: "Photosynthesis",
  context: "Science classroom lecture",
  questions: [
    {
      id: "1",
      type: "comprehension",
      question: "What are the three things plants need for photosynthesis?",
      options: [
        "Sunlight, water, carbon dioxide",
        "Sunlight, oxygen, nitrogen",
        "Water, soil, fertilizer",
      ],
      correct: 0,
      explanation: "Ms. Chen said plants need sunlight, water, and carbon dioxide.",
    },
    {
      id: "2",
      type: "inference",
      question: "Why did Ms. Chen call plants important?",
      options: [
        "They are beautiful",
        "They produce oxygen animals need",
        "They grow quickly",
      ],
      correct: 1,
      explanation: "Plants produce oxygen that animals need to breathe.",
    },
    {
      id: "3",
      type: "sequence",
      question: "What does photosynthesis produce?",
      options: ["Carbon dioxide", "Water vapor", "Oxygen"],
      correct: 2,
      explanation: "The audio says the process produces oxygen.",
    },
  ],
};

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateListeningContent(params: {
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  oralFormat: string;
  permittedFormats: string[];
  canDo: { keyUse: string; action: string; items: string[] };
  topic: string;
  isRetry?: boolean;
  lastSessionScore?: number | null;
  hasLibraryImage?: boolean;
  priorPracticeReport?: PracticeReport | null;
}): Promise<ListeningContent> {
  // Levels 0–2 use image_library sessions; levels 3–6 scale question count with level.
  const clampedLevel          = Math.min(Math.max(params.level, 3), 6);
  const questionCount         = LEVEL_QUESTION_COUNT[clampedLevel]         ?? 3;
  const passageSentenceTarget = PASSAGE_SENTENCE_TARGETS[clampedLevel]     ?? PASSAGE_SENTENCE_TARGETS[3];
  const maxTokens             = LEVEL_MAX_TOKENS[clampedLevel]              ?? 1500;

  // Build a level-specific output schema and combine with the static base prompt
  const schemaSection = buildListeningOutputSchema(clampedLevel, params.permittedFormats, questionCount);
  const systemPrompt  = buildSystemPrompt(
    contentGenPrompt("listening", clampedLevel),
    OPTIONAL_LINE_VISUALS_BLOCK,
    schemaSection,
  );

  const userPrompt = JSON.stringify(mergePriorPractice({
    current_score:           params.fractionalLevel,
    integer_level:           params.level,
    step_within_level:       params.stepWithinLevel,
    complexity_instruction:  params.complexityInstruction,
    can_do: serializeCanDoForPrompt(params.canDo, { level: params.level, domain: "LISTENING" }),
    oral_format:              params.oralFormat,
    permitted_formats:        params.permittedFormats,
    topic:                    params.topic,
    is_retry:                 params.isRetry ?? false,
    last_session_score:       params.lastSessionScore ?? null,
    question_count:           questionCount,
    passage_sentence_target:  passageSentenceTarget,
    has_library_image:        params.hasLibraryImage ?? false,
  }, params.priorPracticeReport));

  dumpContentGenRequest("listening", systemPrompt, userPrompt);
  try {
    const result = (await callClaude(systemPrompt, userPrompt, maxTokens)) as {
      audio_script: string;
      topic: string;
      context: string;
      questions: Array<Record<string, unknown>>;
    };

    // Preserve all question fields — different formats have different shapes.
    // Never forward image_tags, target_label, imageUrls for levels 3+.
    const questions = (result.questions || []).map((q) => {
      const three = Array.isArray(q.options)
        ? clampToThreeOptions(q.options, q.correct)
        : { options: undefined as string[] | undefined, correct: q.correct as number | undefined };
      return {
      id:                 q.id          as string,
      type:               q.type        as string,
      question:           toDisplayText((q.question as string) ?? ""),
      visual:             parseVisual(q.visual),
      optionDiagrams:     parseOptionDiagrams(q.option_diagrams)?.slice(0, three.options?.length ?? 3),
      options:            three.options,
      correct:            three.correct,
      explanation:        q.explanation as string   | undefined,
      // pair_matching
      left_items:         q.left_items  as string[] | undefined,
      right_items:        q.right_items as string[] | undefined,
      correct_pairs:      q.correct_pairs as [number, number][] | undefined,
      // sequence_ordering
      items:              q.items       as string[] | undefined,
      correct_order:      q.correct_order as number[] | undefined,
      // agree_disagree
      answer:             q.answer      as "agree" | "disagree" | undefined,
      // category_sorting
      categories:         q.categories  as string[] | undefined,
      correct_categories: q.correct_categories as number[] | undefined,
      };
    });

    return {
      audioScript: toDisplayText(result.audio_script),
      topic:       result.topic,
      context:     result.context,
      visual:      parseVisual((result as { visual?: unknown }).visual),
      questions,
    };
  } catch (err) {
    logger.error({ err }, "generateListeningContent failed, using fallback");
    return FALLBACK_LISTENING;
  }
}
