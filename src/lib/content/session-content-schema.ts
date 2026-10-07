/**
 * Canonical session content schema — single source of truth for:
 * • Which question / prompt types the AI may emit at each domain + level
 * • Which UI component renders each type on the frontend
 * • Required JSON fields for validation and prompt examples
 *
 * Keep in sync with repo-root shared/session-content-schema.ts (frontend @shared alias).
 */

export const SESSION_DOMAINS = ["listening", "reading", "speaking", "writing"] as const;
export type SessionDomain = (typeof SESSION_DOMAINS)[number];

/** Frontend component keys — every allowed AI type maps to one of these. */
export type SessionUiComponent =
  | "multiple_choice"
  | "image_grid"
  | "sequence"
  | "match"
  | "classify"
  | "agree_disagree"
  | "object_detect"
  | "image_object_tap"
  | "image_yes_no"
  | "speaking_recorder"
  | "writing_textarea";

export interface AiFormatGuide {
  use: string;
  note: string;
}

export interface QuestionTypeDefinition {
  type: string;
  label: string;
  ui: SessionUiComponent;
  ai: AiFormatGuide;
  /** Inclusive integer WIDA level range where this type may appear. */
  minLevel: number;
  maxLevel: number;
  /** Domains that may emit this type (listening_l12 = picture tap sessions). */
  domains: Array<SessionDomain | "listening_l12">;
  requiredFields: readonly string[];
  optionalFields: readonly string[];
}

// ── Question type registry ────────────────────────────────────────────────────

