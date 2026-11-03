import React from 'react';
import { ShieldAlert, LogOut, Lock } from 'lucide-react';
import { Button } from '../components/DesignSystem';

export const UnmappedUserScreen: React.FC<{
  email: string;
  uid: string;
  onSignOut: () => void;
}> = ({ email, uid, onSignOut }) => {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-xl p-8 shadow-md">
        <div className="w-12 h-12 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-5">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-600 mb-1">
          <Lock className="w-3.5 h-3.5" />
          RBAC Directory Barrier
        </div>
        <h1 className="text-xl font-bold text-neutral-900">
          Unmapped Corporate Identity
        </h1>
        <p className="text-xs text-neutral-600 mt-2.5 leading-relaxed">
          Your Firebase Authentication credentials (<span className="font-mono text-sky-700 font-semibold">{email}</span>) were verified, but no matching employee master record exists in the <code className="text-amber-700 font-semibold">employees</code> directory collection.
        </p>
        <div className="mt-4 p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-neutral-600 space-y-1">
          <div>UID: {uid}</div>
          <div>STATUS: ACCESS_DENIED_UNMAPPED</div>
        </div>
        <p className="text-xs text-neutral-600 mt-4">
          Please contact the Corporate Super Admin (<span className="text-neutral-900 font-semibold">EMP-001</span>) to provision your Employee Master Directory profile.
        </p>
        <div className="mt-6">
          <Button
            variant="danger"
            className="w-full"
            icon={<LogOut className="w-4 h-4" />}
            onClick={onSignOut}
          >
            Sign Out of Session
          </Button>
        </div>
      </div>
    </div>
  );
};
