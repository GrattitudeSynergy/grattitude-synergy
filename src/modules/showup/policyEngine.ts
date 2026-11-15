import type {
  Employee,
  ShowupPolicyConfig,
  AttendanceStatus,
  ShowupLeaveRequest,
  ShowupLeaveBalance,
  LeaveTransactionEntry,
} from '../../core/types';

// ============================================================================
// SHOW UP HRMS POLICY, INDIVIDUAL SHIFT, LEAVE ACCRUAL & PAYROLL ENGINE
// ============================================================================
// 1. Standard shift: 09:30 to 18:30 (9.0 hours), with individual employee shift
//    override support (e.g. Aditi #GSL014 -> 11:00 to 20:00).
// 2. Grace period: Until 10:05 AM for standard 09:30 shift (35 minutes relative
//    to shift start time for employees with custom shifts, e.g. 11:35 AM for 11:00 AM shift).
// 3. Late-mark rule: Every 3 late marks trigger an automated deduction of 0.5 CSL.
// 4. Leave Policy:
//    - Earned Leave (EL): 1.5 EL credited every month. Year-end carry-forward is
//      50% of unused EL balance, capped at a maximum of 9 days (excess lapses).
//    - Casual/Sick Leave (CSL): 1.0 CSL credited every month. No carry-forward
//      at year-end (unused CSL lapses). Every 3 late marks deduct 0.5 CSL.
//    - Additional Leaves (AL): Maternity, Paternity, Bereavement, Comp Off, etc.
//    - Work From Home (WFH): Max 4 WFH days per employee per calendar month.
// ============================================================================

