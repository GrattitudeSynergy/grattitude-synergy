import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  ExternalLink,
  History,
  ShieldAlert,
  Search,
  Calendar,
  Smartphone,
  Laptop,
  CheckCircle2,
  Eye,
  FileText,
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
import { AuditService } from '../../core/services/auditService';
import type {
  Employee,
  ShowupAttendanceRecord,
  AttendanceGeoLocation,
  AuditLogEntry,
} from '../../core/types';

interface SelectedMapTarget {
  record: ShowupAttendanceRecord;
  employeeName: string;
  employeeEcode: string;
  department: string;
  activeLoc: AttendanceGeoLocation;
  label: 'Check-In' | 'Check-Out' | 'Punch History';
}

export const AdminGpsDashboard: React.FC<{
  currentEmployee: Employee;
  attendanceRecords: ShowupAttendanceRecord[];
  employees: Employee[];
}> = ({ currentEmployee, attendanceRecords, employees }) => {
  const { showToast } = useToast();
  const isStrictAdmin = PermissionsService.canAccessEmployeeGpsLocations(currentEmployee);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedMapTarget, setSelectedMapTarget] =
    useState<SelectedMapTarget | null>(null);
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);
  const [locationAuditLogs, setLocationAuditLogs] = useState<AuditLogEntry[]>([]);

  const loggedDashboardMount = useRef(false);

  // Log Admin access to the GPS Location Dashboard on open & subscribe to location audit logs
  useEffect(() => {
    if (!isStrictAdmin) return;

    if (!loggedDashboardMount.current) {
      loggedDashboardMount.current = true;
      void AuditService.log({
        action: 'ADMIN_GPS_DASHBOARD_ACCESSED',
        actor: currentEmployee,
        targetId: 'showup_attendance_gps',
        targetType: 'AttendanceGpsDashboard',
        details: `Admin ${currentEmployee.name} (${currentEmployee.ecode}) opened the Employee Attendance GPS Location Tracking Dashboard.`,
      });
    }

    const unsub = AuditService.subscribeLogs((logs) => {
      const gpsLogs = logs.filter(
        (l) =>
          l.action.startsWith('ADMIN_GPS_') ||
          l.targetType === 'AttendanceGpsLocation' ||
          l.targetType === 'AttendanceGpsDashboard'
      );
      setLocationAuditLogs(gpsLogs);
    });

    return () => unsub();
  }, [isStrictAdmin, currentEmployee]);

  // Strict Backend & UI Guard: Never render for Employees or Managers
  if (!isStrictAdmin) {
    return (
      <Card title="Access Restricted — Admin Only">
        <div className="p-6 text-center space-y-2">
          <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
          <div className="text-sm font-bold text-neutral-900">
            Unauthorized Access Attempt Blocked
          </div>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            Employee attendance GPS coordinates and location history are strictly restricted to authorized Admin accounts at both the database and API levels.
          </p>
        </div>
      </Card>
    );
  }

  const getEmployeeMeta = (empId: string, fallbackName?: string) => {
    const norm = PermissionsService.normalizeEmpId(empId);
    const emp = employees.find(
      (e) =>
        PermissionsService.normalizeEmpId(e.id) === norm ||
        PermissionsService.normalizeEmpId(e.ecode) === norm
    );
    return {
      name: emp?.name || fallbackName || empId,
      ecode: emp?.ecode || empId,
      department: emp?.department || 'General',
      designation: emp?.designation || 'Employee',
      empObj: emp || null,
    };
  };

  // Extract Check-In and Check-Out locations from record (or fallback to punches[].gpsLocation)
  const resolveRecordLocations = (rec: ShowupAttendanceRecord): {
    checkIn?: AttendanceGeoLocation;
    checkOut?: AttendanceGeoLocation;
    allGpsPunches: AttendanceGeoLocation[];
  } => {
    const gpsPunches: AttendanceGeoLocation[] = [];
    for (const p of rec.punches || []) {
      if (p.gpsLocation && typeof p.gpsLocation.latitude === 'number') {
        gpsPunches.push(p.gpsLocation);
      }
    }
    const inPunches = gpsPunches.filter((g) => g.punchType === 'IN');
    const outPunches = gpsPunches.filter((g) => g.punchType === 'OUT');

    const checkIn =
      rec.checkInLocation && typeof rec.checkInLocation.latitude === 'number'
        ? rec.checkInLocation
        : inPunches[0];

    const checkOut =
      rec.checkOutLocation && typeof rec.checkOutLocation.latitude === 'number'
        ? rec.checkOutLocation
        : outPunches[outPunches.length - 1];

    return { checkIn, checkOut, allGpsPunches: gpsPunches };
  };

  // Sort records newest date/timestamp first
  const sortedRecords = [...attendanceRecords].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const filteredRecords = sortedRecords.filter((rec) => {
    const meta = getEmployeeMeta(rec.employeeId, rec.employeeName);
    if (selectedEmpId !== 'ALL') {
      const selNorm = PermissionsService.normalizeEmpId(selectedEmpId);
      const recNorm = PermissionsService.normalizeEmpId(rec.employeeId);
      if (selNorm !== recNorm) return false;
    }
    if (selectedDate && rec.date !== selectedDate) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        meta.name.toLowerCase().includes(q) ||
        meta.ecode.toLowerCase().includes(q) ||
        meta.department.toLowerCase().includes(q) ||
        rec.date.includes(q);
      if (!match) return false;
    }
    return true;
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayGpsCheckIns = attendanceRecords.filter((r) => {
    if (r.date !== todayStr) return false;
    const { checkIn } = resolveRecordLocations(r);
    return Boolean(checkIn);
  }).length;

  const todayGpsCheckOuts = attendanceRecords.filter((r) => {
    if (r.date !== todayStr) return false;
    const { checkOut } = resolveRecordLocations(r);
    return Boolean(checkOut);
  }).length;

  const totalGpsRecordsCount = attendanceRecords.filter((r) => {
    const { checkIn, checkOut, allGpsPunches } = resolveRecordLocations(r);
    return Boolean(checkIn || checkOut || allGpsPunches.length > 0);
  }).length;

  const handleInspectOnGoogleMaps = async (
    rec: ShowupAttendanceRecord,
    loc: AttendanceGeoLocation,
    label: 'Check-In' | 'Check-Out' | 'Punch History'
  ) => {
    const meta = getEmployeeMeta(rec.employeeId, rec.employeeName);
    setSelectedMapTarget({
      record: rec,
      employeeName: meta.name,
      employeeEcode: meta.ecode,
      department: meta.department,
      activeLoc: loc,
      label,
    });

    await AuditService.log({
      action: 'ADMIN_GPS_LOCATION_VIEWED',
      actor: currentEmployee,
      targetId: `${rec.id}_${loc.punchType}`,
      targetType: 'AttendanceGpsLocation',
      details: `Admin ${currentEmployee.name} viewed ${label} GPS location on Google Maps for ${meta.name} (${meta.ecode}) on ${rec.date} [Lat: ${loc.latitude.toFixed(6)}, Lng: ${loc.longitude.toFixed(6)}, Accuracy: ±${loc.accuracy}m].`,
    });

    showToast(
      'info',
      'GPS Location Access Logged',
      `Audit entry recorded for viewing ${meta.name}'s ${label} location.`
    );
  };

  const handleOpenEmployeeHistory = async (emp: Employee) => {
    setHistoryEmployee(emp);
    await AuditService.log({
      action: 'ADMIN_GPS_HISTORY_INSPECTED',
      actor: currentEmployee,
      targetId: emp.id,
      targetType: 'AttendanceGpsLocation',
      details: `Admin ${currentEmployee.name} inspected full attendance GPS location history for ${emp.name} (${emp.ecode}).`,
    });
  };

  const employeeHistoryRecords = historyEmployee
    ? sortedRecords.filter(
        (r) =>
          PermissionsService.normalizeEmpId(r.employeeId) ===
          PermissionsService.normalizeEmpId(historyEmployee.id)
      )
    : [];

  return (
    <div className="space-y-5">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <div className="text-[11px] font-bold uppercase text-neutral-500">
            Today's GPS Check-Ins
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">
            {todayGpsCheckIns}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Verified coordinates ({todayStr})
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <div className="text-[11px] font-bold uppercase text-neutral-500">
            Today's GPS Check-Outs
          </div>
          <div className="text-2xl font-extrabold text-sky-700 mt-1">
            {todayGpsCheckOuts}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Completed shifts with GPS
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <div className="text-[11px] font-bold uppercase text-neutral-500">
            Total GPS Attendance Logs
          </div>
          <div className="text-2xl font-extrabold text-neutral-900 mt-1">
            {totalGpsRecordsCount}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Synchronized across devices
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <div className="text-[11px] font-bold uppercase text-neutral-500">
            Location Privacy &amp; RLS
          </div>
          <div className="text-sm font-extrabold text-emerald-700 mt-1.5 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Admin-Only Enforced</span>
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            Hidden from Employees &amp; Managers
          </div>
        </div>
      </div>

      {/* Main GPS Attendance & Location History Card */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-sky-600" />
            <span>
              Admin Attendance GPS Location Tracker &amp; Google Maps Inspector
            </span>
          </div>
        }
        subtitle="Strict Admin-Only View: Inspect Check-In and Check-Out GPS coordinates, accuracy, timestamps, and Google Maps history. Every location inspection is recorded in the Audit Log."
      >
        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee name, E-Code, or department..."
              className="w-full pl-8 pr-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              <option value="ALL">All Employees ({employees.length})</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.ecode}) — {emp.department}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Calendar className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
            {selectedDate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate('')}
              >
                All Dates
              </Button>
            )}
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <EmptyState
            title="No Attendance Location Records Found"
            description="When employees click Check In or Check Out, their device GPS coordinates, accuracy, and timestamps will automatically appear here for Admin review."
          />
        ) : (
          <Table
            headers={[
              'Employee',
              'Date & Status',
              'Check-In GPS Location',
              'Check-Out GPS Location',
              'Location History',
            ]}
          >
            {filteredRecords.map((rec) => {
              const meta = getEmployeeMeta(rec.employeeId, rec.employeeName);
              const { checkIn, checkOut, allGpsPunches } =
                resolveRecordLocations(rec);

              return (
                <tr key={rec.id} className="hover:bg-neutral-50/80">
                  <td className="px-4 py-3">
                    <div className="text-xs font-bold text-neutral-900">
                      {meta.name}
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      {meta.ecode} • {meta.department}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="text-xs font-mono font-bold text-neutral-800">
                      {rec.date}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge
                        variant={
                          rec.status === 'Present'
                            ? 'success'
                            : rec.status === 'Late' || rec.status === 'Half-Day'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {rec.status}
                      </Badge>
                      <span className="text-[11px] font-mono text-neutral-500">
                        {rec.totalHours || 0}h
                      </span>
                    </div>
                  </td>

                  {/* Check-In GPS Column */}
                  <td className="px-4 py-3">
                    {checkIn ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-800">
                          <Navigation className="w-3 h-3 text-emerald-600" />
                          <span>
                            {checkIn.latitude.toFixed(6)},{' '}
                            {checkIn.longitude.toFixed(6)}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-2">
                          <span>
                            Time:{' '}
                            <strong>
                              {new Date(checkIn.timestamp).toLocaleTimeString()}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            Accuracy: <strong>±{checkIn.accuracy}m</strong>
                          </span>
                          {checkIn.deviceType && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-0.5">
                                {checkIn.deviceType.includes('Mobile') ? (
                                  <Smartphone className="w-3 h-3" />
                                ) : (
                                  <Laptop className="w-3 h-3" />
                                )}
                                {checkIn.deviceType}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="pt-1 flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<Eye className="w-3 h-3" />}
                            onClick={() =>
                              handleInspectOnGoogleMaps(rec, checkIn, 'Check-In')
                            }
                          >
                            View on Google Maps
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400 italic">
                        No GPS captured (Legacy record)
                      </span>
                    )}
                  </td>

                  {/* Check-Out GPS Column */}
                  <td className="px-4 py-3">
                    {checkOut ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-sky-800">
                          <Navigation className="w-3 h-3 text-sky-600" />
                          <span>
                            {checkOut.latitude.toFixed(6)},{' '}
                            {checkOut.longitude.toFixed(6)}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-2">
                          <span>
                            Time:{' '}
                            <strong>
                              {new Date(checkOut.timestamp).toLocaleTimeString()}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            Accuracy: <strong>±{checkOut.accuracy}m</strong>
                          </span>
                          {checkOut.deviceType && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-0.5">
                                {checkOut.deviceType.includes('Mobile') ? (
                                  <Smartphone className="w-3 h-3" />
                                ) : (
                                  <Laptop className="w-3 h-3" />
                                )}
                                {checkOut.deviceType}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="pt-1 flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<Eye className="w-3 h-3" />}
                            onClick={() =>
                              handleInspectOnGoogleMaps(
                                rec,
                                checkOut,
                                'Check-Out'
                              )
                            }
                          >
                            View on Google Maps
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400 italic">
                        {rec.punches?.some((p) => p.type === 'OUT')
                          ? 'No GPS captured'
                          : 'Active Shift (Not Checked Out)'}
                      </span>
                    )}
                  </td>

                  {/* Location History Action */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <Badge variant="neutral">
                        {allGpsPunches.length} GPS Punch
                        {allGpsPunches.length === 1 ? '' : 'es'}
                      </Badge>
                      {meta.empObj && (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<History className="w-3 h-3" />}
                          onClick={() =>
                            meta.empObj && handleOpenEmployeeHistory(meta.empObj)
                          }
                        >
                          Location History
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* Admin Location Access Audit Trail */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-600" />
            <span>Admin Location Access Audit Log</span>
          </div>
        }
        subtitle="Immutable compliance log recording every time an Admin accesses or inspects employee GPS location records."
      >
        {locationAuditLogs.length === 0 ? (
          <EmptyState
            title="No Location Access Events Logged Yet"
            description="Inspecting any employee location on Google Maps will automatically append an audit trail record here."
          />
        ) : (
          <Table headers={['Timestamp', 'Admin Actor', 'Action', 'Audit Details']}>
            {locationAuditLogs.slice(0, 25).map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-2 text-xs font-mono text-neutral-600 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-xs font-bold text-neutral-900 whitespace-nowrap">
                  {log.actorName}{' '}
                  <Badge variant="info">{log.actorRole}</Badge>
                </td>
                <td className="px-4 py-2 text-xs font-mono">
                  <Badge variant="neutral">{log.action}</Badge>
                </td>
                <td className="px-4 py-2 text-xs text-neutral-700">
                  {log.details}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* MODAL 1: INTERACTIVE GOOGLE MAPS VIEWER FOR CHECK-IN / CHECK-OUT */}
      <Modal
        isOpen={Boolean(selectedMapTarget)}
        onClose={() => setSelectedMapTarget(null)}
        size="lg"
        title={
          selectedMapTarget
            ? `${selectedMapTarget.label} GPS Location — ${selectedMapTarget.employeeName} (${selectedMapTarget.employeeEcode})`
            : 'Employee GPS Location on Google Maps'
        }
        subtitle={
          selectedMapTarget
            ? `Date: ${selectedMapTarget.record.date} • Timestamp: ${new Date(
                selectedMapTarget.activeLoc.timestamp
              ).toLocaleString()} • GPS Accuracy: ±${
                selectedMapTarget.activeLoc.accuracy
              } meters`
            : ''
        }
      >
        {selectedMapTarget && (
          <div className="space-y-4">
            {/* Quick switcher if record has both Check-In and Check-Out */}
            {(() => {
              const { checkIn, checkOut } = resolveRecordLocations(
                selectedMapTarget.record
              );
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    {checkIn && (
                      <Button
                        size="sm"
                        variant={
                          selectedMapTarget.label === 'Check-In'
                            ? 'primary'
                            : 'outline'
                        }
                        onClick={() =>
                          setSelectedMapTarget({
                            ...selectedMapTarget,
                            activeLoc: checkIn,
                            label: 'Check-In',
                          })
                        }
                      >
                        Check-In Pin (
                        {new Date(checkIn.timestamp).toLocaleTimeString()})
                      </Button>
                    )}
                    {checkOut && (
                      <Button
                        size="sm"
                        variant={
                          selectedMapTarget.label === 'Check-Out'
                            ? 'primary'
                            : 'outline'
                        }
                        onClick={() =>
                          setSelectedMapTarget({
                            ...selectedMapTarget,
                            activeLoc: checkOut,
                            label: 'Check-Out',
                          })
                        }
                      >
                        Check-Out Pin (
                        {new Date(checkOut.timestamp).toLocaleTimeString()})
                      </Button>
                    )}
                  </div>

                  <a
                    href={`https://www.google.com/maps?q=${selectedMapTarget.activeLoc.latitude},${selectedMapTarget.activeLoc.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Full Google Maps</span>
                  </a>
                </div>
              );
            })()}

            {/* Coordinates & Device Telemetry Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[10px] font-bold uppercase text-neutral-500">
                  Latitude
                </div>
                <div className="font-mono font-bold text-neutral-900 mt-0.5">
                  {selectedMapTarget.activeLoc.latitude.toFixed(6)}
                </div>
              </div>
              <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[10px] font-bold uppercase text-neutral-500">
                  Longitude
                </div>
                <div className="font-mono font-bold text-neutral-900 mt-0.5">
                  {selectedMapTarget.activeLoc.longitude.toFixed(6)}
                </div>
              </div>
              <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[10px] font-bold uppercase text-neutral-500">
                  GPS Accuracy
                </div>
                <div className="font-mono font-bold text-emerald-700 mt-0.5">
                  ±{selectedMapTarget.activeLoc.accuracy} meters
                </div>
              </div>
              <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[10px] font-bold uppercase text-neutral-500">
                  Device Platform
                </div>
                <div className="font-bold text-neutral-900 mt-0.5">
                  {selectedMapTarget.activeLoc.deviceType || 'Desktop / Laptop'}
                </div>
              </div>
            </div>

            {/* Embedded Interactive Google Map */}
            <div className="rounded-xl overflow-hidden border border-neutral-300 bg-neutral-100 h-[380px]">
              <iframe
                title={`Google Maps Location — ${selectedMapTarget.employeeName}`}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${selectedMapTarget.activeLoc.latitude},${selectedMapTarget.activeLoc.longitude}&z=16&output=embed`}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 2: EMPLOYEE FULL GPS LOCATION HISTORY */}
      <Modal
        isOpen={Boolean(historyEmployee)}
        onClose={() => setHistoryEmployee(null)}
        size="lg"
        title={
          historyEmployee
            ? `GPS Location History — ${historyEmployee.name} (${historyEmployee.ecode})`
            : 'Employee Location History'
        }
        subtitle={
          historyEmployee
            ? `${historyEmployee.designation} • ${historyEmployee.department} • Complete historical Check-In & Check-Out GPS trail`
            : ''
        }
      >
        {historyEmployee && (
          <div className="space-y-4">
            {employeeHistoryRecords.length === 0 ? (
              <EmptyState
                title="No Attendance Records for This Employee"
                description="Once this employee checks in or out, their historical GPS locations will be listed here."
              />
            ) : (
              <Table
                headers={[
                  'Date',
                  'Punch Type',
                  'Timestamp',
                  'Coordinates (Lat, Lng)',
                  'Accuracy',
                  'Map Action',
                ]}
              >
                {employeeHistoryRecords.flatMap((rec) => {
                  const { checkIn, checkOut, allGpsPunches } =
                    resolveRecordLocations(rec);
                  const entries: AttendanceGeoLocation[] =
                    allGpsPunches.length > 0
                      ? allGpsPunches
                      : [checkIn, checkOut].filter(
                          (x): x is AttendanceGeoLocation => Boolean(x)
                        );

                  return entries.map((loc, idx) => (
                    <tr key={`${rec.id}_${idx}`}>
                      <td className="px-3 py-2 text-xs font-mono font-bold">
                        {rec.date}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={loc.punchType === 'IN' ? 'success' : 'info'}
                        >
                          {loc.punchType === 'IN' ? 'Check-In' : 'Check-Out'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {new Date(loc.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono font-bold text-neutral-800">
                        {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-neutral-600">
                        ±{loc.accuracy}m
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<MapPin className="w-3 h-3" />}
                          onClick={() => {
                            setHistoryEmployee(null);
                            void handleInspectOnGoogleMaps(
                              rec,
                              loc,
                              loc.punchType === 'IN' ? 'Check-In' : 'Check-Out'
                            );
                          }}
                        >
                          View on Map
                        </Button>
                      </td>
                    </tr>
                  ));
                })}
              </Table>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
