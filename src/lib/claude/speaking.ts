/**
 * Speaking content generator — one oral prompt with scaffold and scoring guidance.
 *
 * Schema is built dynamically per call (level + allowedPromptTypes + responseLength +
 * scaffoldRequired) so Claude always sees the exact field shapes, enum values, and
 * scoring dimensions valid for this session.
 */

import { callClaude, BASE_PROMPT, toDisplayText, toDisplayTextOrNull } from "./client";
import type { CanDoEntry } from "../listeningContentEngine";

// ── Per-level schema tables ───────────────────────────────────────────────────

/**
 * Scoring dimensions appropriate for each WIDA level.
 * L1–2: pronunciation + vocabulary (limited production).
 * L3–4: full linguistic measure (pronunciation, fluency, vocabulary, grammar).
 * L5–6: discourse-level measures (fluency, vocabulary, grammar, organization, accuracy).
 */
const SPEAKING_SCORING_DIMENSIONS: Record<number, string[]> = {
  1: ["pronunciation", "vocabulary"],
  2: ["pronunciation", "vocabulary"],
  3: ["pronunciation", "fluency", "vocabulary", "grammar"],
  4: ["pronunciation", "fluency", "vocabulary", "grammar"],
  5: ["fluency", "vocabulary", "grammar", "discourse_organization", "content_accuracy"],
  6: ["fluency", "vocabulary", "grammar", "discourse_organization", "content_accuracy"],
};

/**
 * Whether the scaffold field should be a string or null at each level.
 * Levels 1–3: always provide a sentence frame.
 * Levels 4–6: scaffold is null (student generates their own language).
 */
const SCAFFOLD_REQUIRED_AT_LEVEL: Record<number, boolean> = {
  1: true, 2: true, 3: true, 4: false, 5: false, 6: false,
};

// ── Schema builder ────────────────────────────────────────────────────────────

/**
 * Builds the OUTPUT SCHEMA section for this specific call.
 * Shows the exact prompt_type options, response_length, scoring dimensions,
 * and scaffold nullability for this level.
 */
