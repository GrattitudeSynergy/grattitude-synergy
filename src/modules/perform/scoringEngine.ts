import type {
  TargetValueType,
  PerformScorecardItem,
  LetterGrade,
  PerformGradeConfig,
  AppraisalLifecycleStatus,
} from '../../core/types';

// ============================================================================
// PERFORM SCORING & TARGET VALUE FORMATTING ENGINE (scoringEngine.ts)
// ============================================================================
// Final Weighted Score: Sum(kpiScore * (kpiWeight / 100)) on a 0–100 scale.

export const MAX_SCORE = 100;

export const TARGET_VALUE_TYPES: TargetValueType[] = [
  'Text',
  'Number',
  'Percentage',
];

/**
 * Resolves the Target Value Data Type ('Text' | 'Number' | 'Percentage')
 * with automatic inference for legacy KPIs that don't yet have `targetType` stored.
 */
export function resolveTargetValueType(item: {
  targetType?: TargetValueType;
  target?: number | string;
  unit?: string;
}): TargetValueType {
  if (
    item.targetType === 'Text' ||
    item.targetType === 'Number' ||
    item.targetType === 'Percentage'
  ) {
    return item.targetType;
  }
  if (item.unit?.trim() === '%') {
    return 'Percentage';
  }
  if (
    typeof item.target === 'string' &&
    item.target.trim() !== '' &&
    Number.isNaN(Number(item.target))
  ) {
    return 'Text';
  }
  return 'Number';
}

/**
 * Formats a KPI target value according to its TargetValueType and visibility flag.
 * Returns an empty string when target visibility is disabled or target is empty.
 */
export function formatTargetDisplay(
  target?: number | string,
  targetType?: TargetValueType,
  unit?: string,
  showTarget: boolean = true
): string {
  if (showTarget === false) return '';
  if (target === undefined || target === null || String(target).trim() === '') {
    return '';
  }
  const type = resolveTargetValueType({ targetType, target, unit });
  if (type === 'Percentage') {
    const clean = String(target).replace(/%\s*$/, '').trim();
    return `${clean}%`;
  }
  if (type === 'Text') {
    return String(target);
  }
  // Number
  const cleanUnit = (unit || '').trim();
  if (cleanUnit && cleanUnit !== '%') {
    return `${target} ${cleanUnit}`;
  }
  return String(target);
}

/**
 * Computes a 0–100 KPI score from actual achievement and optional numeric/percentage target.
 * When target is omitted, non-numeric (Text), or <= 0, evaluates actual directly on 0–100 scale.
 */
export function calculateKpiScore(
  actual: number,
  target?: number | string,
  targetType?: TargetValueType,
  maxScore: number = MAX_SCORE
): number {
  const safeActual = Number.isFinite(actual) ? actual : 0;
  if (
    targetType === 'Text' ||
    target === undefined ||
    target === null ||
    String(target).trim() === ''
  ) {
    return Math.round(Math.max(0, Math.min(maxScore, safeActual)) * 100) / 100;
  }

  const numTarget = Number(target);
  if (!Number.isFinite(numTarget) || numTarget <= 0) {
    return Math.round(Math.max(0, Math.min(maxScore, safeActual)) * 100) / 100;
  }

  if (safeActual <= 0) return 0;
  const raw = (safeActual / numTarget) * maxScore;
  return Math.round(Math.max(0, Math.min(maxScore, raw)) * 100) / 100;
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
