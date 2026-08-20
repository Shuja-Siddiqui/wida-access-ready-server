/**
 * Prompt composition utilities.
 *
 * buildSystemPrompt() assembles individual prompt blocks into a single
 * system prompt string. Blocks are joined with a double newline separator
 * so Claude reads them as logically distinct sections.
 *
 * Usage:
 *   const prompt = buildSystemPrompt(
 *     ROLE_HEADER,
 *     BASE_BLOCK,
 *     LISTENING_CORE_BLOCK,
 *     MATH_SUBJECT_BLOCK,
 *     MATH_INPUT_FIELDS,
 *     MATH_BUILD_ORDER,
 *     MATH_OUTPUT_SCHEMA,
 *   );
 */

export function buildSystemPrompt(...blocks: string[]): string {
  return blocks
    .map((b) => b.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Wraps a block conditionally — includes it only when condition is true.
 * Useful for injecting the IMAGE_ANCHOR_BLOCK only when an image is available.
 */
export function blockIf(condition: boolean, block: string): string {
  return condition ? block : "";
}
