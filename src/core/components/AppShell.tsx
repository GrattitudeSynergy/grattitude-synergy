import React, { useState, useEffect, useRef } from 'react';
import {
  Target,
  Clock,
  Briefcase,
  UserCheck,
  Users,
  Bell,
  Shield,
  LogOut,
  CheckCheck,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { PermissionsService } from '../services/permissionsService';
import {
  FiscalService,
  AVAILABLE_FISCAL_YEARS,
  AVAILABLE_QUARTERS,
} from '../services/fiscalService';
import { NotificationService } from '../services/notificationService';
import { AuditLogModal } from './AuditLogModal';
import { Badge } from './DesignSystem';
import type { Employee, AppRoute, Quarter, AppNotification } from '../types';

interface AppShellProps {
  currentEmployee: Employee;
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  fiscalYear: string;
  quarter: Quarter;
  onFiscalChange: (fy: string, q: Quarter) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentEmployee,
  currentRoute,
  onNavigate,
  fiscalYear,
  quarter,
  onFiscalChange,
  onSignOut,
  children,
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = NotificationService.subscribeForEmployee(
      currentEmployee.id,
      (items) => setNotifications(items)
    );
    return () => unsub();
  }, [currentEmployee.id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const navItems: Array<{
    route: AppRoute;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
  }> = [
    {
      route: '/perform',
      label: 'Perform',
      subtitle: 'KPI Appraisals & OKRs',
      icon: <Target className="w-4 h-4" />,
    },
    {
      route: '/showup',
      label: 'Show Up',
      subtitle: 'Attendance, Leave & Payroll',
      icon: <Clock className="w-4 h-4" />,
    },
    {
      route: '/connect',
      label: 'Connect (CRM)',
      subtitle: 'Sales Pipeline & Deals',
      icon: <Briefcase className="w-4 h-4" />,
    },
    {
      route: '/profile',
      label: 'My Profile',
      subtitle: 'Personal, Tax & Bank Info',
      icon: <UserCheck className="w-4 h-4" />,
    },
    {
      route: '/employee-management',
      label: 'Employee Directory',
      subtitle: 'Master List & Provisioning',
      icon: <Users className="w-4 h-4" />,
    },
  ];

  // Dynamically filter via PermissionsService.canAccessModule(employee, module)
  const visibleNavItems = navItems.filter((item) =>
    PermissionsService.canAccessModule(currentEmployee, item.route)
  );

  const activeNavMeta =
    visibleNavItems.find((i) => i.route === currentRoute) || visibleNavItems[0];

  const handleFiscalYearSelect = async (newFy: string) => {
    onFiscalChange(newFy, quarter);
    await FiscalService.updateFiscalContext(newFy, quarter, currentEmployee.id);
  };

  const handleQuarterSelect = async (newQ: Quarter) => {
    onFiscalChange(fiscalYear, newQ);
    await FiscalService.updateFiscalContext(fiscalYear, newQ, currentEmployee.id);
  };

  return (
    <div className="min-h-screen flex bg-neutral-50 text-neutral-900">
      {/* LEFT SIDEBAR NAVIGATION — LIGHT MODE ONLY (White/Light Neutral surface, dark text) */}
      <aside className="w-64 bg-white text-neutral-800 flex flex-col justify-between shrink-0 border-r border-neutral-200 no-print">
        <div>
          {/* Brand Banner */}
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-3 bg-neutral-50/70">
            <div className="w-9 h-9 rounded-lg bg-sky-600 text-white font-extrabold text-sm flex items-center justify-center tracking-tighter shrink-0 shadow-2xs">
              GS
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-neutral-900 truncate">
                Grattitude Synergy
              </div>
              <div className="text-[11px] text-neutral-500 truncate">
                Enterprise Portal • v1.0.0
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="p-3 space-y-1">
            <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Enterprise Modules
            </div>
            {visibleNavItems.map((item) => {
              const isActive = currentRoute === item.route;
              return (
                <button
                  key={item.route}
                  onClick={() => onNavigate(item.route)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-sky-50 text-sky-900 border-sky-200 shadow-2xs'
                      : 'bg-white text-neutral-700 border-transparent hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 ${
                        isActive ? 'text-sky-600' : 'text-neutral-500'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight truncate">
                        {item.label}
                      </div>
                      <div
                        className={`text-[10px] truncate mt-0.5 ${
                          isActive ? 'text-sky-700' : 'text-neutral-500'
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isActive ? 'text-sky-600' : 'text-neutral-400'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* User Profile Card & Sign Out (Light Mode) */}
        <div className="p-3 border-t border-neutral-200 bg-neutral-50/80 space-y-2.5">
          <div className="p-2.5 rounded-lg bg-white border border-neutral-200 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-sky-50 text-sky-800 rounded-sm border border-sky-200">
                {currentEmployee.ecode}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-sm">
                L{currentEmployee.level} • {currentEmployee.role}
              </span>
            </div>
            <div className="text-xs font-bold text-neutral-900 mt-2 truncate">
              {currentEmployee.name}
            </div>
            <div className="text-[11px] text-neutral-600 truncate">
              {currentEmployee.designation}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono truncate mt-0.5">
              {currentEmployee.email}
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT SHELL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER */}
        <header className="h-16 bg-white border-b border-neutral-200 px-6 flex items-center justify-between gap-4 shrink-0 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-neutral-900 truncate">
                  {activeNavMeta?.label || 'Workspace'}
                </h1>
                <Badge variant="neutral">Grattitude Synergy</Badge>
              </div>
              <p className="text-xs text-neutral-500 truncate">
                {activeNavMeta?.subtitle}
              </p>
            </div>
          </div>

          {/* Right Controls: Fiscal Context, Audit Trail (Admin/CEO), Notifications */}
          <div className="flex items-center gap-3">
            {/* Fiscal Context Selector */}
            <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-neutral-500" />
              <span className="text-[11px] font-bold text-neutral-500 uppercase mr-1">
                Fiscal:
              </span>
              <select
                value={fiscalYear}
                onChange={(e) => handleFiscalYearSelect(e.target.value)}
                className="text-xs font-bold text-neutral-900 bg-transparent focus:outline-none cursor-pointer"
                aria-label="Fiscal Year"
              >
                {AVAILABLE_FISCAL_YEARS.map((fy) => (
                  <option key={fy} value={fy}>
                    {fy}
                  </option>
                ))}
              </select>
              <span className="text-neutral-300">|</span>
              <select
                value={quarter}
                onChange={(e) => handleQuarterSelect(e.target.value as Quarter)}
                className="text-xs font-bold text-sky-700 bg-transparent focus:outline-none cursor-pointer"
                aria-label="Fiscal Quarter"
              >
                {AVAILABLE_QUARTERS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            {/* Central Audit Log Button (Accessible ONLY to Admin and CEO) */}
            {PermissionsService.isAdminOrCEO(currentEmployee) && (
              <button
                onClick={() => setAuditModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition-colors cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-sky-600" />
                <span>Audit Logs</span>
              </button>
            )}

            {/* Real-time Notifications Dropdown */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative p-2 text-neutral-700 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 bg-rose-600 text-white text-[10px] font-bold rounded-sm shadow-2xs">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-white border border-neutral-200 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">
                        Enterprise Notifications
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        {unreadCount} unread alert{unreadCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() =>
                          NotificationService.markAllAsRead(
                            currentEmployee.id,
                            notifications
                          )
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:underline cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark All as Read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-neutral-500">
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={async () => {
                            await NotificationService.markAsRead(n.id);
                            onNavigate(n.route);
                            setNotifOpen(false);
                          }}
                          className={`p-3.5 hover:bg-neutral-50 transition-colors cursor-pointer ${
                            !n.read ? 'bg-sky-50/40' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-bold text-neutral-900">
                              {n.title}
                            </span>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-xs bg-sky-600 shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-xs text-neutral-600 mt-1 leading-snug">
                            {n.message}
                          </p>
                          <div className="flex items-center justify-between mt-2 text-[10px] text-neutral-400">
                            <span>{new Date(n.createdAt).toLocaleString()}</span>
                            <span className="font-semibold text-sky-700">
                              Go to {n.route} →
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* WORKSPACE VIEWPORT */}
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>

      {/* Central Audit Trail Modal */}
      <AuditLogModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />
    </div>
  );
};
