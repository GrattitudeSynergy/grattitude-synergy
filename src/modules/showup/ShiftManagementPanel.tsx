import React, { useState, useMemo } from 'react';
import {
  Clock,
  Save,
  RotateCcw,
  History,
  Search,
  UserCheck,
  Calendar,
  CheckCircle2,
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
import { AuditService } from '../../core/services/auditService';
import { NotificationService } from '../../core/services/notificationService';
import {
  PolicyEngine,
  formatTime12Hour,
  parseTimeMinutes,
  formatMinutesToHHMM,
} from './policyEngine';
import type {
  Employee,
  ShowupPolicyConfig,
  EmployeeShiftAssignment,
  EmployeeShiftHistoryEntry,
} from '../../core/types';

interface ShiftManagementPanelProps {
  currentAdmin: Employee;
  employees: Employee[];
  policy: ShowupPolicyConfig;
}

export const ShiftManagementPanel: React.FC<ShiftManagementPanelProps> = ({
  currentAdmin,
  employees,
  policy,
}) => {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [shiftTypeFilter, setShiftTypeFilter] = useState<
    'ALL' | 'CUSTOM' | 'DEFAULT'
  >('ALL');

  // Selected employee for inline/modal editing
  const [selectedEmpId, setSelectedEmpId] = useState<string>(() => {
    const aditi = employees.find((e) => e.id === '#GSL014');
    return aditi?.id || employees[0]?.id || '';
  });

  const selectedEmployee = useMemo(
    () =>
      employees.find((e) => e.id === selectedEmpId) ||
      employees.find((e) => e.id === '#GSL014') ||
      employees[0] ||
      null,
    [employees, selectedEmpId]
  );

  const [shiftStartInput, setShiftStartInput] = useState<string>(
    selectedEmployee?.shiftConfig?.shiftStart || '11:00'
  );
  const [shiftEndInput, setShiftEndInput] = useState<string>(
    selectedEmployee?.shiftConfig?.shiftEnd || '20:00'
  );
  const [effectiveDateInput, setEffectiveDateInput] = useState<string>(
    selectedEmployee?.shiftConfig?.effectiveDate ||
      new Date().toISOString().slice(0, 10)
  );
  const [graceMinutesInput, setGraceMinutesInput] = useState<number>(
    selectedEmployee?.shiftConfig?.graceMinutes ?? 35
  );
  const [remarksInput, setRemarksInput] = useState<string>(
    selectedEmployee?.shiftConfig?.remarks || ''
  );

  // History viewer modal
  const [historyModalEmp, setHistoryModalEmp] = useState<Employee | null>(null);

  const handleSelectEmployeeForEdit = (emp: Employee) => {
    setSelectedEmpId(emp.id);
    const eff = PolicyEngine.getEffectiveShiftForEmployee(emp, policy);
    setShiftStartInput(emp.shiftConfig?.shiftStart || eff.shiftStart);
    setShiftEndInput(emp.shiftConfig?.shiftEnd || eff.shiftEnd);
    setEffectiveDateInput(
      emp.shiftConfig?.effectiveDate || new Date().toISOString().slice(0, 10)
    );
    setGraceMinutesInput(emp.shiftConfig?.graceMinutes ?? 35);
    setRemarksInput(emp.shiftConfig?.remarks || '');
  };

  const activeEmployees = useMemo(() => {
    return employees
      .filter((e) => e.status !== 'Inactive')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const departments = useMemo(
    () => Array.from(new Set(activeEmployees.map((e) => e.department))).sort(),
    [activeEmployees]
  );

  const filteredEmployees = useMemo(() => {
    return activeEmployees.filter((emp) => {
      if (deptFilter !== 'ALL' && emp.department !== deptFilter) return false;
      const isCustom = Boolean(emp.shiftConfig?.isCustomShift);
      if (shiftTypeFilter === 'CUSTOM' && !isCustom) return false;
      if (shiftTypeFilter === 'DEFAULT' && isCustom) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          emp.name.toLowerCase().includes(q) ||
          emp.ecode.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          emp.designation.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeEmployees, deptFilter, shiftTypeFilter, searchQuery]);

  // All shift history logs across the organization
  const allShiftHistory = useMemo(() => {
    const list: Array<EmployeeShiftHistoryEntry & { empName: string; empEcode: string }> = [];
    for (const emp of employees) {
      for (const h of emp.shiftHistory || []) {
        list.push({
          ...h,
          empName: emp.name,
          empEcode: emp.ecode,
        });
      }
    }
    return list.sort(
      (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
    );
  }, [employees]);

  const computedPreviewCutoff = useMemo(() => {
    const startMins = parseTimeMinutes(shiftStartInput);
    return formatMinutesToHHMM(startMins + (Number(graceMinutesInput) || 35));
  }, [shiftStartInput, graceMinutesInput]);

  const handleAssignOrUpdateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    const prevShift = PolicyEngine.getEffectiveShiftForEmployee(
      selectedEmployee,
      policy
    );
    const hadCustomShift = Boolean(selectedEmployee.shiftConfig?.isCustomShift);

    const newAssignment: EmployeeShiftAssignment = {
      shiftStart: shiftStartInput,
      shiftEnd: shiftEndInput,
      effectiveDate: effectiveDateInput,
      graceMinutes: Number(graceMinutesInput) || 35,
      isCustomShift: true,
      updatedBy: currentAdmin.name,
      updatedAt: new Date().toISOString(),
      remarks:
        remarksInput.trim() ||
        `Assigned shift ${formatTime12Hour(shiftStartInput)} – ${formatTime12Hour(shiftEndInput)} effective ${effectiveDateInput}`,
    };

    const historyEntry: EmployeeShiftHistoryEntry = {
      id: `shift_hist_${Date.now()}`,
      employeeId: selectedEmployee.id,
      previousShiftStart: prevShift.shiftStart,
      previousShiftEnd: prevShift.shiftEnd,
      newShiftStart: shiftStartInput,
      newShiftEnd: shiftEndInput,
      effectiveDate: effectiveDateInput,
      action: hadCustomShift ? 'UPDATED' : 'ASSIGNED',
      changedBy: currentAdmin.name,
      changedAt: new Date().toISOString(),
      remarks: newAssignment.remarks,
    };

    const updatedEmployee: Employee = {
      ...selectedEmployee,
      shiftConfig: newAssignment,
      shiftHistory: [historyEntry, ...(selectedEmployee.shiftHistory || [])],
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument(
      'employees',
      selectedEmployee.id,
      updatedEmployee
    );

    await AuditService.log({
      action: hadCustomShift
        ? 'EMPLOYEE_SHIFT_UPDATED'
        : 'EMPLOYEE_SHIFT_ASSIGNED',
      actor: currentAdmin,
      targetId: selectedEmployee.id,
      targetType: 'EmployeeShift',
      details: `${hadCustomShift ? 'Updated' : 'Assigned'} individual shift for ${selectedEmployee.name} (${selectedEmployee.ecode}): ${formatTime12Hour(shiftStartInput)} to ${formatTime12Hour(shiftEndInput)} (Grace cutoff: ${formatTime12Hour(computedPreviewCutoff)}) effective from ${effectiveDateInput}.`,
    });

    await NotificationService.create({
      recipientId: selectedEmployee.id,
      title: 'Shift Timing Updated by Admin',
      message: `Your working shift has been set to ${formatTime12Hour(shiftStartInput)} – ${formatTime12Hour(shiftEndInput)} (Grace until ${formatTime12Hour(computedPreviewCutoff)}) effective ${effectiveDateInput}.`,
      route: '/showup',
      actorName: currentAdmin.name,
    });

    showToast(
      'success',
      'Individual Employee Shift Saved',
      `${selectedEmployee.name} (${selectedEmployee.ecode}) assigned ${formatTime12Hour(shiftStartInput)} – ${formatTime12Hour(shiftEndInput)} effective ${effectiveDateInput}.`
    );
  };

  const handleResetShiftToDefault = async (emp: Employee) => {
    const prevShift = PolicyEngine.getEffectiveShiftForEmployee(emp, policy);
    const defaultStart = policy.shiftStart || '09:30';
    const defaultEnd = policy.shiftEnd || '18:30';
    const todayStr = new Date().toISOString().slice(0, 10);

    const historyEntry: EmployeeShiftHistoryEntry = {
      id: `shift_hist_reset_${Date.now()}`,
      employeeId: emp.id,
      previousShiftStart: prevShift.shiftStart,
      previousShiftEnd: prevShift.shiftEnd,
      newShiftStart: defaultStart,
      newShiftEnd: defaultEnd,
      effectiveDate: todayStr,
      action: 'RESET_TO_DEFAULT',
      changedBy: currentAdmin.name,
      changedAt: new Date().toISOString(),
      remarks: `Reset to company standard shift (${formatTime12Hour(defaultStart)} – ${formatTime12Hour(defaultEnd)})`,
    };

    const updatedEmployee: Employee = {
      ...emp,
      shiftConfig: {
        shiftStart: defaultStart,
        shiftEnd: defaultEnd,
        effectiveDate: todayStr,
        graceMinutes: 35,
        isCustomShift: false,
        updatedBy: currentAdmin.name,
        updatedAt: new Date().toISOString(),
        remarks: 'Standard Company Shift',
      },
      shiftHistory: [historyEntry, ...(emp.shiftHistory || [])],
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('employees', emp.id, updatedEmployee);

    await AuditService.log({
      action: 'EMPLOYEE_SHIFT_RESET_TO_DEFAULT',
      actor: currentAdmin,
      targetId: emp.id,
      targetType: 'EmployeeShift',
      details: `Reset shift for ${emp.name} (${emp.ecode}) to company default (${defaultStart} – ${defaultEnd}).`,
    });

    showToast(
      'info',
      'Shift Reset to Company Default',
      `${emp.name} (${emp.ecode}) now follows the default ${formatTime12Hour(defaultStart)} – ${formatTime12Hour(defaultEnd)} shift.`
    );
  };

  const customShiftCount = activeEmployees.filter(
    (e) => e.shiftConfig?.isCustomShift
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs">
          <div className="text-xs font-bold uppercase text-neutral-500">
            Company Default Shift
          </div>
          <div className="text-lg font-extrabold text-neutral-900 mt-1 font-mono">
            {formatTime12Hour(policy.shiftStart || '09:30')} –{' '}
            {formatTime12Hour(policy.shiftEnd || '18:30')}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">
            Grace Period Until:{' '}
            <strong>
              {formatTime12Hour(
                policy.graceCutoff === '10:00'
                  ? '10:05'
                  : policy.graceCutoff || '10:05'
              )}
            </strong>{' '}
            (35 mins)
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs">
          <div className="text-xs font-bold uppercase text-sky-700">
            Individual Custom Shifts Active
          </div>
          <div className="text-2xl font-extrabold text-sky-800 mt-1">
            {customShiftCount}{' '}
            <span className="text-xs font-normal text-neutral-500">
              of {activeEmployees.length} Employees
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Example: Aditi Gavande (#GSL014) • 11:00 AM – 08:00 PM
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs">
          <div className="text-xs font-bold uppercase text-amber-700">
            Shift Change History Records
          </div>
          <div className="text-2xl font-extrabold text-neutral-900 mt-1">
            {allShiftHistory.length}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">
            Full audit trail of previous shift timings & effective dates
          </div>
        </div>
      </div>

      {/* Assign / Update Individual Employee Shift Form */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-600" />
            <span>
              Employee-Specific Shift Management (Admin Control)
            </span>
          </div>
        }
        subtitle="Select an employee to assign or update their individual shift start time, shift end time, and effective date without altering the company's standard working hours."
      >
        <form onSubmit={handleAssignOrUpdateShift} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Select Employee *
              </label>
              <select
                value={selectedEmployee?.id || ''}
                onChange={(e) => {
                  const found = employees.find((emp) => emp.id === e.target.value);
                  if (found) handleSelectEmployeeForEdit(found);
                }}
                className="w-full px-3 py-2 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
              >
                {activeEmployees.map((emp) => {
                  const isCustom = Boolean(emp.shiftConfig?.isCustomShift);
                  return (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.ecode}) —{' '}
                      {isCustom
                        ? `Custom: ${formatTime12Hour(emp.shiftConfig!.shiftStart)}–${formatTime12Hour(emp.shiftConfig!.shiftEnd)}`
                        : `Default: ${formatTime12Hour(policy.shiftStart)}–${formatTime12Hour(policy.shiftEnd)}`}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Shift Start Time *
              </label>
              <input
                type="time"
                required
                value={shiftStartInput}
                onChange={(e) => setShiftStartInput(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
              />
              <span className="text-[10px] text-sky-700 font-mono">
                {formatTime12Hour(shiftStartInput)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Shift End Time *
              </label>
              <input
                type="time"
                required
                value={shiftEndInput}
                onChange={(e) => setShiftEndInput(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
              />
              <span className="text-[10px] text-sky-700 font-mono">
                {formatTime12Hour(shiftEndInput)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Effective From Date *
              </label>
              <input
                type="date"
                required
                value={effectiveDateInput}
                onChange={(e) => setEffectiveDateInput(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Relative Grace Window (Minutes)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={graceMinutesInput}
                onChange={(e) => setGraceMinutesInput(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
              <span className="text-[10px] text-emerald-700 font-medium">
                Grace Cutoff for this Shift:{' '}
                <strong>{formatTime12Hour(computedPreviewCutoff)}</strong>
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Change Reason / Remarks (Optional)
              </label>
              <input
                type="text"
                value={remarksInput}
                onChange={(e) => setRemarksInput(e.target.value)}
                placeholder="e.g. Client overlap shift / Flexible hours approved"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="primary"
                icon={<Save className="w-4 h-4" />}
              >
                Assign / Update Individual Shift
              </Button>
              {selectedEmployee?.shiftConfig?.isCustomShift && (
                <Button
                  type="button"
                  variant="outline"
                  icon={<RotateCcw className="w-4 h-4" />}
                  onClick={() => handleResetShiftToDefault(selectedEmployee)}
                >
                  Reset to Default
                </Button>
              )}
            </div>
          </div>
        </form>
      </Card>

      {/* Organization Shift Roster Table */}
      <Card
        title="Organization Employee Shift Roster & Controls"
        subtitle="View every employee's active shift timings, relative grace cutoff, effective date, and modify or reset individual shifts."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee name, E-Code, dept..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
          >
            <option value="ALL">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={shiftTypeFilter}
            onChange={(e) => setShiftTypeFilter(e.target.value as any)}
            className="px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
          >
            <option value="ALL">All Shifts (Custom & Default)</option>
            <option value="CUSTOM">Individual Custom Shifts Only</option>
            <option value="DEFAULT">Standard Default Shifts Only</option>
          </select>
        </div>

        <Table
          headers={[
            'Employee & E-Code',
            'Department',
            'Shift Type',
            'Working Hours (Start – End)',
            'Grace Cutoff',
            'Effective Date',
            'Actions',
          ]}
        >
          {filteredEmployees.map((emp) => {
            const eff = PolicyEngine.getEffectiveShiftForEmployee(emp, policy);
            const historyCount = (emp.shiftHistory || []).length;

            return (
              <tr key={emp.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <div className="text-xs font-bold text-neutral-900">
                    {emp.name}
                  </div>
                  <div className="text-[11px] font-mono text-sky-700">
                    {emp.ecode} • {emp.designation}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-neutral-700">
                  {emp.department}
                </td>
                <td className="px-4 py-3">
                  {eff.isCustomShift ? (
                    <Badge variant="info">
                      <UserCheck className="w-3 h-3" /> Individual Shift
                    </Badge>
                  ) : (
                    <Badge variant="neutral">Standard Default</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-xs font-mono font-bold text-neutral-900">
                  {formatTime12Hour(eff.shiftStart)} –{' '}
                  {formatTime12Hour(eff.shiftEnd)}{' '}
                  <span className="text-[10px] font-normal text-neutral-500">
                    ({eff.standardHours}h)
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-amber-800 font-semibold">
                  {formatTime12Hour(eff.graceCutoff)}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-neutral-600">
                  {eff.isCustomShift && eff.effectiveDate ? (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-sky-600" />
                      {eff.effectiveDate}
                    </span>
                  ) : (
                    <span className="text-neutral-400">Company Policy</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleSelectEmployeeForEdit(emp)}
                    >
                      Configure Shift
                    </Button>
                    {eff.isCustomShift && (
                      <Button
                        size="xs"
                        variant="outline"
                        icon={<RotateCcw className="w-3 h-3" />}
                        onClick={() => handleResetShiftToDefault(emp)}
                      >
                        Reset
                      </Button>
                    )}
                    {historyCount > 0 && (
                      <Button
                        size="xs"
                        variant="secondary"
                        icon={<History className="w-3 h-3" />}
                        onClick={() => setHistoryModalEmp(emp)}
                      >
                        History ({historyCount})
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {/* Complete Shift Change History Log */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-sky-600" />
            <span>Previous Shift Timings & Change History Log</span>
          </div>
        }
        subtitle="Audit log of all employee shift assignments, updates, and resets with effective dates."
      >
        {allShiftHistory.length === 0 ? (
          <EmptyState
            title="No Shift Changes Recorded Yet"
            description="When an Admin assigns, updates, or resets an employee's shift timing, the historical record appears here."
          />
        ) : (
          <Table
            headers={[
              'Changed At',
              'Employee',
              'Action',
              'Previous Shift',
              'New Shift',
              'Effective Date',
              'Changed By & Remarks',
            ]}
          >
            {allShiftHistory.map((h) => (
              <tr key={h.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2.5 text-xs font-mono text-neutral-500">
                  {new Date(h.changedAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-xs font-bold text-neutral-900">
                  {h.empName} ({h.empEcode})
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant={
                      h.action === 'RESET_TO_DEFAULT'
                        ? 'warning'
                        : h.action === 'ASSIGNED'
                        ? 'success'
                        : 'info'
                    }
                  >
                    {h.action}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-xs font-mono text-neutral-600">
                  {formatTime12Hour(h.previousShiftStart)} –{' '}
                  {formatTime12Hour(h.previousShiftEnd)}
                </td>
                <td className="px-4 py-2.5 text-xs font-mono font-bold text-sky-800">
                  {formatTime12Hour(h.newShiftStart)} –{' '}
                  {formatTime12Hour(h.newShiftEnd)}
                </td>
                <td className="px-4 py-2.5 text-xs font-mono">
                  {h.effectiveDate}
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-600">
                  <div className="font-semibold text-neutral-800">
                    {h.changedBy}
                  </div>
                  {h.remarks && (
                    <div className="text-[11px] text-neutral-500">
                      {h.remarks}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Modal: Employee Shift History */}
      <Modal
        isOpen={Boolean(historyModalEmp)}
        onClose={() => setHistoryModalEmp(null)}
        size="lg"
        title={
          historyModalEmp
            ? `Shift Timing History — ${historyModalEmp.name} (${historyModalEmp.ecode})`
            : 'Shift History'
        }
        subtitle="Complete chronological record of previous shift timings and changes."
      >
        {historyModalEmp && (
          <div className="space-y-4">
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-sky-900">Current Active Shift:</span>{' '}
                <span className="font-mono font-bold text-sky-800">
                  {(() => {
                    const eff = PolicyEngine.getEffectiveShiftForEmployee(
                      historyModalEmp,
                      policy
                    );
                    return `${formatTime12Hour(eff.shiftStart)} – ${formatTime12Hour(eff.shiftEnd)} (Grace Cutoff: ${formatTime12Hour(eff.graceCutoff)})`;
                  })()}
                </span>
              </div>
              <Badge variant="success">
                <CheckCircle2 className="w-3 h-3" /> Active
              </Badge>
            </div>

            <Table
              headers={[
                'Date Changed',
                'Action',
                'Previous Shift',
                'New Shift',
                'Effective From',
                'Remarks',
              ]}
            >
              {(historyModalEmp.shiftHistory || []).map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-2 text-xs font-mono">
                    {new Date(entry.changedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="info">{entry.action}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">
                    {formatTime12Hour(entry.previousShiftStart)} –{' '}
                    {formatTime12Hour(entry.previousShiftEnd)}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono font-bold">
                    {formatTime12Hour(entry.newShiftStart)} –{' '}
                    {formatTime12Hour(entry.newShiftEnd)}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">
                    {entry.effectiveDate}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">
                    {entry.remarks || '-'}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Modal>
    </div>
  );
};
