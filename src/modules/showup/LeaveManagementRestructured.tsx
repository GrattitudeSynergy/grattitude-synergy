import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Plus,
  HeartPulse,
  Briefcase,
  Home,
  Sliders,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  History,
  ShieldCheck,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Table,
  Modal,
  EmptyState,
  useToast,
} from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { PermissionsService } from '../../core/services/permissionsService';
import { AuditService } from '../../core/services/auditService';
import { NotificationService } from '../../core/services/notificationService';
import { SEED_ADDITIONAL_LEAVE_TYPES } from '../../core/seedData';
import { PolicyEngine } from './policyEngine';
import type {
  Employee,
  ShowupPolicyConfig,
  ShowupLeaveBalance,
  ShowupLeaveRequest,
  ShowupWfhRequest,
  AdditionalLeaveTypeConfig,
  OpeningLeaveBalanceRecord,
  LeaveTransactionEntry,
  LeaveCategorySection,
} from '../../core/types';

interface LeaveManagementRestructuredProps {
  currentEmployee: Employee;
  employees: Employee[];
  policy: ShowupPolicyConfig;
  leaveBalances: ShowupLeaveBalance[];
  leaveRequests: ShowupLeaveRequest[];
}

export const LeaveManagementRestructured: React.FC<
  LeaveManagementRestructuredProps
