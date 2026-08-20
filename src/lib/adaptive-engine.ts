// Adaptive pathway engine: gap calculation, domain ranking, level advancement, growth rate

import { Assessment, Domain, getAssessmentConfig, normalizeScore } from "./assessments";

export interface DomainGap {
  domain: Domain;
  currentLevel: number; // native scale
  exitThreshold: number; // native scale
  gap: number; // native scale gap
  normalizedGap: number; // 0.0-1.0
  normalizedLevel: number; // 0.0-1.0
  daysSinceLastPracticed?: number;
  atExit: boolean;
}

export interface DomainPriority extends DomainGap {
  priority: number;
  allocatedMinutes: number;
  recommendedFirst: boolean;
}

export function calculateGaps(
  levels: Record<Domain, number>, // native scale current levels
  thresholds: Record<Domain, number>, // native scale thresholds
  assessment: Assessment,
  daysSince?: Record<Domain, number>
): DomainGap[] {
  const domains: Domain[] = ["listening", "speaking", "reading", "writing"];
  return domains.map((domain) => {
    const current = levels[domain];
    const threshold = thresholds[domain];
    const gap = Math.max(0, threshold - current);
    const normalizedCurrent = normalizeScore(current, assessment);
    const normalizedThreshold = normalizeScore(threshold, assessment);
    const normalizedGap = Math.max(0, normalizedThreshold - normalizedCurrent);
    return {
      domain,
      currentLevel: current,
      exitThreshold: threshold,
      gap,
      normalizedGap,
      normalizedLevel: normalizedCurrent,
      daysSinceLastPracticed: daysSince?.[domain],
      atExit: gap <= 0,
    };
  });
}

export function rankDomains(gaps: DomainGap[]): DomainPriority[] {
  const ranked = gaps.map((g) => {
    let priority = g.normalizedGap;

    // Neglect prevention: boost if hasn't been practiced in 3+ days
    if ((g.daysSinceLastPracticed ?? 0) > 3) {
      priority += 0.1;
    }

    // Exit proximity boost: strong boost if very close to exit
    if (g.normalizedGap > 0 && g.normalizedGap <= 0.5) {
      priority += 0.2;
    }

    // Already at exit: deprioritize
    if (g.atExit) {
      priority = -1;
    }

    return {
      ...g,
      priority,
      allocatedMinutes: 5, // default, recalculated below
      recommendedFirst: false,
    };
  });

  ranked.sort((a, b) => b.priority - a.priority);

  // Mark top as recommended first
  if (ranked.length > 0 && ranked[0].priority >= 0) {
    ranked[0].recommendedFirst = true;
  }

  return ranked;
}

export function allocateTime(gaps: DomainGap[], totalMinutes = 20): Record<Domain, number> {
  const totalGap = gaps.reduce((sum, g) => sum + g.normalizedGap, 0);

  if (totalGap === 0) {
    const alloc: Record<Domain, number> = { listening: 5, speaking: 5, reading: 5, writing: 5 };
    return alloc;
  }

  const allocation: Record<Domain, number> = { listening: 3, speaking: 3, reading: 3, writing: 3 };
  const domains: Domain[] = ["listening", "speaking", "reading", "writing"];

  let remaining = totalMinutes;
  const minimums: Record<Domain, number> = { listening: 3, speaking: 3, reading: 3, writing: 3 };
  remaining -= 12; // 4 domains * 3 min minimum

  domains.forEach((domain) => {
    const gap = gaps.find((g) => g.domain === domain);
    if (!gap || gap.atExit) return;
    const weight = gap.normalizedGap / totalGap;
    const extra = Math.round(weight * remaining);
    allocation[domain] = minimums[domain] + extra;
  });

  // Normalize to exactly totalMinutes
  const currentTotal = Object.values(allocation).reduce((sum, v) => sum + v, 0);
  const diff = totalMinutes - currentTotal;
  if (diff !== 0) {
    // Add/subtract from highest priority (first non-exit domain)
    const firstActive = domains.find((d) => {
      const g = gaps.find((g) => g.domain === d);
      return g && !g.atExit;
    });
    if (firstActive) allocation[firstActive] += diff;
  }

  return allocation;
}

// Level advancement rules
export interface LevelUpdateResult {
  newLevel: number;
  changed: boolean;
  delta: number;
  reason: "advance" | "drop" | "exit" | "floor";
  newConsecutivePass: number;
  newConsecutiveFail: number;
  atExit: boolean;
}

const STEP = 0.2;
const PASS_THRESHOLD_PCT = 70; // ≥ 70% on a session = success

/**
 * Simple ±0.2 model:
 *   score ≥ 70%  →  +0.2, capped at exitThreshold (6.0 for WIDA)
 *   score < 70%  →  −0.2, floored at scale minimum (1.0)
 */
