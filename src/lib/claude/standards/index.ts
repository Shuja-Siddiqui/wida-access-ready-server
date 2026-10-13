/**
 * WIDA ELD Standards Framework — live content generation (2020 only).
 *
 * prompts/content/     Always-on: JSON schema, item types, photo rules.
 * standards/2020/      ELD Standards Framework — functions, PLDs, prompt slices.
 * standards/2016/      ARCHIVED — Can Do Descriptors pack; not imported here.
 *
 * System prompt (buildContentSystemPrompt) =
 *   kernel
 * + standards/2020/prompts/shared
 * + prompts/content/{domain}-{band}
 * + optional layers (line visuals, academic subject, library photo)
 * + output schema
 */
import type { FrameworkBand, FrameworkDomain, WidaFrameworkVersion } from "./types";
export type { FrameworkBand, FrameworkDomain, WidaFrameworkVersion } from "./types";
import { FRAMEWORK_2020_PROMPT_SLICE, framework2020DomainSlice } from "./2020";

/** Active pack — all live generate/feedback paths use 2020. */
export const WIDA_FRAMEWORK_VERSION: WidaFrameworkVersion = "2020";

export function frameworkPromptSlice(
  version: WidaFrameworkVersion = WIDA_FRAMEWORK_VERSION,
): string {
  assertLiveFrameworkVersion(version);
  return FRAMEWORK_2020_PROMPT_SLICE;
}

export function frameworkDomainSlice(
  domain: FrameworkDomain,
  band: FrameworkBand,
  version: WidaFrameworkVersion = WIDA_FRAMEWORK_VERSION,
  opts?: { hasLibraryCandidates?: boolean },
): string {
  assertLiveFrameworkVersion(version);
  return framework2020DomainSlice(domain, band, opts);
}

function assertLiveFrameworkVersion(version: WidaFrameworkVersion): void {
  if (version !== "2020") {
    throw new Error(
      `WIDA framework version "${version}" is not supported. Live paths use 2020 only.`,
    );
  }
}

export { FRAMEWORK_2020_PROMPT_SLICE } from "./2020";
