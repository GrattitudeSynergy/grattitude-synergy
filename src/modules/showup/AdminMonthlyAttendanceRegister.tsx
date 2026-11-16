import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Users,
  Eye,
  Table as TableIcon,
  CalendarDays,
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
import { PermissionsService } from '../../core/services/permissionsService';
import { AttendanceCalendar } from './AttendanceCalendar';
import type {
  Employee,
  ShowupAttendanceRecord,
  ShowupLeaveRequest,
  ShowupHoliday,
} from '../../core/types';

interface AdminMonthlyAttendanceRegisterProps {
  employees: Employee[];
  attendanceRecords: ShowupAttendanceRecord[];
  leaveRequests: ShowupLeaveRequest[];
  holidays: ShowupHoliday[];
}

type DayCellCode = 'P' | 'L' | 'HD' | 'LV' | 'H' | 'WO' | 'A' | '-';

interface DayEvaluation {
  day: number;
  dateStr: string;
  code: DayCellCode;
  statusLabel: string;
  inTime?: string;
  outTime?: string;
  hours?: number;
  leaveType?: string;
  holidayName?: string;
}

export const AdminMonthlyAttendanceRegister: React.FC<
  AdminMonthlyAttendanceRegisterProps
> = ({ employees, attendanceRecords, leaveRequests, holidays }) => {
  const { showToast } = useToast();

  // YYYY-MM state (defaults to current month)
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'register' | 'employee-calendar'>(
    'register'
  );
  const [selectedEmpId, setSelectedEmpId] = useState<string>(() => {
    const first = employees.find((e) => e.id !== 'EMP-001') || employees[0];
    return first?.id || '';
  });
  const [inspectModalEmp, setInspectModalEmp] = useState<Employee | null>(null);

  const [yearNum, monthNum] = useMemo(() => {
    const parts = selectedMonth.split('-').map(Number);
    return [
      parts[0] || new Date().getFullYear(),
      parts[1] || new Date().getMonth() + 1,
    ];
  }, [selectedMonth]);

  const daysInMonth = useMemo(
    () => new Date(yearNum, monthNum, 0).getDate(),
    [yearNum, monthNum]
  );

  const formattedMonthLabel = useMemo(() => {
    const d = new Date(yearNum, monthNum - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [yearNum, monthNum]);

  const handlePrevMonth = () => {
    const d = new Date(yearNum, monthNum - 2, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    setSelectedMonth(ym);
  };

  const handleNextMonth = () => {
    const d = new Date(yearNum, monthNum, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    setSelectedMonth(ym);
  };

  const activeEmployees = useMemo(() => {
    return employees
      .filter((e) => e.status !== 'Inactive')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const departments = useMemo(() => {
    return Array.from(new Set(activeEmployees.map((e) => e.department))).sort();
  }, [activeEmployees]);

  const filteredEmployees = useMemo(() => {
    return activeEmployees.filter((emp) => {
      if (deptFilter !== 'ALL' && emp.department !== deptFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          emp.name.toLowerCase().includes(q) ||
          emp.ecode.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          emp.designation.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [activeEmployees, deptFilter, searchQuery]);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Build full monthly matrix for every filtered employee
  const employeeMonthlyRows = useMemo(() => {
    const holidayMap = new Map<string, ShowupHoliday>();
    for (const h of holidays) {
      holidayMap.set(h.date, h);
    }

    const approvedLeaves = leaveRequests.filter((l) => l.status === 'Approved');

    return filteredEmployees.map((emp) => {
      const normId = PermissionsService.normalizeEmpId(emp.id);
      const normEcode = PermissionsService.normalizeEmpId(emp.ecode);

      const empRecords = attendanceRecords.filter((r) => {
        const rNorm = PermissionsService.normalizeEmpId(r.employeeId);
        const rEcodeNorm = PermissionsService.normalizeEmpId(r.employeeEcode);
        return (
          r.date.startsWith(selectedMonth) &&
          (rNorm === normId ||
            rNorm === normEcode ||
            (rEcodeNorm && (rEcodeNorm === normId || rEcodeNorm === normEcode)))
        );
      });

      const recByDate = new Map<string, ShowupAttendanceRecord>();
      for (const r of empRecords) {
        recByDate.set(r.date, r);
      }

      const empLeaves = approvedLeaves.filter((l) => {
        const lNorm = PermissionsService.normalizeEmpId(l.employeeId);
        return lNorm === normId || lNorm === normEcode;
      });

      let presentCount = 0;
      let lateCount = 0;
      let halfDayCount = 0;
      let leaveCount = 0;
      let absentCount = 0;
      let totalHours = 0;

      const days: DayEvaluation[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        const dow = new Date(yearNum, monthNum - 1, d).getDay();
        const isWeekend = dow === 0 || dow === 6;
        const hol = holidayMap.get(dateStr);
        const rec = recByDate.get(dateStr);
        const matchedLeave = empLeaves.find(
          (l) => l.startDate <= dateStr && l.endDate >= dateStr
        );

        if (rec) {
          const firstIn = rec.punches?.find((p) => p.type === 'IN');
          const lastOut = [...(rec.punches || [])]
            .reverse()
            .find((p) => p.type === 'OUT');

          const inTimeStr = firstIn
            ? firstIn.timestamp.includes('T')
              ? new Date(firstIn.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : firstIn.timestamp
            : undefined;

          const outTimeStr = lastOut
            ? lastOut.timestamp.includes('T')
              ? new Date(lastOut.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : lastOut.timestamp
            : undefined;

          totalHours += rec.totalHours || 0;

          if (rec.status === 'Present' || rec.status === 'WFH') {
            presentCount++;
            days.push({
              day: d,
              dateStr,
              code: 'P',
              statusLabel: rec.status,
              inTime: inTimeStr,
              outTime: outTimeStr,
              hours: rec.totalHours,
            });
          } else if (rec.status === 'Late') {
            presentCount++;
            lateCount++;
            days.push({
              day: d,
              dateStr,
              code: 'L',
              statusLabel: 'Late Arrival',
              inTime: inTimeStr,
              outTime: outTimeStr,
              hours: rec.totalHours,
            });
          } else if (rec.status === 'Half-Day') {
            halfDayCount++;
            days.push({
              day: d,
              dateStr,
              code: 'HD',
              statusLabel: 'Half-Day',
              inTime: inTimeStr,
              outTime: outTimeStr,
              hours: rec.totalHours,
            });
          } else {
            absentCount++;
            days.push({
              day: d,
              dateStr,
              code: 'A',
              statusLabel: 'Under-reported (< 4h worked)',
              inTime: inTimeStr,
              outTime: outTimeStr,
              hours: rec.totalHours,
            });
          }
        } else if (matchedLeave) {
          leaveCount++;
          days.push({
            day: d,
            dateStr,
            code: 'LV',
            statusLabel: `On Leave (${matchedLeave.leaveType})`,
            leaveType: matchedLeave.leaveType,
          });
        } else if (hol) {
          days.push({
            day: d,
            dateStr,
            code: 'H',
            statusLabel: `Holiday: ${hol.name}`,
            holidayName: hol.name,
          });
        } else if (isWeekend) {
          days.push({
            day: d,
            dateStr,
            code: 'WO',
            statusLabel: 'Weekly Off',
          });
        } else if (dateStr < todayStr) {
          absentCount++;
          days.push({
            day: d,
            dateStr,
            code: 'A',
            statusLabel: 'No Punch Recorded (Under-reported)',
          });
        } else {
          days.push({
            day: d,
            dateStr,
            code: '-',
            statusLabel: 'Upcoming / Not Yet In',
          });
        }
      }

      return {
        employee: emp,
        presentCount,
        lateCount,
        halfDayCount,
        leaveCount,
        absentCount,
        totalHours: Math.round(totalHours * 100) / 100,
        days,
        empRecords,
      };
    });
  }, [
    filteredEmployees,
    attendanceRecords,
    leaveRequests,
    holidays,
    selectedMonth,
    daysInMonth,
    yearNum,
    monthNum,
    todayStr,
  ]);

  const codeBadgeStyles: Record<DayCellCode, string> = {
    P: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    L: 'bg-amber-100 text-amber-800 border-amber-300',
    HD: 'bg-orange-100 text-orange-800 border-orange-300',
    LV: 'bg-sky-100 text-sky-800 border-sky-300',
    H: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    WO: 'bg-neutral-100 text-neutral-400 border-neutral-200',
    A: 'bg-rose-50 text-rose-700 border-rose-200',
    '-': 'bg-white text-neutral-300 border-neutral-200',
  };

  const handleExportMonthlyCsv = () => {
    if (employeeMonthlyRows.length === 0) {
      showToast('warning', 'No Data', 'No employee rows to export.');
      return;
    }

    const dayHeaders = Array.from(
      { length: daysInMonth },
      (_, idx) => `Day_${String(idx + 1).padStart(2, '0')}`
    );
    const headers = [
      'Employee_Name',
      'ECode',
      'Department',
      'Designation',
      'Present_Days',
      'Late_Days',
      'Half_Days',
      'Leave_Days',
      'Absent_Days',
      'Total_Hours',
      ...dayHeaders,
    ];

    const csvRows = employeeMonthlyRows.map((row) => {
      const baseCols = [
        row.employee.name,
        row.employee.ecode,
        row.employee.department,
        row.employee.designation,
        String(row.presentCount),
        String(row.lateCount),
        String(row.halfDayCount),
        String(row.leaveCount),
        String(row.absentCount),
        String(row.totalHours),
      ];
      const dayCols = row.days.map((d) =>
        d.inTime ? `${d.code} (${d.inTime})` : d.code
      );
      return [...baseCols, ...dayCols]
        .map((val) => `"${String(val || '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Organization_Attendance_Register_${selectedMonth}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(
      'success',
      'Monthly Attendance Exported',
      `Downloaded full attendance register for ${formattedMonthLabel}.`
    );
  };

  // Get records for a specific selected employee (for single-employee full history & calendar view)
  const getEmployeeAllRecords = (emp: Employee | null): ShowupAttendanceRecord[] => {
    if (!emp) return [];
    const normId = PermissionsService.normalizeEmpId(emp.id);
    const normEcode = PermissionsService.normalizeEmpId(emp.ecode);
    return attendanceRecords
      .filter((r) => {
        const rNorm = PermissionsService.normalizeEmpId(r.employeeId);
        const rEcodeNorm = PermissionsService.normalizeEmpId(r.employeeEcode);
        return (
          rNorm === normId ||
          rNorm === normEcode ||
          (rEcodeNorm && (rEcodeNorm === normId || rEcodeNorm === normEcode))
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  };

  const currentlySelectedEmp =
    activeEmployees.find((e) => e.id === selectedEmpId) || activeEmployees[0] || null;
  const selectedEmpAllRecords = useMemo(
    () => getEmployeeAllRecords(currentlySelectedEmp),
    [currentlySelectedEmp, attendanceRecords]
  );

  return (
    <div className="space-y-5">
      {/* Top Control Bar: Month Selector, View Mode Switcher & Export */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-sky-600" />
            <span>
              Admin Organization-Wide Monthly &amp; Past Attendance Register
            </span>
          </div>
        }
        subtitle="Inspect full monthly attendance sheets, day-by-day status grids, and historical check-in/check-out logs for every employee across any month."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-50">
              <button
                type="button"
                onClick={() => setViewMode('register')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 cursor-pointer transition ${
                  viewMode === 'register'
                    ? 'bg-white text-sky-700 shadow-2xs border border-neutral-200'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>All Employees Monthly Sheet</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('employee-calendar')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 cursor-pointer transition ${
                  viewMode === 'employee-calendar'
                    ? 'bg-white text-sky-700 shadow-2xs border border-neutral-200'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Individual Employee Calendar &amp; Past Logs</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={handleExportMonthlyCsv}
            >
              Export Month CSV
            </Button>
          </div>
        }
      >
        {/* Filters & Month Picker Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center mb-4">
          {/* Month Navigation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-100 cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4 text-neutral-700" />
            </button>

            <div className="flex-1 relative">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  if (e.target.value) setSelectedMonth(e.target.value);
                }}
                className="w-full px-3 py-2 text-xs font-bold text-neutral-900 border border-neutral-300 rounded-lg bg-white"
              />
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-100 cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4 text-neutral-700" />
            </button>
          </div>

          {/* Search Employee */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee by name, #E-Code, or role..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          {/* Department Filter */}
          <div>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              <option value="ALL">All Departments ({activeEmployees.length})</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-neutral-200 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-neutral-500 uppercase mr-1">
              Legend ({formattedMonthLabel}):
            </span>
            <span className="px-2 py-0.5 font-bold border rounded-md bg-emerald-100 text-emerald-800 border-emerald-300">
              P = Present
            </span>
            <span className="px-2 py-0.5 font-bold border rounded-md bg-amber-100 text-amber-800 border-amber-300">
              L = Late Arrival
            </span>
            <span className="px-2 py-0.5 font-bold border rounded-md bg-orange-100 text-orange-800 border-orange-300">
              HD = Half-Day
            </span>
            <span className="px-2 py-0.5 font-bold border rounded-md bg-sky-100 text-sky-800 border-sky-300">
              LV = Approved Leave
            </span>
            <span className="px-2 py-0.5 font-bold border rounded-md bg-indigo-100 text-indigo-800 border-indigo-300">
              H = Holiday
            </span>
            <span className="px-2 py-0.5 font-bold border rounded-md bg-neutral-100 text-neutral-500 border-neutral-200">
              WO = Weekly Off
            </span>
            <span className="px-2 py-0.5 font-bold border rounded-md bg-rose-50 text-rose-700 border-rose-200">
              A = Under-reported
            </span>
          </div>
          <div className="text-neutral-500">
            Hover over any day cell to see exact Check-In &amp; Check-Out times
          </div>
        </div>

        {/* VIEW MODE 1: ALL EMPLOYEES MONTHLY ATTENDANCE SHEET */}
        {viewMode === 'register' && (
          <div className="overflow-x-auto border border-neutral-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold text-neutral-600">
                  <th className="py-2.5 px-3 sticky left-0 bg-neutral-50 z-10 min-w-[190px] border-r border-neutral-200">
                    Employee
                  </th>
                  <th className="py-2.5 px-2 text-center bg-emerald-50/60 text-emerald-800">
                    P
                  </th>
                  <th className="py-2.5 px-2 text-center bg-amber-50/60 text-amber-800">
                    L
                  </th>
                  <th className="py-2.5 px-2 text-center bg-sky-50/60 text-sky-800">
                    LV
                  </th>
                  <th className="py-2.5 px-2 text-center bg-rose-50/60 text-rose-800">
                    A
                  </th>
                  <th className="py-2.5 px-2.5 text-center border-r border-neutral-200 font-mono">
                    Hours
                  </th>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                    (dayNum) => (
                      <th
                        key={dayNum}
                        className="py-2 px-1 text-center font-mono text-[10px] min-w-[28px] border-r border-neutral-100"
                      >
                        {String(dayNum).padStart(2, '0')}
                      </th>
                    )
                  )}
                  <th className="py-2.5 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-xs">
                {employeeMonthlyRows.map((row) => (
                  <tr
                    key={row.employee.id}
                    className="hover:bg-neutral-50/80 transition"
                  >
                    <td className="py-2.5 px-3 sticky left-0 bg-white z-10 border-r border-neutral-200">
                      <div className="font-bold text-neutral-900 truncate">
                        {row.employee.name}
                      </div>
                      <div className="text-[11px] font-mono text-sky-700">
                        {row.employee.ecode} • {row.employee.department}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-emerald-700 bg-emerald-50/20">
                      {row.presentCount}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-amber-700 bg-amber-50/20">
                      {row.lateCount}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-sky-700 bg-sky-50/20">
                      {row.leaveCount}
                    </td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-rose-700 bg-rose-50/20">
                      {row.absentCount}
                    </td>
                    <td className="py-2 px-2.5 text-center font-mono font-bold text-neutral-800 border-r border-neutral-200">
                      {row.totalHours}h
                    </td>

                    {row.days.map((dCell) => {
                      const tooltipParts = [
                        `${row.employee.name} — ${dCell.dateStr}`,
                        `Status: ${dCell.statusLabel}`,
                      ];
                      if (dCell.inTime) tooltipParts.push(`Check-In: ${dCell.inTime}`);
                      if (dCell.outTime)
                        tooltipParts.push(`Check-Out: ${dCell.outTime}`);
                      if (dCell.hours !== undefined && dCell.hours > 0)
                        tooltipParts.push(`Hours: ${dCell.hours}h`);

                      return (
                        <td
                          key={dCell.dateStr}
                          title={tooltipParts.join(' | ')}
                          onClick={() => setInspectModalEmp(row.employee)}
                          className="p-1 text-center border-r border-neutral-100 cursor-pointer"
                        >
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 text-[10px] font-bold border rounded-md ${
                              codeBadgeStyles[dCell.code]
                            }`}
                          >
                            {dCell.code}
                          </span>
                        </td>
                      );
                    })}

                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Eye className="w-3 h-3" />}
                        onClick={() => setInspectModalEmp(row.employee)}
                      >
                        Calendar &amp; Logs
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW MODE 2: INDIVIDUAL EMPLOYEE MONTHLY CALENDAR & PAST LOGS */}
        {viewMode === 'employee-calendar' && (
          <div className="space-y-5">
            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-sky-600" />
                <div>
                  <label className="block text-xs font-bold text-neutral-700">
                    Select Employee to Inspect Full Monthly Calendar &amp; Past Attendance
                  </label>
                  <select
                    value={currentlySelectedEmp?.id || ''}
                    onChange={(e) => setSelectedEmpId(e.target.value)}
                    className="mt-1 px-3 py-2 text-xs font-bold border border-neutral-300 rounded-lg bg-white min-w-[280px]"
                  >
                    {activeEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.ecode}) — {emp.designation} ({emp.department})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {currentlySelectedEmp && (
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="info">{currentlySelectedEmp.department}</Badge>
                  <Badge variant="neutral">
                    {selectedEmpAllRecords.length} Total Historical Attendance Day(s)
                  </Badge>
                </div>
              )}
            </div>

            {currentlySelectedEmp && (
              <>
                <AttendanceCalendar
                  records={selectedEmpAllRecords}
                  holidays={holidays}
                />

                <Card
                  title={`Complete Past Attendance Punch Log — ${currentlySelectedEmp.name} (${currentlySelectedEmp.ecode})`}
                  subtitle="Chronological history of all Check-In and Check-Out punches, work hours, and daily statuses."
                >
                  {selectedEmpAllRecords.length === 0 ? (
                    <EmptyState
                      title="No Past Attendance Records Logged Yet"
                      description="Once this employee checks in or out, their daily attendance records will appear here."
                    />
                  ) : (
                    <Table
                      headers={[
                        'Date',
                        'Status',
                        'First Check-In',
                        'Last Check-Out',
                        'Total Hours',
                        'Late / Half-Day Flags',
                      ]}
                    >
                      {selectedEmpAllRecords.map((rec) => {
                        const firstIn = rec.punches?.find((p) => p.type === 'IN');
                        const lastOut = [...(rec.punches || [])]
                          .reverse()
                          .find((p) => p.type === 'OUT');

                        return (
                          <tr key={rec.id}>
                            <td className="px-4 py-2.5 text-xs font-mono font-bold text-neutral-900">
                              {rec.date}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                variant={
                                  rec.status === 'Present'
                                    ? 'success'
                                    : rec.status === 'Late' ||
                                      rec.status === 'Half-Day'
                                    ? 'warning'
                                    : 'danger'
                                }
                              >
                                {rec.status === 'Absent'
                                  ? 'Under-reported'
                                  : rec.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-xs font-mono text-emerald-700 font-semibold">
                              {firstIn
                                ? firstIn.timestamp.includes('T')
                                  ? new Date(
                                      firstIn.timestamp
                                    ).toLocaleTimeString()
                                  : firstIn.timestamp
                                : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-mono text-sky-700 font-semibold">
                              {lastOut
                                ? lastOut.timestamp.includes('T')
                                  ? new Date(
                                      lastOut.timestamp
                                    ).toLocaleTimeString()
                                  : lastOut.timestamp
                                : 'Active / Not Checked Out'}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-mono font-bold text-neutral-900">
                              {rec.totalHours || 0} hrs
                            </td>
                            <td className="px-4 py-2.5 text-xs space-x-1">
                              {rec.isLate && (
                                <Badge variant="warning">Late Mark</Badge>
                              )}
                              {rec.isHalfDay && (
                                <Badge variant="warning">Half-Day</Badge>
                              )}
                              {!rec.isLate && !rec.isHalfDay && (
                                <span className="text-neutral-400">On-Time</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Table>
                  )}
                </Card>
              </>
            )}
          </div>
        )}
      </Card>

      {/* MODAL: Inspect Specific Employee's Full Monthly Calendar & Past Logs */}
      <Modal
        isOpen={Boolean(inspectModalEmp)}
        onClose={() => setInspectModalEmp(null)}
        size="xl"
        title={
          inspectModalEmp
            ? `Monthly Calendar & Past Attendance — ${inspectModalEmp.name} (${inspectModalEmp.ecode})`
            : 'Employee Attendance History'
        }
        subtitle={
          inspectModalEmp
            ? `${inspectModalEmp.designation} • ${inspectModalEmp.department} • Navigate any month or inspect chronological daily punch logs`
            : ''
        }
      >
        {inspectModalEmp &&
          (() => {
            const empAllRecs = getEmployeeAllRecords(inspectModalEmp);
            return (
              <div className="space-y-5">
                <AttendanceCalendar
                  records={empAllRecs}
                  holidays={holidays}
                />

                <div>
                  <h4 className="text-xs font-bold uppercase text-neutral-500 mb-2">
                    Historical Daily Attendance Records ({empAllRecs.length})
                  </h4>
                  {empAllRecs.length === 0 ? (
                    <EmptyState
                      title="No Recorded Punches Yet"
                      description="This employee has no recorded attendance punches yet."
                    />
                  ) : (
                    <Table
                      headers={[
                        'Date',
                        'Status',
                        'Check-In Time',
                        'Check-Out Time',
                        'Work Hours',
                      ]}
                    >
                      {empAllRecs.map((rec) => {
                        const firstIn = rec.punches?.find((p) => p.type === 'IN');
                        const lastOut = [...(rec.punches || [])]
                          .reverse()
                          .find((p) => p.type === 'OUT');
                        return (
                          <tr key={rec.id}>
                            <td className="px-3 py-2 text-xs font-mono font-bold">
                              {rec.date}
                            </td>
                            <td className="px-3 py-2">
                              <Badge
                                variant={
                                  rec.status === 'Present'
                                    ? 'success'
                                    : rec.status === 'Late' ||
                                      rec.status === 'Half-Day'
                                    ? 'warning'
                                    : 'danger'
                                }
                              >
                                {rec.status === 'Absent'
                                  ? 'Under-reported'
                                  : rec.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-emerald-700">
                              {firstIn
                                ? firstIn.timestamp.includes('T')
                                  ? new Date(
                                      firstIn.timestamp
                                    ).toLocaleTimeString()
                                  : firstIn.timestamp
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-sky-700">
                              {lastOut
                                ? lastOut.timestamp.includes('T')
                                  ? new Date(
                                      lastOut.timestamp
                                    ).toLocaleTimeString()
                                  : lastOut.timestamp
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-xs font-mono font-bold">
                              {rec.totalHours || 0}h
                            </td>
                          </tr>
                        );
                      })}
                    </Table>
                  )}
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
};
