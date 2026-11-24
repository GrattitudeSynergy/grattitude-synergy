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
  Tablet,
  Laptop,
  CheckCircle2,
  Eye,
  FileText,
  Building2,
  Crosshair,
  Save,
  Loader2,
  AlertTriangle,
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
import {
  DEFAULT_OFFICE_RADIUS_METERS,
  evaluateAttendanceLocation,
  normalizeLocationStatus,
  normalizeDeviceType,
  formatDistanceLabel,
  isSecureGeolocationContext,
} from './locationEngine';
import type {
  Employee,
  ShowupAttendanceRecord,
  AttendanceGeoLocation,
  NormalizedLocationStatus,
  AttendanceDeviceType,
  AttendanceDeviceInfo,
  OfficeLocationConfig,
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
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedLocationStatus, setSelectedLocationStatus] = useState<
    'ALL' | NormalizedLocationStatus
  >('ALL');
  const [selectedDeviceType, setSelectedDeviceType] = useState<
    'ALL' | AttendanceDeviceType
  >('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedMapTarget, setSelectedMapTarget] =
    useState<SelectedMapTarget | null>(null);
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);
  const [locationAuditLogs, setLocationAuditLogs] = useState<AuditLogEntry[]>([]);

  // Official Office Location Configuration State (stored in app_settings/office_location)
  const [officeLocation, setOfficeLocation] =
    useState<OfficeLocationConfig | null>(null);
  const [officeNameInput, setOfficeNameInput] = useState('Grattitude Synergy HQ');
  const [officeLatInput, setOfficeLatInput] = useState<string>('');
  const [officeLngInput, setOfficeLngInput] = useState<string>('');
  const [officeRadiusInput, setOfficeRadiusInput] = useState<number>(
    DEFAULT_OFFICE_RADIUS_METERS
  );
  const [officeAccuracy, setOfficeAccuracy] = useState<number | undefined>(
    undefined
  );
  const [isDetectingOfficeGps, setIsDetectingOfficeGps] = useState(false);
  const [isSavingOffice, setIsSavingOffice] = useState(false);
  const [officeGpsError, setOfficeGpsError] = useState<string | null>(null);

  const loggedDashboardMount = useRef(false);

  // Subscribe to saved official office location from central database
  useEffect(() => {
    if (!isStrictAdmin) return;
    const unsubOffice = FirestoreEngine.subscribeCollection<any>(
      'app_settings',
      (items) => {
        const found: OfficeLocationConfig | undefined = items.find(
          (i) => i.id === 'office_location'
        );
        if (found) {
          setOfficeLocation(found);
          setOfficeNameInput(found.officeName || 'Grattitude Synergy HQ');
          setOfficeLatInput(String(found.latitude));
          setOfficeLngInput(String(found.longitude));
          setOfficeRadiusInput(
            found.radiusMeters || DEFAULT_OFFICE_RADIUS_METERS
          );
          setOfficeAccuracy(found.accuracy);
        }
      }
    );
    return () => unsubOffice();
  }, [isStrictAdmin]);

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
        details: `Admin ${currentEmployee.name} (${currentEmployee.ecode}) opened the Office Location & Attendance Location Dashboard.`,
      });
    }

    const unsub = AuditService.subscribeLogs((logs) => {
      const gpsLogs = logs.filter(
        (l) =>
          l.action.startsWith('ADMIN_GPS_') ||
          l.action.startsWith('ADMIN_OFFICE_LOCATION') ||
          l.targetType === 'AttendanceGpsLocation' ||
          l.targetType === 'AttendanceGpsDashboard' ||
          l.targetType === 'OfficeLocationConfig'
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

  const handleUseCurrentLocationForOffice = () => {
    setOfficeGpsError(null);
    if (!isSecureGeolocationContext()) {
      const msg =
        'Browser geolocation requires HTTPS (or localhost). Please open the portal over HTTPS to capture your current office coordinates.';
      setOfficeGpsError(msg);
      showToast('error', 'HTTPS Required for GPS', msg);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      const msg = 'Geolocation is not supported by this browser.';
      setOfficeGpsError(msg);
      showToast('error', 'Geolocation Unsupported', msg);
      return;
    }

    setIsDetectingOfficeGps(true);
    const onSuccess = (pos: GeolocationPosition) => {
      setOfficeLatInput(pos.coords.latitude.toFixed(6));
      setOfficeLngInput(pos.coords.longitude.toFixed(6));
      setOfficeAccuracy(Math.round(pos.coords.accuracy || 0));
      setIsDetectingOfficeGps(false);
      showToast(
        'success',
        'Current Location Captured',
        `Captured ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)} (±${Math.round(pos.coords.accuracy || 0)}m). Click "Save Office Location" to apply.`
      );
    };
    const onFinalError = (err: GeolocationPositionError) => {
      setIsDetectingOfficeGps(false);
      const msg =
        err.code === err.PERMISSION_DENIED
          ? 'Location permission denied. Please allow Location access in your browser address bar and try again.'
          : 'Unable to detect current GPS location. Ensure device Location Services are turned ON.';
      setOfficeGpsError(msg);
      showToast('error', 'Could Not Detect Location', msg);
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          onFinalError(err);
          return;
        }
        navigator.geolocation.getCurrentPosition(onSuccess, onFinalError, {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 30000,
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleSaveOfficeLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(officeLatInput);
    const lng = Number(officeLngInput);
    const radius = Number(officeRadiusInput);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      showToast(
        'error',
        'Invalid Coordinates',
        'Please capture your current location or enter valid latitude (-90 to 90) and longitude (-180 to 180).'
      );
      return;
    }
    if (!Number.isFinite(radius) || radius < 10 || radius > 50000) {
      showToast(
        'error',
        'Invalid Office Radius',
        'Please enter a GPS radius between 10 meters and 50,000 meters.'
      );
      return;
    }

    setIsSavingOffice(true);
    try {
      const cfg: OfficeLocationConfig = {
        id: 'office_location',
        officeName: officeNameInput.trim() || 'Grattitude Synergy HQ',
        latitude: lat,
        longitude: lng,
        radiusMeters: Math.round(radius),
        accuracy: officeAccuracy,
        updatedBy: currentEmployee.name,
        updatedAt: new Date().toISOString(),
      };
      await FirestoreEngine.setDocument('app_settings', 'office_location', cfg);
      setOfficeLocation(cfg);
      await AuditService.log({
        action: 'ADMIN_OFFICE_LOCATION_UPDATED',
        actor: currentEmployee,
        targetId: 'office_location',
        targetType: 'OfficeLocationConfig',
        details: `Admin ${currentEmployee.name} saved official office location "${cfg.officeName}" at [${lat.toFixed(6)}, ${lng.toFixed(6)}] with ${cfg.radiusMeters}m GPS radius.`,
      });
      showToast(
        'success',
        'Official Office Location Saved',
        `${cfg.officeName} configured with ${cfg.radiusMeters}m GPS radius.`
      );
    } finally {
      setIsSavingOffice(false);
    }
  };

  /**
   * Independently resolves Check-In location status, distance, timestamp, and device info.
   */
  const resolveCheckInSummary = (
    rec: ShowupAttendanceRecord,
    checkIn?: AttendanceGeoLocation
  ): {
    timestamp?: string;
    status: NormalizedLocationStatus;
    distanceMeters?: number;
    unavailableReason?: string;
    device: AttendanceDeviceInfo;
  } => {
    const firstInPunch = rec.punches?.find((p) => p.type === 'IN');
    const timestamp =
      rec.checkInTimestamp || checkIn?.timestamp || firstInPunch?.timestamp;

    const rawDevice =
      rec.checkInDevice || firstInPunch?.deviceInfo || checkIn?.deviceInfo;
    const device: AttendanceDeviceInfo = rawDevice
      ? {
          ...rawDevice,
          deviceType: normalizeDeviceType(rawDevice.deviceType),
        }
      : {
          deviceType: normalizeDeviceType(checkIn?.deviceType),
          os: 'Unknown',
          browser: 'Unknown',
          userAgent: 'Unknown',
        };

    if (checkIn) {
      const liveEval = officeLocation
        ? evaluateAttendanceLocation(checkIn, officeLocation)
        : null;
      return {
        timestamp,
        status: normalizeLocationStatus(
          rec.checkInLocationStatus ||
            rec.locationStatus ||
            checkIn.locationStatus ||
            liveEval?.locationStatus ||
            'Outside Office'
        ),
        distanceMeters:
          rec.checkInDistanceFromOfficeMeters ??
          rec.distanceFromOfficeMeters ??
          checkIn.distanceFromOfficeMeters ??
          liveEval?.distanceFromOfficeMeters,
        device,
      };
    }

    return {
      timestamp,
      status: normalizeLocationStatus(
        rec.checkInLocationStatus || rec.locationStatus || 'Location Unavailable'
      ),
      distanceMeters: undefined,
      unavailableReason:
        rec.checkInLocationUnavailableReason || rec.locationUnavailableReason,
      device,
    };
  };

  /**
   * Independently resolves Check-Out location status, distance, timestamp, and device info.
   * Never copies Check-In location or device onto Check-Out.
   */
  const resolveCheckOutSummary = (
    rec: ShowupAttendanceRecord,
    checkOut?: AttendanceGeoLocation
  ): {
    hasCheckedOut: boolean;
    timestamp?: string;
    status?: NormalizedLocationStatus;
    distanceMeters?: number;
    unavailableReason?: string;
    device?: AttendanceDeviceInfo;
  } => {
    const lastOutPunch = [...(rec.punches || [])]
      .reverse()
      .find((p) => p.type === 'OUT');
    const timestamp =
      rec.checkOutTimestamp || checkOut?.timestamp || lastOutPunch?.timestamp;
    const hasCheckedOut = Boolean(timestamp || checkOut || lastOutPunch);

    if (!hasCheckedOut) {
      return { hasCheckedOut: false };
    }

    const rawDevice =
      rec.checkOutDevice || lastOutPunch?.deviceInfo || checkOut?.deviceInfo;
    const device: AttendanceDeviceInfo = rawDevice
      ? {
          ...rawDevice,
          deviceType: normalizeDeviceType(rawDevice.deviceType),
        }
      : {
          deviceType: normalizeDeviceType(checkOut?.deviceType),
          os: 'Unknown',
          browser: 'Unknown',
          userAgent: 'Unknown',
        };

    if (checkOut) {
      const liveEval = officeLocation
        ? evaluateAttendanceLocation(checkOut, officeLocation)
        : null;
      return {
        hasCheckedOut: true,
        timestamp,
        status: normalizeLocationStatus(
          rec.checkOutLocationStatus ||
            checkOut.locationStatus ||
            liveEval?.locationStatus ||
            'Outside Office'
        ),
        distanceMeters:
          rec.checkOutDistanceFromOfficeMeters ??
          checkOut.distanceFromOfficeMeters ??
          liveEval?.distanceFromOfficeMeters,
        device,
      };
    }

    return {
      hasCheckedOut: true,
      timestamp,
      status: normalizeLocationStatus(
        rec.checkOutLocationStatus || 'Location Unavailable'
      ),
      distanceMeters: undefined,
      unavailableReason: rec.checkOutLocationUnavailableReason,
      device,
    };
  };

  const renderDeviceIcon = (type: AttendanceDeviceType) => {
    if (type === 'Mobile Phone') {
      return <Smartphone className="w-3.5 h-3.5 text-sky-600 shrink-0" />;
    }
    if (type === 'Tablet') {
      return <Tablet className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
    }
    return <Laptop className="w-3.5 h-3.5 text-neutral-600 shrink-0" />;
  };

  const departments = Array.from(
    new Set(employees.map((e) => e.department).filter(Boolean))
  ).sort();

  // Sort records newest date/timestamp first
  const sortedRecords = [...attendanceRecords].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const filteredRecords = sortedRecords.filter((rec) => {
    const meta = getEmployeeMeta(rec.employeeId, rec.employeeName);
    const { checkIn, checkOut } = resolveRecordLocations(rec);
    const inMeta = resolveCheckInSummary(rec, checkIn);
    const outMeta = resolveCheckOutSummary(rec, checkOut);

    if (selectedEmpId !== 'ALL') {
      const selNorm = PermissionsService.normalizeEmpId(selectedEmpId);
      const recNorm = PermissionsService.normalizeEmpId(rec.employeeId);
      if (selNorm !== recNorm) return false;
    }
    if (selectedDept !== 'ALL' && meta.department !== selectedDept) {
      return false;
    }
    if (selectedLocationStatus !== 'ALL') {
      const matchesIn = inMeta.status === selectedLocationStatus;
      const matchesOut =
        outMeta.hasCheckedOut && outMeta.status === selectedLocationStatus;
      if (!matchesIn && !matchesOut) return false;
    }
    if (selectedDeviceType !== 'ALL') {
      const matchesInDev = inMeta.device.deviceType === selectedDeviceType;
      const matchesOutDev =
        outMeta.hasCheckedOut &&
        outMeta.device?.deviceType === selectedDeviceType;
      if (!matchesInDev && !matchesOutDev) return false;
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
        rec.date.includes(q) ||
        inMeta.status.toLowerCase().includes(q) ||
        inMeta.device.deviceType.toLowerCase().includes(q) ||
        (outMeta.status || '').toLowerCase().includes(q) ||
        (outMeta.device?.deviceType || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRecords = attendanceRecords.filter((r) => r.date === todayStr);
  const todayOfficeCount = todayRecords.filter((r) => {
    const { checkIn } = resolveRecordLocations(r);
    return resolveCheckInSummary(r, checkIn).status === 'In Office';
  }).length;
  const todayOutsideCount = todayRecords.filter((r) => {
    const { checkIn } = resolveRecordLocations(r);
    return resolveCheckInSummary(r, checkIn).status === 'Outside Office';
  }).length;
  const todayUnavailableCount = todayRecords.filter((r) => {
    const { checkIn } = resolveRecordLocations(r);
    return resolveCheckInSummary(r, checkIn).status === 'Location Unavailable';
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
      {/* Official Office Location Configuration Card (Admin Only) */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-sky-600" />
            <span>Official Office Location &amp; Geofence Radius (Admin Control)</span>
          </div>
        }
        subtitle="Configure the company's official GPS office location and geofence radius. Employee check-ins within this radius are marked 'Office'; outside are marked 'Outside Office'."
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isDetectingOfficeGps}
            icon={
              isDetectingOfficeGps ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Crosshair className="w-3.5 h-3.5" />
              )
            }
            onClick={handleUseCurrentLocationForOffice}
          >
            {isDetectingOfficeGps
              ? 'Detecting Current Location...'
              : 'Use My Current Location'}
          </Button>
        }
      >
        {officeGpsError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{officeGpsError}</span>
          </div>
        )}

        {officeLocation ? (
          <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Saved Office Location: {officeLocation.officeName}</span>
              </div>
              <div className="font-mono text-emerald-800">
                Lat: <strong>{officeLocation.latitude.toFixed(6)}</strong> • Lng:{' '}
                <strong>{officeLocation.longitude.toFixed(6)}</strong> • Radius:{' '}
                <strong>{officeLocation.radiusMeters} m</strong>
                {officeLocation.accuracy ? ` • GPS Accuracy: ±${officeLocation.accuracy}m` : ''}
              </div>
              <div className="text-[11px] text-emerald-700">
                Last updated by {officeLocation.updatedBy} on{' '}
                {new Date(officeLocation.updatedAt).toLocaleString()}
              </div>
            </div>
            <a
              href={`https://www.google.com/maps?q=${officeLocation.latitude},${officeLocation.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View Office on Google Maps</span>
            </a>
          </div>
        ) : (
          <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Office Location Not Configured Yet:</strong> Click{' '}
              <strong>"Use My Current Location"</strong> above (or enter coordinates below) and save to enable automatic <strong>Office</strong> vs <strong>Outside Office</strong> detection on employee check-ins.
            </div>
          </div>
        )}

        <form onSubmit={handleSaveOfficeLocation} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Office Location Name *
              </label>
              <input
                type="text"
                required
                value={officeNameInput}
                onChange={(e) => setOfficeNameInput(e.target.value)}
                placeholder="e.g. Grattitude Synergy HQ"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Office Latitude *
              </label>
              <input
                type="number"
                step="any"
                required
                value={officeLatInput}
                onChange={(e) => setOfficeLatInput(e.target.value)}
                placeholder="Click 'Use My Current Location'"
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Office Longitude *
              </label>
              <input
                type="number"
                step="any"
                required
                value={officeLngInput}
                onChange={(e) => setOfficeLngInput(e.target.value)}
                placeholder="Click 'Use My Current Location'"
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                GPS Office Radius (Meters) *
              </label>
              <input
                type="number"
                min={10}
                max={50000}
                required
                value={officeRadiusInput}
                onChange={(e) => setOfficeRadiusInput(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-600">
              <span className="font-bold">Quick Radius Presets:</span>
              {[50, 100, 150, 250, 500].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setOfficeRadiusInput(r)}
                  className={`px-2.5 py-1 rounded-md border font-mono font-bold cursor-pointer ${
                    officeRadiusInput === r
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                  }`}
                >
                  {r}m
                </button>
              ))}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSavingOffice}
              icon={<Save className="w-3.5 h-3.5" />}
            >
              {isSavingOffice ? 'Saving...' : 'Save Office Location'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <div className="text-[11px] font-bold uppercase text-neutral-500">
            Checked In from Office (Today)
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">
            {todayOfficeCount}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Within office geofence ({todayStr})
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <div className="text-[11px] font-bold uppercase text-neutral-500">
            Outside Office (Today)
          </div>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">
            {todayOutsideCount}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Checked in beyond office radius
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <div className="text-[11px] font-bold uppercase text-neutral-500">
            Location Unavailable (Today)
          </div>
          <div className="text-2xl font-extrabold text-rose-700 mt-1">
            {todayUnavailableCount}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            GPS permission denied or unavailable
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl">
          <div className="text-[11px] font-bold uppercase text-neutral-500">
            Location Privacy &amp; Radius
          </div>
          <div className="text-sm font-extrabold text-sky-700 mt-1.5 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              {officeLocation ? `${officeLocation.radiusMeters}m Radius Active` : 'Radius Not Set'}
            </span>
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            Detailed GPS visible to Admin only
          </div>
        </div>
      </div>

      {/* Main GPS Attendance & Location History Card */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-sky-600" />
            <span>
              Employee Attendance Location &amp; Device Audit Table
            </span>
          </div>
        }
        subtitle="Strict Admin-Only View: Independent Check-In and Check-Out location status (In Office, Outside Office, Location Unavailable), device type, OS, browser, and GPS verification."
      >
        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or E-Code..."
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
                  {emp.name} ({emp.ecode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedLocationStatus}
              onChange={(e) => setSelectedLocationStatus(e.target.value as any)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              <option value="ALL">All Location Statuses</option>
              <option value="In Office">In Office</option>
              <option value="Outside Office">Outside Office</option>
              <option value="Location Unavailable">Location Unavailable</option>
            </select>
          </div>

          <div>
            <select
              value={selectedDeviceType}
              onChange={(e) => setSelectedDeviceType(e.target.value as any)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              <option value="ALL">All Device Types</option>
              <option value="Mobile Phone">Mobile Phone</option>
              <option value="Tablet">Tablet</option>
              <option value="Laptop/Desktop">Laptop/Desktop</option>
              <option value="Unknown">Unknown</option>
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
                All
              </Button>
            )}
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <EmptyState
            title="No Attendance Location Records Found"
            description="When employees check in or out via Show Up, their independent Check-In and Check-Out location statuses (In Office, Outside Office, or Location Unavailable) and devices appear here."
          />
        ) : (
          <Table
            headers={[
              'Employee',
              'Check-In Time',
              'Check-In Location',
              'Check-In Device',
              'Check-Out Time',
              'Check-Out Location',
              'Check-Out Device',
            ]}
          >
            {filteredRecords.map((rec) => {
              const meta = getEmployeeMeta(rec.employeeId, rec.employeeName);
              const { checkIn, checkOut } = resolveRecordLocations(rec);
              const inMeta = resolveCheckInSummary(rec, checkIn);
              const outMeta = resolveCheckOutSummary(rec, checkOut);

              return (
                <tr key={rec.id} className="hover:bg-neutral-50/80 align-top">
                  {/* 1. Employee */}
                  <td className="px-4 py-3">
                    <div className="text-xs font-bold text-neutral-900">
                      {meta.name}
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      {meta.ecode} • {meta.department}
                    </div>
                    {meta.empObj && (
                      <div className="mt-1.5">
                        <Button
                          variant="outline"
                          size="xs"
                          icon={<History className="w-3 h-3" />}
                          onClick={() =>
                            meta.empObj && handleOpenEmployeeHistory(meta.empObj)
                          }
                        >
                          Details &amp; History
                        </Button>
                      </div>
                    )}
                  </td>

                  {/* 2. Check-In Time */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-xs font-mono font-bold text-neutral-900">
                      {inMeta.timestamp
                        ? new Date(inMeta.timestamp).toLocaleTimeString()
                        : '—'}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500 mt-0.5">
                      {rec.date}
                    </div>
                    <div className="mt-1">
                      <Badge
                        variant={
                          rec.status === 'Present'
                            ? 'success'
                            : rec.status === 'Late' || rec.status === 'Half-Day'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {rec.status === 'Absent' ? 'Under-reported' : rec.status}
                      </Badge>
                    </div>
                  </td>

                  {/* 3. Check-In Location */}
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        inMeta.status === 'In Office'
                          ? 'success'
                          : inMeta.status === 'Outside Office'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {inMeta.status}
                    </Badge>
                    {inMeta.distanceMeters !== undefined && (
                      <div className="text-[11px] font-mono text-neutral-500 mt-1">
                        {formatDistanceLabel(inMeta.distanceMeters)}
                      </div>
                    )}
                    {checkIn ? (
                      <div className="mt-1 space-y-1">
                        <div className="text-[10px] font-mono text-neutral-500">
                          ±{checkIn.accuracy}m •{' '}
                          {checkIn.latitude.toFixed(5)},{' '}
                          {checkIn.longitude.toFixed(5)}
                        </div>
                        <Button
                          variant="outline"
                          size="xs"
                          icon={<Eye className="w-3 h-3" />}
                          onClick={() =>
                            handleInspectOnGoogleMaps(rec, checkIn, 'Check-In')
                          }
                        >
                          View Map
                        </Button>
                      </div>
                    ) : (
                      inMeta.unavailableReason && (
                        <div className="text-[10px] text-rose-600 italic mt-1 max-w-[180px]">
                          {inMeta.unavailableReason}
                        </div>
                      )
                    )}
                  </td>

                  {/* 4. Check-In Device */}
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-900">
                      {renderDeviceIcon(inMeta.device.deviceType)}
                      <span>{inMeta.device.deviceType}</span>
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {inMeta.device.os} • {inMeta.device.browser}
                    </div>
                  </td>

                  {/* 5. Check-Out Time */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {outMeta.hasCheckedOut ? (
                      <>
                        <div className="text-xs font-mono font-bold text-neutral-900">
                          {outMeta.timestamp
                            ? new Date(outMeta.timestamp).toLocaleTimeString()
                            : '—'}
                        </div>
                        <div className="text-[11px] font-mono text-neutral-500 mt-0.5">
                          Total: {rec.totalHours || 0}h
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400 italic">
                        Active Shift
                      </span>
                    )}
                  </td>

                  {/* 6. Check-Out Location */}
                  <td className="px-4 py-3">
                    {outMeta.hasCheckedOut && outMeta.status ? (
                      <>
                        <Badge
                          variant={
                            outMeta.status === 'In Office'
                              ? 'success'
                              : outMeta.status === 'Outside Office'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {outMeta.status}
                        </Badge>
                        {outMeta.distanceMeters !== undefined && (
                          <div className="text-[11px] font-mono text-neutral-500 mt-1">
                            {formatDistanceLabel(outMeta.distanceMeters)}
                          </div>
                        )}
                        {checkOut ? (
                          <div className="mt-1 space-y-1">
                            <div className="text-[10px] font-mono text-neutral-500">
                              ±{checkOut.accuracy}m •{' '}
                              {checkOut.latitude.toFixed(5)},{' '}
                              {checkOut.longitude.toFixed(5)}
                            </div>
                            <Button
                              variant="outline"
                              size="xs"
                              icon={<Eye className="w-3 h-3" />}
                              onClick={() =>
                                handleInspectOnGoogleMaps(
                                  rec,
                                  checkOut,
                                  'Check-Out'
                                )
                              }
                            >
                              View Map
                            </Button>
                          </div>
                        ) : (
                          outMeta.unavailableReason && (
                            <div className="text-[10px] text-rose-600 italic mt-1 max-w-[180px]">
                              {outMeta.unavailableReason}
                            </div>
                          )
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>

                  {/* 7. Check-Out Device */}
                  <td className="px-4 py-3">
                    {outMeta.hasCheckedOut && outMeta.device ? (
                      <>
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-900">
                          {renderDeviceIcon(outMeta.device.deviceType)}
                          <span>{outMeta.device.deviceType}</span>
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {outMeta.device.os} • {outMeta.device.browser}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
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

      {/* MODAL 2: EMPLOYEE FULL ATTENDANCE LOCATION & DEVICE HISTORY */}
      <Modal
        isOpen={Boolean(historyEmployee)}
        onClose={() => setHistoryEmployee(null)}
        size="xl"
        title={
          historyEmployee
            ? `Attendance Location & Device History — ${historyEmployee.name} (${historyEmployee.ecode})`
            : 'Employee Location & Device History'
        }
        subtitle={
          historyEmployee
            ? `${historyEmployee.designation} • ${historyEmployee.department} • Independent Check-In & Check-Out GPS, Device, OS, Browser & User-Agent audit trail`
            : ''
        }
      >
        {historyEmployee && (
          <div className="space-y-4">
            {employeeHistoryRecords.length === 0 ? (
              <EmptyState
                title="No Attendance Records for This Employee"
                description="Once this employee checks in or out, their historical Check-In & Check-Out location and device details will be listed here."
              />
            ) : (
              <Table
                headers={[
                  'Date',
                  'Action',
                  'Time',
                  'Location Status & GPS',
                  'Device / OS / Browser',
                  'Map',
                ]}
              >
                {employeeHistoryRecords.flatMap((rec) => {
                  const { checkIn, checkOut } = resolveRecordLocations(rec);
                  const inMeta = resolveCheckInSummary(rec, checkIn);
                  const outMeta = resolveCheckOutSummary(rec, checkOut);

                  const rows: Array<{
                    key: string;
                    action: 'Check-In' | 'Check-Out';
                    timestamp?: string;
                    status: NormalizedLocationStatus;
                    distanceMeters?: number;
                    loc?: AttendanceGeoLocation;
                    device: AttendanceDeviceInfo;
                  }> = [
                    {
                      key: `${rec.id}_in`,
                      action: 'Check-In',
                      timestamp: inMeta.timestamp,
                      status: inMeta.status,
                      distanceMeters: inMeta.distanceMeters,
                      loc: checkIn,
                      device: inMeta.device,
                    },
                  ];

                  if (outMeta.hasCheckedOut && outMeta.status && outMeta.device) {
                    rows.push({
                      key: `${rec.id}_out`,
                      action: 'Check-Out',
                      timestamp: outMeta.timestamp,
                      status: outMeta.status,
                      distanceMeters: outMeta.distanceMeters,
                      loc: checkOut,
                      device: outMeta.device,
                    });
                  }

                  return rows.map((row) => (
                    <tr key={row.key} className="align-top">
                      <td className="px-3 py-2 text-xs font-mono font-bold whitespace-nowrap">
                        {rec.date}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={row.action === 'Check-In' ? 'success' : 'info'}
                        >
                          {row.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">
                        {row.timestamp
                          ? new Date(row.timestamp).toLocaleTimeString()
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            row.status === 'In Office'
                              ? 'success'
                              : row.status === 'Outside Office'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {row.status}
                        </Badge>
                        {row.loc && (
                          <div className="text-[10px] font-mono text-neutral-600 mt-1">
                            {row.loc.latitude.toFixed(6)},{' '}
                            {row.loc.longitude.toFixed(6)} (±{row.loc.accuracy}m)
                            {row.distanceMeters !== undefined
                              ? ` • ${formatDistanceLabel(row.distanceMeters)}`
                              : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="inline-flex items-center gap-1 text-xs font-bold text-neutral-900">
                          {renderDeviceIcon(row.device.deviceType)}
                          <span>{row.device.deviceType}</span>
                        </div>
                        <div className="text-[11px] text-neutral-600">
                          {row.device.os} • {row.device.browser}
                        </div>
                        {row.device.userAgent &&
                          row.device.userAgent !== 'Unknown' && (
                            <div
                              className="text-[10px] font-mono text-neutral-400 truncate max-w-[220px]"
                              title={row.device.userAgent}
                            >
                              {row.device.userAgent}
                            </div>
                          )}
                      </td>
                      <td className="px-3 py-2">
                        {row.loc ? (
                          <Button
                            variant="outline"
                            size="xs"
                            icon={<MapPin className="w-3 h-3" />}
                            onClick={() => {
                              setHistoryEmployee(null);
                              void handleInspectOnGoogleMaps(
                                rec,
                                row.loc!,
                                row.action
                              );
                            }}
                          >
                            Map
                          </Button>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
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
