/**
 * Subject-first KLU rotation filtered by valid 2020 Standard × KLU cells.
 */
import {
  hasExpressiveCell,
  hasInterpretiveCell,
  type AcademicSubjectId,
  type FrameworkMode,
} from "../claude/standards/2020";
import {
  ACADEMIC_SUBJECT_ROTATION,
  KEY_USE_ROTATION,
  lastKeyUseForSubject,
  nextAcademicSubject,
  nextKeyUseForSubject,
  subjectKluCycleComplete,
  type AcademicSessionRef,
  type AcademicSubject,
  type KeyUse,
} from "./listeningContentEngine";

export function interpretiveKeyUsesForSubject(subject: AcademicSubject): KeyUse[] {
  return KEY_USE_ROTATION.filter((k) => hasInterpretiveCell(subject as AcademicSubjectId, k));
}

export function expressiveKeyUsesForSubject(subject: AcademicSubject): KeyUse[] {
  return KEY_USE_ROTATION.filter((k) => hasExpressiveCell(subject as AcademicSubjectId, k));
}

export function keyUsesForSubject(subject: AcademicSubject, mode: FrameworkMode): KeyUse[] {
  return mode === "interpretive"
    ? interpretiveKeyUsesForSubject(subject)
    : expressiveKeyUsesForSubject(subject);
}

function kluPool(mode: FrameworkMode) {
  return (subject: AcademicSubject) => keyUsesForSubject(subject, mode);
}

/** Subject-first rotation for a given communication mode. */
export function nextFrameworkAcademicSubject(
  recent: AcademicSessionRef[],
  isRetry: boolean,
  lastSessionSubject: AcademicSubject | null,
  mode: FrameworkMode,
): AcademicSubject {
  return nextAcademicSubject(recent, isRetry, lastSessionSubject, kluPool(mode));
}

/** Next KLU for this subject — uses that subject's history. */
export function nextFrameworkKeyUseForSubject(
  recent: AcademicSessionRef[],
  subject: AcademicSubject,
  isRetry: boolean,
  retryKeyUse: string | null,
  mode: FrameworkMode,
): KeyUse {
  return nextKeyUseForSubject(recent, subject, isRetry, retryKeyUse, kluPool(mode));
}

export function lastFrameworkKeyUseForSubject(
  recent: AcademicSessionRef[],
  subject: AcademicSubject,
): string | null {
  return lastKeyUseForSubject(recent, subject);
}

export function frameworkSubjectKluCycleComplete(
  subject: AcademicSubject,
  lastKeyUseForSubjectValue: string | null,
  mode: FrameworkMode,
): boolean {
  return subjectKluCycleComplete(kluPool(mode)(subject), lastKeyUseForSubjectValue);
}

export { ACADEMIC_SUBJECT_ROTATION };
