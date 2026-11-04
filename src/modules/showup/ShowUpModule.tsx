import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  FileCheck,
  IndianRupee,
  FolderLock,
  Sliders,
  AlertTriangle,
  Plus,
  Printer,
  Lock,
  CheckCircle2,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Tabs,
  Table,
  Modal,
  EmptyState,
  useToast,
} from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { PermissionsService } from '../../core/services/permissionsService';
import { AuditService } from '../../core/services/auditService';
import { NotificationService } from '../../core/services/notificationService';
import { SEED_SHOWUP_POLICY } from '../../core/seedData';
import { PolicyEngine } from './policyEngine';
import { PunchWidget } from './PunchWidget';
import { AttendanceCalendar } from './AttendanceCalendar';
import { DocumentVaultView } from './DocumentVaultView';
import type {
  Employee,
  ShowupAttendanceRecord,
  ShowupPolicyConfig,
  ShowupLeaveBalance,
  ShowupLeaveRequest,
  ShowupRegularization,
  ShowupHoliday,
  ShowupSalaryStructure,
  ShowupPayslip,
  ShowupDocument,
  CompensationLockConfig,
  LeaveType,
} from '../../core/types';

export const ShowUpModule: React.FC<{
  currentEmployee: Employee;
}> = ({ currentEmployee }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<
    | 'attendance'
    | 'leaves'
    | 'regularization'
    | 'payroll'
    | 'vault'
    | 'policy-admin'
  >('attendance');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<ShowupAttendanceRecord[]>([]);
  const [policy, setPolicy] = useState<ShowupPolicyConfig>(SEED_SHOWUP_POLICY);
  const [leaveBalances, setLeaveBalances] = useState<ShowupLeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<ShowupLeaveRequest[]>([]);
  const [regularizations, setRegularizations] = useState<
    ShowupRegularization[]
  >([]);
  const [holidays, setHolidays] = useState<ShowupHoliday[]>([]);
  const [salaryStructures, setSalaryStructures] = useState<
    ShowupSalaryStructure[]
  >([]);
  const [payslips, setPayslips] = useState<ShowupPayslip[]>([]);
  const [documents, setDocuments] = useState<ShowupDocument[]>([]);
  const [lockConfig, setLockConfig] = useState<CompensationLockConfig | null>(
    null
  );

  // Leave Request Form
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>('CL');
  const [leaveStart, setLeaveStart] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [leaveEnd, setLeaveEnd] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveError, setLeaveError] = useState('');

  // Regularization Form
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [regDate, setRegDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [regPunchIn, setRegPunchIn] = useState('09:30');
  const [regPunchOut, setRegPunchOut] = useState('18:30');
  const [regReason, setRegReason] = useState('');

  // Payroll & Payslip Viewer
  const [payrollMonth, setPayrollMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [ctcModalEmp, setCtcModalEmp] = useState<Employee | null>(null);
  const [annualCtcInput, setAnnualCtcInput] = useState<number>(1200000);
  const [viewingPayslip, setViewingPayslip] = useState<ShowupPayslip | null>(
    null
  );

  // Holiday Form
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');

  useEffect(() => {
    const u1 = FirestoreEngine.subscribeCollection<Employee>(
      'employees',
      setEmployees
    );
    const u2 = FirestoreEngine.subscribeCollection<ShowupAttendanceRecord>(
      'showup_attendance',
      setAttendance
    );
    const u3 = FirestoreEngine.subscribeCollection<ShowupPolicyConfig>(
      'showup_policy',
      (items) => {
        const found = items.find((i) => i.id === 'default_policy');
        if (found) setPolicy(found);
      }
    );
    const u4 = FirestoreEngine.subscribeCollection<ShowupLeaveBalance>(
      'showup_leave_balances',
      setLeaveBalances
    );
    const u5 = FirestoreEngine.subscribeCollection<ShowupLeaveRequest>(
      'showup_leave_requests',
      setLeaveRequests
    );
    const u6 = FirestoreEngine.subscribeCollection<ShowupRegularization>(
      'showup_regularizations',
      setRegularizations
    );
    const u7 = FirestoreEngine.subscribeCollection<ShowupHoliday>(
      'showup_holidays',
      setHolidays
    );
    const u8 = FirestoreEngine.subscribeCollection<ShowupSalaryStructure>(
      'showup_salary_structures',
      setSalaryStructures
    );
    const u9 = FirestoreEngine.subscribeCollection<ShowupPayslip>(
      'showup_payslips',
      setPayslips
    );
    const u10 = FirestoreEngine.subscribeCollection<ShowupDocument>(
      'showup_documents',
      setDocuments
    );
    const u11 = FirestoreEngine.subscribeCollection<CompensationLockConfig>(
      'showup_compensation_lock',
      (items) => {
        const found = items.find((i) => i.id === 'global_lock');
        if (found) setLockConfig(found);
      }
    );
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
      u9();
      u10();
      u11();
    };
  }, []);

  const isAdmin = PermissionsService.isAdmin(currentEmployee);
  const isCEO = PermissionsService.isCEO(currentEmployee);
  const isManager = PermissionsService.isManager(currentEmployee);

  const todayStr = new Date().toISOString().slice(0, 10);
  const myAttendance = attendance.filter(
    (r) => r.employeeId === currentEmployee.id
  );
  const todayRecord =
    myAttendance.find((r) => r.date === todayStr) || null;
  const myLeaveBalance =
    leaveBalances.find((b) => b.employeeId === currentEmployee.id) || null;

  const STATUTORY_LEAVE_TYPES: LeaveType[] = [
    'CL',
    'SL',
    'EL',
    'Optional',
    'Maternity',
    'Paternity',
    'Comp Off',
    'LWP',
  ];

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveError('');

    const validation = PolicyEngine.validateLeavePolicy(
      leaveType,
      leaveStart,
      policy
    );
    if (!validation.valid) {
      setLeaveError(validation.error || 'Leave policy validation failed.');
      return;
    }

    const startMs = new Date(leaveStart).getTime();
    const endMs = new Date(leaveEnd).getTime();
    if (endMs < startMs) {
      setLeaveError('End date cannot be earlier than start date.');
      return;
    }
    const days = Math.max(
      1,
      Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1
    );

    const newReq: ShowupLeaveRequest = {
      id: `leave_${Date.now()}`,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      department: currentEmployee.department,
      reportingManagerId: currentEmployee.reportingManagerId || 'EMP-001',
      leaveType,
      startDate: leaveStart,
      endDate: leaveEnd,
      days,
      reason: leaveReason.trim(),
      status: 'Pending',
      appliedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('showup_leave_requests', newReq.id, newReq);
    await NotificationService.create({
      recipientId: newReq.reportingManagerId,
      title: 'New Leave Request Pending Approval',
      message: `${currentEmployee.name} requested ${days} day(s) of ${leaveType} (${leaveStart} to ${leaveEnd}).`,
      route: '/showup',
      actorName: currentEmployee.name,
    });
    if (newReq.reportingManagerId !== 'EMP-001') {
      await NotificationService.create({
        recipientId: 'EMP-001',
        title: 'New Leave Request Pending Approval',
        message: `${currentEmployee.name} requested ${days} day(s) of ${leaveType} (${leaveStart} to ${leaveEnd}).`,
        route: '/showup',
        actorName: currentEmployee.name,
      });
    }

    showToast(
      'success',
      'Leave Application Submitted',
      `${days} day(s) of ${leaveType} submitted for manager approval.`
    );
    setLeaveReason('');
    setLeaveModalOpen(false);
  };

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
      const currentBalances = empBal?.balances || {
        CL: 12,
        SL: 10,
        EL: 15,
        Optional: 3,
        Maternity: 180,
        Paternity: 15,
        'Comp Off': 2,
        LWP: 365,
      };
      const updatedBalances = {
        ...currentBalances,
        [req.leaveType]: Math.max(
          0,
          (currentBalances[req.leaveType] || 0) - req.days
        ),
      };
      await FirestoreEngine.setDocument('showup_leave_balances', req.employeeId, {
        id: req.employeeId,
        employeeId: req.employeeId,
        balances: updatedBalances,
        lateMarksCount: empBal?.lateMarksCount || 0,
        lateLeaveDeducted: empBal?.lateLeaveDeducted || 0,
        updatedAt: new Date().toISOString(),
      });
    }

    await NotificationService.create({
      recipientId: req.employeeId,
      title: `Leave Request ${decision}`,
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
      `${req.employeeName}'s ${req.leaveType} request marked as ${decision}.`
    );
  };

  const handleSubmitRegularization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regReason.trim()) return;
    const reg: ShowupRegularization = {
      id: `reg_${Date.now()}`,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      reportingManagerId: currentEmployee.reportingManagerId || 'EMP-001',
      date: regDate,
      requestedPunchIn: regPunchIn,
      requestedPunchOut: regPunchOut,
      reason: regReason.trim(),
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };
    await FirestoreEngine.setDocument('showup_regularizations', reg.id, reg);
    await NotificationService.create({
      recipientId: reg.reportingManagerId,
      title: 'New Attendance Regularization Request',
      message: `${currentEmployee.name} requested punch regularization for ${regDate} (${regPunchIn}–${regPunchOut}).`,
      route: '/showup',
      actorName: currentEmployee.name,
    });
    if (reg.reportingManagerId !== 'EMP-001') {
      await NotificationService.create({
        recipientId: 'EMP-001',
        title: 'New Attendance Regularization Request',
        message: `${currentEmployee.name} requested punch regularization for ${regDate} (${regPunchIn}–${regPunchOut}).`,
        route: '/showup',
        actorName: currentEmployee.name,
      });
    }
    showToast(
      'success',
      'Regularization Request Submitted',
      `Requested correction for ${regDate} (${regPunchIn}–${regPunchOut}).`
    );
    setRegReason('');
    setRegModalOpen(false);
  };

  const handleReviewRegularization = async (
    reg: ShowupRegularization,
    decision: 'Approved' | 'Rejected'
  ) => {
    if (
      !PermissionsService.canManageLeaveOrRegularization(
        currentEmployee,
        reg,
        employees
      )
    ) {
      showToast(
        'error',
        'Access Denied',
        'Only the assigned Reporting Manager or Admin can review this regularization request.'
      );
      return;
    }

    await FirestoreEngine.updateDocument<ShowupRegularization>(
      'showup_regularizations',
      reg.id,
      {
        status: decision,
        reviewedBy: currentEmployee.name,
        reviewedAt: new Date().toISOString(),
      }
    );

    if (decision === 'Approved') {
      const [inH, inM] = reg.requestedPunchIn.split(':').map(Number);
      const [outH, outM] = reg.requestedPunchOut.split(':').map(Number);
      const totalHours = Math.max(
        0,
        Math.round(((outH * 60 + outM - (inH * 60 + inM)) / 60) * 100) / 100
      );
      const isLate = PolicyEngine.isPunchInLate(reg.requestedPunchIn, policy);
      const evalStatus = PolicyEngine.evaluateAttendanceStatus(
        totalHours,
        isLate,
        policy
      );

      const attId = `${reg.employeeId}_${reg.date}`;
      const newAtt: ShowupAttendanceRecord = {
        id: attId,
        employeeId: reg.employeeId,
        employeeName: reg.employeeName,
        date: reg.date,
        status: evalStatus.status,
        punches: [
          {
            type: 'IN',
            timestamp: `${reg.date}T${reg.requestedPunchIn}:00`,
            locationNote: 'Regularized Punch',
          },
          {
            type: 'OUT',
            timestamp: `${reg.date}T${reg.requestedPunchOut}:00`,
            locationNote: 'Regularized Punch',
          },
        ],
        totalHours,
        isLate,
        isHalfDay: evalStatus.isHalfDay,
      };
      await FirestoreEngine.setDocument('showup_attendance', attId, newAtt);
    }

    await NotificationService.create({
      recipientId: reg.employeeId,
      title: `Regularization Request ${decision}`,
      message: `Your attendance regularization for ${reg.date} (${reg.requestedPunchIn}–${reg.requestedPunchOut}) was ${decision.toLowerCase()} by ${currentEmployee.name}.`,
      route: '/showup',
      actorName: currentEmployee.name,
    });

    await AuditService.log({
      action: `REGULARIZATION_${decision.toUpperCase()}`,
      actor: currentEmployee,
      targetId: reg.id,
      targetType: 'ShowupRegularization',
      details: `${decision} attendance regularization for ${reg.employeeName} on ${reg.date}.`,
    });
    showToast(
      decision === 'Approved' ? 'success' : 'warning',
      `Regularization ${decision}`,
      `Attendance record for ${reg.date} updated.`
    );
  };

  const handleSaveSalaryStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctcModalEmp) return;
    const calc = PolicyEngine.calculateIndianCtcStructure(annualCtcInput);
    const struct: ShowupSalaryStructure = {
      id: ctcModalEmp.id,
      employeeId: ctcModalEmp.id,
      employeeName: ctcModalEmp.name,
      employeeEcode: ctcModalEmp.ecode,
      ...calc,
      updatedAt: new Date().toISOString(),
    };
    await FirestoreEngine.setDocument(
      'showup_salary_structures',
      struct.id,
      struct
    );
    await AuditService.log({
      action: 'SALARY_STRUCTURE_UPDATED',
      actor: currentEmployee,
      targetId: ctcModalEmp.id,
      targetType: 'ShowupSalaryStructure',
      details: `Configured Indian CTC structure for ${ctcModalEmp.name} (${ctcModalEmp.ecode}): Annual CTC ₹${annualCtcInput.toLocaleString('en-IN')}.`,
    });
    showToast(
      'success',
      'Indian CTC Structure Saved',
      `Monthly Gross ₹${calc.monthlyGross.toLocaleString('en-IN')} configured for ${ctcModalEmp.name}.`
    );
    setCtcModalEmp(null);
  };

  const handleBulkGeneratePayroll = async () => {
    for (const emp of employees) {
      let struct = salaryStructures.find((s) => s.employeeId === emp.id);
      if (!struct) {
        const defaultAnnual = emp.level >= 4 ? 2400000 : emp.level === 0 ? 360000 : 1200000;
        const calc = PolicyEngine.calculateIndianCtcStructure(defaultAnnual);
        struct = {
          id: emp.id,
          employeeId: emp.id,
          employeeName: emp.name,
          employeeEcode: emp.ecode,
          ...calc,
          updatedAt: new Date().toISOString(),
        };
        await FirestoreEngine.setDocument(
          'showup_salary_structures',
          struct.id,
          struct
        );
      }

      // Compute LWP & Late leave deductions
      const empBal = leaveBalances.find((b) => b.employeeId === emp.id);
      const lateDeductionDays = empBal?.lateLeaveDeducted || 0;
      const empLwpLeaves = leaveRequests
        .filter(
          (r) =>
            r.employeeId === emp.id &&
            r.leaveType === 'LWP' &&
            r.status === 'Approved' &&
            r.startDate.startsWith(payrollMonth)
        )
        .reduce((acc, r) => acc + r.days, 0);

      const totalUnpaidDays = empLwpLeaves + lateDeductionDays;
      const perDayPay = struct.monthlyGross / 30;
      const lwpDeduction = Math.round(totalUnpaidDays * perDayPay);
      const totalDeductions =
        struct.employeePf +
        struct.professionalTax +
        struct.tdsMonthly +
        lwpDeduction;
      const netPay = Math.max(0, struct.monthlyGross - totalDeductions);

      const slipId = `${emp.id}_${payrollMonth}`;
      const slip: ShowupPayslip = {
        id: slipId,
        employeeId: emp.id,
        employeeName: emp.name,
        employeeEcode: emp.ecode,
        designation: emp.designation,
        department: emp.department,
        month: payrollMonth,
        paidDays: Math.max(0, 30 - totalUnpaidDays),
        lwpDays: empLwpLeaves,
        lateDeductionDays,
        grossEarnings: struct.monthlyGross,
        basic: struct.basic,
        hra: struct.hra,
        conveyance: struct.conveyance,
        medical: struct.medical,
        specialAllowance: struct.specialAllowance,
        employeePf: struct.employeePf,
        employerPf: struct.employerPf,
        professionalTax: struct.professionalTax,
        tds: struct.tdsMonthly,
        lwpDeduction,
        totalDeductions,
        netPay,
        netPayInWords: PolicyEngine.numberToIndianWords(netPay),
        generatedAt: new Date().toISOString(),
        generatedBy: currentEmployee.name,
      };
      await FirestoreEngine.setDocument('showup_payslips', slip.id, slip);
    }

    await AuditService.log({
      action: 'BULK_PAYROLL_GENERATED',
      actor: currentEmployee,
      targetId: payrollMonth,
      targetType: 'ShowupPayslipBatch',
      details: `Generated statutory Indian CTC payslips for ${employees.length} employee(s) for month ${payrollMonth}.`,
    });

    showToast(
      'success',
      'Bulk Payroll Generated',
      `Payslips generated for ${employees.length} employee(s) (${payrollMonth}).`
    );
  };

  const isMyCompensationLocked =
    PermissionsService.isCompensationLockedForViewer(
      currentEmployee,
      currentEmployee.id,
      lockConfig
    );

  // Strict RBAC Filtering: Requests are visible ONLY to the employee's Reporting Manager and Admin
  // (plus the employee's own personal submission history)
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

  const canAccessManagerApprovalQueue = isAdmin || hasDirectReports || isManager;

  const approvalQueueLeaveRequests = leaveRequests.filter((req) =>
    PermissionsService.canManageLeaveOrRegularization(
      currentEmployee,
      req,
      employees
    )
  );

  const myOwnLeaveRequests = leaveRequests.filter((req) => {
    const reqNorm = PermissionsService.normalizeEmpId(req.employeeId);
    return reqNorm === currentNormId || reqNorm === currentNormEcode;
  });

  const approvalQueueRegularizations = regularizations.filter((reg) =>
    PermissionsService.canManageLeaveOrRegularization(
      currentEmployee,
      reg,
      employees
    )
  );

  const myOwnRegularizations = regularizations.filter((reg) => {
    const regNorm = PermissionsService.normalizeEmpId(reg.employeeId);
    return regNorm === currentNormId || regNorm === currentNormEcode;
  });

  const pendingLeaveBadgeCount = canAccessManagerApprovalQueue
    ? approvalQueueLeaveRequests.filter((r) => r.status === 'Pending').length
    : myOwnLeaveRequests.filter((r) => r.status === 'Pending').length;

  const pendingRegBadgeCount = canAccessManagerApprovalQueue
    ? approvalQueueRegularizations.filter((r) => r.status === 'Pending').length
    : myOwnRegularizations.filter((r) => r.status === 'Pending').length;

  const visibleDocumentsCount = documents.filter(
    (d) => isAdmin || d.employeeId === currentEmployee.id
  ).length;

  const tabs = [
    {
      id: 'attendance',
      label: 'Attendance & Virtual Punch',
      icon: <Clock className="w-3.5 h-3.5" />,
    },
    {
      id: 'leaves',
      label: 'Leave Management & Collision Detector',
      icon: <Calendar className="w-3.5 h-3.5" />,
      badge: pendingLeaveBadgeCount,
    },
    {
      id: 'regularization',
      label: 'Regularization Queue',
      icon: <FileCheck className="w-3.5 h-3.5" />,
      badge: pendingRegBadgeCount,
    },
    {
      id: 'payroll',
      label: 'Statutory Indian CTC Payroll',
      icon: <IndianRupee className="w-3.5 h-3.5" />,
    },
    {
      id: 'vault',
      label: 'Document Vault',
      icon: <FolderLock className="w-3.5 h-3.5" />,
      badge: visibleDocumentsCount,
    },
    ...(isAdmin
      ? [
          {
            id: 'policy-admin',
            label: 'HRMS Policy & Holidays',
            icon: <Sliders className="w-3.5 h-3.5" />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* TAB 1: ATTENDANCE & VIRTUAL PUNCH */}
      {activeTab === 'attendance' && (
        <div className="space-y-5">
          <PunchWidget
            currentEmployee={currentEmployee}
            todayRecord={todayRecord}
            policy={policy}
            leaveBalance={myLeaveBalance}
          />
          <AttendanceCalendar records={myAttendance} holidays={holidays} />
        </div>
      )}

      {/* TAB 2: LEAVE MANAGEMENT & COLLISION DETECTOR */}
      {activeTab === 'leaves' && (
        <div className="space-y-5">
          {/* 8 Statutory Leave Balances */}
          <Card
            title="8 Statutory Leave Balances & Late-Mark Deduction Ledger"
            subtitle={`Rule: ${policy.lateMarksPerDeduction} late marks trigger an automated deduction of ${policy.lateDeductionDays} days of leave. EL requires ${policy.elAdvanceNoticeDays}-day advance notice.`}
            action={
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  setLeaveError('');
                  setLeaveModalOpen(true);
                }}
              >
                Apply for Leave
              </Button>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-4">
              {STATUTORY_LEAVE_TYPES.map((lt) => {
                const bal =
                  myLeaveBalance?.balances?.[lt] ??
                  (lt === 'CL'
                    ? 12
                    : lt === 'SL'
                    ? 10
                    : lt === 'EL'
                    ? 15
                    : lt === 'Optional'
                    ? 3
                    : lt === 'Maternity'
                    ? 180
                    : lt === 'Paternity'
                    ? 15
                    : lt === 'Comp Off'
                    ? 2
                    : 365);
                return (
                  <div
                    key={lt}
                    className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-center"
                  >
                    <div className="text-[11px] font-bold text-neutral-600">
                      {lt}
                    </div>
                    <div className="text-base font-extrabold text-neutral-900 mt-0.5">
                      {bal} <span className="text-[10px] font-normal">days</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
              <span>
                <strong>Late-Mark Counter:</strong>{' '}
                {myLeaveBalance?.lateMarksCount || 0} late mark(s) recorded
              </span>
              <span>
                <strong>Automated Leave Deduction Applied:</strong>{' '}
                {myLeaveBalance?.lateLeaveDeducted || 0} day(s)
              </span>
            </div>
          </Card>

          {/* Manager & Admin Approval Queue (Strictly visible ONLY to Reporting Manager & Admin) */}
          {canAccessManagerApprovalQueue && (
            <Card
              title={
                isAdmin
                  ? 'Organization Leave Approval Queue & Collision Detector (Admin View)'
                  : 'Direct Reports Leave Approval Queue & Collision Detector (Manager View)'
              }
              subtitle="Strictly restricted: Only leave requests from your direct reports (or all employees for Admin) are visible here."
            >
              {approvalQueueLeaveRequests.length === 0 ? (
                <EmptyState
                  title="No Direct-Report Leave Requests in Queue"
                  description="Leave applications submitted by employees reporting to you will appear here for approval."
                />
              ) : (
                <Table
                  headers={[
                    'Employee',
                    'Leave Type',
                    'Date Range & Days',
                    'Reason',
                    'Collision Detector Alert',
                    'Status',
                    'Manager / Admin Actions',
                  ]}
                >
                  {approvalQueueLeaveRequests.map((req) => {
                    const collisions = PolicyEngine.detectLeaveCollisions(
                      req,
                      approvalQueueLeaveRequests
                    );
                    return (
                      <tr key={req.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 text-xs font-bold text-neutral-900">
                          {req.employeeName}
                        </td>
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
                          {collisions.length > 0 ? (
                            <div className="p-2 bg-amber-50 border border-amber-300 rounded-lg text-[11px] text-amber-900 flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <strong>Collision Alert:</strong> Overlaps with{' '}
                                {collisions.map((c) => c.employeeName).join(', ')}
                              </div>
                            </div>
                          ) : (
                            <Badge variant="success">No Team Overlap</Badge>
                          )}
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
                        <td className="px-4 py-3">
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
                              Reviewed by {req.reviewedBy}
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

          {/* Personal Leave Requests Submitted by Current Employee */}
          <Card
            title="My Submitted Leave Applications"
            subtitle="Your personal leave requests sent to your Reporting Manager and Admin."
          >
            {myOwnLeaveRequests.length === 0 ? (
              <EmptyState
                title="You Have Not Submitted Any Leave Requests"
                description="Click 'Apply for Leave' above to submit a leave request to your Reporting Manager."
              />
            ) : (
              <Table
                headers={[
                  'Leave Type',
                  'Date Range & Days',
                  'Reason',
                  'Status',
                  'Review Details',
                ]}
              >
                {myOwnLeaveRequests.map((req) => (
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
        </div>
      )}

      {/* TAB 3: REGULARIZATION REQUEST FLOW */}
      {activeTab === 'regularization' && (
        <div className="space-y-5">
          {/* Manager & Admin Regularization Approval Queue (Strictly visible ONLY to Reporting Manager & Admin) */}
          {canAccessManagerApprovalQueue && (
            <Card
              title={
                isAdmin
                  ? 'Organization Regularization Approval Queue (Admin View)'
                  : 'Direct Reports Regularization Approval Queue (Manager View)'
              }
              subtitle="Strictly restricted: Only attendance regularization requests from your direct reports (or all employees for Admin) are visible here."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setRegModalOpen(true)}
                >
                  Request Punch Regularization
                </Button>
              }
            >
              {approvalQueueRegularizations.length === 0 ? (
                <EmptyState
                  title="No Direct-Report Regularization Requests Pending"
                  description="Missed-punch correction requests submitted by employees reporting to you will appear here."
                />
              ) : (
                <Table
                  headers={[
                    'Employee',
                    'Target Date',
                    'Requested In / Out',
                    'Reason',
                    'Status',
                    'Manager / Admin Approval',
                  ]}
                >
                  {approvalQueueRegularizations.map((reg) => (
                    <tr key={reg.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 text-xs font-bold">
                        {reg.employeeName}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{reg.date}</td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {reg.requestedPunchIn} – {reg.requestedPunchOut}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600">
                        {reg.reason}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            reg.status === 'Approved'
                              ? 'success'
                              : reg.status === 'Rejected'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {reg.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {reg.status === 'Pending' ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="xs"
                              variant="success"
                              onClick={() =>
                                handleReviewRegularization(reg, 'Approved')
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="xs"
                              variant="danger"
                              onClick={() =>
                                handleReviewRegularization(reg, 'Rejected')
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-400">
                            Reviewed by {reg.reviewedBy || 'Manager'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          )}

          {/* Personal Regularization Requests Submitted by Current Employee */}
          <Card
            title="My Submitted Regularization Requests"
            subtitle="Your personal punch correction requests sent to your Reporting Manager and Admin."
            action={
              !canAccessManagerApprovalQueue ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setRegModalOpen(true)}
                >
                  Request Punch Regularization
                </Button>
              ) : undefined
            }
          >
            {myOwnRegularizations.length === 0 ? (
              <EmptyState
                title="You Have Not Submitted Any Regularization Requests"
                description="Submit a missed-punch correction request to send it to your Reporting Manager and Admin for approval."
              />
            ) : (
              <Table
                headers={[
                  'Target Date',
                  'Requested In / Out',
                  'Reason',
                  'Status',
                  'Review Details',
                ]}
              >
                {myOwnRegularizations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-xs font-mono">{reg.date}</td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {reg.requestedPunchIn} – {reg.requestedPunchOut}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {reg.reason}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          reg.status === 'Approved'
                            ? 'success'
                            : reg.status === 'Rejected'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {reg.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {reg.status === 'Pending'
                        ? 'Pending Manager / Admin Approval'
                        : `Reviewed by ${reg.reviewedBy || 'Manager'}`}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: STATUTORY INDIAN CTC PAYROLL ENGINE */}
      {activeTab === 'payroll' && (
        <div className="space-y-5">
          {isMyCompensationLocked && !isAdmin ? (
            <Card title="Compensation Access Restricted">
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    Compensation Lock Active
                  </h4>
                  <p className="text-xs text-amber-800 mt-1">
                    {lockConfig?.lockMessage}
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {(isAdmin || isCEO) && (
                <Card
                  title="Bulk Statutory Indian CTC Payroll Generator (Admin / CEO)"
                  subtitle="Basic (50% Gross), HRA (50% Basic), Conveyance (₹1,600), Medical (₹1,250), Special Allowance, PF (12% Basic), PT (₹200), TDS, and LWP deductions."
                  action={
                    <div className="flex items-center gap-2">
                      <input
                        type="month"
                        value={payrollMonth}
                        onChange={(e) => setPayrollMonth(e.target.value)}
                        className="px-3 py-1.5 text-xs font-mono border border-neutral-300 rounded-lg"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Zap className="w-4 h-4" />}
                        onClick={handleBulkGeneratePayroll}
                      >
                        Run Bulk Payroll ({payrollMonth})
                      </Button>
                    </div>
                  }
                >
                  <Table
                    headers={[
                      'Employee',
                      'Annual CTC',
                      'Monthly Gross',
                      'Basic (50%)',
                      'HRA (50% Basic)',
                      'Conveyance / Medical',
                      'Special Allowance',
                      'Configure CTC',
                    ]}
                  >
                    {employees.map((emp) => {
                      const struct = salaryStructures.find(
                        (s) => s.employeeId === emp.id
                      );
                      const calc =
                        struct ||
                        PolicyEngine.calculateIndianCtcStructure(
                          emp.level >= 4
                            ? 2400000
                            : emp.level === 0
                            ? 360000
                            : 1200000
                        );
                      return (
                        <tr key={emp.id}>
                          <td className="px-4 py-2.5 text-xs font-bold">
                            {emp.name} ({emp.ecode})
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono font-bold">
                            ₹{calc.annualCtc.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono">
                            ₹{calc.monthlyGross.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono">
                            ₹{calc.basic.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono">
                            ₹{calc.hra.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono">
                            ₹{calc.conveyance} / ₹{calc.medical}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono">
                            ₹{calc.specialAllowance.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-2.5">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => {
                                setCtcModalEmp(emp);
                                setAnnualCtcInput(calc.annualCtc);
                              }}
                            >
                              Edit CTC
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                </Card>
              )}

              {/* Payslips Table */}
              <Card
                title="Generated Monthly Payslips (showup_payslips)"
                subtitle="View and print itemized statutory Indian payslips with net pay in words."
              >
                {payslips.filter(
                  (p) => isAdmin || isCEO || p.employeeId === currentEmployee.id
                ).length === 0 ? (
                  <EmptyState
                    title="No Payslips Generated Yet"
                    description="Run the Bulk Payroll Generator above to issue monthly statutory payslips."
                  />
                ) : (
                  <Table
                    headers={[
                      'Month',
                      'Employee',
                      'Paid Days',
                      'Gross Earnings',
                      'Total Deductions (PF+PT+TDS+LWP)',
                      'Net Pay (₹)',
                      'Printable Payslip',
                    ]}
                  >
                    {payslips
                      .filter(
                        (p) =>
                          isAdmin ||
                          isCEO ||
                          p.employeeId === currentEmployee.id
                      )
                      .map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3 text-xs font-mono font-bold">
                            {p.month}
                          </td>
                          <td className="px-4 py-3 text-xs font-bold">
                            {p.employeeName} ({p.employeeEcode})
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">
                            {p.paidDays} / 30
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">
                            ₹{p.grossEarnings.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-rose-700">
                            -₹{p.totalDeductions.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono font-extrabold text-emerald-700">
                            ₹{p.netPay.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              size="xs"
                              variant="primary"
                              icon={<Printer className="w-3 h-3" />}
                              onClick={() => setViewingPayslip(p)}
                            >
                              View Payslip
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </Table>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* TAB 5: DOCUMENT VAULT */}
      {activeTab === 'vault' && (
        <DocumentVaultView
          currentEmployee={currentEmployee}
          documents={documents}
        />
      )}

      {/* TAB 6: HRMS POLICY OVERRIDES & HOLIDAYS (ADMIN) */}
      {activeTab === 'policy-admin' && isAdmin && (
        <div className="space-y-5">
          <Card
            title="HRMS Policy Engine Configuration (showup_policy)"
            subtitle="Configure shift timings, grace cutoff, late-mark rule, and half-day thresholds."
          >
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Shift Start (HH:mm)
                </label>
                <input
                  type="text"
                  value={policy.shiftStart}
                  onChange={(e) =>
                    setPolicy({ ...policy, shiftStart: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Shift End (HH:mm)
                </label>
                <input
                  type="text"
                  value={policy.shiftEnd}
                  onChange={(e) =>
                    setPolicy({ ...policy, shiftEnd: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Grace Period Cutoff (HH:mm)
                </label>
                <input
                  type="text"
                  value={policy.graceCutoff}
                  onChange={(e) =>
                    setPolicy({ ...policy, graceCutoff: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  EL Advance Notice (Days)
                </label>
                <input
                  type="number"
                  value={policy.elAdvanceNoticeDays}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      elAdvanceNoticeDays: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  await FirestoreEngine.setDocument(
                    'showup_policy',
                    'default_policy',
                    policy
                  );
                  showToast(
                    'success',
                    'HRMS Policy Saved',
                    'Updated shift and grace period parameters.'
                  );
                }}
              >
                Save HRMS Policy
              </Button>
            </div>
          </Card>

          <Card
            title="Corporate Holidays Calendar (showup_holidays)"
            subtitle="Add statutory holidays that automatically render on the Monthly Attendance Calendar."
          >
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Holiday Date
                </label>
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Holiday Name
                </label>
                <input
                  type="text"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="e.g. Republic Day / Deepavali"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (!holidayDate || !holidayName.trim()) return;
                  const h: ShowupHoliday = {
                    id: `hol_${holidayDate}`,
                    date: holidayDate,
                    name: holidayName.trim(),
                    type: 'National',
                  };
                  await FirestoreEngine.setDocument(
                    'showup_holidays',
                    h.id,
                    h
                  );
                  setHolidayDate('');
                  setHolidayName('');
                  showToast('success', 'Holiday Added', h.name);
                }}
              >
                Add Holiday
              </Button>
            </div>

            {holidays.length > 0 && (
              <Table headers={['Date', 'Holiday Name', 'Type']}>
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-2 text-xs font-mono">{h.date}</td>
                    <td className="px-4 py-2 text-xs font-bold">{h.name}</td>
                    <td className="px-4 py-2">
                      <Badge variant="info">{h.type}</Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* MODAL: Apply for Leave */}
      <Modal
        isOpen={leaveModalOpen}
        onClose={() => setLeaveModalOpen(false)}
        size="md"
        title="Apply for Statutory Leave"
        subtitle={`Earned Leave (EL) enforces a mandatory ${policy.elAdvanceNoticeDays}-day advance notice policy.`}
      >
        <form onSubmit={handleApplyLeave} className="space-y-4">
          {leaveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
              {leaveError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Leave Type (8 Statutory Categories) *
            </label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              {STATUTORY_LEAVE_TYPES.map((lt) => (
                <option key={lt} value={lt}>
                  {lt}
                </option>
              ))}
            </select>
          </div>

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

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Reason for Leave *
            </label>
            <textarea
              rows={2}
              required
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLeaveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Submit Leave Application
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Request Regularization */}
      <Modal
        isOpen={regModalOpen}
        onClose={() => setRegModalOpen(false)}
        size="md"
        title="Request Attendance Punch Regularization"
      >
        <form onSubmit={handleSubmitRegularization} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Date *
            </label>
            <input
              type="date"
              required
              value={regDate}
              onChange={(e) => setRegDate(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Requested Punch In (HH:mm)
              </label>
              <input
                type="time"
                required
                value={regPunchIn}
                onChange={(e) => setRegPunchIn(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Requested Punch Out (HH:mm)
              </label>
              <input
                type="time"
                required
                value={regPunchOut}
                onChange={(e) => setRegPunchOut(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Reason (Missed Punch / Technical Glitch) *
            </label>
            <textarea
              rows={2}
              required
              value={regReason}
              onChange={(e) => setRegReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRegModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Submit Regularization
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Configure Employee CTC */}
      <Modal
        isOpen={Boolean(ctcModalEmp)}
        onClose={() => setCtcModalEmp(null)}
        size="md"
        title={
          ctcModalEmp
            ? `Configure Statutory Indian CTC — ${ctcModalEmp.name}`
            : 'Configure CTC'
        }
      >
        {ctcModalEmp && (
          <form onSubmit={handleSaveSalaryStructure} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Annual CTC (in ₹ INR) *
              </label>
              <input
                type="number"
                required
                min={180000}
                step={10000}
                value={annualCtcInput}
                onChange={(e) => setAnnualCtcInput(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono font-bold border border-neutral-300 rounded-lg"
              />
            </div>

            {(() => {
              const preview =
                PolicyEngine.calculateIndianCtcStructure(annualCtcInput);
              return (
                <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs space-y-1.5 font-mono">
                  <div className="flex justify-between font-bold text-neutral-900">
                    <span>Monthly Gross:</span>
                    <span>₹{preview.monthlyGross.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Basic (50% of Gross):</span>
                    <span>₹{preview.basic.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>HRA (50% of Basic):</span>
                    <span>₹{preview.hra.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Conveyance (Fixed):</span>
                    <span>₹{preview.conveyance.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Medical (Fixed):</span>
                    <span>₹{preview.medical.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Special Allowance:</span>
                    <span>
                      ₹{preview.specialAllowance.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-700 pt-1 border-t border-neutral-200">
                    <span>Employee & Employer PF (12% Basic):</span>
                    <span>₹{preview.employeePf.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>Professional Tax (PT):</span>
                    <span>₹{preview.professionalTax}</span>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>Estimated Monthly TDS:</span>
                    <span>₹{preview.tdsMonthly.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCtcModalEmp(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save CTC Structure
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: Printable Payslip Viewer */}
      <Modal
        isOpen={Boolean(viewingPayslip)}
        onClose={() => setViewingPayslip(null)}
        size="xl"
        title="Statutory Indian Monthly Payslip Statement"
        subtitle={
          viewingPayslip
            ? `${viewingPayslip.employeeName} (${viewingPayslip.employeeEcode}) • Month: ${viewingPayslip.month}`
            : ''
        }
        footer={
          <div className="flex items-center gap-2 no-print">
            <Button variant="outline" onClick={() => setViewingPayslip(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              icon={<Printer className="w-4 h-4" />}
              onClick={() => window.print()}
            >
              Print / Download PDF
            </Button>
          </div>
        }
      >
        {viewingPayslip && (
          <div className="space-y-5">
            <div className="p-4 bg-neutral-50 border border-neutral-200 text-neutral-900 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase text-sky-700">
                  Grattitude Synergy LLP — Statutory Payroll
                </div>
                <div className="text-base font-extrabold mt-0.5 text-neutral-900">
                  {viewingPayslip.employeeName} ({viewingPayslip.employeeEcode})
                </div>
                <div className="text-xs text-neutral-600">
                  {viewingPayslip.designation} • {viewingPayslip.department}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-neutral-600">
                  Pay Period: {viewingPayslip.month}
                </div>
                <div className="text-xs text-emerald-700 font-mono font-bold mt-0.5">
                  Paid Days: {viewingPayslip.paidDays} / 30
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Earnings */}
              <div className="p-4 border border-neutral-200 rounded-xl space-y-2 text-xs">
                <div className="font-bold uppercase text-emerald-800 border-b border-neutral-200 pb-1.5">
                  Earnings (₹ INR)
                </div>
                <div className="flex justify-between">
                  <span>Basic Salary (50% Gross)</span>
                  <span className="font-mono font-bold">
                    ₹{viewingPayslip.basic.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>House Rent Allowance (50% Basic)</span>
                  <span className="font-mono font-bold">
                    ₹{viewingPayslip.hra.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Conveyance Allowance (Fixed)</span>
                  <span className="font-mono font-bold">
                    ₹{viewingPayslip.conveyance.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Medical Allowance (Fixed)</span>
                  <span className="font-mono font-bold">
                    ₹{viewingPayslip.medical.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Special Allowance (Balancing)</span>
                  <span className="font-mono font-bold">
                    ₹{viewingPayslip.specialAllowance.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-neutral-200 font-bold text-neutral-900">
                  <span>Total Gross Earnings</span>
                  <span className="font-mono">
                    ₹{viewingPayslip.grossEarnings.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Deductions */}
              <div className="p-4 border border-neutral-200 rounded-xl space-y-2 text-xs">
                <div className="font-bold uppercase text-rose-800 border-b border-neutral-200 pb-1.5">
                  Statutory & Leave Deductions (₹ INR)
                </div>
                <div className="flex justify-between">
                  <span>Employee Provident Fund (12% Basic)</span>
                  <span className="font-mono font-bold">
                    ₹{viewingPayslip.employeePf.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Professional Tax (PT)</span>
                  <span className="font-mono font-bold">
                    ₹{viewingPayslip.professionalTax.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>TDS (Income Tax Deducted at Source)</span>
                  <span className="font-mono font-bold">
                    ₹{viewingPayslip.tds.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>
                    LWP & Late-Mark Leave Deduction (
                    {viewingPayslip.lwpDays + viewingPayslip.lateDeductionDays}d)
                  </span>
                  <span className="font-mono font-bold">
                    ₹{viewingPayslip.lwpDeduction.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-neutral-200 font-bold text-rose-700">
                  <span>Total Deductions</span>
                  <span className="font-mono">
                    ₹{viewingPayslip.totalDeductions.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Net Pay & Words */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-emerald-900">
                  Net Take-Home Pay:
                </div>
                <div className="text-xs italic text-emerald-800 mt-0.5">
                  {viewingPayslip.netPayInWords}
                </div>
              </div>
              <div className="text-2xl font-mono font-extrabold text-emerald-800">
                ₹{viewingPayslip.netPay.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
