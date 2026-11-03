import React, { useState } from 'react';
import { KeyRound, ShieldCheck, AlertCircle } from 'lucide-react';
import { Modal, Button } from '../components/DesignSystem';
import { AuthEngine, FirestoreEngine } from '../firebase/firebaseConfig';
import { AuditService } from '../services/auditService';
import type { Employee } from '../types';

export const MustChangePasswordModal: React.FC<{
  employee: Employee;
  onPasswordUpdated: () => void;
}> = ({ employee, onPasswordUpdated }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await AuthEngine.updateCurrentUserPassword(newPassword);
      await FirestoreEngine.updateDocument<Employee>('employees', employee.id, {
        mustChangePassword: false,
      });
      await AuditService.log({
        action: 'FIRST_LOGIN_PASSWORD_CHANGED',
        actor: employee,
        targetId: employee.id,
        targetType: 'Employee',
        details: `Employee ${employee.ecode} (${employee.name}) completed mandatory first-login password update.`,
      });
      onPasswordUpdated();
    } catch (err: any) {
      setError(err?.message || 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={() => {}}
      preventClose={true}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-600" />
          <span>Mandatory First-Login Security Update</span>
        </div>
      }
      subtitle="Corporate security policy requires changing your temporary provisioned password before entering the workspace."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
          Welcome, <strong>{employee.name}</strong> (<span className="font-mono">{employee.ecode}</span>). Your account was provisioned by the Administrator with a temporary credential. Set a permanent password below to unlock your portal modules.
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-700 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-1">
            New Permanent Password
          </label>
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 6 characters"
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-1">
            Confirm New Password
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={saving}
            icon={<ShieldCheck className="w-4 h-4" />}
          >
            {saving ? 'Updating Credentials...' : 'Update Password & Enter Portal'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
