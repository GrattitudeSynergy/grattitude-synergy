import type {
  AppraisalLifecycleStatus,
  Employee,
  PerformScorecard,
} from '../../core/types';

// ============================================================================
// 5-STAGE APPRAISAL LIFECYCLE STATE MACHINE (lifecycleEngine.ts)
// ============================================================================
// Stages:
// 1. 'Draft'
// 2. 'Submitted to Manager'
// 3. 'Manager Review'
// 4. 'CEO Reviewed'
// 5. 'Final Evaluation Released'

export const LIFECYCLE_STAGES: AppraisalLifecycleStatus[] = [
  'Draft',
  'Submitted to Manager',
  'Manager Review',
  'CEO Reviewed',
  'Final Evaluation Released',
];

export const LifecycleEngine = {
  /**
   * Validates if an Employee can submit their scorecard from 'Draft' to 'Submitted to Manager'.
   * Requires mandatory self-review justifications on all 15 KPIs.
   */
  validateEmployeeSelfSubmission(scorecard: PerformScorecard): {
    valid: boolean;
    error?: string;
  } {
    if (scorecard.status !== 'Draft') {
      return {
        valid: false,
        error: `Scorecard is currently in "${scorecard.status}" and cannot be submitted as a Draft.`,
      };
    }

    const missingJustification = scorecard.items.find(
      (item) => !item.selfJustification || item.selfJustification.trim().length < 3
    );
    if (missingJustification) {
      return {
        valid: false,
        error: `Mandatory self-review justification is missing for KPI "${missingJustification.title}". All 15 KPIs require justification notes before submission.`,
      };
    }

    return { valid: true };
  },

  canEmployeeSubmit(actor: Employee, scorecard: PerformScorecard): boolean {
    return (
      (actor.id === scorecard.employeeId || actor.role === 'Admin') &&
      scorecard.status === 'Draft'
    );
  },

  canManagerReview(actor: Employee, scorecard: PerformScorecard): boolean {
    const isDirectManager = scorecard.reportingManagerId === actor.id;
    const hasManagerPrivilege =
      isDirectManager ||
      actor.role === 'Manager' ||
      actor.role === 'Admin' ||
      actor.role === 'CEO';
    return (
      hasManagerPrivilege &&
      (scorecard.status === 'Submitted to Manager' || scorecard.status === 'Draft')
    );
  },

  canCeoCalibrate(actor: Employee, scorecard: PerformScorecard): boolean {
    return (
      (actor.role === 'CEO' || actor.role === 'Admin') &&
      (scorecard.status === 'Manager Review' ||
        scorecard.status === 'Submitted to Manager')
    );
  },

  canFinalRelease(actor: Employee, scorecard: PerformScorecard): boolean {
    return (
      (actor.role === 'CEO' || actor.role === 'Admin') &&
      scorecard.status === 'CEO Reviewed'
    );
  },

  canAdminOverride(actor: Employee): boolean {
    return actor.role === 'Admin';
  },
};
