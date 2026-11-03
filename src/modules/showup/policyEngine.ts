import type {
  ShowupPolicyConfig,
  AttendanceStatus,
  ShowupLeaveRequest,
} from '../../core/types';

// ============================================================================
// SHOW UP HRMS POLICY & STATUTORY INDIAN CTC PAYROLL ENGINE (policyEngine.ts)
// ============================================================================
// 1. Standard shift: 09:30 to 18:30 (9.0 hours).
// 2. Grace period time: 10:00 AM. Punch-ins after 10:00 AM receive an automatic `Late` mark.
// 3. Late-mark rule: 3 late marks trigger an automated deduction of 0.5 days of leave.
// 4. Half-day threshold: Work duration between 4.5 and 7.0 hours. Under 4.5 hours is marked `Absent`.
// 5. 15-day advance notice mandatory for Earned Leave (`EL`).
// 6. Statutory Indian CTC Payroll Engine + Indian currency number-to-words generator.

export const PolicyEngine = {
  /**
   * Evaluates whether a clock-in timestamp or HH:mm string exceeds the grace cutoff (10:00 AM).
   */
  isPunchInLate(
    timestampOrTime: string,
    policy: ShowupPolicyConfig
  ): boolean {
    const [graceH, graceM] = (policy.graceCutoff || '10:00')
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
   * - Under 4.5 hours -> 'Absent'
   * - Between 4.5 and 7.0 hours -> 'Half-Day'
   * - >= 7.0 hours: 'Late' if isLate is true, otherwise 'Present'
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
   * Calculates automated leave deduction from accumulated late marks:
   * Every 3 late marks trigger an automated deduction of 0.5 days of leave.
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
   * Policy validation: 15-day advance notice mandatory for Earned Leave (`EL`).
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
      const requiredDays = policy.elAdvanceNoticeDays || 15;

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
   * Statutory Indian CTC Breakdown Calculator:
   * - Basic: 50% of Gross
   * - HRA: 50% of Basic
   * - Conveyance Allowance: Fixed ₹1,600
   * - Medical Allowance: Fixed ₹1,250
   * - Special Allowance: Balancing figure
   * - Employee & Employer PF: 12% of Basic (capped at ₹1,800 statutory rule or 12% of Basic)
   * - Professional Tax (PT): ₹200/month
   * - TDS: Calculated based on annual slab
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

    // Statutory EPF: 12% of Basic (statutory ceiling of ₹15,000 basic = ₹1,800 PF, or 12% if uncapped)
    const employeePf = Math.min(1800, Math.round(basic * 0.12));
    const employerPf = employeePf;
    const professionalTax = 200;

    // Progressive Indian TDS estimation
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
