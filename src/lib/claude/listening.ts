/**
 * Shared listening schema, system prompt, finalize/retry, and legacy text-only generator.
 * Production sessions use academic-* listening (ela/math/science/social_studies) in sessions.ts —
 * same WIDA 2020 SF domain "listening", one API domain, subject rotation via buildAcademicListeningContext.
 * For image-based listening (levels 0–2) see academic-image-tap / image-library paths.
 * generateListeningContent() is legacy/dev-only (not wired in sessions.ts).
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
import { parseOptionDiagrams, parseVisual } from "./prompts/optional-line-visuals";
import { buildContentSystemPrompt } from "./prompts/content/system-prompt";
import {
  frameworkTaskDescriptor,
  serializeFrameworkTask,
  type FrameworkTask,
} from "./standards/2020";
import { dumpContentGenRequest } from "./dump-content-gen";
import { logger } from "../../config/logger";
import { mergePriorPractice, type PracticeReport } from "../practice-report";
import { aiFormatDescriptionsFor } from "../content/formatCapabilities";
import {
  buildListeningQuestionTypePlan,
  buildListeningQuestionsFixPrompt,
  mapListeningQuestionsFromClaude,
  validateListeningSessionQuestions,
  type MappedListeningQuestion,
} from "../content/listening-question-pipeline";

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
export function buildListeningOutputSchema(
  level: number,
  availableFormats: string[],
  questionCount: number,
  opts?: { libraryCompose?: boolean },
): string {
  const mcSkills = LEVEL_MC_SKILLS[level] ?? ["main_idea", "detail", "vocabulary"];
  const FORMAT_DESCRIPTIONS = aiFormatDescriptionsFor(availableFormats);

  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `Available question formats (UI-capable): ${availableFormats.join(" | ")}`,
    `Choose type(s) from this list that best assess framework.language_functions. Produce exactly ${questionCount} questions.`,
    questionCount >= 2 && availableFormats.length >= 2
      ? `Use at least ${Math.min(2, questionCount)} different "type" values from the list — follow question_type_plan in user JSON when provided.`
      : "",
    questionCount >= 3 && availableFormats.some((f) => ["sequence_ordering", "pair_matching", "category_sorting"].includes(f))
      ? `Include at least one interactive type (sequence_ordering, pair_matching, or category_sorting) when listed above.`
      : "",
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "task_descriptor": "<echo 2–3 language_functions this session assesses>",`,
    ...(opts?.libraryCompose
      ? [
          `  "selected_image_id": "<REQUIRED uuid from library_candidates — pick BEFORE writing audio_script>",`,
        ]
      : []),
    `  "audio_script": "<spoken passage — plain English, no stage directions or SSML>",`,
    `  "topic": "<echo input topic>",`,
    `  "context": "<one sentence: who speaks and to whom — e.g. 'A science teacher explains to students'>",`,
    `  "format": "<primary format you chose for this session>",`,
    `  /* Echo the main question type used — must appear in available_question_formats */`,
    `  "questions": [`,
    ``,
  ];

  const blocks: string[] = [];

  if (availableFormats.includes("multiple_choice")) {
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

  if (availableFormats.includes("pair_matching")) {
    const d = FORMAT_DESCRIPTIONS.pair_matching;
    blocks.push(
`    /* ── pair_matching (interactive — NOT options-only) ── */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "2",
      "type": "pair_matching",
      "question": "<match terms from the audio to definitions or effects>",
      "left_items": ["<term A>", "<term B>"],
      "right_items": ["<match B>", "<match A>"],
      "correct_pairs": [[0, 1], [1, 0]]
    }`,
    );
  }

  if (availableFormats.includes("sequence_ordering")) {
    const d = FORMAT_DESCRIPTIONS.sequence_ordering;
    blocks.push(
`    /* ── sequence_ordering (interactive — NOT options-only) ── */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "3",
      "type": "sequence_ordering",
      "question": "Put these steps or events in the correct order.",
      "items": ["<step B>", "<step A>", "<step C>"],
      "correct_order": [1, 0, 2]
    }`,
    );
  }

  if (availableFormats.includes("agree_disagree")) {
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

  if (availableFormats.includes("category_sorting")) {
    const d = FORMAT_DESCRIPTIONS.category_sorting;
    blocks.push(
`    /* ── category_sorting (interactive — NOT options-only) ── */
    /* Use for: ${d.use} */
    /* ${d.note} */
    {
      "id": "5",
      "type": "category_sorting",
      "question": "Sort each idea into the correct group.",
      "categories": ["<Group A>", "<Group B>"],
      "items": ["<idea 1>", "<idea 2>", "<idea 3>"],
      "correct_categories": [0, 1, 0]
    }`,
    );
  }

  lines.push(blocks.join(",\n\n"));
  lines.push(``);
  lines.push(`  ]`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`SCHEMA ENFORCEMENT RULES`);
  lines.push(`• Return every key above. Produce exactly ${questionCount} questions.`);
  lines.push(`• Each question "type" must be one of: ${availableFormats.join(", ")}.`);
  lines.push(`• Vary types across the session when formats allow.`);
  lines.push(`• multiple_choice / agree_disagree: exactly 3 options + "correct" (0-based index). "explanation" max 8 words on MC only.`);
  lines.push(`• sequence_ordering: MUST include "items" + "correct_order" — never options-only for this type.`);
  lines.push(`• pair_matching: MUST include "left_items" + "right_items" + "correct_pairs" — never options-only for this type.`);
  lines.push(`• category_sorting: MUST include "categories" + "items" + "correct_categories" — never options-only for this type.`);
  lines.push(`• If you cannot build a valid interactive shape, set "type" to "multiple_choice" instead of mis-labeling.`);
  lines.push(`• "audio_script" must be plain spoken English — no stage directions, SSML, or image references.`);
  lines.push(`• Students hear audio_script via TTS only — it is never shown as on-screen text; questions must be answerable from listening.`);
  lines.push(`• Do NOT put student quiz questions inside audio_script — script narrates/explains; questions[] holds every assessed stem. If the speaker raises an idea, assess it in questions[] with matching wording.`);
  lines.push(`• Do NOT include image_tags, imageUrls, or target_label in any field.`);
  if (opts?.libraryCompose) {
    lines.push(`• selected_image_id is REQUIRED when library_candidates exist — audio_script MUST match that photo's concept/tags.`);
    lines.push(`• Never write audio_script about a different topic than the selected photo shows.`);
  }

  return lines.filter((line) => line !== "").join("\n");
}