export const QUESTION_TYPE_REGISTRY: Record<string, QuestionTypeDefinition> = {
  multiple_choice: {
    type: "multiple_choice",
    label: "Multiple choice",
    ui: "multiple_choice",
    ai: {
      use: "Main idea, detail, inference, vocabulary, comparison, summary, claim/evidence",
      note: "3 options (listening) or 3–4 (reading); correct is 0-based index.",
    },
    minLevel: 1,
    maxLevel: 6,
    domains: ["listening", "reading", "listening_l12"],
    requiredFields: ["question", "options", "correct"],
    optionalFields: ["option_diagrams", "visual", "explanation"],
  },
  image_grid: {
    type: "image_grid",
    label: "Picture choices",
    ui: "image_grid",
    ai: {
      use: "Listening — pick the picture that matches what was heard",
      note: "3 image options with labels; imageUrls populated server-side.",
    },
    minLevel: 3,
    maxLevel: 6,
    domains: ["listening"],
    requiredFields: ["question", "options", "correct"],
    optionalFields: ["imageUrls", "explanation"],
  },
  sequence_ordering: {
    type: "sequence_ordering",
    label: "Put in order (listening)",
    ui: "sequence",
    ai: {
      use: "Narrate — event order; Inform — reported facts; Explain — process steps",
      note: "Interactive: items + correct_order. MC fallback: 3 order strings in options.",
    },
    minLevel: 2,
    maxLevel: 6,
    domains: ["listening"],
    requiredFields: ["question"],
    optionalFields: ["items", "correct_order", "options", "correct", "explanation"],
  },
  sequence_order: {
    type: "sequence_order",
    label: "Put in order (reading)",
    ui: "sequence",
    ai: {
      use: "Story order, fact/report order, process steps from the passage",
      note: "items (scrambled) + correct_order where correct_order[i] = destination of items[i].",
    },
    minLevel: 2,
    maxLevel: 6,
    domains: ["reading"],
    requiredFields: ["question", "items", "correct_order"],
    optionalFields: ["explanation"],
  },
  pair_matching: {
    type: "pair_matching",
    label: "Match pairs (listening)",
    ui: "match",
    ai: {
      use: "Match terms to definitions, speakers to views, causes to effects",
      note: "Interactive: left_items + right_items + correct_pairs. MC fallback: matched strings in options.",
    },
    minLevel: 3,
    maxLevel: 6,
    domains: ["listening"],
    requiredFields: ["question"],
    optionalFields: ["left_items", "right_items", "correct_pairs", "options", "correct", "explanation"],
  },
  match_columns: {
    type: "match_columns",
    label: "Match columns (reading)",
    ui: "match",
    ai: {
      use: "Word–picture match (L1), cause–effect, term–definition from passage",
      note: "left + right (scrambled) + correct_pairs as [left_idx, right_idx].",
    },
    minLevel: 1,
    maxLevel: 6,
    domains: ["reading"],
    requiredFields: ["question", "left", "right", "correct_pairs"],
    optionalFields: ["explanation"],
  },
  agree_disagree: {
    type: "agree_disagree",
    label: "Agree or disagree",
    ui: "agree_disagree",
    ai: {
      use: "Evaluate a claim from audio/passage; distinguish claim from opinion",
      note: "MC: 3 options with Agree/Disagree reasons. Legacy: answer field agree|disagree.",
    },
    minLevel: 1,
    maxLevel: 6,
    domains: ["listening", "reading"],
    requiredFields: ["question"],
    optionalFields: ["options", "correct", "answer", "visual", "explanation"],
  },
  category_sorting: {
    type: "category_sorting",
    label: "Sort into categories (listening)",
    ui: "classify",
    ai: {
      use: "Classify spoken items — cause vs effect, pros vs cons, step types",
      note: "Interactive: categories + items + correct_categories. MC fallback: grouping strings in options.",
    },
    minLevel: 3,
    maxLevel: 6,
    domains: ["listening"],
    requiredFields: ["question"],
    optionalFields: ["categories", "items", "correct_categories", "options", "correct", "explanation"],
  },
  classify: {
    type: "classify",
    label: "Sort statements (reading)",
    ui: "classify",
    ai: {
      use: "Fact vs opinion, true vs false, pro vs con from the passage",
      note: "categories + items + correct (array: category index per item).",
    },
    minLevel: 1,
    maxLevel: 6,
    domains: ["reading"],
    requiredFields: ["question", "categories", "items", "correct"],
    optionalFields: ["explanation"],
  },
  object_detect: {
    type: "object_detect",
    label: "Tap object in scene",
    ui: "object_detect",
    ai: {
      use: "Teacher-provided scene — student taps the correct region",
      note: "Requires imageSrc + options labels; detection runs client-side.",
    },
    minLevel: 3,
    maxLevel: 6,
    domains: ["listening", "reading"],
    requiredFields: ["question", "imageSrc", "options"],
    optionalFields: ["correct", "explanation"],
  },
  image_object_tap: {
    type: "image_object_tap",
    label: "Tap object in picture",
    ui: "image_object_tap",
    ai: {
      use: "L1–2 listening — tap the object named in the audio",
      note: "targetLabel must match DINO tags; options for text-choice fallback.",
    },
    minLevel: 0,
    maxLevel: 2,
    domains: ["listening_l12"],
    requiredFields: ["question", "targetLabel"],
    optionalFields: ["options", "correct", "explanation"],
  },
  image_yes_no: {
    type: "image_yes_no",
    label: "Agree or disagree (picture)",
    ui: "image_yes_no",
    ai: {
      use: "L1–2 listening — agree/disagree with a statement about the photo",
      note: "correctAnswer is agree or disagree.",
    },
    minLevel: 0,
    maxLevel: 2,
    domains: ["listening_l12"],
    requiredFields: ["question", "correctAnswer", "targetLabel"],
    optionalFields: ["explanation"],
  },
  image_explain_mc: {
    type: "image_explain_mc",
    label: "Picture multiple choice",
    ui: "multiple_choice",
    ai: {
      use: "L1–2 when box tap is unavailable — text choices about the photo",
      note: "Same shape as multiple_choice with targetLabel for coaching.",
    },
    minLevel: 0,
    maxLevel: 2,
    domains: ["listening_l12"],
    requiredFields: ["question", "options", "correct", "targetLabel"],
    optionalFields: ["explanation"],
  },
};

