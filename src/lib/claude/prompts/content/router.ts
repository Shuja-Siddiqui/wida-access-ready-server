import { buildContentSystemPrompt } from "./system-prompt";

export type ContentDomain = "listening" | "reading" | "speaking" | "writing";
export type ContentBand = "1_2" | "3_6";

export function contentBand(level: number): ContentBand {
  return level <= 2 ? "1_2" : "3_6";
}

/** Base system prompt without output schema (e.g. image-library L1–2). */
export function contentGenPrompt(domain: ContentDomain, level: number): string {
  return buildContentSystemPrompt(domain, level, "");
}