export async function finalizeListeningQuestionsWithRetry(params: {
  systemPrompt: string;
  maxTokens: number;
  permittedFormats: string[];
  questionCount: number;
  audioScript: string;
  topic: string;
  context: string;
  rawQuestions: Array<Record<string, unknown>> | undefined;
  questionTypePlan?: string[];
  varietySeed?: number;
}): Promise<MappedListeningQuestion[]> {
  const questionTypePlan =
    params.questionTypePlan
    ?? buildListeningQuestionTypePlan(
      params.permittedFormats,
      params.questionCount,
      params.varietySeed ?? 0,
    );

  let mapped = mapListeningQuestionsFromClaude(params.rawQuestions);
  let validation = validateListeningSessionQuestions(
    mapped,
    params.permittedFormats,
    params.questionCount,
    params.audioScript,
  );
  if (validation.ok) return mapped;

  for (let attempt = 0; attempt < 2 && !validation.ok; attempt += 1) {
    logger.warn(
      { attempt: attempt + 1, issues: validation.issues, mcFallback: validation.mcFallbackCount },
      "listening questions validation failed — retrying shape fix",
    );
    try {
      const fixUser = buildListeningQuestionsFixPrompt(
        {
          audio_script: params.audioScript,
          topic: params.topic,
          context: params.context,
          questions: mapped,
        },
        validation,
        params.permittedFormats,
        params.questionCount,
        questionTypePlan,
      );
      const fixed = (await callClaude(params.systemPrompt, fixUser, params.maxTokens)) as {
        questions?: Array<Record<string, unknown>>;
      };
      if (Array.isArray(fixed.questions) && fixed.questions.length > 0) {
        mapped = mapListeningQuestionsFromClaude(fixed.questions);
        validation = validateListeningSessionQuestions(
          mapped,
          params.permittedFormats,
          params.questionCount,
          params.audioScript,
        );
      }
    } catch (err) {
      logger.warn({ err, attempt: attempt + 1 }, "listening questions fix call failed");
      break;
    }
  }

  if (!validation.ok) {
    logger.warn(
      { issues: validation.issues, mcFallback: validation.mcFallbackCount },
      "listening questions still imperfect after fix — shipping best effort",
    );
  }

  return mapped;
}

