import { buildSystemPrompt } from "../compose";
import { CONTENT_KERNEL } from "./kernel";
import { LISTENING_CONTENT_1_2 } from "./listening-1-2";
import { LISTENING_CONTENT_3_6 } from "./listening-3-6";
import { READING_CONTENT_1_2 } from "./reading-1-2";
import { READING_CONTENT_3_6 } from "./reading-3-6";
import { SPEAKING_CONTENT_1_2 } from "./speaking-1-2";
import { SPEAKING_CONTENT_3_6 } from "./speaking-3-6";
import { WRITING_CONTENT_1_2 } from "./writing-1-2";
import { WRITING_CONTENT_3_6 } from "./writing-3-6";

export type ContentDomain = "listening" | "reading" | "speaking" | "writing";
export type ContentBand = "1_2" | "3_6";

const SLICES: Record<ContentDomain, Record<ContentBand, string>> = {
  listening: { "1_2": LISTENING_CONTENT_1_2, "3_6": LISTENING_CONTENT_3_6 },
  reading: { "1_2": READING_CONTENT_1_2, "3_6": READING_CONTENT_3_6 },
  speaking: { "1_2": SPEAKING_CONTENT_1_2, "3_6": SPEAKING_CONTENT_3_6 },
  writing: { "1_2": WRITING_CONTENT_1_2, "3_6": WRITING_CONTENT_3_6 },
};

export function contentBand(level: number): ContentBand {
  return level <= 2 ? "1_2" : "3_6";
}

/** Kernel + exactly one domain×band slice. Pass extra blocks (schema, subject) separately. */
export function contentGenPrompt(domain: ContentDomain, level: number): string {
  const band = contentBand(level);
  return buildSystemPrompt(CONTENT_KERNEL, SLICES[domain][band]);
}
