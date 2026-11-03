import React, { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, Badge } from '../../core/components/DesignSystem';
import type {
  ShowupAttendanceRecord,
  ShowupHoliday,
  AttendanceStatus,
} from '../../core/types';

export const AttendanceCalendar: React.FC<{
  records: ShowupAttendanceRecord[];
  holidays: ShowupHoliday[];
}> = ({ records, holidays }) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)

  const recordMap = new Map<string, ShowupAttendanceRecord>();
  records.forEach((r) => recordMap.set(r.date, r));

  const holidayMap = new Map<string, ShowupHoliday>();
  holidays.forEach((h) => holidayMap.set(h.date, h));

  const statusStyles: Record<AttendanceStatus, string> = {
    Present: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Late: 'bg-amber-50 text-amber-800 border-amber-200',
    'Half-Day': 'bg-amber-100 text-amber-900 border-amber-300',
    Absent: 'bg-rose-50 text-rose-800 border-rose-200',
    WFH: 'bg-sky-50 text-sky-800 border-sky-200',
    Holiday: 'bg-sky-100 text-sky-900 border-sky-300',
    'Weekly Off': 'bg-neutral-100 text-neutral-500 border-neutral-200',
  };

  const dayCells: Array<{
    dateStr: string;
    dayNumber: number;
    status?: AttendanceStatus;
    hours?: number;
    holidayName?: string;
  }> = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(
      d
    ).padStart(2, '0')}`;
    const rec = recordMap.get(dateStr);
    const hol = holidayMap.get(dateStr);
    const dow = new Date(year, month, d).getDay();

    let status: AttendanceStatus | undefined = rec?.status;
    if (!status && hol) status = 'Holiday';
    else if (!status && (dow === 0 || dow === 6)) status = 'Weekly Off';

    dayCells.push({
      dateStr,
      dayNumber: d,
      status,
      hours: rec?.totalHours,
      holidayName: hol?.name,
    });
  }

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-sky-600" />
          <span>Monthly Attendance Calendar Grid</span>
        </div>
      }
      subtitle="Color-coded daily status badges: Present, Late, Half-Day, Absent, WFH, Holiday, Weekly Off."
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
            className="p-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-100 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-neutral-900 min-w-[120px] text-center">
            {currentMonth.toLocaleString('default', {
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <button
            type="button"
            onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
            className="p-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-100 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      }
    >
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-neutral-200">
        {(
          [
            'Present',
            'Late',
            'Half-Day',
            'Absent',
            'WFH',
            'Holiday',
            'Weekly Off',
          ] as AttendanceStatus[]
        ).map((st) => (
          <span
            key={st}
            className={`px-2 py-0.5 text-[11px] font-bold border rounded-md ${statusStyles[st]}`}
          >
            {st}
          </span>
        ))}
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase text-neutral-500 mb-2">
        <div>Sun</div>
        <div>Mon</div>
        <div>Tue</div>
        <div>Wed</div>
        <div>Thu</div>
        <div>Fri</div>
        <div>Sat</div>
      </div>

      {/* Calendar Cells */}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
          <div
            key={`empty_${idx}`}
            className="h-20 bg-neutral-50/50 border border-dashed border-neutral-200 rounded-lg"
          />
        ))}

        {dayCells.map((cell) => (
          <div
            key={cell.dateStr}
            className="h-20 p-2 bg-white border border-neutral-200 rounded-lg flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-neutral-800">
                {cell.dayNumber}
              </span>
              {cell.hours !== undefined && cell.hours > 0 && (
                <span className="text-[10px] font-mono text-neutral-500">
                  {cell.hours}h
                </span>
              )}
            </div>

            {cell.status && (
              <div
                className={`px-1.5 py-0.5 text-[10px] font-bold border rounded-sm truncate text-center ${
                  statusStyles[cell.status]
                }`}
              >
                {cell.holidayName ? cell.holidayName : cell.status}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
