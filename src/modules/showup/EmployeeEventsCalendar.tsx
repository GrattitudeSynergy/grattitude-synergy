import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cake,
  Award,
  UserPlus,
  Eye,
  Sliders,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Table,
  Modal,
  useToast,
} from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { PermissionsService } from '../../core/services/permissionsService';
import { AuditService } from '../../core/services/auditService';
import type { Employee, EventsCalendarConfig } from '../../core/types';

interface EmployeeEventsCalendarProps {
  currentEmployee: Employee;
  employees: Employee[];
}

export type EmployeeCalendarEventType = 'Birthday' | 'Work Anniversary' | 'Date of Joining';

interface CalendarEventItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEcode: string;
  department: string;
  designation: string;
  eventType: EmployeeCalendarEventType;
  dayOfMonth: number;
  monthNumber: number; // 1 to 12
  dateStr: string; // YYYY-MM-DD in viewed year
  originalDate: string; // DOB or DOJ
  yearsCount?: number;
  detailLabel: string;
}

// Deterministic fallback birthdays for pre-seeded employees whose personal.dateOfBirth isn't set yet
const DEFAULT_SEEDED_BIRTHDAYS: Record<string, string> = {
  'EMP-001': '1988-11-18',
  '#GSL002': '1995-11-08',
  '#GSL003': '1996-11-14',
  '#GSL004': '1993-11-25',
  '#GSL006': '1997-12-05',
  '#GSL014': '1997-11-22',
  '#GSL016': '1996-01-19',
  '#GSL017': '1998-02-11',
  '#GSL021': '1999-11-28',
  '#GSL023': '1997-03-16',
  '#GSL024': '1998-04-09',
  '#GSLP01': '1986-11-12',
  GSL000: '2001-11-19',
  GSLP04: '1991-06-15',
};