export function parseTimeMinutes(timeStr: string): number {
  const parts = (timeStr || '09:30').split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

export function formatMinutesToHHMM(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime12Hour(timeStr: string): string {
  const [h, m] = (timeStr || '09:30').split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${period}`;
}

export const PolicyEngine = {
  /**
   * Resolves the effective shift timings and grace cutoff for a specific employee on a given date.
   * Respects individual shift assignments (when effectiveDate <= targetDate) and falls back to company policy.
   */
  getEffectiveShiftForEmployee(
    employee?: Employee | null,
    policy?: ShowupPolicyConfig,
    targetDateStr?: string
  ): {
    shiftStart: string;
    shiftEnd: string;
    graceCutoff: string;
    standardHours: number;
    isCustomShift: boolean;
    effectiveDate?: string;
  } {
    const defaultStart = policy?.shiftStart || '09:30';
    const defaultEnd = policy?.shiftEnd || '18:30';
    // Enforce 10:05 AM grace period for standard 09:30 shift (35 min grace window)
    const rawPolicyCutoff =
      policy?.graceCutoff === '10:00' ? '10:05' : policy?.graceCutoff || '10:05';

    const defaultStartMins = parseTimeMinutes(defaultStart);
    const defaultCutoffMins = parseTimeMinutes(rawPolicyCutoff);
    const defaultGraceWindowMins = Math.max(
      5,
      defaultCutoffMins - defaultStartMins
    );

    const dateCheck = targetDateStr || new Date().toISOString().slice(0, 10);
    const customShift = employee?.shiftConfig;

    if (
      customShift &&
      customShift.isCustomShift &&
      customShift.shiftStart &&
      customShift.shiftEnd &&
      (!customShift.effectiveDate || customShift.effectiveDate <= dateCheck)
    ) {
      const startMins = parseTimeMinutes(customShift.shiftStart);
      const endMins = parseTimeMinutes(customShift.shiftEnd);
      const graceMins = customShift.graceMinutes ?? defaultGraceWindowMins;
      const computedCutoff = formatMinutesToHHMM(startMins + graceMins);
      const durationMins =
        endMins >= startMins ? endMins - startMins : 1440 - startMins + endMins;
      const standardHours = Math.round((durationMins / 60) * 10) / 10;

      return {
        shiftStart: customShift.shiftStart,
        shiftEnd: customShift.shiftEnd,
        graceCutoff: computedCutoff,
        standardHours: standardHours > 0 ? standardHours : 9.0,
        isCustomShift: true,
        effectiveDate: customShift.effectiveDate,
      };
    }

    const stdStartMins = parseTimeMinutes(defaultStart);
    const stdEndMins = parseTimeMinutes(defaultEnd);
    const stdDuration =
      stdEndMins >= stdStartMins
        ? stdEndMins - stdStartMins
        : 1440 - stdStartMins + stdEndMins;

    return {
      shiftStart: defaultStart,
      shiftEnd: defaultEnd,
      graceCutoff: rawPolicyCutoff,
      standardHours: policy?.standardHours || Math.round((stdDuration / 60) * 10) / 10 || 9.0,
      isCustomShift: false,
    };
  },

  /**
   * Evaluates whether a clock-in timestamp or HH:mm string exceeds the grace cutoff.
   * - Standard shift (09:30): Grace cutoff is 10:05 AM (check-in at or before 10:05 AM is NOT late).
   * - Custom employee shift (e.g. Aditi 11:00 AM): Grace cutoff is relative to their shift start (11:35 AM).
   */
  isPunchInLate(
    timestampOrTime: string,
    policy: ShowupPolicyConfig,
    employee?: Employee | null,
    targetDateStr?: string
  ): boolean {
    const effectiveShift = this.getEffectiveShiftForEmployee(
      employee,
      policy,
      targetDateStr
    );
    const [graceH, graceM] = (effectiveShift.graceCutoff || '10:05')
      .split(':')
      .map(Number);
    const graceTotalMinutes = graceH * 60 + graceM;

    let punchHours = 9;
    let punchMinutes = 30;

    if (timestampOrTime.includes('T')) {
      const d = new Date(timestampOrTime);
      punchHours = d.getHours();
      punchMinutes = d.getMinutes();
    } else if (timestampOrTime.includes(':')) {
      const parts = timestampOrTime.split(':').map(Number);
      punchHours = parts[0] || 0;
      punchMinutes = parts[1] || 0;
    }

    const punchTotalMinutes = punchHours * 60 + punchMinutes;
    return punchTotalMinutes > graceTotalMinutes;
  },

  /**
   * Evaluates final attendance status based on total work hours and late flag.
   */
  evaluateAttendanceStatus(
    totalHours: number,
    isLate: boolean,
    policy: ShowupPolicyConfig
  ): { status: AttendanceStatus; isHalfDay: boolean } {
    const minHalf = policy.halfDayMinHours ?? 4.5;
    const minFull = policy.fullDayMinHours ?? 7.0;

    if (totalHours < minHalf) {
      return { status: 'Absent', isHalfDay: false };
    }
    if (totalHours < minFull) {
      return { status: 'Half-Day', isHalfDay: true };
    }
    return {
      status: isLate ? 'Late' : 'Present',
      isHalfDay: false,
    };
  },

  /**
   * Calculates automated CSL leave deduction from accumulated late marks:
   * Every 3 late marks result in a deduction of 0.5 day from the employee's CSL balance.
   */
  calculateLateLeaveDeduction(
    lateMarksCount: number,
    policy: ShowupPolicyConfig
  ): number {
    const marksPerDeduction = policy.lateMarksPerDeduction || 3;
    const deductionPerCycle = policy.lateDeductionDays || 0.5;
    const cycles = Math.floor(lateMarksCount / marksPerDeduction);
    return cycles * deductionPerCycle;
  },

  /**
   * Calculates Earned Leave (EL) year-end carry-forward and lapse:
   * Maximum carry-forward is 50% of the eligible unused EL balance, capped at 9 days.
   * Any unused EL exceeding the permitted carry-forward limit lapses at the end of the year.
   */
  calculateElYearEndCarryForward(unusedElBalance: number): {
    carriedForward: number;
    lapsed: number;
  } {
    const safeUnused = Math.max(0, Number(unusedElBalance) || 0);
    const fiftyPercent = Math.round(safeUnused * 0.5 * 100) / 100;
    const carriedForward = Math.min(9, fiftyPercent);
    const lapsed = Math.max(0, Math.round((safeUnused - carriedForward) * 100) / 100);
    return { carriedForward, lapsed };
  },

  /**
   * Computes an employee's live structured EL and CSL summary from their ShowupLeaveBalance record
   * and approved leave requests, ensuring Opening Balances + Monthly Credits (1.5 EL / 1.0 CSL)
   * - Used - Late Mark Deductions are accurately reflected without duplication.
   */
  computeEmployeeLeaveSummary(
    empId: string,
    balanceDoc: ShowupLeaveBalance | null | undefined,
    approvedRequests: ShowupLeaveRequest[]
  ) {
    const empApproved = approvedRequests.filter(
      (r) => r.employeeId === empId && r.status === 'Approved'
    );

    const elUsedFromRequests = empApproved
      .filter((r) => r.leaveType === 'EL' || r.section === 'EL')
      .reduce((sum, r) => sum + (r.days || 0), 0);

    const cslUsedFromRequests = empApproved
      .filter(
        (r) =>
          r.leaveType === 'CSL' ||
          r.leaveType === 'CL' ||
          r.leaveType === 'SL' ||
          r.section === 'CSL'
      )
      .reduce((sum, r) => sum + (r.days || 0), 0);

    const txList: LeaveTransactionEntry[] = balanceDoc?.transactions || [];

    const elOpening =
      balanceDoc?.elOpeningBalance ??
      txList
        .filter(
          (t) => t.section === 'EL' && t.transactionType === 'OPENING_BALANCE'
        )
        .reduce((s, t) => s + t.amount, 0);

    const elMonthlyCredits =
      balanceDoc?.elMonthlyCredits ??
      (txList.some(
        (t) => t.section === 'EL' && t.transactionType === 'MONTHLY_CREDIT'
      )
        ? txList
            .filter(
              (t) => t.section === 'EL' && t.transactionType === 'MONTHLY_CREDIT'
            )
            .reduce((s, t) => s + t.amount, 0)
        : 1.5);

    const elCarriedForward = balanceDoc?.elCarriedForward ?? 0;
    const elLapsed = balanceDoc?.elLapsedAtYearEnd ?? 0;
    const elTotalEntitled =
      Math.round((elOpening + elMonthlyCredits + elCarriedForward) * 100) / 100;
    const elAvailable = Math.max(
      0,
      Math.round((elTotalEntitled - elUsedFromRequests - elLapsed) * 100) / 100
    );

    // Project year-end carry-forward (50% of unused EL, max 9 days)
    const elCarryProjection = this.calculateElYearEndCarryForward(elAvailable);

    const cslOpening =
      balanceDoc?.cslOpeningBalance ??
      txList
        .filter(
          (t) => t.section === 'CSL' && t.transactionType === 'OPENING_BALANCE'
        )
        .reduce((s, t) => s + t.amount, 0);

    const cslMonthlyCredits =
      balanceDoc?.cslMonthlyCredits ??
      (txList.some(
        (t) => t.section === 'CSL' && t.transactionType === 'MONTHLY_CREDIT'
      )
        ? txList
            .filter(
              (t) =>
                t.section === 'CSL' && t.transactionType === 'MONTHLY_CREDIT'
            )
            .reduce((s, t) => s + t.amount, 0)
        : 1.0);

    const lateMarksCount = balanceDoc?.lateMarksCount || 0;
    const cslLateDeductions =
      Math.floor(lateMarksCount / 3) * 0.5;
    const cslLapsed = balanceDoc?.cslLapsedAtYearEnd ?? 0;

    const cslTotalEntitled =
      Math.round((cslOpening + cslMonthlyCredits) * 100) / 100;
    const cslAvailable = Math.max(
      0,
      Math.round(
        (cslTotalEntitled - cslUsedFromRequests - cslLateDeductions - cslLapsed) *
          100
      ) / 100
    );

    return {
      el: {
        opening: elOpening,
        monthlyCredits: elMonthlyCredits,
        carriedForward: elCarriedForward,
        used: elUsedFromRequests,
        lapsed: elLapsed,
        available: elAvailable,
        projectedCarryForward: elCarryProjection.carriedForward,
        projectedLapse: elCarryProjection.lapsed,
      },
      csl: {
        opening: cslOpening,
        monthlyCredits: cslMonthlyCredits,
        used: cslUsedFromRequests,
        lateMarksCount,
        lateMarkDeductions: cslLateDeductions,
        lapsed: cslLapsed,
        available: cslAvailable,
      },
    };
  },

  /**
   * Policy validation for leave applications.
   */
  validateLeavePolicy(
    leaveType: string,
    startDate: string,
    policy: ShowupPolicyConfig
  ): { valid: boolean; error?: string } {
    if (leaveType === 'EL') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const diffMs = start.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const requiredDays = policy.elAdvanceNoticeDays ?? 5;

      if (diffDays < requiredDays) {
        return {
          valid: false,
          error: `HRMS Policy Violation: Earned Leave (EL) requires at least ${requiredDays} days advance notice (selected start date is ${diffDays} day(s) away).`,
        };
      }
    }
    return { valid: true };
  },

  /**
   * Manager Collision Detector:
   * When approving a leave, detects and alerts if another direct report has already booked overlapping dates.
   */
  detectLeaveCollisions(
    targetRequest: ShowupLeaveRequest,
    allRequests: ShowupLeaveRequest[]
  ): ShowupLeaveRequest[] {
    const tStart = new Date(targetRequest.startDate).getTime();
    const tEnd = new Date(targetRequest.endDate).getTime();

    return allRequests.filter((req) => {
      if (req.id === targetRequest.id) return false;
      if (req.employeeId === targetRequest.employeeId) return false;
      if (req.reportingManagerId !== targetRequest.reportingManagerId) return false;
      if (req.status === 'Rejected') return false;

      const rStart = new Date(req.startDate).getTime();
      const rEnd = new Date(req.endDate).getTime();
      return tStart <= rEnd && tEnd >= rStart;
    });
  },

  /**
   * Statutory Indian CTC Breakdown Calculator
   */
  calculateIndianCtcStructure(annualCtc: number) {
    const monthlyGross = Math.round(annualCtc / 12);
    const basic = Math.round(monthlyGross * 0.5);
    const hra = Math.round(basic * 0.5);
    const conveyance = 1600;
    const medical = 1250;
    const specialAllowance = Math.max(
      0,
      monthlyGross - (basic + hra + conveyance + medical)
    );

    const employeePf = Math.min(1800, Math.round(basic * 0.12));
    const employerPf = employeePf;
    const professionalTax = 200;

    let annualTax = 0;
    if (annualCtc > 1500000) {
      annualTax = (annualCtc - 1500000) * 0.2 + 112500;
    } else if (annualCtc > 1000000) {
      annualTax = (annualCtc - 1000000) * 0.15 + 37500;
    } else if (annualCtc > 700000) {
      annualTax = (annualCtc - 700000) * 0.1;
    }
    const tdsMonthly = Math.round(annualTax / 12);

    return {
      annualCtc,
      monthlyGross,
      basic,
      hra,
      conveyance,
      medical,
      specialAllowance,
      employeePf,
      employerPf,
      professionalTax,
      tdsMonthly,
    };
  },

  /**
   * Indian Currency Number-to-Words Generator (Crores, Lakhs, Thousands)
   */
  numberToIndianWords(amount: number): string {
    const num = Math.max(0, Math.round(amount));
    if (num === 0) return 'Zero Rupees Only';

    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];
    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];

    const twoDigits = (n: number): string => {
      if (n < 20) return ones[n];
      const t = Math.floor(n / 10);
      const o = n % 10;
      return `${tens[t]}${o ? ' ' + ones[o] : ''}`;
    };

    const threeDigits = (n: number): string => {
      const h = Math.floor(n / 100);
      const rem = n % 100;
      let res = '';
      if (h > 0) res += `${ones[h]} Hundred`;
      if (rem > 0) res += `${res ? ' and ' : ''}${twoDigits(rem)}`;
      return res;
    };

    let n = num;
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const remainder = n;

    const parts: string[] = [];
    if (crore > 0) parts.push(`${twoDigits(crore)} Crore`);
    if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
    if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
    if (remainder > 0) parts.push(threeDigits(remainder));

    return `Rupees ${parts.join(' ')} Only`;
  },
};