export function listeningGenerationVarietyFields(
  permittedFormats: string[],
  questionCount: number,
  varietySeed: number,
): { questionTypePlan: string[]; varietySeed: number } {
  return {
    varietySeed,
    questionTypePlan: buildListeningQuestionTypePlan(
      permittedFormats,
      questionCount,
      varietySeed,
    ),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ListeningContent {
  taskDescriptor?: string;
  canDoDescriptor?: string;
  framework?: FrameworkTask;
  /** Set when L1–2 compose picks a library photo — sessions.ts resolves illustrationUrl from this. */
  selectedLibraryImageId?: string | null;
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
      type: "multiple_choice",
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
      type: "sequence_ordering",
      question: "Put these steps in the order Ms. Chen described.",
      items: [
        "Plants take in carbon dioxide",
        "Sunlight provides energy in the leaf",
        "Plants release oxygen",
      ],
      correct_order: [0, 1, 2],
    },
    {
      id: "3",
      type: "agree_disagree",
      question: "Plants are important because they produce oxygen animals need.",
      options: ["Agree", "Disagree", "Not in the audio"],
      correct: 0,
    },
  ],
};

const LISTENING_FALLBACK_VARIANTS: ListeningContent[] = [
  FALLBACK_LISTENING,
  {
    audioScript:
      "In social studies, Mr. Rivera described how a bill becomes a law. First, someone in Congress writes a bill. Next, committees review it and both houses vote. If both approve, the bill goes to the president, who can sign it or veto it.",
    topic: "How a bill becomes a law",
    context: "Social studies class",
    questions: [
      {
        id: "1",
        type: "sequence_ordering",
        question: "Order the steps Mr. Rivera gave.",
        items: [
          "Congress votes on the bill",
          "Someone writes a bill",
          "The president signs or vetoes it",
          "Committees review the bill",
        ],
        correct_order: [1, 3, 0, 2],
      },
      {
        id: "2",
        type: "multiple_choice",
        question: "What can the president do with a bill?",
        options: ["Sign it or veto it", "Rewrite it alone", "Skip the vote"],
        correct: 0,
      },
      {
        id: "3",
        type: "pair_matching",
        question: "Match each step to who does it.",
        left_items: ["Writes the bill", "Votes on the bill", "Signs or vetoes"],
        right_items: ["Congress member", "Congress", "President"],
        correct_pairs: [[0, 0], [1, 1], [2, 2]],
      },
    ],
  },
  {
    audioScript:
      "The school nurse explained healthy habits: drink water, sleep eight hours, wash hands before eating. Sugary drinks can make you tired later. Exercise helps your heart and brain stay strong.",
    topic: "Healthy habits",
    context: "School nurse",
    questions: [
      {
        id: "1",
        type: "category_sorting",
        question: "Sort each habit.",
        categories: ["Healthy habit", "Avoid"],
        items: ["Drink water", "Sleep eight hours", "Many sugary drinks"],
        correct_categories: [0, 0, 1],
      },
      {
        id: "2",
        type: "multiple_choice",
        question: "Why did the nurse mention sugary drinks?",
        options: [
          "They can make you tired later",
          "They replace sleep",
          "They are required at lunch",
        ],
        correct: 0,
      },
      {
        id: "3",
        type: "agree_disagree",
        question: "Exercise helps your heart and brain.",
        options: ["Agree", "Disagree", "Not in the audio"],
        correct: 0,
      },
    ],
  },
];

export function pickListeningFallback(varietySeed = 0): ListeningContent {
  const n = LISTENING_FALLBACK_VARIANTS.length;
  const idx = ((Math.floor(varietySeed) % n) + n) % n;
  return LISTENING_FALLBACK_VARIANTS[idx] ?? FALLBACK_LISTENING;
}

