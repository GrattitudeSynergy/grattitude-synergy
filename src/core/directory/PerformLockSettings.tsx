import React, { useState, useEffect } from 'react';
import { Lock, Unlock, ShieldAlert, Save, Users, Target } from 'lucide-react';
import { Card, Button, Badge, useToast } from '../components/DesignSystem';
import { FirestoreEngine } from '../firebase/firebaseConfig';
import { AuditService } from '../services/auditService';
import { SEED_PERFORM_LOCK } from '../seedData';
import type {
  PerformLockConfig,
  PerformLockMode,
  Employee,
} from '../types';

export const PerformLockSettings: React.FC<{
  currentAdmin: Employee;
  allEmployees: Employee[];
}> = ({ currentAdmin, allEmployees }) => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<PerformLockConfig>(SEED_PERFORM_LOCK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = FirestoreEngine.subscribeCollection<PerformLockConfig>(
      'perform_config',
      (items) => {
        const found = items.find((i) => i.id === 'perform_lock');
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
      const updated: PerformLockConfig = {
        ...config,
        updatedBy: currentAdmin.id,
        updatedAt: new Date().toISOString(),
      };
      await FirestoreEngine.setDocument(
        'perform_config',
        'perform_lock',
        updated
      );
      await AuditService.log({
        action: 'PERFORM_MODULE_LOCK_UPDATED',
        actor: currentAdmin,
        targetId: 'perform_lock',
        targetType: 'PerformLock',
        details: `Set Perform module lock mode to "${updated.mode.toUpperCase()}" (${updated.selectiveModeType}, ${updated.selectedEmployeeIds.length} selected employees).`,
      });
      showToast(
        'success',
        'Perform Module Lock Saved',
        `Perform protection mode is now "${updated.mode.toUpperCase()}".`
      );
    } finally {
      setSaving(false);
    }
  };

  const modes: Array<{
    id: PerformLockMode;
    title: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'unlocked',
      title: 'Unlocked (Standard Appraisal Access)',
      description:
        'All employees, managers, and interns can access their Perform scorecards, KPIs, and OKR roadmaps normally.',
      icon: <Unlock className="w-4 h-4 text-emerald-600" />,
    },
    {
      id: 'selective',
      title: 'Selective Protection (Whitelist / Blacklist)',
      description:
        'Lock or unlock the Perform module for specific selected employees (e.g., freeze appraisals for a subset of staff).',
      icon: <Users className="w-4 h-4 text-amber-600" />,
    },
    {
      id: 'all',
      title: 'Complete Lock (Freeze All Non-Admins)',
      description:
        'Locks the entire Perform module (15-KPI scorecards, reviews, and intern tracks) for all non-admin employees.',
      icon: <Lock className="w-4 h-4 text-rose-600" />,
    },
  ];

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-sky-600" />
          <span>Perform Module Access & Lock Governance (perform_config/perform_lock)</span>
        </div>
      }
      subtitle="Control access to the Perform (KPI Appraisal & OKR) module for all employees or a selective whitelist/blacklist."
      action={
        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          icon={<Save className="w-4 h-4" />}
          onClick={handleSave}
        >
          {saving ? 'Applying Policy...' : 'Save Perform Lock'}
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
                  Selective Perform Module Enforcement
                </h4>
                <p className="text-xs text-neutral-600">
                  Choose whether selected employees are locked out (Blacklist) or the only ones permitted access (Whitelist).
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
                  Blacklist (Lock Selected Employees)
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
                        ? 'bg-white border-sky-600 font-semibold text-neutral-900'
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
                      <span className="text-[10px] text-neutral-400 ml-1">
                        ({emp.role})
                      </span>
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
            Configurable Perform Lock Banner Message (Displayed to Restricted Employees)
          </label>
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-2.5" />
            <textarea
              rows={2}
              value={config.lockMessage}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, lockMessage: e.target.value }))
              }
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-sky-600 bg-white"
            />
          </div>
        </div>
      </div>
    </Card>
  );
};
