import React, { useState } from 'react';
import { Building2, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { AuthEngine, normalizeIdentifier } from '../firebase/firebaseConfig';
import { DEFAULT_ADMIN_PASSWORD, SEED_ADMIN_EMPLOYEE } from '../seedData';
import { Button } from '../components/DesignSystem';

// ============================================================================
// LOGIN SCREEN (Standard Email/Username + Password Form — Light Mode Only)
// ============================================================================
// - Identifier Normalization: Users can log in using either their full email
//   or short username. If no `@` is provided, automatically resolves against
//   `@grattitude.in`.
// - No demo quick-login persona bar, since only EMP-001 (Admin) is pre-seeded.

export const LoginScreen: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resolvedPreview = identifier.trim() ? normalizeIdentifier(identifier) : '';

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !password) {
      setError('Please enter both your email/username and password.');
      return;
    }

    setLoading(true);
    try {
      await AuthEngine.signIn(identifier, password);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
        {/* Brand Header (Light Mode) */}
        <div className="bg-neutral-50 px-7 py-6 text-neutral-900 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center font-extrabold text-base tracking-tighter shadow-xs">
              GS
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-neutral-900">
                Grattitude Synergy
              </h1>
              <p className="text-xs text-neutral-500">
                Employee Enterprise Portal • v1.0.0
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSignIn} className="p-7 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">
              Corporate Single Sign-On
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Sign in with your corporate email or short username. Short usernames automatically resolve to <code className="font-mono text-sky-700 font-semibold">@grattitude.in</code>.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1.5">
              Official Email or Username
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="firstname.lastname@grattitude.in or username"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white text-neutral-900 border border-neutral-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
            {resolvedPreview && !identifier.includes('@') && (
              <p className="text-[11px] text-sky-700 font-mono mt-1">
                Normalized identity: {resolvedPreview}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white text-neutral-900 border border-neutral-300 rounded-lg focus:outline-none focus:border-sky-600"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-2.5"
            disabled={loading}
            icon={<ArrowRight className="w-4 h-4" />}
          >
            {loading ? 'Authenticating Session...' : 'Sign In to Workspace'}
          </Button>

          {/* Bootstrap Admin Reference Notice */}
          <div className="pt-4 border-t border-neutral-200">
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-600 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Pre-Seeded Bootstrap Admin (EMP-001)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier(SEED_ADMIN_EMPLOYEE.email);
                    setPassword(DEFAULT_ADMIN_PASSWORD);
                  }}
                  className="text-[11px] font-bold text-sky-700 hover:underline cursor-pointer"
                >
                  Fill Admin Credentials
                </button>
              </div>
              <div className="font-mono text-[11px] text-neutral-600">
                Email: {SEED_ADMIN_EMPLOYEE.email}
              </div>
              <div className="font-mono text-[11px] text-neutral-600">
                Default Password: {DEFAULT_ADMIN_PASSWORD}
              </div>
            </div>
          </div>
        </form>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
        <Building2 className="w-3.5 h-3.5" />
        <span>Grattitude Synergy — Persistent Multi-Tab Firestore Engine</span>
      </div>
    </div>
  );
};
