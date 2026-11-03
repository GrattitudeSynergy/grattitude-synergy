import React, { useState, useEffect } from 'react';
import {
  User,
  Briefcase,
  Landmark,
  FileText,
  PhoneCall,
  Save,
  Lock,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Tabs,
  Table,
  EmptyState,
  useToast,
} from '../components/DesignSystem';
import { FirestoreEngine } from '../firebase/firebaseConfig';
import { PermissionsService } from '../services/permissionsService';
import { AuditService } from '../services/auditService';
import type {
  Employee,
  CompensationLockConfig,
  ShowupDocument,
} from '../types';

export const MyProfilePage: React.FC<{
  currentEmployee: Employee;
}> = ({ currentEmployee }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<
    'personal' | 'employment' | 'bank-statutory' | 'documents' | 'emergency'
  >('personal');

  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>(currentEmployee.id);
  const [lockConfig, setLockConfig] = useState<CompensationLockConfig | null>(null);
  const [documents, setDocuments] = useState<ShowupDocument[]>([]);

  // Form states for selected employee
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [uanNumber, setUanNumber] = useState('');
  const [passportNumber, setPassportNumber] = useState('');

  useEffect(() => {
    const unsubEmp = FirestoreEngine.subscribeCollection<Employee>('employees', (items) => {
      setAllEmployees(items);
    });
    const unsubLock = FirestoreEngine.subscribeCollection<CompensationLockConfig>(
      'showup_compensation_lock',
      (items) => {
        const found = items.find((i) => i.id === 'global_lock');
        if (found) setLockConfig(found);
      }
    );
    const unsubDocs = FirestoreEngine.subscribeCollection<ShowupDocument>(
      'showup_documents',
      (items) => {
        setDocuments(items);
      }
    );
    return () => {
      unsubEmp();
      unsubLock();
      unsubDocs();
    };
  }, []);

  const targetEmployee =
    allEmployees.find((e) => e.id === selectedEmpId) || currentEmployee;

  useEffect(() => {
    setPhone(targetEmployee.personal?.phone || '');
    setAddress(targetEmployee.personal?.address || '');
    setEmergencyName(targetEmployee.personal?.emergencyContactName || '');
    setEmergencyPhone(targetEmployee.personal?.emergencyContactPhone || '');
    setWorkLocation(targetEmployee.employment?.workLocation || '');
    setAccountNumber(targetEmployee.bank?.accountNumber || '');
    setBankName(targetEmployee.bank?.bankName || '');
    setIfscCode(targetEmployee.bank?.ifscCode || '');
    setBranchName(targetEmployee.bank?.branchName || '');
    setPanNumber(targetEmployee.legalIdentity?.panNumber || '');
    setAadhaarNumber(targetEmployee.legalIdentity?.aadhaarNumber || '');
    setUanNumber(targetEmployee.legalIdentity?.uanNumber || '');
    setPassportNumber(targetEmployee.legalIdentity?.passportNumber || '');
  }, [targetEmployee]);

  // Calculate Profile Completeness Percentage (12 key attributes)
  const completenessChecks = [
    Boolean(targetEmployee.name),
    Boolean(targetEmployee.email),
    Boolean(targetEmployee.designation),
    Boolean(phone.trim()),
    Boolean(address.trim()),
    Boolean(emergencyName.trim()),
    Boolean(emergencyPhone.trim()),
    Boolean(workLocation.trim()),
    Boolean(accountNumber.trim()),
    Boolean(ifscCode.trim()),
    Boolean(panNumber.trim()),
    Boolean(aadhaarNumber.trim()),
  ];
  const completedCount = completenessChecks.filter(Boolean).length;
  const completenessPct = Math.round(
    (completedCount / completenessChecks.length) * 100
  );

  const canViewStatutory = PermissionsService.canViewBankAndStatutory(
    currentEmployee,
    targetEmployee
  );
  const isLockedByCompensationPolicy =
    PermissionsService.isCompensationLockedForViewer(
      currentEmployee,
      targetEmployee.id,
      lockConfig
    );
  const canEditProfile =
    currentEmployee.id === targetEmployee.id ||
    currentEmployee.role === 'Admin' ||
    Boolean(currentEmployee.isAccountsStaff);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditProfile) return;

    const updated: Employee = {
      ...targetEmployee,
      personal: {
        phone: phone.trim(),
        address: address.trim(),
        emergencyContactName: emergencyName.trim(),
        emergencyContactPhone: emergencyPhone.trim(),
      },
      employment: {
        ...targetEmployee.employment,
        workLocation: workLocation.trim(),
      },
      bank: canViewStatutory
        ? {
            accountNumber: accountNumber.trim(),
            bankName: bankName.trim(),
            ifscCode: ifscCode.trim().toUpperCase(),
            branchName: branchName.trim(),
          }
        : targetEmployee.bank,
      legalIdentity: canViewStatutory
        ? {
            panNumber: panNumber.trim().toUpperCase(),
            aadhaarNumber: aadhaarNumber.trim(),
            uanNumber: uanNumber.trim(),
            passportNumber: passportNumber.trim().toUpperCase(),
          }
        : targetEmployee.legalIdentity,
    };

    await FirestoreEngine.setDocument('employees', targetEmployee.id, updated);
    await AuditService.log({
      action: 'PROFILE_UPDATED',
      actor: currentEmployee,
      targetId: targetEmployee.id,
      targetType: 'Employee',
      details: `Updated profile details for ${targetEmployee.name} (${targetEmployee.ecode}). Completeness: ${completenessPct}%.`,
    });
    showToast(
      'success',
      'Profile Saved',
      `Profile records for ${targetEmployee.name} updated.`
    );
  };

  const empDocuments = documents.filter((d) => d.employeeId === targetEmployee.id);
  const managerRecord = allEmployees.find(
    (m) => m.id === targetEmployee.reportingManagerId
  );

  return (
    <div className="space-y-5">
      {/* Top Banner & Completeness Meter */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-neutral-900 text-white font-extrabold text-lg flex items-center justify-center">
              {targetEmployee.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900">
                  {targetEmployee.name}
                </h2>
                <Badge variant="neutral" className="font-mono">
                  {targetEmployee.ecode}
                </Badge>
                <Badge variant="info">
                  Level {targetEmployee.level} • {targetEmployee.role}
                </Badge>
                <Badge
                  variant={
                    targetEmployee.status === 'Active' ? 'success' : 'warning'
                  }
                >
                  {targetEmployee.status}
                </Badge>
              </div>
              <p className="text-xs text-neutral-600 mt-1">
                {targetEmployee.designation} • {targetEmployee.department} (
                {targetEmployee.vertical})
              </p>
              <p className="text-xs font-mono text-neutral-500 mt-0.5">
                {targetEmployee.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Employee Switcher for Admin / Accounts / Manager inspection */}
            {allEmployees.length > 1 && (
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">
                  Inspect Directory Profile
                </label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-neutral-50"
                >
                  {allEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.ecode} — {e.name} ({e.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Profile Completeness Indicator */}
            <div className="w-52 p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-neutral-700">Profile Completeness</span>
                <span
                  className={
                    completenessPct === 100
                      ? 'text-emerald-700'
                      : 'text-sky-700'
                  }
                >
                  {completenessPct}%
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-200 rounded-sm overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-all ${
                    completenessPct === 100 ? 'bg-emerald-600' : 'bg-sky-600'
                  }`}
                  style={{ width: `${completenessPct}%` }}
                />
              </div>
              <div className="text-[10px] text-neutral-500 mt-1">
                {completedCount} of {completenessChecks.length} attributes verified
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 5-Tab Profile Navigation */}
      <Tabs
        tabs={[
          {
            id: 'personal',
            label: 'Personal Information',
            icon: <User className="w-3.5 h-3.5" />,
          },
          {
            id: 'employment',
            label: 'Employment Details',
            icon: <Briefcase className="w-3.5 h-3.5" />,
          },
          {
            id: 'bank-statutory',
            label: 'Bank & Statutory Tax Identifiers',
            icon: <Landmark className="w-3.5 h-3.5" />,
          },
          {
            id: 'documents',
            label: 'Documents',
            icon: <FileText className="w-3.5 h-3.5" />,
            badge: empDocuments.length,
          },
          {
            id: 'emergency',
            label: 'Emergency Contacts',
            icon: <PhoneCall className="w-3.5 h-3.5" />,
          },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      <form onSubmit={handleSaveProfile}>
        {activeTab === 'personal' && (
          <Card
            title="Personal Information"
            subtitle="Contact details and residential address on file with People Operations."
            action={
              canEditProfile && (
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={<Save className="w-4 h-4" />}
                >
                  Save Changes
                </Button>
              )
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Full Legal Name
                </label>
                <input
                  type="text"
                  disabled
                  value={targetEmployee.name}
                  className="w-full px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Official Corporate Email
                </label>
                <input
                  type="text"
                  disabled
                  value={targetEmployee.email}
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-200 rounded-lg bg-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Primary Mobile Number
                </label>
                <input
                  type="text"
                  disabled={!canEditProfile}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98450 00000"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Residential Address
                </label>
                <input
                  type="text"
                  disabled={!canEditProfile}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Full street address, city, state, PIN"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                />
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'employment' && (
          <Card
            title="Employment & Organizational Placement"
            subtitle="Official role, vertical, hierarchy level, and probation/notice terms."
            action={
              canEditProfile && (
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={<Save className="w-4 h-4" />}
                >
                  Save Changes
                </Button>
              )
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[11px] text-neutral-500">Employee Code</div>
                <div className="text-sm font-mono font-bold text-neutral-900 mt-0.5">
                  {targetEmployee.ecode}
                </div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[11px] text-neutral-500">Department & Vertical</div>
                <div className="text-sm font-bold text-neutral-900 mt-0.5">
                  {targetEmployee.department} • {targetEmployee.vertical}
                </div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[11px] text-neutral-500">Reporting Manager</div>
                <div className="text-sm font-bold text-neutral-900 mt-0.5">
                  {managerRecord
                    ? `${managerRecord.name} (${managerRecord.ecode})`
                    : 'Executive Root (None)'}
                </div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[11px] text-neutral-500">Date of Joining</div>
                <div className="text-sm font-mono font-bold text-neutral-900 mt-0.5">
                  {targetEmployee.dateOfJoining}
                </div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[11px] text-neutral-500">Probation Period</div>
                <div className="text-sm font-bold text-neutral-900 mt-0.5">
                  {targetEmployee.employment?.probationPeriodMonths ?? 3} Months
                </div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                <div className="text-[11px] text-neutral-500">Notice Period</div>
                <div className="text-sm font-bold text-neutral-900 mt-0.5">
                  {targetEmployee.employment?.noticePeriodDays ?? 30} Days
                </div>
              </div>
            </div>

            <div className="mt-4 max-w-md">
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Primary Work Location
              </label>
              <input
                type="text"
                disabled={!canEditProfile}
                value={workLocation}
                onChange={(e) => setWorkLocation(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg disabled:bg-neutral-100"
              />
            </div>
          </Card>
        )}

        {activeTab === 'bank-statutory' && (
          <Card
            title="Bank & Statutory Tax Identifiers (Strict RBAC)"
            subtitle="PAN, Aadhaar, UAN, Bank Account, and IFSC. Viewable and editable ONLY by the employee themselves, Admin, or designated Accounts staff."
            action={
              canViewStatutory &&
              !isLockedByCompensationPolicy && (
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={<Save className="w-4 h-4" />}
                >
                  Save Statutory Records
                </Button>
              )
            }
          >
            {!canViewStatutory ? (
              <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                <Lock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-rose-900">
                    Strict RBAC Confidentiality Barrier
                  </h4>
                  <p className="text-xs text-rose-700 mt-1">
                    Bank accounts and statutory tax identifiers (PAN, Aadhaar, UAN) for{' '}
                    <strong>{targetEmployee.name}</strong> are restricted. Only the employee themselves, Corporate Admin, or designated Finance & Accounts staff may view or edit these records.
                  </p>
                </div>
              </div>
            ) : isLockedByCompensationPolicy ? (
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    Compensation & Banking Lock Active
                  </h4>
                  <p className="text-xs text-amber-800 mt-1">
                    {lockConfig?.lockMessage}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    Authorized RBAC Access Verified: You have permission to view and update statutory tax & banking identifiers.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. HDFC Bank Ltd"
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="50100XXXXXXXXX"
                      className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value)}
                      placeholder="HDFC0001204"
                      className="w-full px-3 py-2 text-xs font-mono uppercase border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="Corporate Branch"
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Permanent Account Number (PAN)
                    </label>
                    <input
                      type="text"
                      value={panNumber}
                      onChange={(e) => setPanNumber(e.target.value)}
                      placeholder="ABCDE1234F"
                      className="w-full px-3 py-2 text-xs font-mono uppercase border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Aadhaar Number
                    </label>
                    <input
                      type="text"
                      value={aadhaarNumber}
                      onChange={(e) => setAadhaarNumber(e.target.value)}
                      placeholder="XXXX-XXXX-XXXX"
                      className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      EPFO UAN Number
                    </label>
                    <input
                      type="text"
                      value={uanNumber}
                      onChange={(e) => setUanNumber(e.target.value)}
                      placeholder="100XXXXXXXXX"
                      className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Passport Number
                    </label>
                    <input
                      type="text"
                      value={passportNumber}
                      onChange={(e) => setPassportNumber(e.target.value)}
                      placeholder="ZXXXXXXX"
                      className="w-full px-3 py-2 text-xs font-mono uppercase border border-neutral-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {activeTab === 'documents' && (
          <Card
            title="Verified Employee Document Repository"
            subtitle="Synchronized with Show Up Document Vault (showup_documents)."
          >
            {empDocuments.length === 0 ? (
              <EmptyState
                title="No Documents Uploaded for This Employee"
                description="Upload Education Certificates, Employment/Legal contracts, or Identity/Tax proofs in the Show Up → Document Vault tab."
              />
            ) : (
              <Table
                headers={[
                  'Document Title',
                  'Category',
                  'File Name',
                  'Uploaded At',
                  'Verification Status',
                ]}
              >
                {empDocuments.map((doc) => (
                  <tr key={doc.id}>
                    <td className="px-4 py-3 text-xs font-bold text-neutral-900">
                      {doc.title}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{doc.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-neutral-600">
                      {doc.fileName} ({doc.fileSizeKb} KB)
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          doc.status === 'Verified'
                            ? 'success'
                            : doc.status === 'Rejected'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {doc.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )}

        {activeTab === 'emergency' && (
          <Card
            title="Emergency Contact Registry"
            subtitle="Immediate next-of-kin contact details for workplace emergencies."
            action={
              canEditProfile && (
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={<Save className="w-4 h-4" />}
                >
                  Save Emergency Contact
                </Button>
              )
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Emergency Contact Name & Relationship
                </label>
                <input
                  type="text"
                  disabled={!canEditProfile}
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  placeholder="e.g. Rajesh Sharma (Spouse)"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Emergency Contact Phone Number
                </label>
                <input
                  type="text"
                  disabled={!canEditProfile}
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="+91 98450 XXXXX"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                />
              </div>
            </div>
          </Card>
        )}
      </form>
    </div>
  );
};
