import type {
  ScoringFormula,
  PerformScorecardItem,
  LetterGrade,
  PerformGradeConfig,
  AppraisalLifecycleStatus,
} from '../../core/types';

// ============================================================================
// PERFORM DETERMINISTIC MATHEMATICAL SCORING ENGINE (scoringEngine.ts)
// ============================================================================
// 5 Deterministic Scoring Algorithms on a 0–100 scale:
// 1. DIRECT_PROPORTION: score = min(maxScore, (actual / target) * maxScore)
// 2. INVERSE_PROPORTION: score = max(0, min(maxScore, (1 - ((actual - target) / target)) * maxScore))
// 3. STEP_MILESTONE: Discrete milestones (0%, 25%, 50%, 75%, 100%)
// 4. SLAB_SCALE: Bracket thresholds (>=95% = 100 pts; 85-94% = 85 pts; 75-84% = 70 pts; <75% = 0 pts)
// 5. BOOLEAN_BINARY: Binary pass/fail (100% or 0%)
// Final Weighted Score: Sum(kpiScore * (kpiWeight / 100)) on a 0–100 scale.

export const MAX_SCORE = 100;

export function calculateKpiScore(
  formula: ScoringFormula,
  actual: number,
  target: number,
  maxScore: number = MAX_SCORE
): number {
  const safeActual = Number.isFinite(actual) ? actual : 0;
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 1;

  switch (formula) {
    case 'DIRECT_PROPORTION': {
      if (safeActual <= 0) return 0;
      const raw = (safeActual / safeTarget) * maxScore;
      return Math.round(Math.max(0, Math.min(maxScore, raw)) * 100) / 100;
    }

    case 'INVERSE_PROPORTION': {
      // Used for defects, server downtime, SLA breaches (lower actual is better)
      const raw = (1 - (safeActual - safeTarget) / safeTarget) * maxScore;
      return Math.round(Math.max(0, Math.min(maxScore, raw)) * 100) / 100;
    }

    case 'STEP_MILESTONE': {
      // Discrete milestones: 0%, 25%, 50%, 75%, 100%
      const ratioPct = (safeActual / safeTarget) * 100;
      if (ratioPct >= 100) return maxScore;
      if (ratioPct >= 75) return maxScore * 0.75;
      if (ratioPct >= 50) return maxScore * 0.5;
      if (ratioPct >= 25) return maxScore * 0.25;
      return 0;
    }

    case 'SLAB_SCALE': {
      // Bracket thresholds: >=95% = 100 pts; 85-94% = 85 pts; 75-84% = 70 pts; <75% = 0 pts
      // Note: if target is already a % benchmark (e.g., 90%), evaluate achievement ratio or direct pct
      const achievementPct =
        safeTarget === 100 ? safeActual : (safeActual / safeTarget) * 95;
      const effectivePct = Math.max(safeActual, achievementPct);

      if (effectivePct >= 95) return 100;
      if (effectivePct >= 85) return 85;
      if (effectivePct >= 75) return 70;
      return 0;
    }

    case 'BOOLEAN_BINARY': {
      // Binary pass/fail (100% or 0%)
      return safeActual >= 1 ? maxScore : 0;
    }

    default:
      return 0;
  }
}

/**
 * Determines which score column represents the active authoritative score
 * for an item based on the scorecard's lifecycle stage, or falls back hierarchically.
 */
export function getEffectiveItemScore(
  item: PerformScorecardItem,
  status: AppraisalLifecycleStatus
): number {
  if (
    (status === 'CEO Reviewed' || status === 'Final Evaluation Released') &&
    item.ceoScore > 0
  ) {
    return item.ceoScore;
  }
  if (
    (status === 'Manager Review' ||
      status === 'CEO Reviewed' ||
      status === 'Final Evaluation Released') &&
    item.managerScore > 0
  ) {
    return item.managerScore;
  }
  return item.selfScore;
}

/**
 * Final Weighted Score: Sum(kpiScore * (kpiWeight / 100)) on a 0–100 scale.
 */
export function calculateTotalWeightedScore(
  items: PerformScorecardItem[],
  status: AppraisalLifecycleStatus
): number {
  const sum = items.reduce((acc, item) => {
    const kpiScore = getEffectiveItemScore(item, status);
    return acc + kpiScore * (item.weightage / 100);
  }, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Letter Grade Cutoffs:
 * A+ (>= 90%), A (80–89%), B (70–79%), C (60–69%), D (< 60%)
 */
export function resolveLetterGrade(
  totalWeightedScore: number,
  gradeConfig?: PerformGradeConfig | null
): LetterGrade {
  const cutoffs = gradeConfig?.cutoffs || {
    APlus: 90,
    A: 80,
    B: 70,
    C: 60,
  };

  if (totalWeightedScore >= cutoffs.APlus) return 'A+';
  if (totalWeightedScore >= cutoffs.A) return 'A';
  if (totalWeightedScore >= cutoffs.B) return 'B';
  if (totalWeightedScore >= cutoffs.C) return 'C';
  return 'D';
}
