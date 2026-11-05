import React, { useState, useMemo } from 'react';
import {
  Download,
  ChevronDown,
  ChevronUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  ShieldCheck,
  CheckCircle2,
  FileText,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { Badge, Button, useToast } from '../../core/components/DesignSystem';
import { PermissionsService } from '../../core/services/permissionsService';
import { PolicyEngine } from './policyEngine';
import type {
  Employee,
  ShowupAttendanceRecord,
  ShowupLeaveRequest,
  ShowupHoliday,
  ShowupPolicyConfig,
} from '../../core/types';

interface WhoIsInOfficeProps {
  employees: Employee[];
  attendanceRecords: ShowupAttendanceRecord[];
  leaveRequests: ShowupLeaveRequest[];
  holidays: ShowupHoliday[];
  policy: ShowupPolicyConfig;
  onViewLocationOnMap?: (record: ShowupAttendanceRecord) => void;
}

export const WhoIsInOfficeDashboard: React.FC<WhoIsInOfficeProps> = ({
  employees,
  attendanceRecords,
  leaveRequests,
  holidays,
  policy,
  onViewLocationOnMap,
}) => {
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null);
  const [outOfOfficeFilter, setOutOfOfficeFilter] = useState<
    'all' | 'leave' | 'holiday' | 'off' | 'rest'
  >('leave');

  // Format date as "05 Nov 2026"
  const formattedDateTitle = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const handlePrevDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d - 1);
    setSelectedDate(dt.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 1);
    setSelectedDate(dt.toISOString().slice(0, 10));
  };

  // Only consider active employees (exclude EMP-001 or deleted test entries)
  const activeEmployees = useMemo(() => {
    return employees
      .filter((e) => e.status !== 'Inactive')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  // Daily classification engine
  const dailyData = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const matchedHoliday = holidays.find((h) => h.date === selectedDate);

    // Records for this date
    const dayRecords = attendanceRecords.filter((r) => r.date === selectedDate);
    const recordByEmpMap = new Map<string, ShowupAttendanceRecord>();
    for (const rec of dayRecords) {
      recordByEmpMap.set(PermissionsService.normalizeEmpId(rec.employeeId), rec);
      if (rec.employeeEcode) {
        recordByEmpMap.set(PermissionsService.normalizeEmpId(rec.employeeEcode), rec);
      }
    }

    // Approved leaves covering this date
    const dayLeaves = leaveRequests.filter(
      (lr) =>
        lr.status === 'Approved' &&
        lr.startDate <= selectedDate &&
        lr.endDate >= selectedDate
    );
    const leaveByEmpMap = new Map<string, ShowupLeaveRequest>();
    for (const l of dayLeaves) {
      leaveByEmpMap.set(PermissionsService.normalizeEmpId(l.employeeId), l);
    }

    const notYetInList: Array<{
      employee: Employee;
      expectedTime: string;
      record?: ShowupAttendanceRecord;
    }> = [];

    const lateArrivalsList: Array<{
      employee: Employee;
      inTime: string;
      lateBy: string;
      record?: ShowupAttendanceRecord;
    }> = [];

    const onTimeList: Array<{
      employee: Employee;
      inTime: string;
      earlyBy: string;
      record?: ShowupAttendanceRecord;
    }> = [];

    const outOfOfficeList: Array<{
      employee: Employee;
      type: 'On Leave' | 'Holiday' | 'Off Day' | 'Rest Day';
      daysCount: string;
      leaveRequest?: ShowupLeaveRequest;
      holidayName?: string;
    }> = [];

    const expectedInTimeStr = `${policy.shiftStart || '09:30'}:00`;
    const [shiftH, shiftM] = (policy.shiftStart || '09:30')
      .split(':')
      .map(Number);
    const shiftMinutes = shiftH * 60 + shiftM;

    for (const emp of activeEmployees) {
      const normId = PermissionsService.normalizeEmpId(emp.id);
      const normEcode = PermissionsService.normalizeEmpId(emp.ecode);

      // Check leave first
      const approvedLeave = leaveByEmpMap.get(normId) || leaveByEmpMap.get(normEcode);
      if (approvedLeave) {
        const days = approvedLeave.days || 1;
        outOfOfficeList.push({
          employee: emp,
          type: 'On Leave',
          daysCount: `${String(days).padStart(2, '0')} Day(s)`,
          leaveRequest: approvedLeave,
        });
        continue;
      }

      // Check Holiday / Weekend
      if (matchedHoliday) {
        outOfOfficeList.push({
          employee: emp,
          type: 'Holiday',
          daysCount: '01 Day(s)',
          holidayName: matchedHoliday.name,
        });
        continue;
      }

      if (isWeekend) {
        outOfOfficeList.push({
          employee: emp,
          type: dayOfWeek === 0 ? 'Rest Day' : 'Off Day',
          daysCount: '01 Day(s)',
        });
        continue;
      }

      // Check attendance punch
      const record = recordByEmpMap.get(normId) || recordByEmpMap.get(normEcode);
      const firstIn = record?.punches?.find((p) => p.type === 'IN');

      if (!firstIn) {
        notYetInList.push({
          employee: emp,
          expectedTime: expectedInTimeStr,
          record,
        });
      } else {
        // Extract punch in time (HH:mm:ss)
        let punchHours = 9;
        let punchMins = 30;
        let punchSecs = 0;
        let displayTime = '09:30:00';

        if (firstIn.timestamp.includes('T')) {
          const d = new Date(firstIn.timestamp);
          punchHours = d.getHours();
          punchMins = d.getMinutes();
          punchSecs = d.getSeconds();
          displayTime = `${String(punchHours).padStart(2, '0')}:${String(
            punchMins
          ).padStart(2, '0')}:${String(punchSecs).padStart(2, '0')}`;
        } else if (firstIn.timestamp.includes(':')) {
          const parts = firstIn.timestamp.split(':').map(Number);
          punchHours = parts[0] || 0;
          punchMins = parts[1] || 0;
          punchSecs = parts[2] || 0;
          displayTime = `${String(punchHours).padStart(2, '0')}:${String(
            punchMins
          ).padStart(2, '0')}:${String(punchSecs).padStart(2, '0')}`;
        }

        const isLate = PolicyEngine.isPunchInLate(firstIn.timestamp, policy);

        if (isLate) {
          const punchTotalMins = punchHours * 60 + punchMins;
          const lateMins = Math.max(1, punchTotalMins - shiftMinutes);
          const lateHours = Math.floor(lateMins / 60);
          const remMins = lateMins % 60;
          const lateByStr =
            lateHours > 0
              ? `${String(lateHours).padStart(2, '0')}:${String(remMins).padStart(2, '0')}`
              : `+${lateMins}m`;

          lateArrivalsList.push({
            employee: emp,
            inTime: displayTime,
            lateBy: lateByStr,
            record,
          });
        } else {
          // On time: calculate early by
          const punchTotalMins = punchHours * 60 + punchMins;
          let earlyByStr = '00:00';

          if (punchTotalMins < shiftMinutes) {
            const earlyMins = shiftMinutes - punchTotalMins;
            const earlyHours = Math.floor(earlyMins / 60);
            const remMins = earlyMins % 60;
            earlyByStr = `${String(earlyHours).padStart(2, '0')}:${String(
              remMins
            ).padStart(2, '0')}`;
          }

          onTimeList.push({
            employee: emp,
            inTime: displayTime,
            earlyBy: earlyByStr,
            record,
          });
        }
      }
    }

    const total = activeEmployees.length || 1;
    const notYetInPct = ((notYetInList.length / total) * 100).toFixed(
      notYetInList.length === 0 ? 0 : notYetInList.length % 2 === 0 ? 1 : 2
    );
    const lateArrivalsPct = ((lateArrivalsList.length / total) * 100).toFixed(
      lateArrivalsList.length === 0 ? 0 : 2
    );
    const onTimePct = ((onTimeList.length / total) * 100).toFixed(
      onTimeList.length === 0 ? 0 : 2
    );
    const outOfOfficePct = ((outOfOfficeList.length / total) * 100).toFixed(
      outOfOfficeList.length === 0 ? 0 : 2
    );

    return {
      notYetInList,
      lateArrivalsList,
      onTimeList,
      outOfOfficeList,
      notYetInPct,
      lateArrivalsPct,
      onTimePct,
      outOfOfficePct,
      total,
    };
  }, [selectedDate, activeEmployees, attendanceRecords, leaveRequests, holidays, policy]);

  // Export CSV Helper
  const exportCategoryCsv = (
    title: string,
    rows: Array<Record<string, string>>
  ) => {
    if (rows.length === 0) {
      showToast('warning', 'Nothing to Export', `No records in ${title} for ${selectedDate}.`);
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        headers.join(','),
        ...rows.map((r) =>
          headers
            .map((h) => `"${String(r[h] || '').replace(/"/g, '""')}"`)
            .join(',')
        ),
      ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `${title.replace(/\s+/g, '_')}_${selectedDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('success', 'Report Exported', `Downloaded ${title} CSV report.`);
  };

  // Filter Out Of Office list based on active mini pill
  const filteredOutOfOfficeList = useMemo(() => {
    if (outOfOfficeFilter === 'all') return dailyData.outOfOfficeList;
    if (outOfOfficeFilter === 'leave')
      return dailyData.outOfOfficeList.filter((item) => item.type === 'On Leave');
    if (outOfOfficeFilter === 'holiday')
      return dailyData.outOfOfficeList.filter((item) => item.type === 'Holiday');
    if (outOfOfficeFilter === 'off')
      return dailyData.outOfOfficeList.filter((item) => item.type === 'Off Day');
    if (outOfOfficeFilter === 'rest')
      return dailyData.outOfOfficeList.filter((item) => item.type === 'Rest Day');
    return dailyData.outOfOfficeList;
  }, [dailyData.outOfOfficeList, outOfOfficeFilter]);

  const onLeaveCount = dailyData.outOfOfficeList.filter(
    (x) => x.type === 'On Leave'
  ).length;
  const holidayCount = dailyData.outOfOfficeList.filter(
    (x) => x.type === 'Holiday'
  ).length;
  const offDayCount = dailyData.outOfOfficeList.filter(
    (x) => x.type === 'Off Day'
  ).length;
  const restDayCount = dailyData.outOfOfficeList.filter(
    (x) => x.type === 'Rest Day'
  ).length;

  return (
    <div className="space-y-4">
      {/* Top Header Card with Date Selector */}
      <div className="bg-white border border-neutral-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 bg-neutral-50/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500">
              Daily Attendance Intelligence:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrevDay}
                className="p-1 hover:bg-neutral-200/80 rounded-md transition cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4 text-neutral-600" />
              </button>

              <div className="relative inline-flex items-center gap-2 px-3 py-1 bg-white border border-neutral-300 rounded-lg shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                <span className="text-sm font-bold text-neutral-900 tracking-tight">
                  Employees Information for <strong className="text-sky-700">{formattedDateTitle}</strong>
                </span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={handleNextDay}
                className="p-1 hover:bg-neutral-200/80 rounded-md transition cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4 text-neutral-600" />
              </button>

              {selectedDate !== new Date().toISOString().slice(0, 10) && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedDate(new Date().toISOString().slice(0, 10))
                  }
                  className="ml-2 px-2.5 py-1 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 transition cursor-pointer"
                >
                  Jump to Today
                </button>
              )}
            </div>
          </div>

          <div className="text-xs font-medium text-neutral-500">
            Total Workforce: <strong className="text-neutral-900">{dailyData.total}</strong> Employees
          </div>
        </div>

        {/* 4 Summary Metric Columns (Border-divided layout matching Image 2) */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-neutral-200 text-center bg-white">
          {/* Stat 1: Not Yet In */}
          <div className="p-4 flex flex-col justify-center">
            <div className="text-2xl font-extrabold text-neutral-800 tracking-tight">
              {dailyData.notYetInPct}%
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {dailyData.notYetInList.length} Employee(s) Are Not Yet In
            </div>
          </div>

          {/* Stat 2: Late Arrivals */}
          <div className="p-4 flex flex-col justify-center">
            <div className="text-2xl font-extrabold text-neutral-800 tracking-tight">
              {dailyData.lateArrivalsPct}%
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {dailyData.lateArrivalsList.length === 0
                ? 'No Employee(s) Are Late In'
                : `${dailyData.lateArrivalsList.length} Employee(s) Are Late In`}
            </div>
          </div>

          {/* Stat 3: On Time */}
          <div className="p-4 flex flex-col justify-center">
            <div className="text-2xl font-extrabold text-neutral-800 tracking-tight">
              {dailyData.onTimePct}%
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {dailyData.onTimeList.length} Employee(s) Are On-Time
            </div>
          </div>

          {/* Stat 4: Out of Office */}
          <div className="p-4 flex flex-col justify-center">
            <div className="text-2xl font-extrabold text-neutral-800 tracking-tight">
              {dailyData.outOfOfficePct}%
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {dailyData.outOfOfficeList.length} Employee(s) Are Out of Office
            </div>
          </div>
        </div>
      </div>

      {/* 4 Columns Main Grid matching Image 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 items-start">
        {/* COLUMN 1: NOT YET IN */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-2xs flex flex-col min-h-[460px]">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-neutral-800">
              Not Yet In ({dailyData.notYetInList.length})
            </h3>
            <button
              type="button"
              onClick={() =>
                exportCategoryCsv(
                  'Not_Yet_In_Employees',
                  dailyData.notYetInList.map((x) => ({
                    Employee: x.employee.name,
                    ECode: x.employee.ecode,
                    Department: x.employee.department,
                    ExpectedInTime: x.expectedTime,
                  }))
                )
              }
              className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Table Header */}
          <div className="px-4 py-2 bg-neutral-50/70 border-b border-neutral-100 flex items-center justify-between text-[11px] font-bold text-neutral-500">
            <span>Employee</span>
            <span>Expected In Time</span>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[560px]">
            {dailyData.notYetInList.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto opacity-70" />
                <div className="font-semibold text-neutral-700">All employees clocked in!</div>
                <div>No pending arrivals for today.</div>
              </div>
            ) : (
              dailyData.notYetInList.map((item) => {
                const isExpanded = expandedEmpId === item.employee.id;
                return (
                  <div
                    key={item.employee.id}
                    className="hover:bg-neutral-50/80 transition"
                  >
                    <div
                      onClick={() =>
                        setExpandedEmpId(isExpanded ? null : item.employee.id)
                      }
                      className="px-4 py-3 flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-neutral-900 truncate">
                          {item.employee.name}
                        </div>
                        <div className="text-[11px] font-mono text-sky-700 font-medium">
                          {item.employee.ecode.startsWith('#')
                            ? item.employee.ecode
                            : `#${item.employee.ecode}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-mono text-neutral-600">
                          {item.expectedTime}
                        </span>
                        <div className="w-4 h-4 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-400">
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 text-[11px] bg-neutral-50/60 border-t border-neutral-100 space-y-1 text-neutral-600">
                        <div>
                          <strong>Department:</strong> {item.employee.department}
                        </div>
                        <div>
                          <strong>Designation:</strong> {item.employee.designation}
                        </div>
                        <div>
                          <strong>Email:</strong> {item.employee.email}
                        </div>
                        <div>
                          <strong>Reporting Manager:</strong>{' '}
                          {item.employee.reportingManagerId || 'None (Executive)'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 2: LATE ARRIVALS */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-2xs flex flex-col min-h-[460px]">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-neutral-800">
              Late Arrivals ({dailyData.lateArrivalsList.length})
            </h3>
            <button
              type="button"
              onClick={() =>
                exportCategoryCsv(
                  'Late_Arrivals_Employees',
                  dailyData.lateArrivalsList.map((x) => ({
                    Employee: x.employee.name,
                    ECode: x.employee.ecode,
                    Department: x.employee.department,
                    InTime: x.inTime,
                    LateBy: x.lateBy,
                  }))
                )
              }
              className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {dailyData.lateArrivalsList.length === 0 ? (
            /* Empty State Matching Image 2: "Team's on the way" */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-20 rounded-lg border border-neutral-200 bg-neutral-50/60 flex flex-col items-center justify-center p-2 shadow-2xs relative mb-3">
                <div className="w-6 h-6 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-400">
                  <Clock className="w-3.5 h-3.5 text-neutral-400" />
                </div>
                <div className="w-8 h-1 bg-neutral-200 rounded-sm mt-2" />
                <div className="w-6 h-1 bg-neutral-200 rounded-sm mt-1" />
              </div>
              <p className="text-xs text-neutral-500 font-medium tracking-tight">
                Team's on the way
              </p>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="px-4 py-2 bg-neutral-50/70 border-b border-neutral-100 flex items-center justify-between text-[11px] font-bold text-neutral-500">
                <span>Employee</span>
                <span>Late By / In Time</span>
              </div>

              <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[560px]">
                {dailyData.lateArrivalsList.map((item) => {
                  const isExpanded = expandedEmpId === item.employee.id;
                  const firstInPunch = item.record?.punches?.find(
                    (p) => p.type === 'IN'
                  );
                  return (
                    <div
                      key={item.employee.id}
                      className="hover:bg-neutral-50/80 transition"
                    >
                      <div
                        onClick={() =>
                          setExpandedEmpId(isExpanded ? null : item.employee.id)
                        }
                        className="px-4 py-3 flex items-center justify-between cursor-pointer select-none"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-bold text-neutral-900 truncate">
                            {item.employee.name}
                          </div>
                          <div className="text-[11px] font-mono text-sky-700 font-medium">
                            {item.employee.ecode.startsWith('#')
                              ? item.employee.ecode
                              : `#${item.employee.ecode}`}
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0 text-right">
                          <div>
                            <div className="text-xs font-mono font-bold text-amber-700">
                              {item.lateBy}
                            </div>
                            <div className="text-[11px] font-mono text-neutral-500">
                              {item.inTime}
                            </div>
                          </div>
                          <div className="w-4 h-4 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-400">
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-1 text-[11px] bg-neutral-50/60 border-t border-neutral-100 space-y-1.5 text-neutral-600">
                          <div>
                            <strong>Department:</strong> {item.employee.department}
                          </div>
                          <div>
                            <strong>Punch Status:</strong>{' '}
                            <Badge variant="warning">{item.record?.status || 'Late'}</Badge>
                          </div>
                          {firstInPunch?.gpsLocation && (
                            <div className="pt-1 flex items-center gap-2 text-sky-700 font-mono">
                              <MapPin className="w-3 h-3" />
                              <span>
                                Lat: {firstInPunch.gpsLocation.latitude.toFixed(4)},{' '}
                                Lng: {firstInPunch.gpsLocation.longitude.toFixed(4)} (±{firstInPunch.gpsLocation.accuracy}m)
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* COLUMN 3: ON TIME */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-2xs flex flex-col min-h-[460px]">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-neutral-800">
              On Time ({dailyData.onTimeList.length})
            </h3>
            <button
              type="button"
              onClick={() =>
                exportCategoryCsv(
                  'On_Time_Employees',
                  dailyData.onTimeList.map((x) => ({
                    Employee: x.employee.name,
                    ECode: x.employee.ecode,
                    Department: x.employee.department,
                    EarlyBy: x.earlyBy,
                    InTime: x.inTime,
                  }))
                )
              }
              className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Table Header */}
          <div className="px-4 py-2 bg-neutral-50/70 border-b border-neutral-100 flex items-center justify-between text-[11px] font-bold text-neutral-500">
            <span>Employee</span>
            <span>Early By</span>
          </div>

          {/* Table Rows matching Image 2 */}
          <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[560px]">
            {dailyData.onTimeList.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400 space-y-1">
                <Clock className="w-6 h-6 text-neutral-400 mx-auto opacity-60" />
                <div className="font-semibold text-neutral-700">No on-time punches yet</div>
                <div>Employees clocking in before 10:00 AM will list here.</div>
              </div>
            ) : (
              dailyData.onTimeList.map((item) => {
                const isExpanded = expandedEmpId === item.employee.id;
                const firstInPunch = item.record?.punches?.find(
                  (p) => p.type === 'IN'
                );
                return (
                  <div
                    key={item.employee.id}
                    className="hover:bg-neutral-50/80 transition"
                  >
                    <div
                      onClick={() =>
                        setExpandedEmpId(isExpanded ? null : item.employee.id)
                      }
                      className="px-4 py-3 flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-neutral-900 truncate">
                          {item.employee.name}
                        </div>
                        <div className="text-[11px] font-mono text-sky-700 font-medium">
                          {item.employee.ecode.startsWith('#')
                            ? item.employee.ecode
                            : `#${item.employee.ecode}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 text-right">
                        <div>
                          <div className="text-xs font-mono font-bold text-neutral-800">
                            {item.earlyBy}
                          </div>
                          <div className="text-[11px] font-mono text-neutral-500">
                            {item.inTime}
                          </div>
                        </div>
                        <div className="w-4 h-4 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-400">
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 text-[11px] bg-neutral-50/60 border-t border-neutral-100 space-y-1.5 text-neutral-600">
                        <div>
                          <strong>Department:</strong> {item.employee.department}
                        </div>
                        <div>
                          <strong>Designation:</strong> {item.employee.designation}
                        </div>
                        <div>
                          <strong>Total Hours Logged:</strong>{' '}
                          {item.record?.totalHours || 0} hrs
                        </div>
                        {firstInPunch?.gpsLocation && (
                          <div className="pt-1 flex items-center gap-2 text-emerald-700 font-mono">
                            <MapPin className="w-3 h-3" />
                            <span>
                              GPS: {firstInPunch.gpsLocation.latitude.toFixed(4)},{' '}
                              {firstInPunch.gpsLocation.longitude.toFixed(4)} (±{firstInPunch.gpsLocation.accuracy}m)
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 4: OUT OF OFFICE */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-2xs flex flex-col min-h-[460px]">
          <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-neutral-800">
              Out of Office ({dailyData.outOfOfficeList.length})
            </h3>
            <button
              type="button"
              onClick={() =>
                exportCategoryCsv(
                  'Out_Of_Office_Employees',
                  dailyData.outOfOfficeList.map((x) => ({
                    Employee: x.employee.name,
                    ECode: x.employee.ecode,
                    Department: x.employee.department,
                    Type: x.type,
                    Duration: x.daysCount,
                    Reason: x.leaveRequest?.reason || x.holidayName || '',
                  }))
                )
              }
              className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition cursor-pointer"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Mini Status Pills matching Image 2: On Leave | Holiday | Off Day | Rest Day */}
          <div className="p-3 bg-neutral-50/50 border-b border-neutral-200 grid grid-cols-4 gap-1.5 text-center">
            <button
              type="button"
              onClick={() => setOutOfOfficeFilter('leave')}
              className={`p-2 rounded-lg border text-xs cursor-pointer transition ${
                outOfOfficeFilter === 'leave'
                  ? 'bg-blue-50/90 border-blue-200 text-blue-900 font-bold shadow-2xs'
                  : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <div className="text-[10px] uppercase font-bold text-neutral-500">
                On Leave
              </div>
              <div className="text-sm font-extrabold mt-0.5">{onLeaveCount}</div>
            </button>

            <button
              type="button"
              onClick={() => setOutOfOfficeFilter('holiday')}
              className={`p-2 rounded-lg border text-xs cursor-pointer transition ${
                outOfOfficeFilter === 'holiday'
                  ? 'bg-blue-50/90 border-blue-200 text-blue-900 font-bold shadow-2xs'
                  : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <div className="text-[10px] uppercase font-bold text-neutral-500">
                Holiday
              </div>
              <div className="text-sm font-extrabold mt-0.5">{holidayCount}</div>
            </button>

            <button
              type="button"
              onClick={() => setOutOfOfficeFilter('off')}
              className={`p-2 rounded-lg border text-xs cursor-pointer transition ${
                outOfOfficeFilter === 'off'
                  ? 'bg-blue-50/90 border-blue-200 text-blue-900 font-bold shadow-2xs'
                  : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <div className="text-[10px] uppercase font-bold text-neutral-500">
                Off Day
              </div>
              <div className="text-sm font-extrabold mt-0.5">{offDayCount}</div>
            </button>

            <button
              type="button"
              onClick={() => setOutOfOfficeFilter('rest')}
              className={`p-2 rounded-lg border text-xs cursor-pointer transition ${
                outOfOfficeFilter === 'rest'
                  ? 'bg-blue-50/90 border-blue-200 text-blue-900 font-bold shadow-2xs'
                  : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <div className="text-[10px] uppercase font-bold text-neutral-500">
                Rest Day
              </div>
              <div className="text-sm font-extrabold mt-0.5">{restDayCount}</div>
            </button>
          </div>

          {/* Table Header */}
          <div className="px-4 py-2 bg-neutral-50/70 border-b border-neutral-100 flex items-center justify-between text-[11px] font-bold text-neutral-500">
            <span>Employee</span>
            <span>Number Of Days</span>
          </div>

          {/* Table Rows matching Image 2 */}
          <div className="divide-y divide-neutral-100 flex-1 overflow-y-auto max-h-[500px]">
            {filteredOutOfOfficeList.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400 space-y-1">
                <User className="w-6 h-6 text-neutral-400 mx-auto opacity-50" />
                <div className="font-semibold text-neutral-700">None in this category</div>
                <div>No employees scheduled out of office under this filter.</div>
              </div>
            ) : (
              filteredOutOfOfficeList.map((item) => {
                const isExpanded = expandedEmpId === item.employee.id;
                return (
                  <div
                    key={item.employee.id}
                    className="hover:bg-neutral-50/80 transition"
                  >
                    <div
                      onClick={() =>
                        setExpandedEmpId(isExpanded ? null : item.employee.id)
                      }
                      className="px-4 py-3 flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-bold text-neutral-900 truncate">
                          {item.employee.name}
                        </div>
                        <div className="text-[11px] font-mono text-sky-700 font-medium">
                          {item.employee.ecode.startsWith('#')
                            ? item.employee.ecode
                            : `#${item.employee.ecode}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 text-right">
                        <div>
                          <div className="text-xs font-semibold text-neutral-800">
                            {item.daysCount}
                          </div>
                          <div className="mt-0.5">
                            <span className="inline-block px-2 py-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-full">
                              Approved
                            </span>
                          </div>
                        </div>
                        <div className="w-4 h-4 rounded-full border border-neutral-300 flex items-center justify-center text-neutral-400">
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Details */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 text-[11px] bg-neutral-50/60 border-t border-neutral-100 space-y-1.5 text-neutral-600">
                        <div>
                          <strong>Department:</strong> {item.employee.department}
                        </div>
                        {item.leaveRequest && (
                          <>
                            <div>
                              <strong>Leave Category:</strong>{' '}
                              <Badge variant="info">
                                {item.leaveRequest.leaveType}
                              </Badge>
                            </div>
                            <div>
                              <strong>Duration:</strong>{' '}
                              {item.leaveRequest.startDate} to{' '}
                              {item.leaveRequest.endDate}
                            </div>
                            <div>
                              <strong>Reason:</strong> {item.leaveRequest.reason}
                            </div>
                          </>
                        )}
                        {item.holidayName && (
                          <div>
                            <strong>Holiday Occasion:</strong> {item.holidayName}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
