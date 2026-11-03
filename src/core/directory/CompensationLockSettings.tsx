import React, { useState, useEffect } from 'react';
import { Lock, Unlock, ShieldAlert, Save, Users } from 'lucide-react';
import { Card, Button, Badge, useToast } from '../components/DesignSystem';
import { FirestoreEngine } from '../firebase/firebaseConfig';
import { AuditService } from '../services/auditService';
import { SEED_COMPENSATION_LOCK } from '../seedData';
import type {
  CompensationLockConfig,
  CompensationLockMode,
  Employee,
} from '../types';

export const CompensationLockSettings: React.FC<{
  currentAdmin: Employee;
  allEmployees: Employee[];
}> = ({ currentAdmin, allEmployees }) => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<CompensationLockConfig>(SEED_COMPENSATION_LOCK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = FirestoreEngine.subscribeCollection<CompensationLockConfig>(
      'showup_compensation_lock',
      (items) => {
        const found = items.find((i) => i.id === 'global_lock');
        if (found) setConfig(found);
      }
    );
    return () => unsub();
  }, []);

  const toggleEmployeeSelection = (empId: string) => {
    setConfig((prev) => {
      const exists = prev.selectedEmployeeIds.includes(empId);
      const next = exists
        ? prev.selectedEmployeeIds.filter((id) => id !== empId)
        : [...prev.selectedEmployeeIds, empId];
      return { ...prev, selectedEmployeeIds: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated: CompensationLockConfig = {
        ...config,
        updatedBy: currentAdmin.id,
        updatedAt: new Date().toISOString(),
      };
      await FirestoreEngine.setDocument(
        'showup_compensation_lock',
        'global_lock',
        updated
      );
      await AuditService.log({
        action: 'COMPENSATION_LOCK_UPDATED',
        actor: currentAdmin,
        targetId: 'global_lock',
        targetType: 'CompensationLock',
        details: `Set compensation lock mode to "${updated.mode.toUpperCase()}" (${updated.selectiveModeType}, ${updated.selectedEmployeeIds.length} selected employees).`,
      });
      showToast(
        'success',
        'Compensation Lock Saved',
        `Protection mode is now "${updated.mode.toUpperCase()}".`
      );
    } finally {
      setSaving(false);
    }
  };

  const modes: Array<{
    id: CompensationLockMode;
    title: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'unlocked',
      title: 'Unlocked (Standard Access)',
      description:
        'Employees can view their own CTC breakdown, payslips, and statutory bank identifiers per standard RBAC.',
      icon: <Unlock className="w-4 h-4 text-emerald-600" />,
    },
    {
      id: 'selective',
      title: 'Selective Protection (Whitelist / Blacklist)',
      description:
        'Restrict or allow compensation access for specific designated employees.',
      icon: <Users className="w-4 h-4 text-amber-600" />,
    },
    {
      id: 'all',
      title: 'Complete Lock (Freeze All Non-Admins)',
      description:
        'Hides sensitive salary/CTC and banking details from all non-admin viewers across Show Up and Profile modules.',
      icon: <Lock className="w-4 h-4 text-rose-600" />,
    },
  ];

  return (
    <Card
      title="Compensation Access & Lock Governance (showup_compensation_lock)"
      subtitle="Control visibility of sensitive CTC structures, payslips, and banking details across the organization."
      action={
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          icon={<Save className="w-4 h-4" />}
          onClick={handleSave}
        >
          {saving ? 'Applying Policy...' : 'Save Lock Configuration'}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* 3 Protection Modes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {modes.map((m) => {
            const active = config.mode === m.id;
            return (
              <div
                key={m.id}
                onClick={() => setConfig((prev) => ({ ...prev, mode: m.id }))}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  active
                    ? 'border-sky-600 bg-sky-50/70 text-neutral-900 shadow-xs'
                    : 'border-neutral-200 bg-neutral-50 hover:bg-white text-neutral-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-white border border-neutral-200">
                    {m.icon}
                  </div>
                  {active && <Badge variant="info">ACTIVE MODE</Badge>}
                </div>
                <h4 className="text-xs font-bold mt-2">{m.title}</h4>
                <p className="text-xs mt-1 leading-relaxed text-neutral-600">
                  {m.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Selective Whitelist / Blacklist Controls */}
        {config.mode === 'selective' && (
          <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-neutral-900">
                  Selective Enforcement Mode
                </h4>
                <p className="text-xs text-neutral-600">
                  Choose whether selected employees are exempted (Whitelist) or restricted (Blacklist).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({ ...prev, selectiveModeType: 'blacklist' }))
                  }
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                    config.selectiveModeType === 'blacklist'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-neutral-700 border-neutral-300'
                  }`}
                >
                  Blacklist (Lock Selected)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({ ...prev, selectiveModeType: 'whitelist' }))
                  }
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                    config.selectiveModeType === 'whitelist'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-neutral-700 border-neutral-300'
                  }`}
                >
                  Whitelist (Unlock Only Selected)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {allEmployees.map((emp) => {
                const checked = config.selectedEmployeeIds.includes(emp.id);
                return (
                  <label
                    key={emp.id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer ${
                      checked
                        ? 'bg-white border-neutral-900 font-semibold'
                        : 'bg-white/60 border-neutral-200 text-neutral-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEmployeeSelection(emp.id)}
                    />
                    <div className="truncate">
                      <span className="font-mono text-[11px] text-neutral-500 mr-1.5">
                        {emp.ecode}
                      </span>
                      <span>{emp.name}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Configurable Lock Message */}
        <div>
          <label className="block text-xs font-bold text-neutral-800 mb-1.5">
            Configurable Lock Banner Message (Displayed to Restricted Users)
          </label>
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-2.5" />
            <textarea
              rows={2}
              value={config.lockMessage}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, lockMessage: e.target.value }))
              }
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900"
            />
          </div>
        </div>
      </div>
    </Card>
  );
};
