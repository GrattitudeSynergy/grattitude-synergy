import React, { useState, useEffect } from 'react';
import { UserPlus, AlertCircle, ShieldCheck, KeyRound } from 'lucide-react';
import { Modal, Button, useToast } from '../components/DesignSystem';
import {
  AuthEngine,
  FirestoreEngine,
  normalizeIdentifier,
  synchronizeWithCentralDatabase,
} from '../firebase/firebaseConfig';
import { PermissionsService } from '../services/permissionsService';
import { AuditService } from '../services/auditService';
import { NotificationService } from '../services/notificationService';
import { SEED_DEFAULT_FORM_FIELDS } from '../seedData';
import type {
  Employee,
  CorporateRole,
  EmployeeStatus,
  DynamicFormField,
} from '../types';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAdmin: Employee;
  allEmployees: Employee[];
  editingEmployee?: Employee | null;
}

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen,
  onClose,
  currentAdmin,
  allEmployees,
  editingEmployee = null,
}) => {
  const { showToast } = useToast();
  const [formFields, setFormFields] = useState<DynamicFormField[]>(SEED_DEFAULT_FORM_FIELDS);

  // Core Employee State
  const computeNextEcode = (emps: Employee[]) => {
    const maxGslNum = emps.reduce((max, emp) => {
      const m = emp.ecode?.match(/^#?GSL(\d+)$/i);
      const num = m ? parseInt(m[1], 10) : 0;
      return num > max ? num : max;
    }, 0);
    if (maxGslNum > 0) {
      return `#GSL${String(maxGslNum + 1).padStart(3, '0')}`;
    }
    const maxNum = emps.reduce((max, emp) => {
      const m = emp.ecode?.match(/EMP-(\d+)/i);
      const num = m ? parseInt(m[1], 10) : 0;
      return num > max ? num : max;
    }, 0);
    return `EMP-${String(maxNum + 1).padStart(3, '0')}`;
  };
  const defaultEcode = computeNextEcode(allEmployees);

  const [ecode, setEcode] = useState(defaultEcode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('Welcome@123');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('Engineering');
  const [vertical, setVertical] = useState('Enterprise SaaS');
  const [level, setLevel] = useState<number>(3);
  const [role, setRole] = useState<CorporateRole>('Employee');
  const [reportingManagerId, setReportingManagerId] = useState<string>('EMP-001');
  const [dateOfJoining, setDateOfJoining] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState<EmployeeStatus>('Active');
  const [isManager, setIsManager] = useState(false);
  const [hasCrmAccess, setHasCrmAccess] = useState(false);
  const [isAccountsStaff, setIsAccountsStaff] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = FirestoreEngine.subscribeCollection<any>('app_settings', (items) => {
      const schemaDoc = items.find((i) => i.id === 'employee_form_schema');
      if (schemaDoc && Array.isArray(schemaDoc.fields)) {
        const sorted = [...schemaDoc.fields].sort((a, b) => a.order - b.order);
        setFormFields(sorted);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (editingEmployee) {
      setEcode(editingEmployee.ecode);
      setName(editingEmployee.name);
      setEmail(editingEmployee.email);
      setDesignation(editingEmployee.designation);
      setDepartment(editingEmployee.department);
      setVertical(editingEmployee.vertical);
      setLevel(editingEmployee.level);
      setRole(editingEmployee.role);
      setReportingManagerId(editingEmployee.reportingManagerId || '');
      setDateOfJoining(editingEmployee.dateOfJoining);
      setStatus(editingEmployee.status);
      setIsManager(editingEmployee.isManager);
      setHasCrmAccess(editingEmployee.hasCrmAccess);
      setIsAccountsStaff(Boolean(editingEmployee.isAccountsStaff));
      setMustChangePassword(Boolean(editingEmployee.mustChangePassword));
      setCustomValues(editingEmployee.customAttributes || {});
    } else {
      if (isOpen) {
        void synchronizeWithCentralDatabase();
      }
      setEcode(computeNextEcode(allEmployees));
      setName('');
      setEmail('');
      setTempPassword('Welcome@123');
      setDesignation('');
      setDepartment('Engineering');
      setVertical('Enterprise SaaS');
      setLevel(3);
      setRole('Employee');
      setReportingManagerId('EMP-001');
      setDateOfJoining(new Date().toISOString().slice(0, 10));
      setStatus('Active');
      setIsManager(false);
      setHasCrmAccess(false);
      setIsAccountsStaff(false);
      setMustChangePassword(true);
      setCustomValues({});
    }
    setError('');
  }, [editingEmployee, isOpen, allEmployees.length]);

  const handleRoleLevelPreset = (selectedRole: CorporateRole, selectedLevel: number) => {
    setRole(selectedRole);
    setLevel(selectedLevel);
    if (selectedRole === 'Manager' || selectedRole === 'CEO' || selectedRole === 'Admin') {
      setIsManager(true);
    }
    if (selectedRole === 'Advisor' || selectedRole === 'CEO' || selectedRole === 'Admin') {
      setHasCrmAccess(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = normalizeIdentifier(email);
    if (!ecode.trim() || !name.trim() || !normalizedEmail || !designation.trim()) {
      setError('Please complete all mandatory identity and job detail fields.');
      return;
    }

    // Validate dynamic custom required fields
    const customFields = formFields.filter((f) => !f.isSystem);
    for (const cf of customFields) {
      if (cf.required && !customValues[cf.key]) {
        setError(`Mandatory custom field "${cf.label}" is required.`);
        return;
      }
    }

    // Check Circular Reporting Hierarchy
    const targetEmpId = editingEmployee ? editingEmployee.id : ecode.trim().toUpperCase();
    const circularCheck = PermissionsService.checkCircularReporting(
      targetEmpId,
      reportingManagerId,
      allEmployees
    );
    if (circularCheck.isCircular) {
      setError(
        `Circular Reporting Detected! Assigning "${reportingManagerId}" creates a reporting loop: ${circularCheck.chain.join(' → ')}`
      );
      return;
    }

    setSaving(true);
    try {
      await synchronizeWithCentralDatabase();
      if (editingEmployee) {
        const updatedEmp: Employee = {
          ...editingEmployee,
          ecode: ecode.trim().toUpperCase(),
          name: name.trim(),
          email: normalizedEmail,
          designation: designation.trim(),
          department,
          vertical,
          level,
          role,
          reportingManagerId,
          dateOfJoining,
          status,
          isManager,
          hasCrmAccess,
          isAssociate: level <= 2 && level > 0,
          isAccountsStaff,
          mustChangePassword,
          updatedAt: new Date().toISOString(),
          isCloudRecovered: false,
          customAttributes: customValues,
        };

        await FirestoreEngine.setDocument('employees', editingEmployee.id, updatedEmp);
        await AuditService.log({
          action: 'EMPLOYEE_UPDATED',
          actor: currentAdmin,
          targetId: editingEmployee.id,
          targetType: 'Employee',
          details: `Updated employee profile for ${updatedEmp.name} (${updatedEmp.ecode}), Level ${updatedEmp.level}, Role ${updatedEmp.role}.`,
        });
        showToast('success', 'Employee Updated', `${updatedEmp.name} (${updatedEmp.ecode}) saved.`);
        onClose();
        return;
      }

      // Check duplicate ecode against latest synced employees
      const latestEmployees = await FirestoreEngine.getCollection<Employee>('employees');
      if (latestEmployees.some((emp) => emp.ecode.toUpperCase() === ecode.trim().toUpperCase())) {
        setError(`Employee Code "${ecode.trim().toUpperCase()}" already exists.`);
        setSaving(false);
        return;
      }

      // Secondary App Pattern for Employee Creation
      const createdAuth = await AuthEngine.createEmployeeWithSecondaryApp(
        normalizedEmail,
        tempPassword,
        ecode.trim().toUpperCase()
      );

      const newEmployee: Employee = {
        id: createdAuth.uid,
        ecode: ecode.trim().toUpperCase(),
        name: name.trim(),
        email: createdAuth.email,
        designation: designation.trim(),
        department,
        vertical,
        level,
        role,
        reportingManagerId,
        dateOfJoining,
        status,
        isManager,
        hasCrmAccess,
        isAssociate: level <= 2 && level > 0,
        isAccountsStaff,
        mustChangePassword,
        passwordHash: tempPassword,
        updatedAt: new Date().toISOString(),
        isCloudRecovered: false,
        customAttributes: customValues,
        personal: {
          address: '',
          emergencyContactName: '',
          emergencyContactPhone: '',
          phone: '',
        },
        employment: {
          workLocation: 'Bengaluru HQ',
          probationPeriodMonths: level === 0 ? 6 : 3,
          noticePeriodDays: level >= 4 ? 60 : 30,
        },
        bank: {
          accountNumber: '',
          bankName: '',
          ifscCode: '',
          branchName: '',
        },
        legalIdentity: {
          panNumber: '',
          aadhaarNumber: '',
          uanNumber: '',
          passportNumber: '',
        },
      };

      await FirestoreEngine.setDocument('employees', newEmployee.id, newEmployee);

      // Initialize default Leave Balance for the new employee
      await FirestoreEngine.setDocument('showup_leave_balances', newEmployee.id, {
        id: newEmployee.id,
        employeeId: newEmployee.id,
        balances: {
          CL: 12,
          SL: 10,
          EL: 15,
          Optional: 3,
          Maternity: 180,
          Paternity: 15,
          'Comp Off': 2,
          LWP: 365,
        },
        lateMarksCount: 0,
        lateLeaveDeducted: 0,
        updatedAt: new Date().toISOString(),
      });

      await AuditService.log({
        action: 'EMPLOYEE_PROVISIONED',
        actor: currentAdmin,
        targetId: newEmployee.id,
        targetType: 'Employee',
        details: `Provisioned ${newEmployee.name} (${newEmployee.ecode}) via Secondary Firebase App. Role: ${newEmployee.role}, Level: ${newEmployee.level}, Email: ${newEmployee.email}.`,
      });

      await NotificationService.create({
        recipientId: newEmployee.id,
        title: 'Welcome to Grattitude Synergy Portal',
        message: `Your account (${newEmployee.ecode}) has been provisioned. Complete your profile and review your workspace.`,
        route: '/profile',
        actorName: currentAdmin.name,
      });

      showToast(
        'success',
        'Employee Account Provisioned',
        `${newEmployee.name} (${newEmployee.email}) created without interrupting Admin session.`
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to provision employee account.');
    } finally {
      setSaving(false);
    }
  };

  const customFields = formFields.filter((f) => !f.isSystem);
  const deptField = formFields.find((f) => f.key === 'department');
  const vertField = formFields.find((f) => f.key === 'vertical');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-sky-600" />
          <span>
            {editingEmployee
              ? `Edit Employee Profile — ${editingEmployee.ecode}`
              : 'Provision New Employee Account (Secondary Firebase App)'}
          </span>
        </div>
      }
      subtitle="Creates a Firebase Authentication identity in an isolated secondary app instance and initializes the Firestore Employee Master record."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-700 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Persona / Hierarchy Level Preset Selector (Strictly 6 Levels: Level 0 to Level 5) */}
        <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl">
          <div className="text-xs font-bold text-neutral-800 mb-2">
            Corporate Hierarchy Level Quick-Selector (6 Levels: Level 0 to Level 5)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleRoleLevelPreset('CEO', 5)}
              className={`px-3 py-2 text-left rounded-lg border text-xs transition-all cursor-pointer ${
                level === 5
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="font-bold">Level 5 — Executive Leadership</div>
              <div className="text-[10px] opacity-80">CEO / Advisor / Admin</div>
            </button>

            <button
              type="button"
              onClick={() => handleRoleLevelPreset('Manager', 4)}
              className={`px-3 py-2 text-left rounded-lg border text-xs transition-all cursor-pointer ${
                level === 4
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="font-bold">Level 4 — Manager</div>
              <div className="text-[10px] opacity-80">Team Hub, Approvals & 1:1s</div>
            </button>

            <button
              type="button"
              onClick={() => {
                handleRoleLevelPreset('Employee', 3);
                setHasCrmAccess(true);
              }}
              className={`px-3 py-2 text-left rounded-lg border text-xs transition-all cursor-pointer ${
                level === 3
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="font-bold">Level 3 — Senior Specialist</div>
              <div className="text-[10px] opacity-80">15-KPI + Connect CRM Access</div>
            </button>

            <button
              type="button"
              onClick={() => {
                handleRoleLevelPreset('Employee', 2);
                setHasCrmAccess(false);
              }}
              className={`px-3 py-2 text-left rounded-lg border text-xs transition-all cursor-pointer ${
                level === 2
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="font-bold">Level 2 — Associate</div>
              <div className="text-[10px] opacity-80">15-KPI Self-Service</div>
            </button>

            <button
              type="button"
              onClick={() => {
                handleRoleLevelPreset('Employee', 1);
                setHasCrmAccess(false);
              }}
              className={`px-3 py-2 text-left rounded-lg border text-xs transition-all cursor-pointer ${
                level === 1
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="font-bold">Level 1 — Junior Associate</div>
              <div className="text-[10px] opacity-80">15-KPI Entry Track</div>
            </button>

            <button
              type="button"
              onClick={() => {
                handleRoleLevelPreset('Employee', 0);
                setHasCrmAccess(false);
                setIsManager(false);
              }}
              className={`px-3 py-2 text-left rounded-lg border text-xs transition-all cursor-pointer ${
                level === 0
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="font-bold">Level 0 — Intern</div>
              <div className="text-[10px] opacity-80">Roadmaps, OKRs & Discussions</div>
            </button>
          </div>
        </div>

        {/* SECTION 1: IDENTITY */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-1.5 mb-3">
            1. Identity & Authentication Credentials
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Employee Code (E-Code) *
              </label>
              <input
                type="text"
                required
                disabled={Boolean(editingEmployee)}
                value={ecode}
                onChange={(e) => setEcode(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg disabled:bg-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Full Legal Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Official Email / Username *
              </label>
              <input
                type="text"
                required
                disabled={Boolean(editingEmployee)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="firstname.lastname or firstname.lastname@grattitude.in"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg disabled:bg-neutral-100"
              />
              {email && !email.includes('@') && (
                <span className="text-[10px] font-mono text-sky-700">
                  Resolves to: {normalizeIdentifier(email)}
                </span>
              )}
            </div>
          </div>

          {!editingEmployee && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Initial Provisioned Password *
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-neutral-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mustChangePassword}
                    onChange={(e) => setMustChangePassword(e.target.checked)}
                    className="rounded border-neutral-300"
                  />
                  <span>Require password change on first login (MustChangePasswordModal)</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: JOB DETAILS */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-1.5 mb-3">
            2. Job Details & Reporting Hierarchy
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Designation / Title *
              </label>
              <input
                type="text"
                required
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="e.g. Engineering Manager"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Department *
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                {(
                  deptField?.options || [
                    'Engineering',
                    'Marketing',
                    'Operations',
                    'Business Development',
                    'Finance & Accounts',
                    'Human Resources',
                    'Executive Administration',
                  ]
                ).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Business Vertical *
              </label>
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                {(
                  vertField?.options || [
                    'Enterprise SaaS',
                    'Cloud & Platform',
                    'Growth & Revenue',
                    'Corporate Shared Services',
                    'Strategic Advisory',
                  ]
                ).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Hierarchy Level (0 to 5) *
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value={0}>Level 0 — Graduate Intern</option>
                <option value={1}>Level 1 — Junior Associate</option>
                <option value={2}>Level 2 — Associate</option>
                <option value={3}>Level 3 — Senior Specialist</option>
                <option value={4}>Level 4 — Manager</option>
                <option value={5}>Level 5 — Executive / Admin / CEO / Advisor</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Corporate Role *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as CorporateRole)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="Employee">Employee (or Intern if Level 0)</option>
                <option value="Manager">Manager</option>
                <option value="CEO">CEO</option>
                <option value="Advisor">Advisor</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Reporting Manager (Circular Guarded)
              </label>
              <select
                value={reportingManagerId}
                onChange={(e) => setReportingManagerId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="">-- None (Top of Hierarchy) --</option>
                {allEmployees
                  .filter((emp) => !editingEmployee || emp.id !== editingEmployee.id)
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.ecode} • L{emp.level} {emp.role})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Date of Joining *
              </label>
              <input
                type="date"
                required
                value={dateOfJoining}
                onChange={(e) => setDateOfJoining(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Employment Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
                <option value="Exited">Exited</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 3: ACCESS FLAGS */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-1.5 mb-3">
            3. Module & RBAC Access Flags
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-start gap-2.5 p-3 border border-neutral-200 rounded-lg bg-neutral-50 cursor-pointer">
              <input
                type="checkbox"
                checked={hasCrmAccess}
                onChange={(e) => setHasCrmAccess(e.target.checked)}
                className="mt-0.5 rounded border-neutral-300"
              />
              <div>
                <div className="text-xs font-bold text-neutral-900">
                  Connect (CRM) Access
                </div>
                <div className="text-[11px] text-neutral-500">
                  Enables `/connect` deal pipeline & sales dashboard.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 border border-neutral-200 rounded-lg bg-neutral-50 cursor-pointer">
              <input
                type="checkbox"
                checked={isManager}
                onChange={(e) => setIsManager(e.target.checked)}
                className="mt-0.5 rounded border-neutral-300"
              />
              <div>
                <div className="text-xs font-bold text-neutral-900">
                  People Manager Authority
                </div>
                <div className="text-[11px] text-neutral-500">
                  Can receive direct reports & approve leave/scorecards.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 border border-neutral-200 rounded-lg bg-neutral-50 cursor-pointer">
              <input
                type="checkbox"
                checked={isAccountsStaff}
                onChange={(e) => setIsAccountsStaff(e.target.checked)}
                className="mt-0.5 rounded border-neutral-300"
              />
              <div>
                <div className="text-xs font-bold text-neutral-900">
                  Accounts / Statutory Verifier
                </div>
                <div className="text-[11px] text-neutral-500">
                  Permits viewing statutory PAN, Aadhaar, UAN & Bank info.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* SECTION 4: DYNAMIC CUSTOM ATTRIBUTES (FROM EMPLOYEE FORM BUILDER) */}
        {customFields.length > 0 && (
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-200 pb-1.5 mb-3">
              4. Custom Onboarding Attributes (Configured via Form Builder)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {customFields.map((field) => (
                <div key={field.id}>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    {field.label} {field.required && '*'}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      value={customValues[field.key] || ''}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
                    >
                      <option value="">-- Select --</option>
                      {(field.options || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'boolean' ? (
                    <label className="flex items-center gap-2 text-xs py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(customValues[field.key])}
                        onChange={(e) =>
                          setCustomValues((prev) => ({
                            ...prev,
                            [field.key]: e.target.checked,
                          }))
                        }
                      />
                      <span>Enabled</span>
                    </label>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      rows={2}
                      value={customValues[field.key] || ''}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={customValues[field.key] || ''}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-neutral-200 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={saving}
            icon={<ShieldCheck className="w-4 h-4" />}
          >
            {saving
              ? 'Provisioning...'
              : editingEmployee
              ? 'Save Employee Changes'
              : 'Provision Employee Account'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