export const EmployeeEventsCalendar: React.FC<EmployeeEventsCalendarProps> = ({
  currentEmployee,
  employees,
}) => {
  const { showToast } = useToast();
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [typeFilter, setTypeFilter] = useState<
    'ALL' | EmployeeCalendarEventType
  >('ALL');

  const [visibilityConfig, setVisibilityConfig] =
    useState<EventsCalendarConfig>({
      id: 'events_calendar_config',
      showBirthdaysToEmployees: true,
      showAnniversariesToEmployees: true,
      showJoiningDatesToEmployees: true,
      updatedBy: 'EMP-001',
      updatedAt: '2026-11-04T00:00:00.000Z',
    });

  const [dobModalEmp, setDobModalEmp] = useState<Employee | null>(null);
  const [dobInput, setDobInput] = useState<string>('');
  const [dojInput, setDojInput] = useState<string>('');

  useEffect(() => {
    const unsub = FirestoreEngine.subscribeCollection<any>(
      'app_settings',
      (items) => {
        const found = items.find((i) => i.id === 'events_calendar_config');
        if (found) setVisibilityConfig(found);
      }
    );
    return () => unsub();
  }, []);

  const isAdmin = PermissionsService.isAdmin(currentEmployee);
  const viewYear = currentMonthDate.getFullYear();
  const viewMonthIndex = currentMonthDate.getMonth(); // 0 to 11
  const viewMonthNum = viewMonthIndex + 1; // 1 to 12

  const daysInMonth = new Date(viewYear, viewMonthIndex + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonthIndex, 1).getDay();

  const activeEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.status !== 'Inactive' && e.status !== 'Exited')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees]
  );

  const getEmployeeDob = (emp: Employee): string => {
    return (
      emp.personal?.dateOfBirth ||
      DEFAULT_SEEDED_BIRTHDAYS[emp.id] ||
      DEFAULT_SEEDED_BIRTHDAYS[emp.ecode] ||
      ''
    );
  };

  // Automatically generate monthly events from Employee profiles (DOB & DOJ)
  const monthlyEvents = useMemo(() => {
    const events: CalendarEventItem[] = [];

    for (const emp of activeEmployees) {
      // 1. Birthday
      const dob = getEmployeeDob(emp);
      if (dob && (isAdmin || visibilityConfig.showBirthdaysToEmployees)) {
        const parts = dob.split('-').map(Number);
        const bMonth = parts[1];
        const bDay = parts[2];
        if (bMonth === viewMonthNum && bDay >= 1 && bDay <= 31) {
          events.push({
            id: `bday_${emp.id}_${viewYear}`,
            employeeId: emp.id,
            employeeName: emp.name,
            employeeEcode: emp.ecode,
            department: emp.department,
            designation: emp.designation,
            eventType: 'Birthday',
            dayOfMonth: bDay,
            monthNumber: bMonth,
            dateStr: `${viewYear}-${String(bMonth).padStart(2, '0')}-${String(
              bDay
            ).padStart(2, '0')}`,
            originalDate: dob,
            detailLabel: `Birthday (${emp.name})`,
          });
        }
      }

      // 2. Date of Joining (DOJ) & Work Anniversary
      if (emp.dateOfJoining) {
        const dojParts = emp.dateOfJoining.split('-').map(Number);
        const jYear = dojParts[0];
        const jMonth = dojParts[1];
        const jDay = dojParts[2];

        if (jMonth === viewMonthNum && jDay >= 1 && jDay <= 31) {
          const yearsDiff = viewYear - jYear;

          if (
            yearsDiff <= 0 &&
            (isAdmin || visibilityConfig.showJoiningDatesToEmployees)
          ) {
            events.push({
              id: `doj_${emp.id}_${viewYear}`,
              employeeId: emp.id,
              employeeName: emp.name,
              employeeEcode: emp.ecode,
              department: emp.department,
              designation: emp.designation,
              eventType: 'Date of Joining',
              dayOfMonth: jDay,
              monthNumber: jMonth,
              dateStr: `${viewYear}-${String(jMonth).padStart(2, '0')}-${String(
                jDay
              ).padStart(2, '0')}`,
              originalDate: emp.dateOfJoining,
              detailLabel: `Joined Grattitude Synergy (${emp.dateOfJoining})`,
            });
          } else if (
            yearsDiff > 0 &&
            (isAdmin || visibilityConfig.showAnniversariesToEmployees)
          ) {
            events.push({
              id: `anniv_${emp.id}_${viewYear}`,
              employeeId: emp.id,
              employeeName: emp.name,
              employeeEcode: emp.ecode,
              department: emp.department,
              designation: emp.designation,
              eventType: 'Work Anniversary',
              dayOfMonth: jDay,
              monthNumber: jMonth,
              dateStr: `${viewYear}-${String(jMonth).padStart(2, '0')}-${String(
                jDay
              ).padStart(2, '0')}`,
              originalDate: emp.dateOfJoining,
              yearsCount: yearsDiff,
              detailLabel: `${yearsDiff} Year${
                yearsDiff === 1 ? '' : 's'
              } Work Anniversary (Joined ${emp.dateOfJoining})`,
            });
          }
          // Also include DOJ badge if user filters specifically or for visibility
          if (
            yearsDiff > 0 &&
            (isAdmin || visibilityConfig.showJoiningDatesToEmployees)
          ) {
            events.push({
              id: `doj_ref_${emp.id}_${viewYear}`,
              employeeId: emp.id,
              employeeName: emp.name,
              employeeEcode: emp.ecode,
              department: emp.department,
              designation: emp.designation,
              eventType: 'Date of Joining',
              dayOfMonth: jDay,
              monthNumber: jMonth,
              dateStr: `${viewYear}-${String(jMonth).padStart(2, '0')}-${String(
                jDay
              ).padStart(2, '0')}`,
              originalDate: emp.dateOfJoining,
              detailLabel: `DOJ: ${emp.dateOfJoining}`,
            });
          }
        }
      }
    }

    return events
      .filter((ev) => typeFilter === 'ALL' || ev.eventType === typeFilter)
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  }, [
    activeEmployees,
    viewYear,
    viewMonthNum,
    isAdmin,
    visibilityConfig,
    typeFilter,
  ]);

  const handleSaveVisibilityConfig = async (
    next: Partial<EventsCalendarConfig>
  ) => {
    const updated: EventsCalendarConfig = {
      ...visibilityConfig,
      ...next,
      updatedBy: currentEmployee.name,
      updatedAt: new Date().toISOString(),
    };
    setVisibilityConfig(updated);
    await FirestoreEngine.setDocument(
      'app_settings',
      'events_calendar_config',
      updated
    );
    await AuditService.log({
      action: 'EVENTS_CALENDAR_VISIBILITY_UPDATED',
      actor: currentEmployee,
      targetId: 'events_calendar_config',
      targetType: 'EventsCalendarConfig',
      details: `Updated Employee Events Calendar visibility: Birthdays=${updated.showBirthdaysToEmployees}, Anniversaries=${updated.showAnniversariesToEmployees}, DOJ=${updated.showJoiningDatesToEmployees}.`,
    });
    showToast(
      'success',
      'Event Visibility Updated',
      'Calendar visibility preferences saved.'
    );
  };

  const handleSaveEmployeeDates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dobModalEmp) return;

    const updatedEmp: Employee = {
      ...dobModalEmp,
      dateOfJoining: dojInput || dobModalEmp.dateOfJoining,
      personal: {
        ...dobModalEmp.personal,
        dateOfBirth: dobInput,
      },
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('employees', dobModalEmp.id, updatedEmp);
    await AuditService.log({
      action: 'EMPLOYEE_EVENT_DATES_UPDATED',
      actor: currentEmployee,
      targetId: dobModalEmp.id,
      targetType: 'Employee',
      details: `Updated Birthday (${dobInput}) and Date of Joining (${dojInput}) for ${dobModalEmp.name} (${dobModalEmp.ecode}).`,
    });

    showToast(
      'success',
      'Employee Profile Dates Synced',
      `${dobModalEmp.name}'s Birthday and DOJ automatically updated on the Events Calendar.`
    );
    setDobModalEmp(null);
  };

  const eventBadgeStyles: Record<EmployeeCalendarEventType, string> = {
    Birthday: 'bg-pink-50 text-pink-800 border-pink-200',
    'Work Anniversary': 'bg-amber-50 text-amber-800 border-amber-200',
    'Date of Joining': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  return (
    <div className="space-y-6">
      {/* Admin / HR Visibility Control Bar */}
      {isAdmin && (
        <div className="p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-600" />
            <div>
              <div className="text-xs font-bold text-neutral-900">
                Admin / HR Event Visibility Controls
              </div>
              <div className="text-[11px] text-neutral-500">
                Control which event categories are visible to employees across the portal.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={visibilityConfig.showBirthdaysToEmployees}
                onChange={(e) =>
                  handleSaveVisibilityConfig({
                    showBirthdaysToEmployees: e.target.checked,
                  })
                }
              />
              <span>Show Birthdays</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={visibilityConfig.showAnniversariesToEmployees}
                onChange={(e) =>
                  handleSaveVisibilityConfig({
                    showAnniversariesToEmployees: e.target.checked,
                  })
                }
              />
              <span>Show Work Anniversaries</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={visibilityConfig.showJoiningDatesToEmployees}
                onChange={(e) =>
                  handleSaveVisibilityConfig({
                    showJoiningDatesToEmployees: e.target.checked,
                  })
                }
              />
              <span>Show Joining Dates (DOJ)</span>
            </label>
          </div>
        </div>
      )}

      {/* Main Monthly Events Calendar */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-600" />
            <span>
              Employee Events Calendar — Birthdays, Work Anniversaries & Dates of Joining
            </span>
          </div>
        }
        subtitle="Automatically fetched from employee profiles and updated in real time when profile details change."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
            >
              <option value="ALL">All Event Types</option>
              <option value="Birthday">Birthdays Only</option>
              <option value="Work Anniversary">Work Anniversaries Only</option>
              <option value="Date of Joining">Dates of Joining (DOJ)</option>
            </select>

            <button
              type="button"
              onClick={() =>
                setCurrentMonthDate(new Date(viewYear, viewMonthIndex - 1, 1))
              }
              className="p-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-100 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-extrabold text-neutral-900 min-w-[130px] text-center">
              {currentMonthDate.toLocaleString('default', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <button
              type="button"
              onClick={() =>
                setCurrentMonthDate(new Date(viewYear, viewMonthIndex + 1, 1))
              }
              className="p-1.5 border border-neutral-200 rounded-lg hover:bg-neutral-100 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        }
      >
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mb-4 pb-3 border-b border-neutral-200 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-bold bg-pink-50 text-pink-800 border-pink-200">
            <Cake className="w-3.5 h-3.5" /> Employee Birthday
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-bold bg-amber-50 text-amber-800 border-amber-200">
            <Award className="w-3.5 h-3.5" /> Work Anniversary
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-bold bg-emerald-50 text-emerald-800 border-emerald-200">
            <UserPlus className="w-3.5 h-3.5" /> Date of Joining (DOJ)
          </span>
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

        {/* Monthly Grid */}
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
            <div
              key={`empty_ev_${idx}`}
              className="min-h-[96px] bg-neutral-50/50 border border-dashed border-neutral-200 rounded-lg"
            />
          ))}

          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const dayNum = idx + 1;
            const dayEvents = monthlyEvents.filter(
              (ev) => ev.dayOfMonth === dayNum
            );

            return (
              <div
                key={`day_${dayNum}`}
                className={`min-h-[96px] p-2 rounded-lg border flex flex-col justify-between ${
                  dayEvents.length > 0
                    ? 'bg-sky-50/20 border-sky-200'
                    : 'bg-white border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-neutral-800">
                    {dayNum}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-[10px] font-bold text-sky-700">
                      {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="space-y-1 mt-1">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      title={`${ev.employeeName} (${ev.employeeEcode}) — ${ev.detailLabel}`}
                      className={`px-1.5 py-0.5 text-[10px] font-bold border rounded-sm truncate ${
                        eventBadgeStyles[ev.eventType]
                      }`}
                    >
                      {ev.eventType === 'Birthday'
                        ? '🎂 '
                        : ev.eventType === 'Work Anniversary'
                        ? '🏆 '
                        : '🎉 '}
                      {ev.employeeName}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Upcoming & Monthly Events List + Profile Date Editor */}
      <Card
        title="Employee Celebrations & Profile Milestones Directory"
        subtitle="View all employee Birthdays, Work Anniversaries, and Dates of Joining (DOJ)."
      >
        <Table
          headers={[
            'Employee & E-Code',
            'Department & Role',
            'Date of Birth (Birthday)',
            'Date of Joining (DOJ)',
            'Tenure / Work Anniversary',
            ...(isAdmin ? ['Update Dates'] : []),
          ]}
        >
          {activeEmployees.map((emp) => {
            const dob = getEmployeeDob(emp);
            const dojYear = emp.dateOfJoining
              ? Number(emp.dateOfJoining.split('-')[0])
              : viewYear;
            const years = Math.max(0, viewYear - dojYear);

            return (
              <tr key={emp.id} className="hover:bg-neutral-50">
                <td className="px-3 py-2.5">
                  <div className="text-xs font-bold text-neutral-900">
                    {emp.name}
                  </div>
                  <div className="text-[11px] font-mono text-sky-700">
                    {emp.ecode}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-neutral-600">
                  {emp.designation} • {emp.department}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono">
                  {isAdmin || visibilityConfig.showBirthdaysToEmployees ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-pink-50 text-pink-800 border border-pink-200 font-bold">
                      <Cake className="w-3 h-3" /> {dob || 'Not Set'}
                    </span>
                  ) : (
                    <span className="text-neutral-400">Hidden by Admin</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono">
                  {isAdmin || visibilityConfig.showJoiningDatesToEmployees ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                      <UserPlus className="w-3 h-3" /> {emp.dateOfJoining}
                    </span>
                  ) : (
                    <span className="text-neutral-400">Hidden by Admin</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {isAdmin || visibilityConfig.showAnniversariesToEmployees ? (
                    <Badge variant={years > 0 ? 'warning' : 'info'}>
                      {years > 0
                        ? `${years} Year${years > 1 ? 's' : ''} Completed`
                        : 'Joined This Year'}
                    </Badge>
                  ) : (
                    <span className="text-xs text-neutral-400">Hidden</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-3 py-2.5">
                    <Button
                      size="xs"
                      variant="outline"
                      icon={<Eye className="w-3 h-3" />}
                      onClick={() => {
                        setDobModalEmp(emp);
                        setDobInput(getEmployeeDob(emp));
                        setDojInput(emp.dateOfJoining);
                      }}
                    >
                      Edit Dates
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </Table>
      </Card>

      {/* Modal: Edit Employee Birthday & Date of Joining */}
      <Modal
        isOpen={Boolean(dobModalEmp)}
        onClose={() => setDobModalEmp(null)}
        size="md"
        title={
          dobModalEmp
            ? `Update Profile Event Dates — ${dobModalEmp.name} (${dobModalEmp.ecode})`
            : 'Update Dates'
        }
        subtitle="Changes automatically sync with the Employee Events Calendar."
      >
        {dobModalEmp && (
          <form onSubmit={handleSaveEmployeeDates} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Date of Birth (Birthday) *
              </label>
              <input
                type="date"
                required
                value={dobInput}
                onChange={(e) => setDobInput(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Date of Joining (DOJ & Work Anniversary) *
              </label>
              <input
                type="date"
                required
                value={dojInput}
                onChange={(e) => setDojInput(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDobModalEmp(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save & Sync Calendar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
