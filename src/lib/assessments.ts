// Assessment configurations and normalization for all 6 state assessments

export type Assessment = "WIDA" | "OELPA" | "TELPAS" | "ELPAC" | "ELPA21" | "NYSESLAT";

/** The four core language-skill domains. */
export const DOMAINS = ["listening", "speaking", "reading", "writing"] as const;
export type Domain = typeof DOMAINS[number];

/**
 * Curriculum tier — which instructional track a session belongs to.
 *   general  → everyday language / standard listening, speaking, reading, writing
 *   academic → content-area academic language (currently listening only)
 *
 * Tier is stored as a separate column in sessions and student_levels so that
 * (domain="listening", tier="general") and (domain="listening", tier="academic")
 * track independent level trajectories without conflating the two into a
 * composite domain string like "listening_academic".
 */
export const TIERS = ["general", "academic"] as const;
export type Tier = typeof TIERS[number];
export type GradeBand = "K-2" | "3-5" | "6-8" | "9-12";

export const TELPAS_LEVELS = ["Beginning", "Intermediate", "Advanced", "Advanced High"] as const;
export type TelpasLevel = typeof TELPAS_LEVELS[number];

const TELPAS_VALUES: Record<TelpasLevel, number> = {
  Beginning: 1,
  Intermediate: 2,
  Advanced: 3,
  "Advanced High": 4,
};

const NYSESLAT_LEVELS = ["Entering", "Emerging", "Transitioning", "Expanding"] as const;
const NYSESLAT_VALUES: Record<string, number> = {
  Entering: 1,
  Emerging: 2,
  Transitioning: 3,
  Expanding: 4,
};

export interface AssessmentConfig {
  scale: { min: number; max: number; type: "decimal" | "integer" | "categorical" };
  levels: Record<number, string>;
  exitModel: "composite" | "per_domain_minimum" | "multi_criteria" | "overall_pl4_plus_local";
  defaultThresholds: Record<Domain, number>; // in native scale
  normalize: (score: number) => number;
  denormalize: (normalized: number) => number;
  levelLabel: (score: number) => string;
}

export const ASSESSMENTS: Record<Assessment, AssessmentConfig> = {
  WIDA: {
    scale: { min: 1.0, max: 6.0, type: "decimal" },
    levels: { 1: "Entering", 2: "Emerging", 3: "Developing", 4: "Expanding", 5: "Bridging", 6: "Reaching" },
    exitModel: "composite",
    defaultThresholds: { listening: 6.0, speaking: 6.0, reading: 6.0, writing: 6.0 },
    normalize: (s) => Math.max(1 / 6, s / 6),
    denormalize: (n) => parseFloat((Math.max(1, n * 6)).toFixed(2)),
    levelLabel: (score) => {
      const lvl = Math.floor(score);
      const labels: Record<number, string> = { 1: "Entering", 2: "Emerging", 3: "Developing", 4: "Expanding", 5: "Bridging", 6: "Reaching" };
      return labels[Math.min(Math.max(lvl, 1), 6)] || "Entering";
    },
  },
  OELPA: {
    scale: { min: 1, max: 5, type: "integer" },
    levels: { 1: "Emerging", 2: "Emerging", 3: "Developing", 4: "Expanding", 5: "Accomplished" },
    exitModel: "per_domain_minimum",
    defaultThresholds: { listening: 4, speaking: 4, reading: 4, writing: 4 },
    normalize: (s) => (s - 1) / 4,
    denormalize: (n) => Math.round(n * 4 + 1),
    levelLabel: (score) => {
      const lvl = Math.round(score);
      const labels: Record<number, string> = { 1: "Emerging", 2: "Emerging", 3: "Developing", 4: "Expanding", 5: "Accomplished" };
      return labels[Math.min(Math.max(lvl, 1), 5)] || "Emerging";
    },
  },
  TELPAS: {
    scale: { min: 1, max: 4, type: "categorical" },
    levels: { 1: "Beginning", 2: "Intermediate", 3: "Advanced", 4: "Advanced High" },
    exitModel: "multi_criteria",
    // Advanced High for L+S, Advanced for R+W
    defaultThresholds: { listening: 4, speaking: 4, reading: 3, writing: 3 },
    normalize: (s) => (s - 1) / 3,
    denormalize: (n) => Math.round(n * 3 + 1),
    levelLabel: (score) => {
      const lvl = Math.round(score);
      const labels: Record<number, string> = { 1: "Beginning", 2: "Intermediate", 3: "Advanced", 4: "Advanced High" };
      return labels[Math.min(Math.max(lvl, 1), 4)] || "Beginning";
    },
  },
  ELPAC: {
    scale: { min: 1, max: 4, type: "integer" },
    levels: { 1: "PL1 Emerging", 2: "PL2 Emerging", 3: "PL3 Expanding", 4: "PL4 Bridging" },
    exitModel: "overall_pl4_plus_local",
    defaultThresholds: { listening: 4, speaking: 4, reading: 4, writing: 4 },
    normalize: (s) => (s - 1) / 3,
    denormalize: (n) => Math.round(n * 3 + 1),
    levelLabel: (score) => {
      const lvl = Math.round(score);
      const labels: Record<number, string> = { 1: "PL1 Emerging", 2: "PL2 Emerging", 3: "PL3 Expanding", 4: "PL4 Bridging" };
      return labels[Math.min(Math.max(lvl, 1), 4)] || "PL1 Emerging";
    },
  },
  ELPA21: {
    scale: { min: 1, max: 5, type: "integer" },
    levels: { 1: "Level 1", 2: "Level 2", 3: "Level 3", 4: "Level 4", 5: "Level 5" },
    exitModel: "per_domain_minimum",
    defaultThresholds: { listening: 4, speaking: 4, reading: 4, writing: 4 },
    normalize: (s) => (s - 1) / 4,
    denormalize: (n) => Math.round(n * 4 + 1),
    levelLabel: (score) => {
      const lvl = Math.round(score);
      return `Level ${Math.min(Math.max(lvl, 1), 5)}`;
    },
  },
  NYSESLAT: {
    scale: { min: 1, max: 4, type: "integer" },
    levels: { 1: "Entering", 2: "Emerging", 3: "Transitioning", 4: "Expanding" },
    exitModel: "per_domain_minimum",
    defaultThresholds: { listening: 4, speaking: 4, reading: 4, writing: 4 },
    normalize: (s) => (s - 1) / 3,
    denormalize: (n) => Math.round(n * 3 + 1),
    levelLabel: (score) => {
      const lvl = Math.round(score);
      const labels: Record<number, string> = { 1: "Entering", 2: "Emerging", 3: "Transitioning", 4: "Expanding" };
      return labels[Math.min(Math.max(lvl, 1), 4)] || "Entering";
    },
  },
};