export interface Listening2020SystemPromptOptions {
  academicContentLayer?: string;
  extraBlocks?: string[];
  hasLibraryImage?: boolean;
  hasLibraryCandidates?: boolean;
  schemaSection?: string;
  includeLineVisuals?: boolean;
}

/** Assembled via buildContentSystemPrompt — PLD lives in user JSON framework only. */
export function buildListening2020SystemPrompt(
  level: number,
  opts: Listening2020SystemPromptOptions = {},
): string {
  const clamped = Math.min(Math.max(level, 1), 6);
  return buildContentSystemPrompt("listening", clamped, opts.schemaSection ?? "", {
    academicContentLayer: opts.academicContentLayer,
    extraBlocks:          opts.extraBlocks,
    hasLibraryImage:      opts.hasLibraryImage ?? opts.hasLibraryCandidates,
    hasLibraryCandidates: opts.hasLibraryCandidates,
    includeLineVisuals:   opts.includeLineVisuals,
  });
}

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateListeningContent(params: {
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  oralFormat: string;
  permittedFormats: string[];
  framework: FrameworkTask;
  topic: string;
  isRetry?: boolean;
  lastSessionScore?: number | null;
  hasLibraryImage?: boolean;
  priorPracticeReport?: PracticeReport | null;
  varietySeed?: number;
}): Promise<ListeningContent> {
  // Levels 0–2 use image_library sessions; levels 3–6 scale question count with level.
  const clampedLevel          = Math.min(Math.max(params.level, 3), 6);
  const questionCount         = LEVEL_QUESTION_COUNT[clampedLevel]         ?? 3;
  const passageSentenceTarget = PASSAGE_SENTENCE_TARGETS[clampedLevel]     ?? PASSAGE_SENTENCE_TARGETS[3];
  const maxTokens             = LEVEL_MAX_TOKENS[clampedLevel]              ?? 1500;
  const varietySeed           = params.varietySeed ?? 0;
  const { questionTypePlan } = listeningGenerationVarietyFields(
    params.permittedFormats,
    questionCount,
    varietySeed,
  );

  // Build a level-specific output schema and combine with the static base prompt
  const schemaSection = buildListeningOutputSchema(clampedLevel, params.permittedFormats, questionCount);
  const systemPrompt = buildListening2020SystemPrompt(clampedLevel, { schemaSection });

  const userPrompt = JSON.stringify(mergePriorPractice({
    domain:                  "listening",
    current_score:           params.fractionalLevel,
    integer_level:           params.level,
    step_within_level:       params.stepWithinLevel,
    complexity_instruction:  params.complexityInstruction,
    framework:               serializeFrameworkTask(params.framework),
    goal:                    "Create one listening task so the student can practice understanding language at framework.pld (end of this integer level).",
    required_key_use:      params.framework.key_language_use,
    oral_format:              params.oralFormat,
    available_question_formats: params.permittedFormats,
    question_type_plan:       questionTypePlan,
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

    const questions = await finalizeListeningQuestionsWithRetry({
      systemPrompt,
      maxTokens,
      permittedFormats: params.permittedFormats,
      questionCount,
      audioScript: toDisplayText(result.audio_script),
      topic: result.topic,
      context: result.context,
      rawQuestions: result.questions,
      questionTypePlan,
      varietySeed,
    });

    const taskDescriptor = (result as { task_descriptor?: string; can_do_descriptor?: string }).task_descriptor
      ?? (result as { can_do_descriptor?: string }).can_do_descriptor
      ?? frameworkTaskDescriptor(params.framework);
    return {
      taskDescriptor,
      canDoDescriptor: taskDescriptor,
      framework:       params.framework,
      audioScript: toDisplayText(result.audio_script),
      topic:       result.topic,
      context:     result.context,
      visual:      parseVisual((result as { visual?: unknown }).visual),
      questions,
    };
  } catch (err) {
    logger.error({ err }, "generateListeningContent failed, using fallback");
    return pickListeningFallback(varietySeed);
  }
}
