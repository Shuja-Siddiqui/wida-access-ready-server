/**
 * ACCESS Ready — Listening Content Agent
 *
 * Calls the Anthropic Agent (agent_01Vm63bRTg6tGE3b2nGZsa7e) which holds the
 * lean system prompt.  At call-time we pass:
 *   • the generate_listening_question tool definition
 *   • level, levelName, keyUse, canDo descriptors, format, outputSchema, topic
 *
 * The agent owns the system prompt; we own the runtime parameters.
 */

import { config } from "../config/index";
import { logger } from "../config/logger";
import canDoData from "../data/canDo.json";
import { findKeyUseBlock } from "./listeningContentEngine";

// ── Config ────────────────────────────────────────────────────────────────────

export const LISTENING_AGENT_ID = "agent_01Vm63bRTg6tGE3b2nGZsa7e";

const LEVEL_NAMES: Record<number, string> = {
  1: "Entering",
  2: "Emerging",
  3: "Developing",
  4: "Expanding",
  5: "Bridging",
  6: "Reaching",
};

// ── canDo lookup ──────────────────────────────────────────────────────────────

export function getListeningCanDo(level: number, keyUse: string): string[] {
  const levelEntry = (canDoData as any).levels.find(
    (l: any) => l.elpLevel === `ELP Level ${level}`,
  );
  if (!levelEntry) return [];

  const listeningDomain = levelEntry.domains.find(
    (d: any) => d.domain === "LISTENING",
  );
  if (!listeningDomain) return [];

  const keyUseEntry = findKeyUseBlock(listeningDomain.keyUses, keyUse);
  return keyUseEntry?.canDo ?? [];
}

// ── Output schemas per format (passed as runtime parameter) ──────────────────

export const OUTPUT_SCHEMAS: Record<string, string> = {
  listening_mc: JSON.stringify({
    type: "listening_mc",
    audioScript: "string — 3-6 spoken sentences",
    audioUrl: null,
    question: "string",
    options: ["A text", "B text", "C text"],
    correctIndex: 0,
  }),
  listening_tf: JSON.stringify({
    type: "listening_tf",
    audioScript: "string — 2-3 spoken sentences",
    audioUrl: null,
    statement: "string",
    answer: "true | false | agree | disagree",
    mode: "true_false | agree_disagree",
  }),
  listening_image_grid: JSON.stringify({
    type: "listening_image_grid",
    audioScript: "string — 1-2 spoken sentences",
    audioUrl: null,
    instruction: "string",
    images: [
      { url: "https://upload.wikimedia.org/... (real URL)", label: "string" },
      { url: "https://upload.wikimedia.org/... (real URL)", label: "string" },
      { url: "https://upload.wikimedia.org/... (real URL)", label: "string" },
    ],
    correctIndex: 0,
  }),
  listening_sequence: JSON.stringify({
    type: "listening_sequence",
    audioScript: "string — narration with first/then/after/finally",
    audioUrl: null,
    instruction: "string",
    items: ["event text", "event text", "event text", "event text"],
    correctOrder: [1, 0, 3, 2],
  }),
  listening_match: JSON.stringify({
    type: "listening_match",
    audioScript: "string — 3-5 sentences establishing pairs",
    audioUrl: null,
    instruction: "string",
    leftItems: ["text", "text", "text"],
    rightItems: ["text", "text", "text"],
    correctPairs: [1, 2, 0],
  }),
  listening_classify: JSON.stringify({
    type: "listening_classify",
    audioScript: "string — passage that names items per category",
    audioUrl: null,
    instruction: "string",
    categories: ["Category A", "Category B"],
    items: ["item", "item", "item", "item", "item", "item"],
    correctCategories: [0, 1, 0, 1, 0, 1],
  }),
};

// ── Tool definition (injected at runtime) ─────────────────────────────────────

