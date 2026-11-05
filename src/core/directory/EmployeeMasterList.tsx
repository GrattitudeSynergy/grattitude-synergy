import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  KeyRound,
  Trash2,
  Edit3,
  AlertTriangle,
  Sliders,
  Lock,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Table,
  Modal,
  Tabs,
  EmptyState,
  useToast,
} from '../components/DesignSystem';
import { FirestoreEngine, AuthEngine } from '../firebase/firebaseConfig';
import { PermissionsService } from '../services/permissionsService';
import { AuditService } from '../services/auditService';
import { AddEmployeeModal } from './AddEmployeeModal';
import { EmployeeFormBuilder } from './EmployeeFormBuilder';
import { CompensationLockSettings } from './CompensationLockSettings';
import { PerformLockSettings } from './PerformLockSettings';
import { AdminGpsDashboard } from '../../modules/showup/AdminGpsDashboard';
import type { Employee, ShowupAttendanceRecord } from '../types';

export const EmployeeMasterList: React.FC<{
  currentEmployee: Employee;
}> = ({ currentEmployee }) => {
  const { showToast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<
    | 'directory'
    | 'gps-tracker'
    | 'form-builder'
    | 'compensation-lock'
    | 'perform-lock'
  >('directory');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    ShowupAttendanceRecord[]
  >([]);

  // Filters
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [resetModalEmp, setResetModalEmp] = useState<Employee | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('Reset@123');
  const [forceMustChange, setForceMustChange] = useState(true);
  const [deleteTargetEmp, setDeleteTargetEmp] = useState<Employee | null>(null);

  const isAdmin = PermissionsService.isAdmin(currentEmployee);
  const canAccessGps = PermissionsService.canAccessEmployeeGpsLocations(currentEmployee);

  useEffect(() => {
    const unsub = FirestoreEngine.subscribeCollection<Employee>('employees', (items) => {
      const sorted = [...items].sort((a, b) => a.ecode.localeCompare(b.ecode));
      setEmployees(sorted);
    });
    let unsubAtt: (() => void) | null = null;
    if (canAccessGps) {
      unsubAtt = FirestoreEngine.subscribeCollection<ShowupAttendanceRecord>(
        'showup_attendance',
        setAttendanceRecords
      );
    }
    return () => {
      unsub();
      if (unsubAtt) unsubAtt();
    };
  }, [canAccessGps]);

  const departments = Array.from(new Set(employees.map((e) => e.department)));

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.ecode.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      emp.designation.toLowerCase().includes(search.toLowerCase());
    const matchesDept = deptFilter === 'ALL' || emp.department === deptFilter;
    const matchesLevel = levelFilter === 'ALL' || String(emp.level) === levelFilter;
    const matchesRole = roleFilter === 'ALL' || emp.role === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || emp.status === statusFilter;
    return matchesSearch && matchesDept && matchesLevel && matchesRole && matchesStatus;
  });

  // Safe Deletion Direct-Report Guard
  const getDirectReportsFor = (managerId: string): Employee[] => {
    return employees.filter((e) => e.reportingManagerId === managerId);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetEmp) return;
    if (deleteTargetEmp.id === 'EMP-001') {
      showToast('error', 'Action Prohibited', 'Cannot delete the bootstrap Super Admin (EMP-001).');
      return;
    }
    const directReports = getDirectReportsFor(deleteTargetEmp.id);
    if (directReports.length > 0) {
      showToast(
        'error',
        'Direct-Report Guard Triggered',
        `Reassign ${directReports.length} reporting employee(s) before deleting ${deleteTargetEmp.name}.`
      );
      return;
    }

    await FirestoreEngine.deleteDocument('employees', deleteTargetEmp.id);
    await AuditService.log({
      action: 'EMPLOYEE_DELETED',
      actor: currentEmployee,
      targetId: deleteTargetEmp.id,
      targetType: 'Employee',
      details: `Deleted employee record ${deleteTargetEmp.name} (${deleteTargetEmp.ecode}).`,
    });
    showToast(
      'info',
      'Employee Deleted',
      `${deleteTargetEmp.name} (${deleteTargetEmp.ecode}) removed from master directory.`
    );
    setDeleteTargetEmp(null);
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalEmp || !newResetPassword.trim()) return;
    try {
      await AuthEngine.adminResetUserPassword(resetModalEmp.email, newResetPassword.trim());
      await FirestoreEngine.updateDocument<Employee>('employees', resetModalEmp.id, {
        mustChangePassword: forceMustChange,
      });
      await AuditService.log({
        action: 'ADMIN_PASSWORD_RESET',
        actor: currentEmployee,
        targetId: resetModalEmp.id,
        targetType: 'Employee',
        details: `Admin reset password for ${resetModalEmp.name} (${resetModalEmp.ecode}). Force change on next login: ${forceMustChange}.`,
      });
      showToast(
        'success',
        'Password Reset Complete',
        `Temporary password updated for ${resetModalEmp.email}.`
      );
      setResetModalEmp(null);
    } catch (err: any) {
      showToast('error', 'Password Reset Failed', err?.message || 'Error resetting password.');
    }
  };

  const subTabs = [
    {
      id: 'directory',
      label: 'Employee Master Directory',
      icon: <Users className="w-3.5 h-3.5" />,
      badge: employees.length,
    },
    ...(canAccessGps
      ? [
          {
            id: 'gps-tracker',
            label: 'Attendance GPS Tracker',
            icon: <MapPin className="w-3.5 h-3.5" />,
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            id: 'form-builder',
            label: 'Onboarding Form Builder',
            icon: <Sliders className="w-3.5 h-3.5" />,
          },
          {
            id: 'compensation-lock',
            label: 'Compensation Lock Controls',
            icon: <Lock className="w-3.5 h-3.5" />,
          },
          {
            id: 'perform-lock',
            label: 'Perform Module Lock Controls',
            icon: <Lock className="w-3.5 h-3.5" />,
          },
        ]
      : []),
  ];

  const onlyAdminExists =
    employees.length === 1 && employees[0]?.id === 'EMP-001';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={subTabs}
          activeTab={activeSubTab}
          onChange={(id) => setActiveSubTab(id as any)}
          className="border-b-0 pb-0"
        />

        {isAdmin && activeSubTab === 'directory' && (
          <Button
            variant="primary"
            icon={<UserPlus className="w-4 h-4" />}
            onClick={() => {
              setEditingEmployee(null);
              setAddModalOpen(true);
            }}
          >
            Add Employee
          </Button>
        )}
      </div>

      {activeSubTab === 'gps-tracker' && canAccessGps && (
        <AdminGpsDashboard
          currentEmployee={currentEmployee}
          attendanceRecords={attendanceRecords}
          employees={employees}
        />
      )}

      {activeSubTab === 'form-builder' && isAdmin && (
        <EmployeeFormBuilder currentAdmin={currentEmployee} />
      )}

      {activeSubTab === 'compensation-lock' && isAdmin && (
        <CompensationLockSettings
          currentAdmin={currentEmployee}
          allEmployees={employees}
        />
      )}

      {activeSubTab === 'perform-lock' && isAdmin && (
        <PerformLockSettings
          currentAdmin={currentEmployee}
          allEmployees={employees}
        />
      )}

      {activeSubTab === 'directory' && (
        <>
          {/* EmptyState callout when ONLY the pre-seeded Admin exists */}
          {onlyAdminExists && (
            <EmptyState
              title="Only the Pre-Seeded Super Admin (EMP-001) Exists"
              description="No CEO, Manager, Employee, Intern, or Advisor accounts are pre-seeded. Provision your organization's workforce using the Add Employee button below."
              icon={<UserPlus className="w-6 h-6 text-sky-600" />}
              action={
                isAdmin && (
                  <Button
                    variant="secondary"
                    icon={<UserPlus className="w-4 h-4" />}
                    onClick={() => {
                      setEditingEmployee(null);
                      setAddModalOpen(true);
                    }}
                  >
                    Add First Employee to Organization
                  </Button>
                )
              }
            />
          )}

          <Card
            title="Employee Master Directory (employees)"
            subtitle="Searchable, filterable corporate workforce registry with circular-reporting protection and direct-report deletion guards."
          >
            {/* Search & Multi-Facet Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, E-Code, email..."
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
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="ALL">All Hierarchy Levels (L0–L5)</option>
                <option value="5">Level 5 (Admin / CEO / Advisor)</option>
                <option value="4">Level 4 (Manager)</option>
                <option value="3">Level 3 (Senior Specialist)</option>
                <option value="2">Level 2 (Associate)</option>
                <option value="1">Level 1 (Junior Associate)</option>
                <option value="0">Level 0 (Graduate Intern)</option>
              </select>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="ALL">All Corporate Roles</option>
                <option value="Admin">Admin</option>
                <option value="CEO">CEO</option>
                <option value="Manager">Manager</option>
                <option value="Employee">Employee / Intern</option>
                <option value="Advisor">Advisor</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
                <option value="Exited">Exited</option>
              </select>
            </div>

            <Table
              headers={[
                'E-Code & Identity',
                'Role & Hierarchy',
                'Department & Vertical',
                'Reporting Manager',
                'Access & Status',
                ...(isAdmin ? ['Admin Controls'] : []),
              ]}
            >
              {filteredEmployees.map((emp) => {
                const mgr = employees.find((m) => m.id === emp.reportingManagerId);
                const directReportsCount = getDirectReportsFor(emp.id).length;

                return (
                  <tr key={emp.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-neutral-100 border border-neutral-300 rounded-sm">
                          {emp.ecode}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-neutral-900">
                            {emp.name}
                          </div>
                          <div className="text-[11px] font-mono text-neutral-500">
                            {emp.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="info">Level {emp.level}</Badge>
                        <Badge variant="neutral">{emp.role}</Badge>
                      </div>
                      <div className="text-xs text-neutral-600 mt-1">
                        {emp.designation}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs">
                      <div className="font-semibold text-neutral-800">
                        {emp.department}
                      </div>
                      <div className="text-neutral-500 text-[11px]">
                        {emp.vertical}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-xs">
                      {mgr ? (
                        <div>
                          <div className="font-semibold text-neutral-800">
                            {mgr.name}
                          </div>
                          <div className="font-mono text-[11px] text-neutral-500">
                            {mgr.ecode}
                          </div>
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic">
                          Root Executive
                        </span>
                      )}
                      {directReportsCount > 0 && (
                        <div className="text-[10px] font-bold text-sky-700 mt-0.5">
                          {directReportsCount} Direct Report
                          {directReportsCount === 1 ? '' : 's'}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={
                            emp.status === 'Active'
                              ? 'success'
                              : emp.status === 'On Leave'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {emp.status}
                        </Badge>
                        {emp.hasCrmAccess && (
                          <Badge variant="info">CRM Enabled</Badge>
                        )}
                        {emp.mustChangePassword && (
                          <Badge variant="warning">Pending Pwd Reset</Badge>
                        )}
                      </div>
                    </td>

                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            icon={<Edit3 className="w-3 h-3" />}
                            onClick={() => {
                              setEditingEmployee(emp);
                              setAddModalOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            icon={<KeyRound className="w-3 h-3" />}
                            onClick={() => {
                              setResetModalEmp(emp);
                              setNewResetPassword('Reset@123');
                              setForceMustChange(true);
                            }}
                          >
                            Reset Pwd
                          </Button>
                          {emp.id !== 'EMP-001' && (
                            <Button
                              size="xs"
                              variant="danger"
                              icon={<Trash2 className="w-3 h-3" />}
                              onClick={() => setDeleteTargetEmp(emp)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </Table>
          </Card>
        </>
      )}

      {/* Add / Edit Employee Modal */}
      <AddEmployeeModal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setEditingEmployee(null);
        }}
        currentAdmin={currentEmployee}
        allEmployees={employees}
        editingEmployee={editingEmployee}
      />

      {/* Admin Password Reset Modal */}
      <Modal
        isOpen={Boolean(resetModalEmp)}
        onClose={() => setResetModalEmp(null)}
        size="md"
        title="Admin Password Reset Authority"
        subtitle={
          resetModalEmp
            ? `Reset authentication password for ${resetModalEmp.name} (${resetModalEmp.ecode})`
            : ''
        }
      >
        {resetModalEmp && (
          <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs">
              <div>
                <strong>Target Account:</strong> {resetModalEmp.name} (
                <span className="font-mono">{resetModalEmp.email}</span>)
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                New Temporary Password *
              </label>
              <input
                type="text"
                required
                value={newResetPassword}
                onChange={(e) => setNewResetPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={forceMustChange}
                onChange={(e) => setForceMustChange(e.target.checked)}
              />
              <span>Enforce mandatory password change on employee's next login</span>
            </label>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetModalEmp(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon={<ShieldCheck className="w-4 h-4" />}
              >
                Confirm Password Reset
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Safe Deletion Modal with Direct-Report Guard */}
      <Modal
        isOpen={Boolean(deleteTargetEmp)}
        onClose={() => setDeleteTargetEmp(null)}
        size="md"
        title="Safe Employee Deletion Guard"
        subtitle="Verifying organizational reporting dependencies prior to removal."
      >
        {deleteTargetEmp && (
          <div className="space-y-4">
            {(() => {
              const directReports = getDirectReportsFor(deleteTargetEmp.id);
              if (directReports.length > 0) {
                return (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        Deletion Blocked: Active Direct Reports Assigned ({directReports.length})
                      </span>
                    </div>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      <strong>{deleteTargetEmp.name}</strong> ({deleteTargetEmp.ecode}) is currently the reporting manager for the following employee(s). You must reassign them before deleting this manager:
                    </p>
                    <ul className="list-disc list-inside text-xs font-mono text-rose-900 pt-1">
                      {directReports.map((dr) => (
                        <li key={dr.id}>
                          {dr.ecode} — {dr.name} ({dr.designation})
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }

              return (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="font-bold">
                    Confirm permanent removal of {deleteTargetEmp.name} ({deleteTargetEmp.ecode})?
                  </div>
                  <p>
                    Zero direct reports depend on this employee. This action will be recorded in the immutable audit trail.
                  </p>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTargetEmp(null)}>
                Cancel
              </Button>
              {getDirectReportsFor(deleteTargetEmp.id).length === 0 && (
                <Button
                  variant="danger"
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={handleConfirmDelete}
                >
                  Confirm Delete Employee
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