export function telpasToNumeric(level: TelpasLevel): number {
  return TELPAS_VALUES[level] || 1;
}

export function numericToTelpas(val: number): TelpasLevel {
  const lvl = Math.round(val);
  const map: Record<number, TelpasLevel> = { 1: "Beginning", 2: "Intermediate", 3: "Advanced", 4: "Advanced High" };
  return map[Math.min(Math.max(lvl, 1), 4)] || "Beginning";
}

export function nyseslatToNumeric(level: string): number {
  return NYSESLAT_VALUES[level] || 1;
}

export function getAssessmentConfig(assessment: Assessment): AssessmentConfig {
  return ASSESSMENTS[assessment];
}

// Normalize any native score to 0.0-1.0
export function normalizeScore(score: number, assessment: Assessment): number {
  const config = ASSESSMENTS[assessment];
  return config.normalize(score);
}

// Denormalize 0.0-1.0 to native scale
export function denormalizeScore(normalized: number, assessment: Assessment): number {
  const config = ASSESSMENTS[assessment];
  return config.denormalize(normalized);
}

// Get exit threshold in native scale for a domain
export function getExitThreshold(assessment: Assessment, domain: Domain): number {
  return ASSESSMENTS[assessment].defaultThresholds[domain];
}

/** @deprecated Use Tier instead — kept for call-sites not yet migrated. */
export type StudentTrack = Tier;

/**
 * Get exit threshold for a domain, respecting the student's track.
 *
 * WIDA:
 *   academic → 6.0 (full reclassification / "Reaching")
 *   general  → 5.0 ("Bridging" — strong everyday + school communication)
 *
 * All other assessments use their existing defaultThresholds regardless of track
 * (their scales already represent the single recognized exit point).
 */
export function getExitThresholdForTrack(
  assessment: Assessment,
  domain: Domain,
  track: StudentTrack = "academic",
): number {
  if (assessment === "WIDA" && track === "general") {
    return 5.0;
  }
  return getExitThreshold(assessment, domain);
}

// Get level label
export function getLevelLabel(score: number, assessment: Assessment): string {
  return ASSESSMENTS[assessment].levelLabel(score);
}

// Get initial in-app level for a student: official - 0.25, floor at min
export function getStartingLevel(officialScore: number, assessment: Assessment): number {
  const config = ASSESSMENTS[assessment];
  const starting = officialScore - 0.25;
  return Math.max(starting, config.scale.min);
}
