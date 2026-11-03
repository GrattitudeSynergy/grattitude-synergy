import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, AlertOctagon, Inbox } from 'lucide-react';

// ============================================================================
// GRATTITUDE SYNERGY — ENTERPRISE DESIGN SYSTEM
// ============================================================================
// Zero Pill Discipline: Structured rectangular cards & badges with rounded-md / rounded-lg / rounded-xl.
// Neutral Slate/Zinc surfaces (neutral-50 to neutral-900), subtle borders (border-neutral-200).
// High-contrast, clean corporate components:
// Badge, Button, Card, Modal, Table, Tabs, ToastProvider, and EmptyState.

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const Badge: React.FC<{
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}> = ({ variant = 'neutral', children, className = '' }) => {
  const styles: Record<BadgeVariant, string> = {
    neutral: 'bg-neutral-100 text-neutral-800 border-neutral-300',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-rose-50 text-rose-800 border-rose-200',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold border rounded-md tracking-tight ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  ...rest
}) => {
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-neutral-900 text-white hover:bg-neutral-800 border-neutral-900 shadow-xs',
    secondary:
      'bg-sky-600 text-white hover:bg-sky-700 border-sky-600 shadow-xs',
    outline:
      'bg-white text-neutral-800 hover:bg-neutral-50 border-neutral-300 shadow-2xs',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 border-rose-600 shadow-xs',
    success:
      'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600 shadow-xs',
    ghost:
      'bg-transparent text-neutral-700 hover:bg-neutral-100 border-transparent',
  };

  const sizes: Record<ButtonSize, string> = {
    xs: 'px-2.5 py-1 text-xs',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-semibold border rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
};

export const Card: React.FC<{
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, subtitle, action, children, className = '', bodyClassName = 'p-5' }) => {
  return (
    <div
      className={`bg-white border border-neutral-200 rounded-xl shadow-2xs overflow-hidden ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="px-5 py-4 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 bg-neutral-50/60">
          <div>
            {title && (
              <h3 className="text-sm font-bold text-neutral-900 tracking-tight">{title}</h3>
            )}
            {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
};

export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  preventClose?: boolean;
}> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'lg',
  children,
  footer,
  preventClose = false,
}) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-[1px] overflow-y-auto">
      <div
        className={`bg-white border border-neutral-200 rounded-xl shadow-xl w-full ${sizeClasses[size]} max-h-[92vh] flex flex-col overflow-hidden`}
      >
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div>
            <h2 className="text-base font-bold text-neutral-900">{title}</h2>
            {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
          </div>
          {!preventClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-lg transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-3.5 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const Table: React.FC<{
  headers: React.ReactNode[];
  children: React.ReactNode;
  className?: string;
}> = ({ headers, children, className = '' }) => {
  return (
    <div className={`overflow-x-auto border border-neutral-200 rounded-xl bg-white ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-neutral-50 border-b border-neutral-200">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-neutral-600"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 text-sm text-neutral-800">{children}</tbody>
      </table>
    </div>
  );
};

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export const Tabs: React.FC<{
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ tabs, activeTab, onChange, className = '' }) => {
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 border-b border-neutral-200 pb-2 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
              isActive
                ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100 hover:text-neutral-900'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`px-1.5 py-0.2 text-[10px] font-bold rounded-sm ${
                  isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-700'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, description, icon, action }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 bg-neutral-50/70 border border-dashed border-neutral-300 rounded-xl">
      <div className="w-12 h-12 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-600 mb-3 shadow-2xs">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h4 className="text-sm font-bold text-neutral-900">{title}</h4>
      <p className="text-xs text-neutral-500 max-w-md mt-1 leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

// ============================================================================
// TOAST NOTIFICATION PROVIDER
// ============================================================================
interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}

interface ToastContextValue {
  showToast: (
    type: ToastMessage['type'],
    title: string,
    description?: string
  ) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const borderStyles = {
            success: 'border-emerald-600 bg-white',
            error: 'border-rose-600 bg-white',
            warning: 'border-amber-500 bg-white',
            info: 'border-sky-600 bg-white',
          };
          const icons = {
            success: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />,
            error: <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />,
            warning: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
            info: <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />,
          };
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 border-l-4 border border-neutral-200 rounded-lg shadow-lg ${borderStyles[t.type]}`}
            >
              {icons[t.type]}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-neutral-900">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-neutral-600 mt-0.5 leading-snug">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
