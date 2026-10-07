/**
 * Single assembly point for domain content-generation system prompts.
 *
 * Stack: kernel → framework contract → domain×band slice → optional layers → schema
 */

import { buildSystemPrompt, blockIf } from "../compose";
import { ACADEMIC_IMAGE_ANCHOR_EXAMPLES } from "../academic-image-anchor";
import { OPTIONAL_LINE_VISUALS_BLOCK } from "../optional-line-visuals";
import { frameworkPromptSlice } from "../../standards";
import { CONTENT_KERNEL } from "./kernel";
import { LISTENING_CONTENT_1_2 } from "./listening-1-2";
import { LISTENING_CONTENT_3_6 } from "./listening-3-6";
import { READING_CONTENT_1_2 } from "./reading-1-2";
import { READING_CONTENT_3_6 } from "./reading-3-6";
import { SPEAKING_CONTENT_1_2 } from "./speaking-1-2";
import { SPEAKING_CONTENT_3_6 } from "./speaking-3-6";
import { buildWritingContentSlice } from "./writing";
import { contentBand, type ContentBand, type ContentDomain } from "./router";

const DOMAIN_BAND_SLICES: Record<Exclude<ContentDomain, "writing">, Record<ContentBand, string>> = {
  listening: { "1_2": LISTENING_CONTENT_1_2, "3_6": LISTENING_CONTENT_3_6 },
  reading:   { "1_2": READING_CONTENT_1_2,   "3_6": READING_CONTENT_3_6 },
  speaking:  { "1_2": SPEAKING_CONTENT_1_2,  "3_6": SPEAKING_CONTENT_3_6 },
};

export interface ContentSystemPromptOptions {
  academicContentLayer?: string;
  hasLibraryImage?: boolean;
  hasLibraryCandidates?: boolean;
  /** Extra blocks before schema (e.g. LISTENING_L12_MODE_BLOCK). */
  extraBlocks?: string[];
  /** Default: true for listening/reading/speaking; writing L1–2 only. */
  includeLineVisuals?: boolean;
}

export function buildContentSystemPrompt(
  domain: ContentDomain,
  level: number,
  schemaSection: string,
  opts: ContentSystemPromptOptions = {},
): string {
  const band = contentBand(level);
  const domainSlice = domain === "writing"
    ? buildWritingContentSlice(opts.hasLibraryCandidates ?? false)
    : DOMAIN_BAND_SLICES[domain][band];

  const includeLineVisuals = opts.includeLineVisuals
    ?? (domain === "writing" ? level <= 2 : true);

  return buildSystemPrompt(
    CONTENT_KERNEL,
    frameworkPromptSlice("2020"),
    domainSlice,
    blockIf(includeLineVisuals, OPTIONAL_LINE_VISUALS_BLOCK),
    opts.academicContentLayer ?? "",
    blockIf(!!opts.hasLibraryImage, ACADEMIC_IMAGE_ANCHOR_EXAMPLES),
    ...(opts.extraBlocks ?? []),
    schemaSection,
  );
}