const TOOL_DEFINITION = {
  name: "generate_listening_question",
  description:
    "Generate one WIDA-aligned listening practice question for a given proficiency level, key use, and format.",
  input_schema: {
    type: "object",
    required: ["level", "levelName", "keyUse", "canDo", "format", "outputSchema"],
    properties: {
      level: { type: "integer", description: "WIDA ELP level 1–6" },
      levelName: {
        type: "string",
        description: "Human name for the level",
        enum: ["Entering", "Emerging", "Developing", "Expanding", "Bridging", "Reaching"],
      },
      keyUse: {
        type: "string",
        enum: ["Narrate", "Inform", "Explain", "Argue", "Recount"],
        description: "WIDA key use the question targets",
      },
      canDo: {
        type: "array",
        items: { type: "string" },
        description:
          "The exact Can Do descriptor strings for this level + key use. The question must directly assess one of these skills.",
      },
      format: {
        type: "string",
        enum: [
          "listening_mc",
          "listening_tf",
          "listening_image_grid",
          "listening_sequence",
          "listening_match",
          "listening_classify",
        ],
        description: "The question format to generate",
      },
      outputSchema: {
        type: "string",
        description:
          "The exact JSON schema the output must match — injected at call time so the model always returns the right shape.",
      },
      topic: {
        type: "string",
        description: "Optional content area hint (e.g. 'ecosystems', 'fractions')",
      },
    },
  },
};

// ── Agent caller ──────────────────────────────────────────────────────────────

export interface AgentQuestionParams {
  level: number;
  keyUse: "Narrate" | "Inform" | "Explain" | "Argue" | "Recount";
  format: string;
  topic?: string;
}

export type AnyGeneratedQuestion = Record<string, unknown>;

/**
 * Resolve the correct API base URL.
 * Prefers the Replit AI Integrations proxy; falls back to Anthropic directly.
 */
function resolveBaseUrl(): string {
  return (config.anthropic.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
}

/**
 * Call the Anthropic agent via the /v1/agents/{id}/invocations endpoint.
 * Falls back to /v1/messages with our lean system prompt if the agent endpoint
 * returns 404 (e.g. proxy doesn't route agent paths).
 */
async function callListeningAgent(
  level: number,
  levelName: string,
  keyUse: string,
  canDo: string[],
  format: string,
  outputSchema: string,
  topic?: string,
): Promise<AnyGeneratedQuestion> {
  const baseUrl = resolveBaseUrl();
  const apiKey = config.anthropic.apiKey;

  const toolInput = { level, levelName, keyUse, canDo, format, outputSchema, ...(topic ? { topic } : {}) };

  const userMessage = `Generate a listening question using the generate_listening_question tool with these parameters: ${JSON.stringify(toolInput)}`;

  // ── Try agent endpoint first ──────────────────────────────────────────────
  try {
    const agentUrl = `${baseUrl}/v1/agents/${LISTENING_AGENT_ID}/invocations`;

    const agentRes = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "agents-2025-01-01",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: userMessage }],
        tools: [TOOL_DEFINITION],
        tool_choice: { type: "any" },
      }),
    });

    if (agentRes.ok) {
      const data = await agentRes.json() as Record<string, unknown>;
      return extractToolResult(data);
    }

    const errText = await agentRes.text();
    logger.warn({ status: agentRes.status, body: errText }, "Agent endpoint failed, falling back to messages API");
  } catch (err) {
    logger.warn({ err }, "Agent endpoint unreachable, falling back to messages API");
  }

  // ── Fallback: standard messages API with lean system prompt ───────────────
  const LEAN_SYSTEM = `You are the content engine for ACCESS Ready, an adaptive ELL exit-prep app for K-12 students by Fugees Family, Inc.

Your job: generate a single LISTENING practice question as a JSON object.

RULES
- Output the tool's JSON arguments only. No prose, no markdown, no explanation.
- audioUrl is always null — the app synthesizes speech from audioScript using TTS.
- audioScript must be written in natural spoken English (contractions OK, conversational register).
- Scale vocabulary and sentence complexity to the proficiency level: Level 1-2 short simple sentences, Level 3-4 compound sentences with academic vocab, Level 5-6 complex clauses and discipline-specific vocabulary.
- Topics rotate across: science, social studies, math, language arts, daily school life.
- MC distractors must be plausible — never obviously wrong.
- Levels 3-6: never repeat the correct answer word-for-word in the audioScript (test inference, not recall).
- The question must directly assess the Can Do skill(s) provided.`;

  const fallbackRes = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.anthropic.model,
      max_tokens: 1200,
      system: LEAN_SYSTEM,
      tools: [TOOL_DEFINITION],
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!fallbackRes.ok) {
    const errText = await fallbackRes.text();
    throw new Error(`Anthropic messages API error ${fallbackRes.status}: ${errText}`);
  }

  const data = await fallbackRes.json() as Record<string, unknown>;
  return extractToolResult(data);
}

