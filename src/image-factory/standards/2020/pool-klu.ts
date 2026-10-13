/**
 * Key Language Use resolution for Image Factory pools (Table 3-11 expressive cells).
 * Image Factory only — not shared with session content engines.
 */

import type { ImageFactorySubject } from "../../../../db/schema/image_generation";
import {
  hasExpressiveCell,
  type AcademicSubjectId,
  type KeyLanguageUse,
} from "./select";

const KEY_USE_ROTATION: KeyLanguageUse[] = ["Narrate", "Inform", "Explain", "Argue"];

export function imageFactoryAcademicSubject(
  subject: ImageFactorySubject,
): AcademicSubjectId {
  return subject as AcademicSubjectId;
}

export function expressiveKeyUsesForImagePool(
  subject: AcademicSubjectId,
): KeyLanguageUse[] {
  return KEY_USE_ROTATION.filter((k) => hasExpressiveCell(subject, k));
}

export function resolveImageFactoryKeyUse(
  subject: ImageFactorySubject,
  keyUse?: string | null,
): KeyLanguageUse {
  const requested = (keyUse?.trim() || "Inform") as KeyLanguageUse;
  const academic = imageFactoryAcademicSubject(subject);
  if (hasExpressiveCell(academic, requested)) return requested;
  return expressiveKeyUsesForImagePool(academic)[0] ?? "Explain";
}