export function calculateLevelUpdate(
  currentLevel: number,
  exitThreshold: number,
  scorePct: number,
  _consecutivePass: number,
  _consecutiveFail: number,
  assessment: Assessment
): LevelUpdateResult {
  const config = getAssessmentConfig(assessment);
  const minLevel = config.scale.min;

  const passed = scorePct >= PASS_THRESHOLD_PCT;
  let newLevel: number;
  let reason: LevelUpdateResult["reason"];

  if (passed) {
    newLevel = parseFloat(Math.min(currentLevel + STEP, exitThreshold).toFixed(2));
    reason   = newLevel >= exitThreshold ? "exit" : "advance";
  } else {
    newLevel = parseFloat(Math.max(currentLevel - STEP, minLevel).toFixed(2));
    reason   = newLevel <= minLevel ? "floor" : "drop";
  }

  return {
    newLevel,
    changed: newLevel !== currentLevel,
    delta: parseFloat((newLevel - currentLevel).toFixed(2)),
    reason,
    newConsecutivePass: 0,
    newConsecutiveFail: 0,
    atExit: newLevel >= exitThreshold,
  };
}

// Stall detection: 8 sessions without level movement
export function detectStall(sessions: { levelStart: number; levelEnd: number | null }[]): boolean {
  if (sessions.length < 8) return false;
  const recent = sessions.slice(-8);
  const first = recent[0].levelStart;
  const last = recent[recent.length - 1].levelEnd ?? recent[recent.length - 1].levelStart;
  return last - first <= 0;
}

// Growth rate calculation
export interface GrowthRate {
  perSession: number | null;
  weekly: number | null;
  sessionsPerWeek: number | null;
  isStalled: boolean;
  stalledSessionCount: number;
}

export function calculateGrowthRate(
  sessions: { levelStart: number; levelEnd: number | null; createdAt: Date }[],
  currentLevel: number
): GrowthRate {
  const completed = sessions.filter((s) => s.levelEnd !== null);
  
  const stalledCount = Math.max(0, sessions.length - (sessions.findIndex((s) => {
    const levelEnd = s.levelEnd ?? s.levelStart;
    return levelEnd > s.levelStart;
  }) ?? 0));

  if (completed.length < 3) {
    return {
      perSession: null,
      weekly: null,
      sessionsPerWeek: null,
      isStalled: detectStall(sessions.map(s => ({ levelStart: s.levelStart, levelEnd: s.levelEnd }))),
      stalledSessionCount: stalledCount,
    };
  }

  const recent = completed.slice(-10);
  const gains = recent.map((s) => (s.levelEnd ?? s.levelStart) - s.levelStart);
  const avgGain = gains.reduce((sum, g) => sum + g, 0) / gains.length;

  // Sessions per week based on last 14 days
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentCount = sessions.filter((s) => s.createdAt >= twoWeeksAgo).length;
  const sessionsPerWeek = recentCount / 2;

  const isStalled = detectStall(sessions.map(s => ({ levelStart: s.levelStart, levelEnd: s.levelEnd })));

  return {
    perSession: avgGain,
    weekly: sessionsPerWeek > 0 ? avgGain * sessionsPerWeek : null,
    sessionsPerWeek,
    isStalled,
    stalledSessionCount: stalledCount,
  };
}

export function projectExitDate(
  gap: number,
  growthRate: GrowthRate
): { weeksToExit: number | null; projectedDate: string | null; status: string } {
  if (gap <= 0) return { weeksToExit: 0, projectedDate: new Date().toISOString(), status: "at_exit" };
  if (!growthRate.weekly || growthRate.weekly <= 0) {
    return {
      weeksToExit: null,
      projectedDate: null,
      status: growthRate.isStalled ? "stalled" : "insufficient_data",
    };
  }

  const weeksToExit = gap / growthRate.weekly;
  const projectedDate = new Date(Date.now() + weeksToExit * 7 * 24 * 60 * 60 * 1000).toISOString();

  return {
    weeksToExit,
    projectedDate,
    status: "on_track",
  };
}

// Generate nudge message for pathway
export function generateNudgeMessage(
  domains: DomainPriority[],
  studentName?: string
): string {
  const topDomain = domains.find((d) => !d.atExit);
  if (!topDomain) return "All domains are at exit. Great work!";

  const name = studentName ? `${studentName}, ` : "";
  const domainLabels: Record<Domain, string> = {
    listening: "Listening",
    speaking: "Speaking",
    reading: "Reading",
    writing: "Writing",
  };

  if (topDomain.normalizedGap <= 0.2) {
    return `${name}you're close to exit in ${domainLabels[topDomain.domain]}. Start here today.`;
  }

  return `${name}${domainLabels[topDomain.domain]} has the biggest gap. Let's work on that first.`;
}
