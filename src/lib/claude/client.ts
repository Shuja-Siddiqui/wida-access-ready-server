/**
 * Shared Claude client, base prompt, and JSON parsing utilities.
 * Everything in this file is imported by the domain-specific generators.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../../config/logger";
import { config } from "../../config/index";

// ── Singleton client ──────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!_client) {
    const { baseUrl, apiKey } = config.anthropic;
    _client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
  }
  return _client;
}

// ── Shared base prompt ────────────────────────────────────────────────────────

/**
 * Legacy shared block for non-routed callers (object-detect, etc.).
 * Content generation uses CONTENT_KERNEL + one domain×band slice instead.
 */
export const BASE_PROMPT = `Scale 1.0–6.0. Each level has 5 sub-steps (0–4); complexity_instruction governs vocabulary and scaffolding at each sub-step.
Return ONLY valid JSON. No preamble, no markdown, no code fences.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISUAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Do not invent photos, charts, maps, graphs, or scenes.
Do not say "look at the picture/diagram" unless a library photo is already on screen
(has_library_image = true) or you also supplied a short keyboard-mark visual.
Optional exception: a few keyboard marks (counts, plus/equals, simple outlines)
may be placed in visual / option_diagrams when they make the item easier.
If words are enough, omit marks. Spoken audio must still stay free of "as you can see".
If a topic is visual and you cannot mark it simply, describe it in prose.`.trim();

// ── Shared length / token constants ──────────────────────────────────────────

/** Passage-length targets for all WIDA levels (used by listening + academic math). */
export const PASSAGE_SENTENCE_TARGETS: Record<number, string> = {
  1: "1–3 very short sentences (~12–35 words). One idea each. Common words only. No extra background.",
  2: "1–3 short sentences (~18–45 words). Simple sentences. Do not write a paragraph.",
  3: "3–4 sentences (~80–120 words): one short, focused paragraph. Simple, familiar vocabulary.",
  4: "5–7 sentences (~130–180 words): one developed paragraph with a clear main idea. Moderate Tier-2 vocabulary.",
  5: "8–10 sentences (~200–260 words): an extended paragraph or two short paragraphs. Higher-register academic vocabulary, some inference required.",
  6: "11–14 sentences (~300–400 words): two or more developed paragraphs with supporting detail, nuanced vocabulary, and complex sentence structures.",
};

/** Question count scales with WIDA level for listening sessions. */
export const LEVEL_QUESTION_COUNT: Record<number, number> = { 1: 2, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };

/** Claude token budget scales with WIDA level. */
export const LEVEL_MAX_TOKENS: Record<number, number> = { 1: 1200, 2: 1200, 3: 1500, 4: 2000, 5: 2500, 6: 3000 };

export function academicSessionScale(level: number) {
  const clampedLevel = Math.min(Math.max(Math.floor(level), 1), 6);
  return {
    clampedLevel,
    questionCount: LEVEL_QUESTION_COUNT[clampedLevel] ?? 2,
    passageSentenceTarget: PASSAGE_SENTENCE_TARGETS[clampedLevel] ?? PASSAGE_SENTENCE_TARGETS[1],
    maxTokens: LEVEL_MAX_TOKENS[clampedLevel] ?? 1200,
  };
}

// ── Display-text coercion ─────────────────────────────────────────────────────

/**
 * Claude occasionally returns a structured object instead of a plain string
 * for prompt/scaffold-style fields. Coerce to string so React never receives
 * a raw object where it expects text.
 */
export function toDisplayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidate = obj.text ?? obj.prompt ?? obj.content ?? obj.description;
    if (typeof candidate === "string") return candidate;
    const stringValues = Object.values(obj).filter((v): v is string => typeof v === "string");
    if (stringValues.length > 0) return stringValues.join(" ");
  }
  return String(value);
}

export function toDisplayTextOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = toDisplayText(value);
  return text || null;
}

/** Keep the first N sentences so L1–2 audio stays short even if the model overwrites. */
export function limitSentences(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const parts = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!parts || parts.length <= max) return trimmed;
  return parts.slice(0, max).join(" ").replace(/\s+/g, " ").trim();
}

export function sentenceCount(text: string): number {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return 0;
  const parts = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return parts?.filter((p) => p.trim()).length ?? 0;
}

// ── Claude API wrapper ────────────────────────────────────────────────────────

/**
 * Calls the Claude API with the given system and user prompts.
 * Always parses the response as JSON.
 * Throws on API error or unparseable response — callers handle fallback.
 */
export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1200,
): Promise<unknown> {
  const claude = getClient();
  try {
    const response = await claude.messages.create({
      model: config.anthropic.model,
      max_tokens: maxTokens,
      temperature: 0.7,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    let cleaned = text
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```\s*$/, "")
      .trim();

    const fixJson = (s: string): string =>
      s
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\x00-\x1F\x7F]/g, (c) => (c === "\n" || c === "\t" ? c : " "))
        .replace(/"\s*\n\s*"/g, '", "')
        .replace(/([}\]"])\s*\n\s*([{\["])/g, "$1,$2")
        .replace(/:\s*'([^']*)'/g, ': "$1"');

    try {
      return JSON.parse(fixJson(cleaned));
    } catch {
      const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          return JSON.parse(fixJson(jsonMatch[1]));
        } catch {
          const deepCleaned = jsonMatch[1]
            .replace(/\\n/g, " ")
            .replace(/\n/g, " ")
            .replace(/\t/g, " ")
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/([}\]"])\s+([{\["])/g, "$1,$2");
          return JSON.parse(deepCleaned);
        }
      }
      throw new Error("Could not parse Claude response as JSON");
    }
  } catch (err) {
    logger.error({ err }, "Claude API error");
    throw err;
  }
}
