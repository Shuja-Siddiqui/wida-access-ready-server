/**
 * BASE prompt block — shared by every academic listening generator.
 *
 * Covers: WIDA scale definition and the JSON-only output rule.
 * Every subject prompt starts with this so Claude knows the scoring model.
 */

export const BASE_BLOCK = `WIDA SCALE: 1.0–6.0. Each integer level has 5 sub-steps (0–4).
complexity_instruction governs vocabulary ceiling, sentence complexity, and scaffolding at each sub-step — follow it exactly.
OUTPUT RULE: Return ONLY valid JSON. No preamble, no markdown, no code fences.`.trim();
