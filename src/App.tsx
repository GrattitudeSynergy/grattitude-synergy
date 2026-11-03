import React, { useState, useEffect } from 'react';
import { AuthEngine, FirestoreEngine, type AuthSessionUser } from './core/firebase/firebaseConfig';
import { initializeSeedData } from './core/seedData';
import { FiscalService } from './core/services/fiscalService';
import { PermissionsService } from './core/services/permissionsService';
import { ErrorBoundary } from './core/components/ErrorBoundary';
import { ToastProvider } from './core/components/DesignSystem';
import { LoginScreen } from './core/auth/LoginScreen';
import { UnmappedUserScreen } from './core/auth/UnmappedUserScreen';
import { MustChangePasswordModal } from './core/auth/MustChangePasswordModal';
import { AppShell } from './core/components/AppShell';
import { EmployeeMasterList } from './core/directory/EmployeeMasterList';
import { MyProfilePage } from './core/directory/MyProfilePage';
import { PerformModule } from './modules/perform/PerformModule';
import { ShowUpModule } from './modules/showup/ShowUpModule';
import { ConnectModule } from './modules/connect/ConnectModule';
import type { Employee, AppRoute, Quarter } from './core/types';

export const App: React.FC = () => {
  const [bootstrapped, setBootstrapped] = useState(false);
  const [authUser, setAuthUser] = useState<AuthSessionUser | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('/perform');

  const initialFiscal = FiscalService.getInitialLocal();
  const [fiscalYear, setFiscalYear] = useState<string>(initialFiscal.fiscalYear);
  const [quarter, setQuarter] = useState<Quarter>(initialFiscal.quarter);

  useEffect(() => {
    let unsubAuth: (() => void) | null = null;
    let unsubEmp: (() => void) | null = null;
    let unsubFiscal: (() => void) | null = null;

    initializeSeedData().then(() => {
      setBootstrapped(true);
      unsubAuth = AuthEngine.onAuthStateChanged((user) => {
        setAuthUser(user);
      });
      unsubEmp = FirestoreEngine.subscribeCollection<Employee>(
        'employees',
        (items) => {
          setEmployees(items);
        }
      );
      unsubFiscal = FiscalService.subscribeFiscalContext((ctx) => {
        setFiscalYear(ctx.fiscalYear);
        setQuarter(ctx.quarter);
      });
    });

    return () => {
      if (unsubAuth) unsubAuth();
      if (unsubEmp) unsubEmp();
      if (unsubFiscal) unsubFiscal();
    };
  }, []);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-lg bg-sky-600 text-white font-extrabold flex items-center justify-center mx-auto">
            GS
          </div>
          <div className="text-sm font-bold text-neutral-900">
            Bootstrapping Grattitude Synergy Enterprise Portal...
          </div>
          <div className="text-xs text-neutral-500">
            Initializing Persistent Firestore Multi-Tab Cache & 75 Master KPIs
          </div>
        </div>
      </div>
    );
  }

  // 1. Unauthenticated -> Render Standard Login Screen
  if (!authUser) {
    return (
      <ErrorBoundary>
        <ToastProvider>
          <LoginScreen />
        </ToastProvider>
      </ErrorBoundary>
    );
  }

  // Resolve matching employee record in `employees` collection by UID or Email
  const currentEmployee =
    employees.find(
      (e) =>
        e.id.toLowerCase() === authUser.uid.toLowerCase() ||
        e.email.toLowerCase() === authUser.email.toLowerCase()
    ) || null;

  // 2. Unmapped User Barrier (UnmappedUserScreen.tsx)
  if (!currentEmployee) {
    return (
      <ErrorBoundary>
        <UnmappedUserScreen
          email={authUser.email}
          uid={authUser.uid}
          onSignOut={() => AuthEngine.signOut()}
        />
      </ErrorBoundary>
    );
  }

  // Ensure route is permitted for currentEmployee
  const safeRoute: AppRoute = PermissionsService.canAccessModule(
    currentEmployee,
    currentRoute
  )
    ? currentRoute
    : '/perform';

  return (
    <ErrorBoundary>
      <ToastProvider>
        {/* 3. First-Login Mandatory Password Reset Modal */}
        {currentEmployee.mustChangePassword && (
          <MustChangePasswordModal
            employee={currentEmployee}
            onPasswordUpdated={() => {}}
          />
        )}

        <AppShell
          currentEmployee={currentEmployee}
          currentRoute={safeRoute}
          onNavigate={(r) => setCurrentRoute(r)}
          fiscalYear={fiscalYear}
          quarter={quarter}
          onFiscalChange={(fy, q) => {
            setFiscalYear(fy);
            setQuarter(q);
          }}
          onSignOut={() => AuthEngine.signOut()}
        >
          {safeRoute === '/perform' && (
            <PerformModule
              currentEmployee={currentEmployee}
              fiscalYear={fiscalYear}
              quarter={quarter}
            />
          )}

          {safeRoute === '/showup' && (
            <ShowUpModule currentEmployee={currentEmployee} />
          )}

          {safeRoute === '/connect' && (
            <ConnectModule currentEmployee={currentEmployee} />
          )}

          {safeRoute === '/profile' && (
            <MyProfilePage currentEmployee={currentEmployee} />
          )}

          {safeRoute === '/employee-management' && (
            <EmployeeMasterList currentEmployee={currentEmployee} />
          )}
        </AppShell>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