function buildSpeakingOutputSchema(params: {
  level: number;
  allowedPromptTypes: string[];
  responseLength: string;
  scaffoldRequired: boolean;
  targetSeconds: { min: number; max: number };
}): string {
  const { level, allowedPromptTypes, responseLength, scaffoldRequired, targetSeconds } = params;
  const scoringDims = SPEAKING_SCORING_DIMENSIONS[level] ?? ["pronunciation", "vocabulary"];
  const scaffoldShape = scaffoldRequired
    ? `"<sentence frame / starter that models the prompt_type — e.g. 'First… Then… Finally…'>"`
    : `null  /* Level ${level}: no scaffold; student generates their own opening */`;

  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `OUTPUT SCHEMA — LEVEL ${level}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `{`,
    `  "can_do_descriptor": "<WIDA action + chosen can_do item>",`,
    ``,
    `  "prompt": "<the speaking task the student sees — sized to response_length>",`,
    `  /* Task must be answerable in: ${responseLength.replace(/_/g, " ")} */`,
    ``,
    `  "prompt_type": "${allowedPromptTypes[0]}",`,
    `  /* MUST be exactly one of: ${allowedPromptTypes.join(" | ")} */`,
    `  /* These values are derived from the CanDo for this level + key use:`,
    `     wh_answer       → answer a Wh-question in 1–5 words (Recount L1)`,
    `     yes_no          → yes/no with a brief reason (Argue L1)`,
    `     descriptive     → describe an object, person, or place (Explain L1–2)`,
    `     narrative       → retell events with sequence (Recount L2–3)`,
    `     explanatory     → explain how/why (Explain L3–6)`,
    `     summary         → paraphrase/summarize content ideas (Recount L4)`,
    `     argumentative   → state and defend a position with evidence (Argue L2–6)`,
    `     extended_report → organized oral report from multiple sources (Recount L5–6) */`,
    ``,
    `  "response_length": "${responseLength}",`,
    `  /* Echo this value exactly — do not change it */`,
    `  /* Interpretation:`,
    `     word_or_phrase  (L1) → 1–5 words, yes/no, or single Wh-answer`,
    `     1_2_sentences   (L2) → short modeled sentences`,
    `     3_5_sentences   (L3) → multi-sentence with transitions and tenses`,
    `     paragraph       (L4) → one developed paragraph with hedging/connectors`,
    `     extended        (L5–6) → sustained oral discourse */`,
    ``,
    `  "scaffold": ${scaffoldShape},`,
    ``,
    `  "target_seconds": { "min": ${targetSeconds.min}, "max": ${targetSeconds.max} },`,
    `  /* Echo these values — do not modify */`,
    ``,
    `  "scoring_dimensions": ${JSON.stringify(scoringDims)},`,
    `  /* Valid scoring dimensions at Level ${level}:`,
    `       L1–2: pronunciation, vocabulary`,
    `       L3–4: pronunciation, fluency, vocabulary, grammar`,
    `       L5–6: fluency, vocabulary, grammar, discourse_organization, content_accuracy */`,
    ``,
    `  "exit_tip": "<one coaching sentence for exit_proximity mode — or null for standard mode>"`,
    `}`,
    ``,
    `SCHEMA ENFORCEMENT RULES`,
    `• prompt_type MUST be one of: ${allowedPromptTypes.join(", ")}.`,
    `• response_length MUST be echoed as-is: "${responseLength}".`,
    `• scoring_dimensions MUST be drawn from the Level ${level} list above.`,
    scaffoldRequired
      ? `• scaffold MUST be a non-null sentence frame at Level ${level}.`
      : `• scaffold MUST be null at Level ${level} — do not provide a frame.`,
    `• target_seconds MUST echo the input values: { "min": ${targetSeconds.min}, "max": ${targetSeconds.max} }.`,
  ].join("\n");
}

// ── Base system prompt (static) ───────────────────────────────────────────────

const BASE_SYSTEM = `You are a WIDA ACCESS Speaking prompt generator for Grade 6–8 ELL students.
Your task: write one speaking prompt with scaffolding and scoring guidance calibrated to the student's WIDA ELP level and targeted Can Do descriptor.

${BASE_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PER-CALL INPUT FIELDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
assessment              → assessment type (WIDA ACCESS, TELPAS, etc.)
level                   → WIDA ELP level (1–6)
grade_band              → student's grade band
mode                    → "standard" | "exit_proximity" (exit = push harder toward next level)
topic                   → pre-selected speaking topic — design the prompt around this
can_do                  → key_use (Recount|Explain|Argue), action (WIDA framing), items (sub-skills at this level)
complexity_instruction  → vocabulary, sentence complexity, scaffolding level — follow exactly
discourse_type          → oral production length and register expected at this level
scaffold_required       → true = sentence frame required; false = scaffold must be null
response_length         → expected output size — see OUTPUT SCHEMA for interpretation
allowed_prompt_types    → MUST pick exactly one value for prompt_type — see OUTPUT SCHEMA
target_seconds          → speaking duration: { min, max } in seconds — echo in output

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SKILL TARGET
   Pick the item from can_do.items that best fits the topic and key_use.
   Write action + item as can_do_descriptor.

2. PROMPT TYPE
   Choose exactly one value from allowed_prompt_types (listed in OUTPUT SCHEMA).
   The prompt type constrains how the student will respond.

3. PROMPT
   Write one clear, engaging speaking task on the given topic.
   Size the task precisely to response_length — do not ask for more language than the student can produce.
   Match discourse_type exactly. topic is the subject; the prompt is the task text students see.

4. SCAFFOLD
   If scaffold_required is true (see OUTPUT SCHEMA): write a sentence frame that opens the response
   and models the chosen prompt_type's discourse pattern.
     Narrative     → "First, I… Then… Finally…"
     Descriptive   → "I see… / It looks like…"
     Explanatory   → "One reason is… because…"
     Argumentative → "I believe… because…"
     Wh-answer     → echo the question stem: "The setting is…"
   If scaffold_required is false: scaffold must be null.

5. SCORING DIMENSIONS — choose from the Level-specific list in OUTPUT SCHEMA.

6. EXIT TIP — one coaching sentence for exit_proximity mode; null for standard.

RULES
- mode = "exit_proximity" → push complexity toward the next level's discourse type.
- Do NOT set scaffold to null when scaffold_required is true.
- Do NOT provide a scaffold when scaffold_required is false.`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpeakingContent {
  canDoDescriptor: string;
  prompt: string;
  /** One of: wh_answer | yes_no | descriptive | narrative | explanatory | summary | argumentative | extended_report */
  promptType: string;
  /** One of: word_or_phrase | 1_2_sentences | 3_5_sentences | paragraph | extended */
  responseLength: string;
  scaffold: string | null;
  targetSeconds: { min: number; max: number };
  scoringDimensions: string[];
  exitTip: string | null;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

const FALLBACK_SPEAKING: SpeakingContent = {
  canDoDescriptor: "Explain by describing situations from modeled sentences",
  prompt: "Describe what you did to prepare for a school project. What steps did you take?",
  promptType: "explanatory",
  responseLength: "3_5_sentences",
  scaffold: "First, I... Then, I... Finally, I...",
  targetSeconds: { min: 30, max: 60 },
  scoringDimensions: ["pronunciation", "fluency", "vocabulary", "grammar"],
  exitTip: null,
};

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateSpeakingContent(params: {
  assessment: string;
  level: number;
  fractionalLevel: number;
  stepWithinLevel: number;
  complexityInstruction: string;
  discourseType: string;
  scaffoldRequired: boolean;
  responseLength: string;
  allowedPromptTypes: string[];
  targetSeconds: { min: number; max: number };
  canDo: CanDoEntry;
  topic: string;
  gradeBand: string;
  mode: "standard" | "exit_proximity";
  isTelpas?: boolean;
}): Promise<SpeakingContent> {
  // Build a level-specific output schema and combine with the static base prompt
  const schemaSection = buildSpeakingOutputSchema({
    level:              params.level,
    allowedPromptTypes: params.allowedPromptTypes,
    responseLength:     params.responseLength,
    scaffoldRequired:   params.scaffoldRequired,
    targetSeconds:      params.targetSeconds,
  });
  const systemPrompt = `${BASE_SYSTEM}\n\n${schemaSection}`;

  const userPrompt = JSON.stringify({
    domain:                 "speaking",
    assessment:             params.assessment,
    level:                  params.level,
    fractional_level:       params.fractionalLevel,
    step_within_level:      params.stepWithinLevel,
    grade_band:             params.gradeBand,
    mode:                   params.mode,
    topic:                  params.topic,
    can_do:                 params.canDo,
    complexity_instruction: params.complexityInstruction,
    discourse_type:         params.discourseType,
    scaffold_required:      params.scaffoldRequired,
    response_length:        params.responseLength,
    allowed_prompt_types:   params.allowedPromptTypes,
    target_seconds:         params.targetSeconds,
  });

  try {
    const result = (await callClaude(systemPrompt, userPrompt)) as {
      can_do_descriptor: string;
      prompt: string;
      prompt_type: string;
      response_length: string;
      scaffold: string | null;
      target_seconds: { min: number; max: number };
      scoring_dimensions: string[];
      exit_tip: string | null;
    };

    return {
      canDoDescriptor:   result.can_do_descriptor ?? "",
      prompt:            toDisplayText(result.prompt),
      promptType:        result.prompt_type ?? params.allowedPromptTypes[0] ?? "descriptive",
      responseLength:    result.response_length ?? params.responseLength,
      scaffold:          toDisplayTextOrNull(result.scaffold),
      targetSeconds:     params.isTelpas ? { min: 45, max: 90 } : (result.target_seconds ?? params.targetSeconds),
      scoringDimensions: result.scoring_dimensions ?? SPEAKING_SCORING_DIMENSIONS[params.level] ?? [],
      exitTip:           toDisplayTextOrNull(result.exit_tip),
    };
  } catch {
    const fallback = { ...FALLBACK_SPEAKING };
    if (params.isTelpas) fallback.targetSeconds = { min: 45, max: 90 };
    return fallback;
  }
}
