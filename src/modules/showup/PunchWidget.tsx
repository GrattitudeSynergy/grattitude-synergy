import React, { useState, useEffect } from 'react';
import { Clock, MapPin, Coffee, LogIn, LogOut } from 'lucide-react';
import { Card, Button, Badge, useToast } from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { PolicyEngine } from './policyEngine';
import type {
  Employee,
  ShowupAttendanceRecord,
  ShowupPolicyConfig,
  ShowupLeaveBalance,
} from '../../core/types';

export const PunchWidget: React.FC<{
  currentEmployee: Employee;
  todayRecord: ShowupAttendanceRecord | null;
  policy: ShowupPolicyConfig;
  leaveBalance: ShowupLeaveBalance | null;
}> = ({ currentEmployee, todayRecord, policy, leaveBalance }) => {
  const { showToast } = useToast();
  const [locationNote, setLocationNote] = useState('Bengaluru HQ — Biometric & Geo Verified');
  const [breakMinutes, setBreakMinutes] = useState<number>(
    todayRecord?.breakMinutes || 0
  );
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
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

  const handleClockIn = async () => {
    const serverTimestamp = new Date().toISOString();
    const isFirstPunch = punches.length === 0;
    const isLate = isFirstPunch
      ? PolicyEngine.isPunchInLate(serverTimestamp, policy)
      : Boolean(todayRecord?.isLate);

    const nextPunches = [
      ...punches,
      {
        type: 'IN' as const,
        timestamp: serverTimestamp,
        locationNote: locationNote.trim() || 'Office HQ',
      },
    ];

    const recordId = `${currentEmployee.id}_${todayStr}`;
    const newRecord: ShowupAttendanceRecord = {
      id: recordId,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      date: todayStr,
      status: isLate ? 'Late' : 'Present',
      punches: nextPunches,
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
            CL: 12,
            SL: 10,
            EL: 15,
            Optional: 3,
            Maternity: 180,
            Paternity: 15,
            'Comp Off': 2,
            LWP: 365,
          },
          lateMarksCount: currentLateMarks,
          lateLeaveDeducted: totalDeduction,
          updatedAt: new Date().toISOString(),
        }
      );
      showToast(
        'warning',
        'Late Mark Recorded (After Grace Cutoff)',
        `Punch-in after ${policy.graceCutoff} AM marked as Late (${currentLateMarks} late mark(s) total).`
      );
    } else {
      showToast(
        'success',
        'Clocked In Successfully',
        `Server timestamp recorded at ${new Date(serverTimestamp).toLocaleTimeString()}.`
      );
    }
  };

  const handleClockOut = async () => {
    if (!todayRecord) return;
    const serverTimestamp = new Date().toISOString();
    const nextPunches = [
      ...punches,
      {
        type: 'OUT' as const,
        timestamp: serverTimestamp,
        locationNote: locationNote.trim() || 'Office HQ',
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
      punches: nextPunches,
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
      'Clocked Out',
      `Logged ${computedHours} hrs • Status: ${evaluation.status}`
    );
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Live Clock & Timer */}
        <div className="p-4 bg-neutral-50 border border-neutral-200 text-neutral-900 rounded-xl">
          <div className="text-[11px] font-mono uppercase text-sky-700 font-bold">
            {now.toDateString()}
          </div>
          <div className="text-2xl font-mono font-extrabold mt-0.5 text-neutral-900">
            {now.toLocaleTimeString()}
          </div>
          <div className="mt-2 pt-2 border-t border-neutral-200 flex items-center justify-between text-xs">
            <span className="text-neutral-600">Net Work Duration:</span>
            <span className="font-mono font-bold text-emerald-700">
              {liveHours.toFixed(2)} hrs
            </span>
          </div>
        </div>

        {/* Geolocation Note & Break Duration */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              <MapPin className="w-3.5 h-3.5 inline mr-1 text-sky-600" />
              Geolocation / Work Mode Note
            </label>
            <input
              type="text"
              value={locationNote}
              onChange={(e) => setLocationNote(e.target.value)}
              placeholder="e.g. Bengaluru HQ or WFH"
              className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              <Coffee className="w-3.5 h-3.5 inline mr-1 text-amber-600" />
              Break Duration (Minutes)
            </label>
            <input
              type="number"
              min={0}
              max={240}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-xs font-mono border border-neutral-300 rounded-lg"
            />
          </div>
        </div>

        {/* Clock In / Clock Out Controls */}
        <div className="flex flex-col gap-2.5">
          {!isClockedIn ? (
            <Button
              variant="success"
              size="lg"
              icon={<LogIn className="w-4 h-4" />}
              onClick={handleClockIn}
              className="w-full py-3"
            >
              Clock In Now
            </Button>
          ) : (
            <Button
              variant="danger"
              size="lg"
              icon={<LogOut className="w-4 h-4" />}
              onClick={handleClockOut}
              className="w-full py-3"
            >
              Clock Out Now
            </Button>
          )}

          {todayRecord && (
            <div className="flex items-center justify-between text-xs px-2">
              <span className="text-neutral-500">Today's Status:</span>
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
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