/**
 * Extract the tool_use input block from either an agent invocation response
 * or a standard messages response.
 */
function extractToolResult(data: Record<string, unknown>): AnyGeneratedQuestion {
  // Standard messages response: { content: [...] }
  const content = (data.content ?? data.output) as unknown[];
  if (Array.isArray(content)) {
    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === "tool_use" && b.name === "generate_listening_question") {
        return b.input as AnyGeneratedQuestion;
      }
      // Agent responses sometimes nest inside a message block
      if (b.type === "message" && Array.isArray(b.content)) {
        for (const inner of b.content as Record<string, unknown>[]) {
          if (inner.type === "tool_use" && inner.name === "generate_listening_question") {
            return inner.input as AnyGeneratedQuestion;
          }
        }
      }
    }
  }
  throw new Error("No tool_use block found in agent response");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a single WIDA-aligned listening question using the agent.
 */
export async function generateListeningQuestion(
  params: AgentQuestionParams,
): Promise<AnyGeneratedQuestion> {
  const levelName = LEVEL_NAMES[params.level] ?? "Developing";
  const canDo = getListeningCanDo(params.level, params.keyUse);
  const outputSchema = OUTPUT_SCHEMAS[params.format] ?? OUTPUT_SCHEMAS.listening_mc;

  const result = await callListeningAgent(
    params.level,
    levelName,
    params.keyUse,
    canDo,
    params.format,
    outputSchema,
    params.topic,
  );

  // Always ensure audioUrl is null (not undefined or missing)
  result.audioUrl = null;
  return result;
}

/**
 * Generate a full listening session (multiple questions, mixed formats).
 * Picks the best format per key use for the given level.
 */
const BEST_FORMAT: Record<number, Record<string, string>> = {
  1: { Narrate: "listening_image_grid", Inform: "listening_image_grid", Recount: "listening_image_grid", Explain: "listening_image_grid", Argue: "listening_tf"   },
  2: { Narrate: "listening_sequence",   Inform: "listening_sequence",   Recount: "listening_sequence",   Explain: "listening_classify",   Argue: "listening_mc"   },
  3: { Narrate: "listening_sequence",   Inform: "listening_mc",         Recount: "listening_sequence",   Explain: "listening_match",      Argue: "listening_mc"   },
  4: { Narrate: "listening_mc",         Inform: "listening_mc",         Recount: "listening_mc",         Explain: "listening_match",      Argue: "listening_match" },
  5: { Narrate: "listening_sequence",   Inform: "listening_mc",         Recount: "listening_sequence",   Explain: "listening_mc",         Argue: "listening_mc"   },
  6: { Narrate: "listening_mc",         Inform: "listening_mc",         Recount: "listening_mc",         Explain: "listening_mc",         Argue: "listening_mc"   },
};

export async function generateListeningSession(params: {
  level: number;
  keyUses?: ("Narrate" | "Inform" | "Explain" | "Argue" | "Recount")[];
  topic?: string;
}): Promise<AnyGeneratedQuestion[]> {
  const keyUses = params.keyUses ?? ["Narrate", "Inform", "Explain", "Argue"];
  const levelFormats = BEST_FORMAT[params.level] ?? BEST_FORMAT[3];

  const questions = await Promise.all(
    keyUses.map((keyUse) =>
      generateListeningQuestion({
        level: params.level,
        keyUse,
        format: levelFormats[keyUse] ?? "listening_mc",
        topic: params.topic,
      }),
    ),
  );

  return questions;
}
