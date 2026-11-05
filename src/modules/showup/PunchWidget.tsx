import React, { useState, useEffect } from 'react';
import {
  Clock,
  LogIn,
  LogOut,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Card, Button, Badge, useToast } from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { PolicyEngine } from './policyEngine';
import type {
  Employee,
  ShowupAttendanceRecord,
  ShowupPolicyConfig,
  ShowupLeaveBalance,
  AttendanceGeoLocation,
} from '../../core/types';

const GEO_PERMISSION_STORAGE_KEY = 'gs_hrms_geo_permission_state_v1';

function detectDeviceType(): 'Desktop / Laptop' | 'Mobile / Tablet' {
  if (typeof navigator === 'undefined') return 'Desktop / Laptop';
  const ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) {
    return 'Mobile / Tablet';
  }
  return 'Desktop / Laptop';
}

export const PunchWidget: React.FC<{
  currentEmployee: Employee;
  todayRecord: ShowupAttendanceRecord | null;
  policy: ShowupPolicyConfig;
  leaveBalance: ShowupLeaveBalance | null;
}> = ({ currentEmployee, todayRecord, policy, leaveBalance }) => {
  const { showToast } = useToast();
  const [breakMinutes, setBreakMinutes] = useState<number>(
    todayRecord?.breakMinutes || 0
  );
  const [now, setNow] = useState<Date>(new Date());
  const [isCapturingGps, setIsCapturingGps] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<
    'granted' | 'prompt' | 'denied'
  >(() => {
    try {
      const cached = localStorage.getItem(GEO_PERMISSION_STORAGE_KEY);
      if (cached === 'granted' || cached === 'denied') return cached;
    } catch {
      // Ignore storage error
    }
    return 'prompt';
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Silently inspect browser Geolocation permission status without triggering a prompt or background tracking
  useEffect(() => {
    let permStatus: PermissionStatus | null = null;
    const handlePermChange = () => {
      if (!permStatus) return;
      const nextState = permStatus.state as 'granted' | 'prompt' | 'denied';
      setPermissionState(nextState);
      try {
        localStorage.setItem(GEO_PERMISSION_STORAGE_KEY, nextState);
      } catch {
        // Ignore
      }
      if (nextState === 'granted') {
        setGpsError(null);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          permStatus = status;
          handlePermChange();
          status.onchange = handlePermChange;
        })
        .catch(() => {
          // Permissions API not supported on this browser; standard getCurrentPosition handles it on click
        });
    }

    return () => {
      if (permStatus) {
        permStatus.onchange = null;
      }
    };
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const punches = todayRecord?.punches || [];
  const lastPunch = punches.length > 0 ? punches[punches.length - 1] : null;
  const isClockedIn = lastPunch?.type === 'IN';

  // Calculate live elapsed hours if currently clocked in
  const calculateElapsedHours = (): number => {
    let totalMs = 0;
    for (let i = 0; i < punches.length; i += 2) {
      const inPunch = punches[i];
      const outPunch = punches[i + 1];
      if (inPunch && outPunch) {
        totalMs +=
          new Date(outPunch.timestamp).getTime() -
          new Date(inPunch.timestamp).getTime();
      } else if (inPunch && !outPunch) {
        totalMs += now.getTime() - new Date(inPunch.timestamp).getTime();
      }
    }
    const netMs = Math.max(0, totalMs - breakMinutes * 60 * 1000);
    return Math.round((netMs / (1000 * 60 * 60)) * 100) / 100;
  };

  const liveHours = calculateElapsedHours();

  /**
   * Captures current device location ONE TIME when Check-In or Check-Out is clicked.
   * Supports laptops, desktops (Wi-Fi/IP triangulation fallback), and mobile GPS hardware.
   * Rejects if permission is denied or location services are disabled.
   */
  const captureDeviceLocation = (
    punchType: 'IN' | 'OUT',
    isoTimestamp: string
  ): Promise<AttendanceGeoLocation> => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(
          new Error(
            'Geolocation is not supported by your browser. Please use a modern browser (Chrome, Edge, Safari, or Firefox) with Location Services enabled.'
          )
        );
        return;
      }

      const handleSuccess = (pos: GeolocationPosition) => {
        setPermissionState('granted');
        try {
          localStorage.setItem(GEO_PERMISSION_STORAGE_KEY, 'granted');
        } catch {
          // Ignore
        }
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
          date: todayStr,
          timestamp: isoTimestamp,
          punchType,
          deviceType: detectDeviceType(),
        });
      };

      const handleFinalError = (err: GeolocationPositionError) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionState('denied');
          try {
            localStorage.setItem(GEO_PERMISSION_STORAGE_KEY, 'denied');
          } catch {
            // Ignore
          }
          reject(
            new Error(
              'Location access is blocked. Attendance cannot be recorded without automatic GPS verification. Please click the lock/tune icon in your browser address bar → set "Location" to "Allow", and ensure OS Location Services are turned ON.'
            )
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          reject(
            new Error(
              'Unable to detect device location. Please ensure your device Wi-Fi / GPS Location Services are enabled in your system settings and try again.'
            )
          );
        } else if (err.code === err.TIMEOUT) {
          reject(
            new Error(
              'Location capture timed out. Please verify your network/GPS signal and Location Services, then click Check In / Check Out again.'
            )
          );
        } else {
          reject(
            new Error(
              'Could not verify device location. Please enable browser and system Location Services to submit attendance.'
            )
          );
        }
      };

      // Step 1: Request high-accuracy GPS position (ideal for mobile & GPS-equipped laptops)
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        (err) => {
          // If permission was explicitly denied, fail immediately without re-prompting
          if (err.code === err.PERMISSION_DENIED) {
            handleFinalError(err);
            return;
          }
          // Step 2: Fallback for laptops/desktops where hardware GPS times out or is unavailable
          navigator.geolocation.getCurrentPosition(
            handleSuccess,
            handleFinalError,
            {
              enableHighAccuracy: false,
              timeout: 12000,
              maximumAge: 30000,
            }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0,
        }
      );
    });
  };

  const handleClockIn = async () => {
    setGpsError(null);
    setIsCapturingGps(true);

    const serverTimestamp = new Date().toISOString();
    let capturedGps: AttendanceGeoLocation;

    try {
      capturedGps = await captureDeviceLocation('IN', serverTimestamp);
    } catch (err: any) {
      const msg =
        err?.message ||
        'Location permission denied or unavailable. Attendance Check-In was not submitted.';
      setGpsError(msg);
      setIsCapturingGps(false);
      showToast('error', 'Check-In Blocked — Location Required', msg);
      return;
    }

    try {
      const isFirstPunch = punches.length === 0;
      const isLate = isFirstPunch
        ? PolicyEngine.isPunchInLate(serverTimestamp, policy)
        : Boolean(todayRecord?.isLate);

      const nextPunches = [
        ...punches,
        {
          type: 'IN' as const,
          timestamp: serverTimestamp,
          locationNote: 'Office HQ',
          gpsLocation: capturedGps,
        },
      ];

      const recordId = `${currentEmployee.id}_${todayStr}`;
      const newRecord: ShowupAttendanceRecord = {
        id: recordId,
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
        employeeEcode: currentEmployee.ecode,
        department: currentEmployee.department,
        date: todayStr,
        status: isLate ? 'Late' : 'Present',
        punches: nextPunches,
        checkInLocation: todayRecord?.checkInLocation || capturedGps,
        checkOutLocation: todayRecord?.checkOutLocation,
        breakMinutes,
        totalHours: todayRecord?.totalHours || 0,
        isLate,
        isHalfDay: false,
      };

      await FirestoreEngine.setDocument('showup_attendance', recordId, newRecord);

      // If first punch of the day is late, increment lateMarksCount & apply 3-late-marks = 0.5 day deduction rule
      if (isFirstPunch && isLate) {
        const currentLateMarks = (leaveBalance?.lateMarksCount || 0) + 1;
        const totalDeduction = PolicyEngine.calculateLateLeaveDeduction(
          currentLateMarks,
          policy
        );
        await FirestoreEngine.setDocument(
          'showup_leave_balances',
          currentEmployee.id,
          {
            id: currentEmployee.id,
            employeeId: currentEmployee.id,
            balances: leaveBalance?.balances || {
              CL: policy.clQuotaPerYear ?? 0,
              SL: policy.slQuotaPerYear ?? 12,
              EL: policy.elQuotaPerYear ?? 12,
              Optional: policy.optionalHolidaysPerYear ?? 3,
              Maternity: policy.maternityQuotaDays ?? 180,
              Paternity: policy.paternityQuotaDays ?? 15,
              'Comp Off': policy.compOffQuotaDays ?? 2,
              LWP: policy.lwpQuotaDays ?? 365,
            },
            lateMarksCount: currentLateMarks,
            lateLeaveDeducted: totalDeduction,
            updatedAt: new Date().toISOString(),
          }
        );
        showToast(
          'warning',
          'Checked In (Late Mark Recorded)',
          `Check-in after ${policy.graceCutoff} AM marked as Late (${currentLateMarks} late mark(s) total).`
        );
      } else {
        showToast(
          'success',
          'Checked In Successfully',
          `Attendance recorded at ${new Date(serverTimestamp).toLocaleTimeString()}.`
        );
      }
    } finally {
      setIsCapturingGps(false);
    }
  };

  const handleClockOut = async () => {
    if (!todayRecord) return;
    setGpsError(null);
    setIsCapturingGps(true);

    const serverTimestamp = new Date().toISOString();
    let capturedGps: AttendanceGeoLocation;

    try {
      capturedGps = await captureDeviceLocation('OUT', serverTimestamp);
    } catch (err: any) {
      const msg =
        err?.message ||
        'Location permission denied or unavailable. Attendance Check-Out was not submitted.';
      setGpsError(msg);
      setIsCapturingGps(false);
      showToast('error', 'Check-Out Blocked — Location Required', msg);
      return;
    }

    try {
      const nextPunches = [
        ...punches,
        {
          type: 'OUT' as const,
          timestamp: serverTimestamp,
          locationNote: 'Office HQ',
          gpsLocation: capturedGps,
        },
      ];

      // Compute total work hours across all IN/OUT pairs
      let totalMs = 0;
      for (let i = 0; i < nextPunches.length; i += 2) {
        const pIn = nextPunches[i];
        const pOut = nextPunches[i + 1];
        if (pIn && pOut) {
          totalMs +=
            new Date(pOut.timestamp).getTime() -
            new Date(pIn.timestamp).getTime();
        }
      }
      const netMs = Math.max(0, totalMs - breakMinutes * 60 * 1000);
      const computedHours = Math.max(
        0.1,
        Math.round((netMs / (1000 * 60 * 60)) * 100) / 100
      );

      const evaluation = PolicyEngine.evaluateAttendanceStatus(
        computedHours,
        todayRecord.isLate,
        policy
      );

      const updated: ShowupAttendanceRecord = {
        ...todayRecord,
        employeeId: currentEmployee.id,
        employeeName: currentEmployee.name,
        employeeEcode: currentEmployee.ecode,
        department: currentEmployee.department,
        punches: nextPunches,
        checkOutLocation: capturedGps,
        breakMinutes,
        totalHours: computedHours,
        status: evaluation.status,
        isHalfDay: evaluation.isHalfDay,
      };

      await FirestoreEngine.setDocument(
        'showup_attendance',
        todayRecord.id,
        updated
      );
      showToast(
        'info',
        'Checked Out Successfully',
        `Logged ${computedHours} hrs • Status: ${evaluation.status}`
      );
    } finally {
      setIsCapturingGps(false);
    }
  };

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-600" />
          <span>Virtual Attendance Punch Terminal</span>
        </div>
      }
      subtitle={`Shift: ${policy.shiftStart}–${policy.shiftEnd} (${policy.standardHours}h) • Grace Cutoff: ${policy.graceCutoff} AM`}
      action={
        <Badge variant={isClockedIn ? 'success' : 'neutral'}>
          {isClockedIn ? 'ACTIVE SHIFT IN PROGRESS' : 'OFF CLOCK'}
        </Badge>
      }
    >
      {/* GPS Error / Permission Denied Banner with Clear Instructions */}
      {(gpsError || permissionState === 'denied') && (
        <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-900 space-y-1.5">
            <div className="font-bold text-rose-800">
              Location Verification Required to Check In / Check Out
            </div>
            <p className="text-rose-700 leading-relaxed">
              {gpsError ||
                'Browser location access is currently blocked. Attendance submission requires automatic location verification at Check-In and Check-Out.'}
            </p>
            <div className="p-2.5 bg-white/80 border border-rose-200 rounded-lg text-[11px] text-neutral-700 space-y-1">
              <div className="font-bold text-neutral-900">
                How to enable Location Access:
              </div>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>
                  Click the <strong>Lock / Site Settings icon</strong> on the left side of your browser address bar.
                </li>
                <li>
                  Change <strong>Location</strong> permission to <strong>Allow</strong>.
                </li>
                <li>
                  Ensure <strong>Location Services</strong> are turned ON in your computer or mobile device settings, then click <strong>Check In</strong> or <strong>Check Out</strong> again.
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        {/* Live Clock & Shift Details */}
        <div className="p-4 bg-neutral-50 border border-neutral-200 text-neutral-900 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase text-sky-700 font-bold">
                {now.toDateString()}
              </div>
              <div className="text-2xl font-mono font-extrabold mt-0.5 text-neutral-900">
                {now.toLocaleTimeString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-neutral-500">
                Work Duration
              </div>
              <div className="font-mono text-lg font-extrabold text-emerald-700">
                {liveHours.toFixed(2)} hrs
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-neutral-600">
              Shift: <strong>{policy.shiftStart}–{policy.shiftEnd}</strong> ({policy.standardHours}h)
            </span>
            <span className="text-amber-800 font-medium">
              Grace Cutoff: <strong>{policy.graceCutoff} AM</strong>
            </span>
          </div>
        </div>

        {/* Check In / Check Out Controls */}
        <div className="p-4 bg-white border border-neutral-200 rounded-xl flex flex-col justify-center gap-3">
          {!isClockedIn ? (
            <Button
              variant="success"
              size="lg"
              disabled={isCapturingGps}
              icon={
                isCapturingGps ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )
              }
              onClick={handleClockIn}
              className="w-full py-3.5 text-sm font-bold shadow-xs cursor-pointer"
            >
              {isCapturingGps ? 'Checking In...' : 'Check In Now'}
            </Button>
          ) : (
            <Button
              variant="danger"
              size="lg"
              disabled={isCapturingGps}
              icon={
                isCapturingGps ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )
              }
              onClick={handleClockOut}
              className="w-full py-3.5 text-sm font-bold shadow-xs cursor-pointer"
            >
              {isCapturingGps ? 'Checking Out...' : 'Check Out Now'}
            </Button>
          )}

          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-neutral-500">Today's Attendance Status:</span>
            {todayRecord ? (
              <Badge
                variant={
                  todayRecord.status === 'Present'
                    ? 'success'
                    : todayRecord.status === 'Late' ||
                      todayRecord.status === 'Half-Day'
                    ? 'warning'
                    : 'danger'
                }
              >
                {todayRecord.status}
              </Badge>
            ) : (
              <span className="text-neutral-400 font-mono text-[11px]">
                Not Clocked In Today
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