/** Speaking prompt shapes — one UI (recorder); AI varies discourse type. */
export const SPEAKING_PROMPT_TYPES: Record<string, AiFormatGuide> = {
  wh_answer: { use: "Answer a who/what/where question about the prompt", note: "L1 — short phrase." },
  descriptive: { use: "Describe people, objects, or scenes", note: "Concrete details from prompt." },
  yes_no: { use: "Respond yes/no with brief support", note: "L1 only." },
  narrative: { use: "Retell or narrate events in order", note: "Story structure." },
  argumentative: { use: "State and support an opinion", note: "Claim + reason." },
  explanatory: { use: "Explain how or why something works", note: "Process or cause." },
  summary: { use: "Summarize main points", note: "Concise recap." },
  extended_report: { use: "Extended oral report with sections", note: "L5–6 only." },
};

/** Writing task shapes — one UI (textarea); AI varies genre. */
export const WRITING_TASK_TYPES: Record<string, AiFormatGuide> = {
  sentence_completion: { use: "Complete frames or short sentences", note: "L1–2 with scaffolds." },
  paragraph: { use: "Single focused paragraph", note: "L2–3." },
  informational_essay: { use: "Inform/explain in organized paragraphs", note: "L4–5." },
  analytical_essay: { use: "Analyze evidence from sources", note: "L5–6 Argue/Explain." },
  opinion_piece: { use: "State and defend a position", note: "Argue key use." },
};

// ── Level availability (AI pick list) ───────────────────────────────────────

export function listeningAvailableFormats(level: number): string[] {
  const lv = Math.floor(level);
  if (lv <= 1) return ["multiple_choice", "agree_disagree"];
  if (lv === 2) return ["multiple_choice", "agree_disagree", "sequence_ordering"];
  return [
    "multiple_choice",
    "pair_matching",
    "sequence_ordering",
    "agree_disagree",
    "category_sorting",
  ];
}

export function listeningL12AvailableFormats(): string[] {
  return ["image_object_tap", "image_yes_no", "image_explain_mc"];
}

export function readingAvailableFormats(level: number): string[] {
  const lv = Math.floor(level);
  if (lv <= 1) return ["multiple_choice", "match_columns", "classify"];
  if (lv === 2) return ["multiple_choice", "sequence_order", "classify"];
  return ["multiple_choice", "sequence_order", "match_columns", "classify"];
}

export function speakingAvailablePromptTypes(level: number): string[] {
  const lv = Math.floor(level);
  if (lv <= 1) return ["wh_answer", "descriptive", "yes_no"];
  if (lv === 2) return ["narrative", "descriptive", "argumentative", "wh_answer"];
  if (lv <= 4) return ["narrative", "descriptive", "explanatory", "argumentative", "summary"];
  return ["narrative", "descriptive", "explanatory", "argumentative", "summary", "extended_report"];
}

export function formatsForDomain(
  domain: SessionDomain | "listening_l12",
  level: number,
): string[] {
  if (domain === "listening_l12") return listeningL12AvailableFormats();
  if (domain === "listening") return listeningAvailableFormats(level);
  if (domain === "reading") return readingAvailableFormats(level);
  if (domain === "speaking") return speakingAvailablePromptTypes(level);
  return Object.keys(WRITING_TASK_TYPES);
}

// ── Shape detection (MC fallback vs interactive) ────────────────────────────

function hasOptions(q: Record<string, unknown>): boolean {
  return Array.isArray(q.options) && q.options.length > 0;
}

function hasSequenceShape(q: Record<string, unknown>): boolean {
  return (
    Array.isArray(q.items)
    && q.items.length > 0
    && Array.isArray(q.correct_order)
    && q.correct_order.length > 0
  );
}

function hasMatchShape(q: Record<string, unknown>): boolean {
  const left = (q.left ?? q.left_items) as unknown;
  const right = (q.right ?? q.right_items) as unknown;
  return (
    Array.isArray(left) && left.length > 0
    && Array.isArray(right) && right.length > 0
    && Array.isArray(q.correct_pairs)
  );
}