> = ({
  currentEmployee,
  employees,
  policy,
  leaveBalances,
  leaveRequests,
}) => {
  const { showToast } = useToast();

  // 4 Main Required Sections + Admin Opening Balances
  const [activeSection, setActiveSection] = useState<
    'EL' | 'CSL' | 'AL' | 'WFH' | 'ADMIN_OPENING'
  >('EL');

  const [alTypes, setAlTypes] = useState<AdditionalLeaveTypeConfig[]>(
    SEED_ADDITIONAL_LEAVE_TYPES
  );
  const [wfhRequests, setWfhRequests] = useState<ShowupWfhRequest[]>([]);
  const [openingBalances, setOpeningBalances] = useState<
    OpeningLeaveBalanceRecord[]
  >([]);

  // Leave Application Modal State (EL, CSL, AL)
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applySection, setApplySection] = useState<'EL' | 'CSL' | 'AL'>('EL');
  const [selectedAlType, setSelectedAlType] = useState<string>('Maternity');
  const [leaveStart, setLeaveStart] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [leaveEnd, setLeaveEnd] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [isHalfDayLeave, setIsHalfDayLeave] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveError, setLeaveError] = useState('');

  // WFH Application Form State (Section 4)
  const [wfhModalOpen, setWfhModalOpen] = useState(false);
  const [wfhStart, setWfhStart] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [wfhEnd, setWfhEnd] = useState(new Date().toISOString().slice(0, 10));
  const [wfhReason, setWfhReason] = useState('');
  const [wfhError, setWfhError] = useState('');

  // Admin AL Configurator Modal
  const [alConfigModalOpen, setAlConfigModalOpen] = useState(false);
  const [editingAlType, setEditingAlType] =
    useState<AdditionalLeaveTypeConfig | null>(null);
  const [alCodeInput, setAlCodeInput] = useState('');
  const [alNameInput, setAlNameInput] = useState('');
  const [alDescInput, setAlDescInput] = useState('');
  const [alAllocInput, setAlAllocInput] = useState<number>(5);
  const [alEligibilityInput, setAlEligibilityInput] = useState(
    'All active employees'
  );
  const [alCarryInput, setAlCarryInput] = useState(false);

  // Admin Opening Balance Entry State (Section 2.4)
  const [openingEmpId, setOpeningEmpId] = useState<string>(
    employees.find((e) => e.id === '#GSL014')?.id ||
      employees[0]?.id ||
      currentEmployee.id
  );
  const [openingElInput, setOpeningElInput] = useState<number>(0);
  const [openingCslInput, setOpeningCslInput] = useState<number>(0);
  const [openingAlInputs, setOpeningAlInputs] = useState<
    Record<string, number>
  >({
    Maternity: 180,
    Paternity: 15,
    Bereavement: 5,
    'Comp Off': 4,
    Optional: 3,
    'Special Leave': 5,
    LWP: 365,
  });
  const [openingEffectiveDate, setOpeningEffectiveDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [openingRemark, setOpeningRemark] = useState<string>(
    'Initial migration opening leave balance'
  );
  const [csvBulkText, setCsvBulkText] = useState<string>('');

  useEffect(() => {
    const u1 = FirestoreEngine.subscribeCollection<AdditionalLeaveTypeConfig>(
      'showup_additional_leave_types',
      (items) => {
        if (items.length > 0) setAlTypes(items);
      }
    );
    const u2 = FirestoreEngine.subscribeCollection<ShowupWfhRequest>(
      'showup_wfh_requests',
      setWfhRequests
    );
    const u3 = FirestoreEngine.subscribeCollection<OpeningLeaveBalanceRecord>(
      'showup_opening_leave_balances',
      setOpeningBalances
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const isAdmin = PermissionsService.isAdmin(currentEmployee);
  const isManager = PermissionsService.isManager(currentEmployee);
  const currentNormId = PermissionsService.normalizeEmpId(currentEmployee.id);
  const currentNormEcode = PermissionsService.normalizeEmpId(
    currentEmployee.ecode
  );

  const hasDirectReports = employees.some((e) => {
    const mgrNorm = PermissionsService.normalizeEmpId(e.reportingManagerId);
    return (
      mgrNorm !== '' &&
      (mgrNorm === currentNormId || mgrNorm === currentNormEcode)
    );
  });
  const canAccessApprovalQueue = isAdmin || isManager || hasDirectReports;

  // Ensure current month automated accrual (+1.5 EL and +1.0 CSL) is credited for the logged-in employee without duplication
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const myBalanceDoc = useMemo(
    () =>
      leaveBalances.find((b) => b.employeeId === currentEmployee.id) || null,
    [leaveBalances, currentEmployee.id]
  );

  useEffect(() => {
    if (!myBalanceDoc) return;
    const txList = myBalanceDoc.transactions || [];
    const hasElThisMonth = txList.some(
      (t) =>
        t.section === 'EL' &&
        t.transactionType === 'MONTHLY_CREDIT' &&
        t.monthKey === currentMonthKey
    );
    const hasCslThisMonth = txList.some(
      (t) =>
        t.section === 'CSL' &&
        t.transactionType === 'MONTHLY_CREDIT' &&
        t.monthKey === currentMonthKey
    );

    if (
      myBalanceDoc.lastAccruedMonth !== currentMonthKey &&
      (!hasElThisMonth || !hasCslThisMonth)
    ) {
      const nextTx = [...txList];
      let nextElCredits = myBalanceDoc.elMonthlyCredits ?? 0;
      let nextCslCredits = myBalanceDoc.cslMonthlyCredits ?? 0;

      if (!hasElThisMonth) {
        nextElCredits = Math.round((nextElCredits + 1.5) * 100) / 100;
        nextTx.unshift({
          id: `tx_el_${currentEmployee.id}_${currentMonthKey}`,
          employeeId: currentEmployee.id,
          employeeName: currentEmployee.name,
          section: 'EL',
          leaveType: 'EL',
          transactionType: 'MONTHLY_CREDIT',
          amount: 1.5,
          balanceAfter:
            (myBalanceDoc.elOpeningBalance || 0) +
            nextElCredits +
            (myBalanceDoc.elCarriedForward || 0) -
            (myBalanceDoc.elUsed || 0),
          effectiveDate: `${currentMonthKey}-01`,
          monthKey: currentMonthKey,
          remark: `Automated monthly EL credit (+1.5 EL for ${currentMonthKey})`,
          createdBy: 'HRMS Monthly Accrual Engine',
          createdAt: new Date().toISOString(),
        });
      }

      if (!hasCslThisMonth) {
        nextCslCredits = Math.round((nextCslCredits + 1.0) * 100) / 100;
        nextTx.unshift({
          id: `tx_csl_${currentEmployee.id}_${currentMonthKey}`,
          employeeId: currentEmployee.id,
          employeeName: currentEmployee.name,
          section: 'CSL',
          leaveType: 'CSL',
          transactionType: 'MONTHLY_CREDIT',
          amount: 1.0,
          balanceAfter:
            (myBalanceDoc.cslOpeningBalance || 0) +
            nextCslCredits -
            (myBalanceDoc.cslUsed || 0) -
            (myBalanceDoc.lateLeaveDeducted || 0),
          effectiveDate: `${currentMonthKey}-01`,
          monthKey: currentMonthKey,
          remark: `Automated monthly CSL credit (+1.0 CSL for ${currentMonthKey})`,
          createdBy: 'HRMS Monthly Accrual Engine',
          createdAt: new Date().toISOString(),
        });
      }

      void FirestoreEngine.setDocument(
        'showup_leave_balances',
        currentEmployee.id,
        {
          ...myBalanceDoc,
          elMonthlyCredits: nextElCredits,
          cslMonthlyCredits: nextCslCredits,
          lastAccruedMonth: currentMonthKey,
          transactions: nextTx,
          updatedAt: new Date().toISOString(),
        }
      );
    }
  }, [myBalanceDoc?.id, currentMonthKey]);

  const myLeaveSummary = useMemo(
    () =>
      PolicyEngine.computeEmployeeLeaveSummary(
        currentEmployee.id,
        myBalanceDoc,
        leaveRequests
      ),
    [currentEmployee.id, myBalanceDoc, leaveRequests]
  );

  // Additional Leaves (AL) Balance Helper per sub-type
  const getAlTypeBalanceInfo = (empId: string, alConfig: AdditionalLeaveTypeConfig) => {
    const empBalDoc = leaveBalances.find((b) => b.employeeId === empId);
    const empOpeningDoc = openingBalances.find((o) => o.employeeId === empId);
    const openingAllocation =
      empOpeningDoc?.openingAL?.[alConfig.code] ??
      empBalDoc?.balances?.[alConfig.code] ??
      alConfig.annualAllocationDays;

    const usedDays = leaveRequests
      .filter(
        (r) =>
          r.employeeId === empId &&
          r.leaveType === alConfig.code &&
          r.status === 'Approved'
      )
      .reduce((sum, r) => sum + (r.days || 0), 0);

    const pendingDays = leaveRequests
      .filter(
        (r) =>
          r.employeeId === empId &&
          r.leaveType === alConfig.code &&
          r.status === 'Pending'
      )
      .reduce((sum, r) => sum + (r.days || 0), 0);

    return {
      allocated: openingAllocation,
      used: usedDays,
      pending: pendingDays,
      available: Math.max(0, openingAllocation - usedDays),
    };
  };

  // WFH Monthly Summary (Max 4 days per calendar month)
  const maxWfhPerMonth = policy.wfhRemoteDaysPerMonth ?? 4;

  const myWfhRequests = useMemo(() => {
    return wfhRequests
      .filter((w) => {
        const wNorm = PermissionsService.normalizeEmpId(w.employeeId);
        return wNorm === currentNormId || wNorm === currentNormEcode;
      })
      .sort(
        (a, b) =>
          new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      );
  }, [wfhRequests, currentNormId, currentNormEcode]);

  const myWfhMonthStats = useMemo(() => {
    const monthReqs = myWfhRequests.filter(
      (w) =>
        w.monthKey === currentMonthKey || w.startDate.startsWith(currentMonthKey)
    );
    const approvedDays = monthReqs
      .filter((w) => w.status === 'Approved')
      .reduce((s, w) => s + (w.days || 0), 0);
    const pendingDays = monthReqs
      .filter((w) => w.status === 'Pending')
      .reduce((s, w) => s + (w.days || 0), 0);
    const pendingCount = monthReqs.filter((w) => w.status === 'Pending').length;
    const approvedCount = monthReqs.filter(
      (w) => w.status === 'Approved'
    ).length;

    return {
      usedThisMonth: approvedDays,
      pendingDaysThisMonth: pendingDays,
      remainingThisMonth: Math.max(0, maxWfhPerMonth - approvedDays),
      pendingCount,
      approvedCount,
    };
  }, [myWfhRequests, currentMonthKey, maxWfhPerMonth]);

  // Filtered Leave Requests per section
  const isLeaveInSection = (
    req: ShowupLeaveRequest,
    sec: 'EL' | 'CSL' | 'AL'
  ): boolean => {
    if (req.section === sec) return true;
    if (sec === 'EL') return req.leaveType === 'EL';
    if (sec === 'CSL')
      return (
        req.leaveType === 'CSL' ||
        req.leaveType === 'CL' ||
        req.leaveType === 'SL'
      );
    return (
      req.leaveType !== 'EL' &&
      req.leaveType !== 'CSL' &&
      req.leaveType !== 'CL' &&
      req.leaveType !== 'SL'
    );
  };

  const myOwnLeaveRequests = useMemo(() => {
    return leaveRequests
      .filter((req) => {
        const reqNorm = PermissionsService.normalizeEmpId(req.employeeId);
        return reqNorm === currentNormId || reqNorm === currentNormEcode;
      })
      .sort(
        (a, b) =>
          new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      );
  }, [leaveRequests, currentNormId, currentNormEcode]);

  const approvalQueueLeaveRequests = useMemo(() => {
    return leaveRequests
      .filter((req) =>
        PermissionsService.canManageLeaveOrRegularization(
          currentEmployee,
          req,
          employees
        )
      )
      .sort(
        (a, b) =>
          new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      );
  }, [leaveRequests, currentEmployee, employees]);

  const approvalQueueWfhRequests = useMemo(() => {
    return wfhRequests
      .filter((req) =>
        PermissionsService.canManageLeaveOrRegularization(
          currentEmployee,
          req as any,
          employees
        )
      )
      .sort(
        (a, b) =>
          new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      );
  }, [wfhRequests, currentEmployee, employees]);

  // Apply for EL, CSL, or AL
  const handleSubmitLeaveApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveError('');

    const effectiveLeaveType =
      applySection === 'EL'
        ? 'EL'
        : applySection === 'CSL'
        ? 'CSL'
        : selectedAlType;

    if (applySection === 'EL') {
      const validation = PolicyEngine.validateLeavePolicy(
        'EL',
        leaveStart,
        policy
      );
      if (!validation.valid) {
        setLeaveError(validation.error || 'EL policy validation failed.');
        return;
      }
    }

    const startMs = new Date(leaveStart).getTime();
    const endMs = new Date(leaveEnd).getTime();
    if (endMs < startMs) {
      setLeaveError('End date cannot be earlier than start date.');
      return;
    }

    const rawDays = Math.max(
      1,
      Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1
    );
    const days = isHalfDayLeave && rawDays === 1 ? 0.5 : rawDays;

    // Validate available balance for the selected section
    let availableBalance = 0;
    if (applySection === 'EL') {
      availableBalance = myLeaveSummary.el.available;
    } else if (applySection === 'CSL') {
      availableBalance = myLeaveSummary.csl.available;
    } else {
      const matchedAl = alTypes.find((a) => a.code === selectedAlType);
      availableBalance = matchedAl
        ? getAlTypeBalanceInfo(currentEmployee.id, matchedAl).available
        : 30;
    }

    if (days > availableBalance) {
      setLeaveError(
        `Insufficient ${effectiveLeaveType} balance: requesting ${days} day(s), but only ${availableBalance} day(s) available.`
      );
      return;
    }

    const newReq: ShowupLeaveRequest = {
      id: `leave_${Date.now()}`,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      department: currentEmployee.department,
      reportingManagerId: currentEmployee.reportingManagerId || 'EMP-001',
      section: applySection as LeaveCategorySection,
      leaveType: effectiveLeaveType,
      startDate: leaveStart,
      endDate: leaveEnd,
      days,
      reason: leaveReason.trim(),
      status: 'Pending',
      appliedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument(
      'showup_leave_requests',
      newReq.id,
      newReq
    );

    await NotificationService.create({
      recipientId: newReq.reportingManagerId,
      title: `New ${effectiveLeaveType} Leave Request`,
      message: `${currentEmployee.name} applied for ${days} day(s) of ${effectiveLeaveType} (${leaveStart} to ${leaveEnd}).`,
      route: '/showup',
      actorName: currentEmployee.name,
    });
    if (newReq.reportingManagerId !== 'EMP-001') {
      await NotificationService.create({
        recipientId: 'EMP-001',
        title: `New ${effectiveLeaveType} Leave Request`,
        message: `${currentEmployee.name} applied for ${days} day(s) of ${effectiveLeaveType} (${leaveStart} to ${leaveEnd}).`,
        route: '/showup',
        actorName: currentEmployee.name,
      });
    }

    showToast(
      'success',
      'Leave Application Submitted',
      `${days} day(s) of ${effectiveLeaveType} submitted for approval.`
    );
    setLeaveReason('');
    setIsHalfDayLeave(false);
    setApplyModalOpen(false);
  };

  // Review Leave (Approve / Reject) and record ledger transaction
  const handleReviewLeave = async (
    req: ShowupLeaveRequest,
    decision: 'Approved' | 'Rejected'
  ) => {
    if (
      !PermissionsService.canManageLeaveOrRegularization(
        currentEmployee,
        req,
        employees
      )
    ) {
      showToast(
        'error',
        'Access Denied',
        'Only the assigned Reporting Manager or Admin can review this leave request.'
      );
      return;
    }

    await FirestoreEngine.updateDocument<ShowupLeaveRequest>(
      'showup_leave_requests',
      req.id,
      {
        status: decision,
        reviewedBy: currentEmployee.name,
        reviewedAt: new Date().toISOString(),
      }
    );

    if (decision === 'Approved') {
      const empBal = leaveBalances.find((b) => b.employeeId === req.employeeId);
      const sec: 'EL' | 'CSL' | 'AL' =
        req.leaveType === 'EL' || req.section === 'EL'
          ? 'EL'
          : req.leaveType === 'CSL' ||
            req.leaveType === 'CL' ||
            req.leaveType === 'SL' ||
            req.section === 'CSL'
          ? 'CSL'
          : 'AL';

      const currentSummary = PolicyEngine.computeEmployeeLeaveSummary(
        req.employeeId,
        empBal,
        [...leaveRequests, { ...req, status: 'Approved' }]
      );

      const newTx: LeaveTransactionEntry = {
        id: `tx_leave_${req.id}`,
        employeeId: req.employeeId,
        employeeName: req.employeeName,
        section: sec,
        leaveType: req.leaveType,
        transactionType: 'LEAVE_USED',
        amount: -req.days,
        balanceAfter:
          sec === 'EL'
            ? currentSummary.el.available
            : sec === 'CSL'
            ? currentSummary.csl.available
            : Math.max(
                0,
                (empBal?.balances?.[req.leaveType] ?? 10) - req.days
              ),
        effectiveDate: req.startDate,
        monthKey: req.startDate.slice(0, 7),
        remark: `Approved ${req.days} day(s) of ${req.leaveType} (${req.startDate} to ${req.endDate}) — ${req.reason}`,
        createdBy: currentEmployee.name,
        createdAt: new Date().toISOString(),
      };

      const nextBalances = { ...(empBal?.balances || {}) };
      nextBalances.EL = currentSummary.el.available;
      nextBalances.CSL = currentSummary.csl.available;
      if (sec === 'AL') {
        const matchedAl = alTypes.find((a) => a.code === req.leaveType);
        const curAl =
          nextBalances[req.leaveType] ??
          matchedAl?.annualAllocationDays ??
          10;
        nextBalances[req.leaveType] = Math.max(0, curAl - req.days);
      }

      await FirestoreEngine.setDocument(
        'showup_leave_balances',
        req.employeeId,
        {
          ...(empBal || {}),
          id: req.employeeId,
          employeeId: req.employeeId,
          balances: nextBalances,
          elUsed: currentSummary.el.used,
          elAvailable: currentSummary.el.available,
          cslUsed: currentSummary.csl.used,
          cslAvailable: currentSummary.csl.available,
          lateMarksCount: empBal?.lateMarksCount || 0,
          lateLeaveDeducted: empBal?.lateLeaveDeducted || 0,
          transactions: [newTx, ...(empBal?.transactions || [])],
          updatedAt: new Date().toISOString(),
        }
      );
    }

    await NotificationService.create({
      recipientId: req.employeeId,
      title: `Leave Application ${decision}`,
      message: `Your ${req.leaveType} request (${req.startDate} to ${req.endDate}) was ${decision.toLowerCase()} by ${currentEmployee.name}.`,
      route: '/showup',
      actorName: currentEmployee.name,
    });

    await AuditService.log({
      action: `LEAVE_${decision.toUpperCase()}`,
      actor: currentEmployee,
      targetId: req.id,
      targetType: 'ShowupLeaveRequest',
      details: `${decision} ${req.days} day(s) of ${req.leaveType} for ${req.employeeName} (${req.startDate} to ${req.endDate}).`,
    });

    showToast(
      decision === 'Approved' ? 'success' : 'warning',
      `Leave ${decision}`,
      `${req.employeeName}'s ${req.leaveType} application marked as ${decision}.`
    );
  };

  // Submit WFH Application (Enforces 4 WFH days/month limit & prevents overlaps)
  const handleSubmitWfhRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setWfhError('');

    const startMs = new Date(wfhStart).getTime();
    const endMs = new Date(wfhEnd).getTime();
    if (endMs < startMs) {
      setWfhError('End date cannot be earlier than start date.');
      return;
    }

    const startMonth = wfhStart.slice(0, 7);
    const endMonth = wfhEnd.slice(0, 7);
    if (startMonth !== endMonth) {
      setWfhError(
        'Please submit WFH applications within a single calendar month so the 4-day monthly limit can be accurately tracked.'
      );
      return;
    }

    const days = Math.max(
      1,
      Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1
    );

    // 1. Check duplicate or overlapping WFH applications for this employee
    const overlapping = myWfhRequests.find((existing) => {
      if (existing.status === 'Rejected') return false;
      const exStart = new Date(existing.startDate).getTime();
      const exEnd = new Date(existing.endDate).getTime();
      return startMs <= exEnd && endMs >= exStart;
    });

    if (overlapping) {
      setWfhError(
        `Overlapping or duplicate WFH application detected: You already have a ${overlapping.status} WFH request covering ${overlapping.startDate} to ${overlapping.endDate}.`
      );
      return;
    }

    // 2. Enforce maximum 4 WFH days per calendar month (counting Approved + Pending in that month)
    const monthWfhReqs = myWfhRequests.filter(
      (w) =>
        (w.monthKey === startMonth || w.startDate.startsWith(startMonth)) &&
        w.status !== 'Rejected'
    );
    const alreadyCommittedDays = monthWfhReqs.reduce(
      (s, w) => s + (w.days || 0),
      0
    );

    if (alreadyCommittedDays + days > maxWfhPerMonth) {
      const remaining = Math.max(0, maxWfhPerMonth - alreadyCommittedDays);
      setWfhError(
        `Monthly WFH Limit Exceeded: Maximum allowed is ${maxWfhPerMonth} WFH days per calendar month. You have already used/requested ${alreadyCommittedDays} day(s) in ${startMonth} (${remaining} day(s) remaining).`
      );
      return;
    }

    const newWfh: ShowupWfhRequest = {
      id: `wfh_${Date.now()}`,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      employeeEcode: currentEmployee.ecode,
      department: currentEmployee.department,
      reportingManagerId: currentEmployee.reportingManagerId || 'EMP-001',
      startDate: wfhStart,
      endDate: wfhEnd,
      days,
      monthKey: startMonth,
      reason: wfhReason.trim() || 'Remote Work From Home',
      status: 'Pending',
      appliedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('showup_wfh_requests', newWfh.id, newWfh);

    await NotificationService.create({
      recipientId: newWfh.reportingManagerId,
      title: 'New Work From Home (WFH) Request',
      message: `${currentEmployee.name} requested ${days} WFH day(s) (${wfhStart} to ${wfhEnd}).`,
      route: '/showup',
      actorName: currentEmployee.name,
    });
    if (newWfh.reportingManagerId !== 'EMP-001') {
      await NotificationService.create({
        recipientId: 'EMP-001',
        title: 'New Work From Home (WFH) Request',
        message: `${currentEmployee.name} requested ${days} WFH day(s) (${wfhStart} to ${wfhEnd}).`,
        route: '/showup',
        actorName: currentEmployee.name,
      });
    }

    showToast(
      'success',
      'WFH Request Submitted',
      `${days} WFH day(s) submitted for approval (Zero leave balance deducted).`
    );
    setWfhReason('');
    setWfhModalOpen(false);
  };

  // Review WFH Request (Does NOT deduct from EL, CSL, or AL balances)
  const handleReviewWfh = async (
    req: ShowupWfhRequest,
    decision: 'Approved' | 'Rejected'
  ) => {
    if (
      !PermissionsService.canManageLeaveOrRegularization(
        currentEmployee,
        req as any,
        employees
      )
    ) {
      showToast(
        'error',
        'Access Denied',
        'Only the Reporting Manager or Admin can review this WFH application.'
      );
      return;
    }

    await FirestoreEngine.updateDocument<ShowupWfhRequest>(
      'showup_wfh_requests',
      req.id,
      {
        status: decision,
        reviewedBy: currentEmployee.name,
        reviewedAt: new Date().toISOString(),
      }
    );

    await NotificationService.create({
      recipientId: req.employeeId,
      title: `Work From Home (WFH) ${decision}`,
      message: `Your WFH request for ${req.startDate} to ${req.endDate} (${req.days}d) was ${decision.toLowerCase()} by ${currentEmployee.name}. No leave balance was deducted.`,
      route: '/showup',
      actorName: currentEmployee.name,
    });

    await AuditService.log({
      action: `WFH_${decision.toUpperCase()}`,
      actor: currentEmployee,
      targetId: req.id,
      targetType: 'ShowupWfhRequest',
      details: `${decision} ${req.days} WFH day(s) for ${req.employeeName} (${req.startDate} to ${req.endDate}). Zero leave balance deduction.`,
    });

    showToast(
      decision === 'Approved' ? 'success' : 'warning',
      `WFH Request ${decision}`,
      `${req.employeeName}'s WFH application (${req.days}d) marked as ${decision}.`
    );
  };

  // Admin: Run Monthly Accrual Batch (+1.5 EL and +1.0 CSL) or Year-End Carry-Forward / Lapse
  const handleAdminRunAccrualForMonth = async (targetMonthKey: string) => {
    let creditedCount = 0;
    for (const emp of employees) {
      if (emp.status === 'Inactive' || emp.status === 'Exited') continue;
      const empBal = leaveBalances.find((b) => b.employeeId === emp.id);
      const txList = [...(empBal?.transactions || [])];

      const alreadyEl = txList.some(
        (t) =>
          t.section === 'EL' &&
          t.transactionType === 'MONTHLY_CREDIT' &&
          t.monthKey === targetMonthKey
      );
      const alreadyCsl = txList.some(
        (t) =>
          t.section === 'CSL' &&
          t.transactionType === 'MONTHLY_CREDIT' &&
          t.monthKey === targetMonthKey
      );

      if (alreadyEl && alreadyCsl) continue;

      const nextElCredits =
        Math.round(
          ((empBal?.elMonthlyCredits ?? 0) + (alreadyEl ? 0 : 1.5)) * 100
        ) / 100;
      const nextCslCredits =
        Math.round(
          ((empBal?.cslMonthlyCredits ?? 0) + (alreadyCsl ? 0 : 1.0)) * 100
        ) / 100;

      if (!alreadyEl) {
        txList.unshift({
          id: `tx_el_${emp.id}_${targetMonthKey}`,
          employeeId: emp.id,
          employeeName: emp.name,
          section: 'EL',
          leaveType: 'EL',
          transactionType: 'MONTHLY_CREDIT',
          amount: 1.5,
          balanceAfter:
            (empBal?.elOpeningBalance || 0) +
            nextElCredits +
            (empBal?.elCarriedForward || 0) -
            (empBal?.elUsed || 0),
          effectiveDate: `${targetMonthKey}-01`,
          monthKey: targetMonthKey,
          remark: `Monthly EL accrual (+1.5 EL for ${targetMonthKey})`,
          createdBy: currentEmployee.name,
          createdAt: new Date().toISOString(),
        });
      }

      if (!alreadyCsl) {
        txList.unshift({
          id: `tx_csl_${emp.id}_${targetMonthKey}`,
          employeeId: emp.id,
          employeeName: emp.name,
          section: 'CSL',
          leaveType: 'CSL',
          transactionType: 'MONTHLY_CREDIT',
          amount: 1.0,
          balanceAfter:
            (empBal?.cslOpeningBalance || 0) +
            nextCslCredits -
            (empBal?.cslUsed || 0) -
            (empBal?.lateLeaveDeducted || 0),
          effectiveDate: `${targetMonthKey}-01`,
          monthKey: targetMonthKey,
          remark: `Monthly CSL accrual (+1.0 CSL for ${targetMonthKey})`,
          createdBy: currentEmployee.name,
          createdAt: new Date().toISOString(),
        });
      }

      await FirestoreEngine.setDocument('showup_leave_balances', emp.id, {
        ...(empBal || {}),
        id: emp.id,
        employeeId: emp.id,
        balances: {
          ...(empBal?.balances || {}),
          EL:
            (empBal?.elOpeningBalance || 0) +
            nextElCredits +
            (empBal?.elCarriedForward || 0) -
            (empBal?.elUsed || 0),
          CSL:
            (empBal?.cslOpeningBalance || 0) +
            nextCslCredits -
            (empBal?.cslUsed || 0) -
            (empBal?.lateLeaveDeducted || 0),
        },
        elMonthlyCredits: nextElCredits,
        cslMonthlyCredits: nextCslCredits,
        lastAccruedMonth: targetMonthKey,
        lateMarksCount: empBal?.lateMarksCount || 0,
        lateLeaveDeducted: empBal?.lateLeaveDeducted || 0,
        transactions: txList,
        updatedAt: new Date().toISOString(),
      });
      creditedCount++;
    }

    await AuditService.log({
      action: 'MONTHLY_LEAVE_ACCRUAL_EXECUTED',
      actor: currentEmployee,
      targetId: targetMonthKey,
      targetType: 'ShowupLeaveBalanceBatch',
      details: `Processed monthly accrual (+1.5 EL, +1.0 CSL) for ${creditedCount} employee(s) for ${targetMonthKey} without duplicating existing credits.`,
    });

    showToast(
      'success',
      'Monthly Leave Accrual Processed',
      `Credited +1.5 EL and +1.0 CSL for ${creditedCount} employee(s) for ${targetMonthKey} (zero duplicate credits).`
    );
  };

  const handleAdminProcessYearEndRollover = async () => {
    const yearStr = String(new Date().getFullYear());
    for (const emp of employees) {
      const empBal = leaveBalances.find((b) => b.employeeId === emp.id);
      const summary = PolicyEngine.computeEmployeeLeaveSummary(
        emp.id,
        empBal,
        leaveRequests
      );

      // EL: Carry forward 50% of unused EL, max 9 days. Excess lapses.
      const { carriedForward, lapsed: elLapsed } =
        PolicyEngine.calculateElYearEndCarryForward(summary.el.available);
      // CSL: 0 carry forward; unused CSL lapses at year-end.
      const cslLapsed = summary.csl.available;

      const txList: LeaveTransactionEntry[] = [
        {
          id: `tx_ye_el_cf_${emp.id}_${Date.now()}`,
          employeeId: emp.id,
          employeeName: emp.name,
          section: 'EL',
          leaveType: 'EL',
          transactionType: 'YEAR_END_CARRY_FORWARD',
          amount: carriedForward,
          balanceAfter: carriedForward,
          effectiveDate: `${yearStr}-12-31`,
          yearKey: yearStr,
          remark: `Year-end EL carry-forward: 50% of ${summary.el.available} unused EL (capped at max 9 days) = ${carriedForward} days carried forward; ${elLapsed} days lapsed.`,
          createdBy: currentEmployee.name,
          createdAt: new Date().toISOString(),
        },
        ...(cslLapsed > 0
          ? [
              {
                id: `tx_ye_csl_lapse_${emp.id}_${Date.now()}`,
                employeeId: emp.id,
                employeeName: emp.name,
                section: 'CSL' as const,
                leaveType: 'CSL',
                transactionType: 'YEAR_END_LAPSE' as const,
                amount: -cslLapsed,
                balanceAfter: 0,
                effectiveDate: `${yearStr}-12-31`,
                yearKey: yearStr,
                remark: `Year-end CSL lapse: ${cslLapsed} unused CSL day(s) lapsed (CSL is non-carry-forward).`,
                createdBy: currentEmployee.name,
                createdAt: new Date().toISOString(),
              },
            ]
          : []),
        ...(empBal?.transactions || []),
      ];

      await FirestoreEngine.setDocument('showup_leave_balances', emp.id, {
        ...(empBal || {}),
        id: emp.id,
        employeeId: emp.id,
        balances: {
          ...(empBal?.balances || {}),
          EL: carriedForward,
          CSL: 0,
        },
        elOpeningBalance: 0,
        elMonthlyCredits: 0,
        elCarriedForward: carriedForward,
        elLapsedAtYearEnd: elLapsed,
        elUsed: 0,
        elAvailable: carriedForward,
        cslOpeningBalance: 0,
        cslMonthlyCredits: 0,
        cslUsed: 0,
        cslLapsedAtYearEnd: cslLapsed,
        cslAvailable: 0,
        lastYearEndProcessed: Number(yearStr),
        lateMarksCount: empBal?.lateMarksCount || 0,
        lateLeaveDeducted: empBal?.lateLeaveDeducted || 0,
        transactions: txList,
        updatedAt: new Date().toISOString(),
      });
    }

    await AuditService.log({
      action: 'YEAR_END_LEAVE_ROLLOVER_EXECUTED',
      actor: currentEmployee,
      targetId: yearStr,
      targetType: 'ShowupLeaveBalanceBatch',
      details: `Executed year-end leave rollover for ${yearStr}: EL carried forward at 50% (max 9 days) and unused CSL lapsed.`,
    });

    showToast(
      'success',
      'Year-End Carry-Forward & Lapse Processed',
      'EL carried forward at 50% (max 9 days) and unused CSL lapsed across employees.'
    );
  };

  // Admin: Save Additional Leave Type Config
  const handleSaveAlTypeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alCodeInput.trim() || !alNameInput.trim()) return;

    const id =
      editingAlType?.id ||
      `AL_${alCodeInput.trim().toUpperCase().replace(/\s+/g, '_')}`;
    const newConfig: AdditionalLeaveTypeConfig = {
      id,
      code: alCodeInput.trim(),
      name: alNameInput.trim(),
      description: alDescInput.trim(),
      annualAllocationDays: Math.max(0, Number(alAllocInput)),
      eligibilityRule: alEligibilityInput.trim() || 'All active employees',
      requiresApproval: true,
      allowCarryForward: alCarryInput,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy: currentEmployee.name,
    };

    await FirestoreEngine.setDocument(
      'showup_additional_leave_types',
      id,
      newConfig
    );

    await AuditService.log({
      action: editingAlType
        ? 'ADDITIONAL_LEAVE_TYPE_UPDATED'
        : 'ADDITIONAL_LEAVE_TYPE_CREATED',
      actor: currentEmployee,
      targetId: id,
      targetType: 'AdditionalLeaveTypeConfig',
      details: `Configured Additional Leave (AL) type "${newConfig.name}" (${newConfig.code}): ${newConfig.annualAllocationDays} days allocation.`,
    });

    showToast(
      'success',
      'Additional Leave Type Saved',
      `${newConfig.name} (${newConfig.annualAllocationDays} days) configured under Additional Leaves (AL).`
    );
    setAlConfigModalOpen(false);
    setEditingAlType(null);
  };

  // Admin: Save Opening Leave Balances for an Employee (Non-overwriting, separate from monthly credits)
  const applyOpeningBalanceForEmployee = async (
    emp: Employee,
    elVal: number,
    cslVal: number,
    alMap: Record<string, number>,
    effDate: string,
    rem: string
  ) => {
    const existingOpening = openingBalances.find(
      (o) => o.employeeId === emp.id
    );
    const empBal = leaveBalances.find((b) => b.employeeId === emp.id);

    const recordId = `opening_${emp.id}`;
    const openingRecord: OpeningLeaveBalanceRecord = {
      id: recordId,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeEcode: emp.ecode,
      openingEL: Math.max(0, Number(elVal) || 0),
      openingCSL: Math.max(0, Number(cslVal) || 0),
      openingAL: alMap,
      effectiveDate: effDate,
      remark: rem || 'Opening Leave Balance Migration',
      addedBy: currentEmployee.name,
      addedById: currentEmployee.id,
      addedAt: existingOpening?.addedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument(
      'showup_opening_leave_balances',
      recordId,
      openingRecord
    );

    // Update ShowupLeaveBalance while preserving existing monthly credits and leave requests
    const prevTx = (empBal?.transactions || []).filter(
      (t) => t.transactionType !== 'OPENING_BALANCE'
    );

    const openingTransactions: LeaveTransactionEntry[] = [
      {
        id: `tx_open_el_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        section: 'EL',
        leaveType: 'EL',
        transactionType: 'OPENING_BALANCE',
        amount: openingRecord.openingEL,
        balanceAfter:
          openingRecord.openingEL +
          (empBal?.elMonthlyCredits ?? 1.5) +
          (empBal?.elCarriedForward ?? 0) -
          (empBal?.elUsed ?? 0),
        effectiveDate: effDate,
        remark: `Opening EL Balance (${rem || 'Migration adjustment'})`,
        createdBy: currentEmployee.name,
        createdAt: new Date().toISOString(),
      },
      {
        id: `tx_open_csl_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        section: 'CSL',
        leaveType: 'CSL',
        transactionType: 'OPENING_BALANCE',
        amount: openingRecord.openingCSL,
        balanceAfter:
          openingRecord.openingCSL +
          (empBal?.cslMonthlyCredits ?? 1.0) -
          (empBal?.cslUsed ?? 0) -
          (empBal?.lateLeaveDeducted ?? 0),
        effectiveDate: effDate,
        remark: `Opening CSL Balance (${rem || 'Migration adjustment'})`,
        createdBy: currentEmployee.name,
        createdAt: new Date().toISOString(),
      },
    ];

    const nextBalances: Record<string, number> = {
      ...(empBal?.balances || {}),
      ...alMap,
      EL:
        openingRecord.openingEL +
        (empBal?.elMonthlyCredits ?? 1.5) +
        (empBal?.elCarriedForward ?? 0) -
        (empBal?.elUsed ?? 0),
      CSL:
        openingRecord.openingCSL +
        (empBal?.cslMonthlyCredits ?? 1.0) -
        (empBal?.cslUsed ?? 0) -
        (empBal?.lateLeaveDeducted ?? 0),
    };

    await FirestoreEngine.setDocument('showup_leave_balances', emp.id, {
      ...(empBal || {}),
      id: emp.id,
      employeeId: emp.id,
      balances: nextBalances,
      elOpeningBalance: openingRecord.openingEL,
      elMonthlyCredits: empBal?.elMonthlyCredits ?? 1.5,
      cslOpeningBalance: openingRecord.openingCSL,
      cslMonthlyCredits: empBal?.cslMonthlyCredits ?? 1.0,
      lateMarksCount: empBal?.lateMarksCount || 0,
      lateLeaveDeducted: empBal?.lateLeaveDeducted || 0,
      transactions: [...openingTransactions, ...prevTx],
      updatedAt: new Date().toISOString(),
    });

    await AuditService.log({
      action: existingOpening
        ? 'OPENING_LEAVE_BALANCE_MODIFIED'
        : 'OPENING_LEAVE_BALANCE_ADDED',
      actor: currentEmployee,
      targetId: emp.id,
      targetType: 'OpeningLeaveBalanceRecord',
      details: `${existingOpening ? 'Modified' : 'Added'} Opening Leave Balances for ${emp.name} (${emp.ecode}) effective ${effDate}: Opening EL=${openingRecord.openingEL}, Opening CSL=${openingRecord.openingCSL}, Remark="${openingRecord.remark}".`,
    });
  };

  const handleSaveSingleOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmp = employees.find((emp) => emp.id === openingEmpId);
    if (!targetEmp) return;

    await applyOpeningBalanceForEmployee(
      targetEmp,
      openingElInput,
      openingCslInput,
      openingAlInputs,
      openingEffectiveDate,
      openingRemark
    );

    showToast(
      'success',
      'Opening Leave Balances Recorded',
      `Opening EL (${openingElInput}d), CSL (${openingCslInput}d), and AL balances saved for ${targetEmp.name} (${targetEmp.ecode}). Regular monthly accruals (+1.5 EL, +1.0 CSL) continue automatically.`
    );
  };

  const handleBulkCsvUploadOpeningBalances = async () => {
    if (!csvBulkText.trim()) {
      showToast(
        'warning',
        'Empty CSV Input',
        'Paste CSV lines or upload a CSV file first.'
      );
      return;
    }

    const lines = csvBulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    let processedCount = 0;

    for (const line of lines) {
      if (line.toLowerCase().startsWith('ecode,')) continue; // skip header
      const parts = line.split(',').map((p) => p.trim());
      const [rawEcode, rawEl, rawCsl, rawCompOff, rawEffDate, ...remParts] =
        parts;
      if (!rawEcode) continue;

      const normTarget = PermissionsService.normalizeEmpId(rawEcode);
      const matchedEmp = employees.find(
        (e) =>
          PermissionsService.normalizeEmpId(e.ecode) === normTarget ||
          PermissionsService.normalizeEmpId(e.id) === normTarget
      );
      if (!matchedEmp) continue;

      const elVal = parseFloat(rawEl || '0') || 0;
      const cslVal = parseFloat(rawCsl || '0') || 0;
      const compVal = parseFloat(rawCompOff || '4') || 4;
      const effDate = rawEffDate || openingEffectiveDate;
      const rem = remParts.join(', ') || 'Bulk CSV Opening Balance Upload';

      await applyOpeningBalanceForEmployee(
        matchedEmp,
        elVal,
        cslVal,
        {
          ...openingAlInputs,
          'Comp Off': compVal,
        },
        effDate,
        rem
      );
      processedCount++;
    }

    showToast(
      'success',
      'Bulk Opening Balances Imported',
      `Successfully imported opening leave balances for ${processedCount} employee(s).`
    );
    setCsvBulkText('');
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      setCsvBulkText(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      {/* 4 Main Leave Management Sections Selector (+ Admin Opening Balance Option) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Earned Leaves (EL) */}
        <button
          type="button"
          onClick={() => setActiveSection('EL')}
          className={`p-4 text-left rounded-xl border transition-all cursor-pointer ${
            activeSection === 'EL'
              ? 'bg-sky-50/90 border-sky-500 ring-2 ring-sky-500/20 shadow-xs'
              : 'bg-white border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-sky-800">
              1. Earned Leaves (EL)
            </span>
            <Briefcase className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-extrabold text-neutral-900 mt-1.5 font-mono">
            {myLeaveSummary.el.available}{' '}
            <span className="text-xs font-normal text-neutral-500">
              days available
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            +1.5 EL/month • Carry-forward 50% (Max 9d)
          </div>
        </button>

        {/* Card 2: Casual/Sick Leave (CSL) */}
        <button
          type="button"
          onClick={() => setActiveSection('CSL')}
          className={`p-4 text-left rounded-xl border transition-all cursor-pointer ${
            activeSection === 'CSL'
              ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
              : 'bg-white border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">
              2. Casual/Sick Leave (CSL)
            </span>
            <HeartPulse className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-neutral-900 mt-1.5 font-mono">
            {myLeaveSummary.csl.available}{' '}
            <span className="text-xs font-normal text-neutral-500">
              days available
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            +1.0 CSL/month • 3 Late Marks = -0.5 CSL
          </div>
        </button>

        {/* Card 3: Additional Leaves (AL) */}
        <button
          type="button"
          onClick={() => setActiveSection('AL')}
          className={`p-4 text-left rounded-xl border transition-all cursor-pointer ${
            activeSection === 'AL'
              ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
              : 'bg-white border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-amber-800">
              3. Additional Leaves (AL)
            </span>
            <Calendar className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-neutral-900 mt-1.5 font-mono">
            {alTypes.filter((a) => a.isActive).length}{' '}
            <span className="text-xs font-normal text-neutral-500">
              configured categories
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Maternity, Paternity, Bereavement, Comp Off
          </div>
        </button>

        {/* Card 4: Work From Home (WFH) */}
        <button
          type="button"
          onClick={() => setActiveSection('WFH')}
          className={`p-4 text-left rounded-xl border transition-all cursor-pointer ${
            activeSection === 'WFH'
              ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
              : 'bg-white border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-indigo-800">
              4. Work From Home (WFH)
            </span>
            <Home className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-neutral-900 mt-1.5 font-mono">
            {myWfhMonthStats.remainingThisMonth} / {maxWfhPerMonth}{' '}
            <span className="text-xs font-normal text-neutral-500">
              days left this month
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Used: {myWfhMonthStats.usedThisMonth}d • Zero leave deduction
          </div>
        </button>
      </div>

      {/* Admin Action Bar for Opening Leave Balances & Monthly Accrual Engine */}
      {isAdmin && (
        <div className="p-3.5 bg-neutral-900 text-white rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <div className="text-xs">
              <span className="font-bold">Admin Leave Controls:</span> Configure
              Opening Leave Balances (Migration), Additional Leave (AL) rules,
              and automated monthly accruals (+1.5 EL / +1.0 CSL).
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant={
                activeSection === 'ADMIN_OPENING' ? 'primary' : 'secondary'
              }
              icon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => setActiveSection('ADMIN_OPENING')}
            >
              Add Existing / Opening Leave Balances
            </Button>
            <Button
              size="xs"
              variant="outline"
              className="bg-neutral-800 text-white border-neutral-700 hover:bg-neutral-700"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => handleAdminRunAccrualForMonth(currentMonthKey)}
            >
              Process {currentMonthKey} Accrual (+1.5 EL / +1 CSL)
            </Button>
            <Button
              size="xs"
              variant="outline"
              className="bg-neutral-800 text-white border-neutral-700 hover:bg-neutral-700"
              onClick={handleAdminProcessYearEndRollover}
            >
              Run Year-End Rollover (50% EL Max 9d)
            </Button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 1: EARNED LEAVES (EL)                                         */}
      {/* ===================================================================== */}
      {activeSection === 'EL' && (
        <div className="space-y-5">
          <Card
            title="Section 1: Earned Leaves (EL) — Balance, Accrual & Carry-Forward Ledger"
            subtitle={`Policy: 1.5 EL automatically credited every month. Maximum year-end carry-forward is 50% of unused EL balance, subject to a maximum of 9 days (excess lapses at year-end).`}
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  setApplySection('EL');
                  setLeaveError('');
                  setApplyModalOpen(true);
                }}
              >
                Apply for Earned Leave (EL)
              </Button>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
                <div className="text-[11px] font-bold text-sky-800">
                  Available EL Balance
                </div>
                <div className="text-xl font-extrabold font-mono text-sky-900 mt-1">
                  {myLeaveSummary.el.available} d
                </div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] font-bold text-neutral-600">
                  Opening Balance
                </div>
                <div className="text-xl font-extrabold font-mono text-neutral-900 mt-1">
                  {myLeaveSummary.el.opening} d
                </div>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-[11px] font-bold text-emerald-800">
                  Monthly Credits (+1.5/mo)
                </div>
                <div className="text-xl font-extrabold font-mono text-emerald-900 mt-1">
                  +{myLeaveSummary.el.monthlyCredits} d
                </div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] font-bold text-neutral-600">
                  Carried Forward EL
                </div>
                <div className="text-xl font-extrabold font-mono text-neutral-900 mt-1">
                  {myLeaveSummary.el.carriedForward} d
                </div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-[11px] font-bold text-amber-800">
                  Used / Deducted EL
                </div>
                <div className="text-xl font-extrabold font-mono text-amber-900 mt-1">
                  {myLeaveSummary.el.used} d
                </div>
              </div>
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                <div className="text-[11px] font-bold text-indigo-800">
                  Eligible Year-End Carry (Max 9d)
                </div>
                <div className="text-xl font-extrabold font-mono text-indigo-900 mt-1">
                  {myLeaveSummary.el.projectedCarryForward} d
                </div>
                <div className="text-[10px] text-indigo-700">
                  Lapse: {myLeaveSummary.el.projectedLapse}d (50% rule)
                </div>
              </div>
            </div>

            {/* EL Transaction Ledger */}
            <div className="mt-4">
              <h4 className="text-xs font-bold uppercase text-neutral-500 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-sky-600" />
                <span>Earned Leave (EL) Complete Transaction History</span>
              </h4>
              <Table
                headers={[
                  'Effective Date',
                  'Transaction Type',
                  'Credit / Deduction',
                  'Balance After',
                  'Details & Remarks',
                  'Processed By',
                ]}
              >
                {(myBalanceDoc?.transactions || [])
                  .filter((t) => t.section === 'EL')
                  .map((tx) => (
                    <tr key={tx.id} className="hover:bg-neutral-50">
                      <td className="px-3 py-2 text-xs font-mono">
                        {tx.effectiveDate}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            tx.transactionType === 'OPENING_BALANCE'
                              ? 'info'
                              : tx.amount >= 0
                              ? 'success'
                              : 'warning'
                          }
                        >
                          {tx.transactionType.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td
                        className={`px-3 py-2 text-xs font-mono font-bold ${
                          tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} d
                      </td>
                      <td className="px-3 py-2 text-xs font-mono font-bold">
                        {tx.balanceAfter} d
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">
                        {tx.remark}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-500">
                        {tx.createdBy}
                      </td>
                    </tr>
                  ))}
              </Table>
            </div>
          </Card>

          {/* Manager / Admin Approval Queue for EL */}
          {canAccessApprovalQueue && (
            <Card
              title="Earned Leave (EL) Manager / Admin Approval Queue"
              subtitle="Review and approve or reject Earned Leave applications with team collision detection."
            >
              {approvalQueueLeaveRequests.filter((r) =>
                isLeaveInSection(r, 'EL')
              ).length === 0 ? (
                <EmptyState
                  title="No Earned Leave (EL) Requests in Queue"
                  description="EL applications from direct reports will appear here."
                />
              ) : (
                <Table
                  headers={[
                    'Employee',
                    'Dates & Days',
                    'Reason',
                    'Collision Check',
                    'Status',
                    'Actions',
                  ]}
                >
                  {approvalQueueLeaveRequests
                    .filter((r) => isLeaveInSection(r, 'EL'))
                    .map((req) => {
                      const collisions = PolicyEngine.detectLeaveCollisions(
                        req,
                        approvalQueueLeaveRequests
                      );
                      return (
                        <tr key={req.id}>
                          <td className="px-3 py-2.5 text-xs font-bold">
                            {req.employeeName}
                          </td>
                          <td className="px-3 py-2.5 text-xs font-mono">
                            {req.startDate} → {req.endDate} ({req.days}d)
                          </td>
                          <td className="px-3 py-2.5 text-xs text-neutral-600">
                            {req.reason}
                          </td>
                          <td className="px-3 py-2.5">
                            {collisions.length > 0 ? (
                              <Badge variant="warning">
                                Overlaps:{' '}
                                {collisions.map((c) => c.employeeName).join(', ')}
                              </Badge>
                            ) : (
                              <Badge variant="success">No Overlap</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge
                              variant={
                                req.status === 'Approved'
                                  ? 'success'
                                  : req.status === 'Rejected'
                                  ? 'danger'
                                  : 'warning'
                              }
                            >
                              {req.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            {req.status === 'Pending' ? (
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="xs"
                                  variant="success"
                                  onClick={() =>
                                    handleReviewLeave(req, 'Approved')
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="xs"
                                  variant="danger"
                                  onClick={() =>
                                    handleReviewLeave(req, 'Rejected')
                                  }
                                >
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-neutral-400">
                                {req.reviewedBy}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </Table>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: CASUAL/SICK LEAVE (CSL)                                    */}
      {/* ===================================================================== */}
      {activeSection === 'CSL' && (
        <div className="space-y-5">
          <Card
            title="Section 2: Casual/Sick Leave (CSL) & Late-Mark Deduction Ledger"
            subtitle="Policy: 1 CSL automatically credited every month. CSL is not carried forward to the next year (unused CSL lapses at year-end). Every 3 late marks automatically deduct 0.5 day from CSL."
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  setApplySection('CSL');
                  setLeaveError('');
                  setApplyModalOpen(true);
                }}
              >
                Apply for Casual/Sick Leave (CSL)
              </Button>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-[11px] font-bold text-emerald-800">
                  Available CSL Balance
                </div>
                <div className="text-xl font-extrabold font-mono text-emerald-900 mt-1">
                  {myLeaveSummary.csl.available} d
                </div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-[11px] font-bold text-neutral-600">
                  Opening CSL Balance
                </div>
                <div className="text-xl font-extrabold font-mono text-neutral-900 mt-1">
                  {myLeaveSummary.csl.opening} d
                </div>
              </div>
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
                <div className="text-[11px] font-bold text-sky-800">
                  Monthly Credits (+1.0/mo)
                </div>
                <div className="text-xl font-extrabold font-mono text-sky-900 mt-1">
                  +{myLeaveSummary.csl.monthlyCredits} d
                </div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-[11px] font-bold text-amber-800">
                  CSL Leave Used
                </div>
                <div className="text-xl font-extrabold font-mono text-amber-900 mt-1">
                  {myLeaveSummary.csl.used} d
                </div>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <div className="text-[11px] font-bold text-rose-800">
                  Late Marks Recorded
                </div>
                <div className="text-xl font-extrabold font-mono text-rose-900 mt-1">
                  {myLeaveSummary.csl.lateMarksCount} marks
                </div>
                <div className="text-[10px] text-rose-700">
                  3 Late Marks = 0.5 CSL
                </div>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <div className="text-[11px] font-bold text-rose-800">
                  Late-Mark CSL Deducted
                </div>
                <div className="text-xl font-extrabold font-mono text-rose-900 mt-1">
                  -{myLeaveSummary.csl.lateMarkDeductions} d
                </div>
                <div className="text-[10px] text-rose-700">
                  Year-end carry: 0d (Lapses)
                </div>
              </div>
            </div>

            {/* CSL & Late-Mark Transaction History */}
            <div className="mt-4">
              <h4 className="text-xs font-bold uppercase text-neutral-500 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  Casual/Sick Leave (CSL) & Late-Mark Deduction Transaction Ledger
                </span>
              </h4>
              <Table
                headers={[
                  'Effective Date',
                  'Transaction Type',
                  'Credit / Deduction',
                  'Balance After',
                  'Details & Remarks',
                  'Processed By',
                ]}
              >
                {(myBalanceDoc?.transactions || [])
                  .filter((t) => t.section === 'CSL')
                  .map((tx) => (
                    <tr key={tx.id} className="hover:bg-neutral-50">
                      <td className="px-3 py-2 text-xs font-mono">
                        {tx.effectiveDate}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            tx.transactionType === 'LATE_MARK_DEDUCTION'
                              ? 'danger'
                              : tx.transactionType === 'OPENING_BALANCE'
                              ? 'info'
                              : tx.amount >= 0
                              ? 'success'
                              : 'warning'
                          }
                        >
                          {tx.transactionType.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td
                        className={`px-3 py-2 text-xs font-mono font-bold ${
                          tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} d
                      </td>
                      <td className="px-3 py-2 text-xs font-mono font-bold">
                        {tx.balanceAfter} d
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">
                        {tx.remark}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-500">
                        {tx.createdBy}
                      </td>
                    </tr>
                  ))}
              </Table>
            </div>
          </Card>

          {/* Manager / Admin Approval Queue for CSL */}
          {canAccessApprovalQueue && (
            <Card
              title="Casual/Sick Leave (CSL) Manager / Admin Approval Queue"
              subtitle="Review and approve or reject CSL applications."
            >
              {approvalQueueLeaveRequests.filter((r) =>
                isLeaveInSection(r, 'CSL')
              ).length === 0 ? (
                <EmptyState
                  title="No Casual/Sick Leave (CSL) Requests in Queue"
                  description="CSL applications from direct reports will appear here."
                />
              ) : (
                <Table
                  headers={[
                    'Employee',
                    'Leave Type',
                    'Dates & Days',
                    'Reason',
                    'Status',
                    'Actions',
                  ]}
                >
                  {approvalQueueLeaveRequests
                    .filter((r) => isLeaveInSection(r, 'CSL'))
                    .map((req) => (
                      <tr key={req.id}>
                        <td className="px-3 py-2.5 text-xs font-bold">
                          {req.employeeName}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="success">{req.leaveType}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono">
                          {req.startDate} → {req.endDate} ({req.days}d)
                        </td>
                        <td className="px-3 py-2.5 text-xs text-neutral-600">
                          {req.reason}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant={
                              req.status === 'Approved'
                                ? 'success'
                                : req.status === 'Rejected'
                                ? 'danger'
                                : 'warning'
                            }
                          >
                            {req.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          {req.status === 'Pending' ? (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="xs"
                                variant="success"
                                onClick={() =>
                                  handleReviewLeave(req, 'Approved')
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="xs"
                                variant="danger"
                                onClick={() =>
                                  handleReviewLeave(req, 'Rejected')
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-400">
                              {req.reviewedBy}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </Table>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 3: ADDITIONAL LEAVES (AL)                                     */}
      {/* ===================================================================== */}
      {activeSection === 'AL' && (
        <div className="space-y-5">
          <Card
            title="Section 3: Additional Leaves (AL) — Special & Statutory Leave Categories"
            subtitle="All leave types other than EL and CSL (Maternity Leave, Paternity Leave, Bereavement Leave, Compensatory Off, Optional Holiday, Special Leave, LWP). Does not follow monthly EL/CSL accrual."
            action={
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Sliders className="w-4 h-4" />}
                    onClick={() => {
                      setEditingAlType(null);
                      setAlCodeInput('');
                      setAlNameInput('');
                      setAlDescInput('');
                      setAlAllocInput(5);
                      setAlEligibilityInput('All active employees');
                      setAlCarryInput(false);
                      setAlConfigModalOpen(true);
                    }}
                  >
                    + Add / Configure AL Type
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => {
                    setApplySection('AL');
                    setLeaveError('');
                    setApplyModalOpen(true);
                  }}
                >
                  Apply for Additional Leave (AL)
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mb-4">
              {alTypes
                .filter((a) => a.isActive)
                .map((al) => {
                  const info = getAlTypeBalanceInfo(currentEmployee.id, al);
                  return (
                    <div
                      key={al.id}
                      className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold text-neutral-900">
                            {al.name}
                          </span>
                          <Badge variant="info">{al.code}</Badge>
                        </div>
                        <p className="text-[11px] text-neutral-500 mt-1">
                          {al.description}
                        </p>
                        <div className="text-[10px] text-neutral-500 mt-1">
                          <strong>Eligibility:</strong> {al.eligibilityRule}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-neutral-200 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-neutral-500">Available: </span>
                          <strong className="font-mono text-neutral-900">
                            {info.available} / {info.allocated} d
                          </strong>
                          {info.used > 0 && (
                            <span className="ml-1.5 text-[10px] text-amber-700 font-mono">
                              (Used: {info.used}d)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAlType(al);
                                setAlCodeInput(al.code);
                                setAlNameInput(al.name);
                                setAlDescInput(al.description);
                                setAlAllocInput(al.annualAllocationDays);
                                setAlEligibilityInput(al.eligibilityRule);
                                setAlCarryInput(al.allowCarryForward);
                                setAlConfigModalOpen(true);
                              }}
                              className="text-[11px] font-bold text-sky-700 hover:underline cursor-pointer"
                            >
                              Edit Rule
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setApplySection('AL');
                              setSelectedAlType(al.code);
                              setLeaveError('');
                              setApplyModalOpen(true);
                            }}
                            className="px-2 py-1 text-[11px] font-bold bg-neutral-900 text-white rounded-md hover:bg-neutral-800 cursor-pointer"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>

          {/* AL Approval Queue & Personal Records */}
          {canAccessApprovalQueue && (
            <Card
              title="Additional Leaves (AL) Approval Queue (Admin / Manager)"
              subtitle="Approve, reject, or review Additional Leave applications by sub-type."
            >
              {approvalQueueLeaveRequests.filter((r) =>
                isLeaveInSection(r, 'AL')
              ).length === 0 ? (
                <EmptyState
                  title="No Additional Leave (AL) Applications Pending"
                  description="Maternity, Paternity, Bereavement, Comp Off, and Special Leave requests will appear here."
                />
              ) : (
                <Table
                  headers={[
                    'Employee',
                    'AL Category',
                    'Dates & Days',
                    'Reason',
                    'Status',
                    'Actions',
                  ]}
                >
                  {approvalQueueLeaveRequests
                    .filter((r) => isLeaveInSection(r, 'AL'))
                    .map((req) => (
                      <tr key={req.id}>
                        <td className="px-3 py-2.5 text-xs font-bold">
                          {req.employeeName}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="info">{req.leaveType}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono">
                          {req.startDate} → {req.endDate} ({req.days}d)
                        </td>
                        <td className="px-3 py-2.5 text-xs text-neutral-600">
                          {req.reason}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant={
                              req.status === 'Approved'
                                ? 'success'
                                : req.status === 'Rejected'
                                ? 'danger'
                                : 'warning'
                            }
                          >
                            {req.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          {req.status === 'Pending' ? (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="xs"
                                variant="success"
                                onClick={() =>
                                  handleReviewLeave(req, 'Approved')
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="xs"
                                variant="danger"
                                onClick={() =>
                                  handleReviewLeave(req, 'Rejected')
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-neutral-400">
                              {req.reviewedBy}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </Table>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 4: WORK FROM HOME (WFH)                                       */}
      {/* ===================================================================== */}
      {activeSection === 'WFH' && (
        <div className="space-y-5">
          <Card
            title="Section 4: Work From Home (WFH) — Monthly Quota & Approval Tracker"
            subtitle={`Policy: Maximum ${maxWfhPerMonth} WFH days per employee per calendar month. Approved WFH is recorded separately from EL, CSL, and AL and does NOT deduct from any leave balance.`}
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                disabled={myWfhMonthStats.remainingThisMonth <= 0}
                onClick={() => {
                  setWfhError('');
                  setWfhModalOpen(true);
                }}
              >
                Apply for Work From Home (WFH)
              </Button>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-5">
              <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl">
                <div className="text-xs font-bold text-indigo-800">
                  WFH Days Used This Month ({currentMonthKey})
                </div>
                <div className="text-2xl font-extrabold font-mono text-indigo-900 mt-1">
                  {myWfhMonthStats.usedThisMonth} / {maxWfhPerMonth} d
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-xs font-bold text-emerald-800">
                  Remaining WFH Days This Month
                </div>
                <div className="text-2xl font-extrabold font-mono text-emerald-900 mt-1">
                  {myWfhMonthStats.remainingThisMonth} d
                </div>
              </div>

              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs font-bold text-amber-800">
                  Pending WFH Applications
                </div>
                <div className="text-2xl font-extrabold font-mono text-amber-900 mt-1">
                  {myWfhMonthStats.pendingCount}{' '}
                  <span className="text-xs font-normal">
                    ({myWfhMonthStats.pendingDaysThisMonth}d)
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl">
                <div className="text-xs font-bold text-sky-800">
                  Approved WFH Applications
                </div>
                <div className="text-2xl font-extrabold font-mono text-sky-900 mt-1">
                  {myWfhMonthStats.approvedCount}
                </div>
                <div className="text-[10px] text-sky-700">
                  0 leave balance deducted
                </div>
              </div>
            </div>

            {/* My WFH Application History */}
            <h4 className="text-xs font-bold uppercase text-neutral-500 mb-2">
              My Work From Home (WFH) Application History
            </h4>
            {myWfhRequests.length === 0 ? (
              <EmptyState
                title="No Work From Home Applications Yet"
                description={`You can apply for up to ${maxWfhPerMonth} WFH days per calendar month without deducting from your leave balances.`}
              />
            ) : (
              <Table
                headers={[
                  'Month',
                  'WFH Dates & Days',
                  'Reason / Comment',
                  'Leave Deduction',
                  'Status',
                  'Reviewed By',
                ]}
              >
                {myWfhRequests.map((w) => (
                  <tr key={w.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-2.5 text-xs font-mono font-bold">
                      {w.monthKey}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono">
                      {w.startDate} → {w.endDate} ({w.days}d)
                    </td>
                    <td className="px-3 py-2.5 text-xs text-neutral-600">
                      {w.reason || '-'}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="neutral">0 Days (Separate WFH)</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant={
                          w.status === 'Approved'
                            ? 'success'
                            : w.status === 'Rejected'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {w.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-neutral-500">
                      {w.reviewedBy || 'Pending Manager / Admin'}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          {/* Manager / Admin WFH Approval Queue */}
          {canAccessApprovalQueue && (
            <Card
              title="Work From Home (WFH) Manager / Admin Approval Queue"
              subtitle="Approve or reject employee WFH applications."
            >
              {approvalQueueWfhRequests.length === 0 ? (
                <EmptyState
                  title="No WFH Requests in Approval Queue"
                  description="Employee WFH requests will appear here for Manager / Admin approval."
                />
              ) : (
                <Table
                  headers={[
                    'Employee',
                    'Month',
                    'WFH Dates & Days',
                    'Reason / Comment',
                    'Status',
                    'Actions',
                  ]}
                >
                  {approvalQueueWfhRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-neutral-50">
                      <td className="px-3 py-2.5 text-xs font-bold">
                        {req.employeeName}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono">
                        {req.monthKey}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono">
                        {req.startDate} → {req.endDate} ({req.days}d)
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-600">
                        {req.reason || '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant={
                            req.status === 'Approved'
                              ? 'success'
                              : req.status === 'Rejected'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {req.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {req.status === 'Pending' ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="xs"
                              variant="success"
                              onClick={() => handleReviewWfh(req, 'Approved')}
                            >
                              Approve WFH
                            </Button>
                            <Button
                              size="xs"
                              variant="danger"
                              onClick={() => handleReviewWfh(req, 'Rejected')}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400">
                            {req.reviewedBy}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* ADMIN SECTION 2.4: ADD EXISTING / OPENING LEAVE BALANCES              */}
      {/* ===================================================================== */}
      {activeSection === 'ADMIN_OPENING' && isAdmin && (
        <div className="space-y-6">
          <Card
            title="Admin Option — Add Existing Employee Leave Balances (Opening Leave Balance)"
            subtitle="Enter accumulated opening balances for EL, CSL, and AL by leave type with effective date and remark. Recorded separately as Opening Balances in the transaction history without overwriting existing records or duplicating monthly credits."
          >
            <form
              onSubmit={handleSaveSingleOpeningBalance}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Select Employee *
                  </label>
                  <select
                    value={openingEmpId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setOpeningEmpId(id);
                      const existing = openingBalances.find(
                        (o) => o.employeeId === id
                      );
                      const empBal = leaveBalances.find(
                        (b) => b.employeeId === id
                      );
                      setOpeningElInput(
                        existing?.openingEL ?? empBal?.elOpeningBalance ?? 0
                      );
                      setOpeningCslInput(
                        existing?.openingCSL ?? empBal?.cslOpeningBalance ?? 0
                      );
                      if (existing?.openingAL) {
                        setOpeningAlInputs(existing.openingAL);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.ecode}) — {emp.department}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-sky-800 mb-1">
                    Existing / Opening EL Balance *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    required
                    value={openingElInput}
                    onChange={(e) => setOpeningElInput(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-800 mb-1">
                    Existing / Opening CSL Balance *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    required
                    value={openingCslInput}
                    onChange={(e) => setOpeningCslInput(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Existing AL Balances by Leave Type */}
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-xs font-bold text-neutral-800 mb-2">
                  Existing Additional Leave (AL) Balances by Leave Type
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {alTypes
                    .filter((a) => a.isActive)
                    .map((al) => (
                      <div key={al.id}>
                        <label className="block text-[11px] font-bold text-neutral-600 mb-1 truncate">
                          {al.code}
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          value={
                            openingAlInputs[al.code] ??
                            al.annualAllocationDays
                          }
                          onChange={(e) =>
                            setOpeningAlInputs((prev) => ({
                              ...prev,
                              [al.code]: Number(e.target.value),
                            }))
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-neutral-300 rounded-lg bg-white"
                        />
                      </div>
                    ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Effective Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={openingEffectiveDate}
                    onChange={(e) => setOpeningEffectiveDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Description / Remark (Optional)
                  </label>
                  <input
                    type="text"
                    value={openingRemark}
                    onChange={(e) => setOpeningRemark(e.target.value)}
                    placeholder="e.g. Pre-migration accumulated leave balance"
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>

                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    icon={<CheckCircle2 className="w-4 h-4" />}
                  >
                    Save Opening Leave Balance
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {/* Bulk CSV / Excel Upload for Opening Leave Balances */}
          <Card
            title={
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>
                  Bulk Upload Existing Leave Balances (CSV / Excel Compatible)
                </span>
              </div>
            }
            subtitle="Format: ECode, Opening_EL, Opening_CSL, Opening_CompOff, EffectiveDate, Remark"
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-neutral-600 font-mono">
                  Example:{' '}
                  <code>
                    #GSL014, 6.5, 3.0, 2, 2026-11-01, Migrated from previous
                    HRMS
                  </code>
                </span>
                <label className="px-3 py-1.5 text-xs font-bold bg-neutral-100 border border-neutral-300 rounded-lg cursor-pointer hover:bg-neutral-200">
                  Upload .CSV File
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <textarea
                rows={4}
                value={csvBulkText}
                onChange={(e) => setCsvBulkText(e.target.value)}
                placeholder={`ECode,Opening_EL,Opening_CSL,Opening_CompOff,EffectiveDate,Remark\n#GSL014,6.5,3.0,2,2026-11-01,Opening balance migration\n#GSL002,4.5,2.0,2,2026-11-01,Opening balance migration`}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Upload className="w-4 h-4" />}
                  onClick={handleBulkCsvUploadOpeningBalances}
                >
                  Import Bulk Opening Leave Balances
                </Button>
              </div>
            </div>
          </Card>

          {/* Opening Leave Balance Audit Registry */}
          <Card
            title="Opening Leave Balances Audit Log (showup_opening_leave_balances)"
            subtitle="Complete record of opening balances added or modified by Admin."
          >
            {openingBalances.length === 0 ? (
              <EmptyState
                title="No Opening Leave Balances Added Yet"
                description="Use the form or bulk CSV importer above to enter pre-existing employee leave balances."
              />
            ) : (
              <Table
                headers={[
                  'Employee',
                  'Opening EL',
                  'Opening CSL',
                  'Effective Date',
                  'Remark',
                  'Added / Modified By',
                  'Timestamp',
                ]}
              >
                {openingBalances.map((ob) => (
                  <tr key={ob.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-2.5 text-xs font-bold">
                      {ob.employeeName} ({ob.employeeEcode})
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono font-bold text-sky-800">
                      {ob.openingEL} d
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono font-bold text-emerald-800">
                      {ob.openingCSL} d
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono">
                      {ob.effectiveDate}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-neutral-600">
                      {ob.remark}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-semibold">
                      {ob.addedBy}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-neutral-500">
                      {new Date(ob.updatedAt || ob.addedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* Personal Leave Applications Across EL, CSL, AL */}
      {activeSection !== 'WFH' && activeSection !== 'ADMIN_OPENING' && (
        <Card
          title={`My Submitted ${
            activeSection === 'EL'
              ? 'Earned Leave (EL)'
              : activeSection === 'CSL'
              ? 'Casual/Sick Leave (CSL)'
              : 'Additional Leave (AL)'
          } Applications`}
          subtitle="Track your personal leave requests and approval status."
        >
          {myOwnLeaveRequests.filter((r) => isLeaveInSection(r, activeSection))
            .length === 0 ? (
            <EmptyState
              title={`No ${activeSection} Leave Applications Submitted`}
              description="Click the Apply button above to submit a new application."
            />
          ) : (
            <Table
              headers={[
                'Category',
                'Date Range & Days',
                'Reason',
                'Status',
                'Review Details',
              ]}
            >
              {myOwnLeaveRequests
                .filter((r) => isLeaveInSection(r, activeSection))
                .map((req) => (
                  <tr key={req.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <Badge variant="info">{req.leaveType}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {req.startDate} → {req.endDate} ({req.days}d)
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {req.reason}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          req.status === 'Approved'
                            ? 'success'
                            : req.status === 'Rejected'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {req.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {req.status === 'Pending'
                        ? 'Pending Manager / Admin Approval'
                        : `Reviewed by ${req.reviewedBy || 'Manager'}`}
                    </td>
                  </tr>
                ))}
            </Table>
          )}
        </Card>
      )}

      {/* MODAL: Apply for EL, CSL, or AL */}
      <Modal
        isOpen={applyModalOpen}
        onClose={() => setApplyModalOpen(false)}
        size="md"
        title={
          applySection === 'EL'
            ? 'Apply for Earned Leave (EL)'
            : applySection === 'CSL'
            ? 'Apply for Casual/Sick Leave (CSL)'
            : 'Apply for Additional Leave (AL)'
        }
        subtitle={
          applySection === 'EL'
            ? `Available EL: ${myLeaveSummary.el.available} days • Advance notice policy: ${policy.elAdvanceNoticeDays} days.`
            : applySection === 'CSL'
            ? `Available CSL: ${myLeaveSummary.csl.available} days • Accrues 1.0 day/month.`
            : 'Select the applicable Additional Leave (AL) type below.'
        }
      >
        <form onSubmit={handleSubmitLeaveApplication} className="space-y-4">
          {leaveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{leaveError}</span>
            </div>
          )}

          {applySection === 'AL' && (
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Additional Leave (AL) Type *
              </label>
              <select
                value={selectedAlType}
                onChange={(e) => setSelectedAlType(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
              >
                {alTypes
                  .filter((a) => a.isActive)
                  .map((al) => {
                    const info = getAlTypeBalanceInfo(currentEmployee.id, al);
                    return (
                      <option key={al.id} value={al.code}>
                        {al.name} ({info.available} day(s) available)
                      </option>
                    );
                  })}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={leaveStart}
                onChange={(e) => setLeaveStart(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                End Date *
              </label>
              <input
                type="date"
                required
                value={leaveEnd}
                onChange={(e) => setLeaveEnd(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
          </div>

          {leaveStart === leaveEnd && (
            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isHalfDayLeave}
                onChange={(e) => setIsHalfDayLeave(e.target.checked)}
              />
              <span>Apply for Half-Day Leave (0.5 day)</span>
            </label>
          )}

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Reason for Leave *
            </label>
            <textarea
              rows={2}
              required
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              placeholder="Provide reason for leave application..."
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setApplyModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Submit Application
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Apply for Work From Home (WFH) */}
      <Modal
        isOpen={wfhModalOpen}
        onClose={() => setWfhModalOpen(false)}
        size="md"
        title="Apply for Work From Home (WFH)"
        subtitle={`Monthly WFH Limit: ${maxWfhPerMonth} days/month • Remaining this month: ${myWfhMonthStats.remainingThisMonth} day(s) • Does not deduct from leave balance.`}
      >
        <form onSubmit={handleSubmitWfhRequest} className="space-y-4">
          {wfhError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{wfhError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                WFH Start Date *
              </label>
              <input
                type="date"
                required
                value={wfhStart}
                onChange={(e) => {
                  setWfhStart(e.target.value);
                  if (wfhEnd < e.target.value) setWfhEnd(e.target.value);
                }}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                WFH End Date *
              </label>
              <input
                type="date"
                required
                value={wfhEnd}
                onChange={(e) => setWfhEnd(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Reason / Comment (Optional)
            </label>
            <textarea
              rows={2}
              value={wfhReason}
              onChange={(e) => setWfhReason(e.target.value)}
              placeholder="Optional note or deliverables planned during WFH..."
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWfhModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Submit WFH Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Admin Configure Additional Leave Type (AL) */}
      <Modal
        isOpen={alConfigModalOpen}
        onClose={() => setAlConfigModalOpen(false)}
        size="md"
        title={
          editingAlType
            ? `Configure Additional Leave Type — ${editingAlType.name}`
            : 'Add New Additional Leave (AL) Type'
        }
        subtitle="Define rules, eligibility, and leave allocation under Additional Leaves (AL)."
      >
        <form onSubmit={handleSaveAlTypeConfig} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Leave Code *
              </label>
              <input
                type="text"
                required
                value={alCodeInput}
                onChange={(e) => setAlCodeInput(e.target.value)}
                placeholder="e.g. Bereavement / Sabbatical"
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Allocation (Days / Year) *
              </label>
              <input
                type="number"
                min={0}
                required
                value={alAllocInput}
                onChange={(e) => setAlAllocInput(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Full Display Name *
            </label>
            <input
              type="text"
              required
              value={alNameInput}
              onChange={(e) => setAlNameInput(e.target.value)}
              placeholder="e.g. Bereavement Leave"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Policy Description
            </label>
            <textarea
              rows={2}
              value={alDescInput}
              onChange={(e) => setAlDescInput(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Eligibility Rule
            </label>
            <input
              type="text"
              value={alEligibilityInput}
              onChange={(e) => setAlEligibilityInput(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAlConfigModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save AL Configuration
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