function hasClassifyShape(q: Record<string, unknown>): boolean {
  const correct = q.correct_categories ?? q.correct;
  return (
    Array.isArray(q.categories)
    && q.categories.length > 0
    && Array.isArray(q.items)
    && q.items.length > 0
    && Array.isArray(correct)
  );
}

/**
 * Resolve which UI component should render a question payload.
 * Unknown types with options fall back to multiple_choice.
 */
export function resolveQuestionUi(
  domain: SessionDomain | "listening_l12",
  q: Record<string, unknown>,
): SessionUiComponent | "unsupported" {
  const type = String(q.type ?? "");

  if (type === "image_grid") return "image_grid";
  if (type === "object_detect" && q.imageSrc) return "object_detect";
  if (type === "image_object_tap") return "image_object_tap";
  if (type === "image_yes_no") return "image_yes_no";

  if (type === "sequence_order" || type === "sequence_ordering") {
    return hasSequenceShape(q) ? "sequence" : hasOptions(q) ? "multiple_choice" : "unsupported";
  }

  if (type === "match_columns" || type === "pair_matching") {
    return hasMatchShape(q) ? "match" : hasOptions(q) ? "multiple_choice" : "unsupported";
  }

  if (type === "classify" || type === "category_sorting") {
    return hasClassifyShape(q) ? "classify" : hasOptions(q) ? "multiple_choice" : "unsupported";
  }

  if (type === "agree_disagree") {
    if (hasOptions(q)) return "multiple_choice";
    if (q.answer === "agree" || q.answer === "disagree") return "agree_disagree";
    return "multiple_choice";
  }

  if (type === "multiple_choice" || type === "image_explain_mc" || hasOptions(q)) {
    return "multiple_choice";
  }

  const def = QUESTION_TYPE_REGISTRY[type];
  if (def && formatsForDomain(domain === "listening_l12" ? "listening_l12" : domain, 6).includes(type)) {
    return def.ui;
  }

  return "unsupported";
}

export function isAllowedQuestionType(
  domain: SessionDomain | "listening_l12",
  level: number,
  type: string,
): boolean {
  return formatsForDomain(domain, level).includes(type);
}

export function getAiFormatGuide(type: string): AiFormatGuide | undefined {
  return QUESTION_TYPE_REGISTRY[type]?.ai ?? SPEAKING_PROMPT_TYPES[type] ?? WRITING_TASK_TYPES[type];
}

/** Descriptions for Claude output-schema blocks (listening / reading generators). */
export function aiFormatDescriptionsFor(types: string[]): Record<string, AiFormatGuide> {
  const out: Record<string, AiFormatGuide> = {};
  for (const t of types) {
    const guide = getAiFormatGuide(t);
    if (guide) out[t] = guide;
  }
  return out;
}

export function validateQuestionShape(q: Record<string, unknown>): {
  valid: boolean;
  ui: SessionUiComponent | "unsupported";
  missingFields: string[];
} {
  const type = String(q.type ?? "");
  const def = QUESTION_TYPE_REGISTRY[type];
  const ui = resolveQuestionUi("listening", q);

  if (ui === "unsupported") {
    return { valid: false, ui, missingFields: ["type"] };
  }

  if (!def) {
    return { valid: true, ui, missingFields: [] };
  }

  const missing: string[] = [];
  for (const field of def.requiredFields) {
    if (field === "correct" && ui === "sequence" && hasSequenceShape(q)) continue;
    if (field === "options" && ui !== "multiple_choice" && ui !== "image_grid") continue;
    if (field === "items" && ui === "multiple_choice") continue;
    if (field === "correct_order" && ui === "multiple_choice") continue;
    if (field === "left" && hasMatchShape(q) === false && ui === "multiple_choice") continue;
    if (q[field] === undefined || q[field] === null || q[field] === "") {
      missing.push(field);
    }
  }

  return { valid: missing.length === 0, ui, missingFields: missing };
}
