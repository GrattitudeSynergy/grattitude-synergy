import type {
  Employee,
  AppRoute,
  CompensationLockConfig,
  PerformLockConfig,
} from '../types';

// ============================================================================
// PERMISSIONS & RBAC ENGINE (PermissionsService)
// ============================================================================
// Central authority for module routing, compensation lock enforcement,
// circular reporting prevention, and statutory identifier visibility.

export const PermissionsService = {
  /**
   * Determines whether an authenticated employee can access a given navigation module.
   * - The "Connect (CRM)" module is completely hidden if `hasCrmAccess` is false.
   * - Employee Management is visible to Admin, CEO, Manager, and Advisor (with role-scoped permissions).
   */
  canAccessModule(employee: Employee | null, route: AppRoute): boolean {
    if (!employee) return false;

    switch (route) {
      case '/perform':
      case '/showup':
      case '/profile':
        return true;

      case '/connect':
        return Boolean(employee.hasCrmAccess);

      case '/employee-management':
        return (
          employee.role === 'Admin' ||
          employee.role === 'CEO' ||
          employee.role === 'Manager' ||
          employee.role === 'Advisor'
        );

      default:
        return false;
    }
  },

  isAdmin(employee: Employee | null): boolean {
    return employee?.role === 'Admin';
  },

  isCEO(employee: Employee | null): boolean {
    return employee?.role === 'CEO';
  },

  isAdminOrCEO(employee: Employee | null): boolean {
    return employee?.role === 'Admin' || employee?.role === 'CEO';
  },

  isManager(employee: Employee | null): boolean {
    if (!employee) return false;
    return (
      employee.role === 'Manager' ||
      employee.isManager ||
      employee.role === 'Admin' ||
      employee.role === 'CEO'
    );
  },

  isIntern(employee: Employee | null): boolean {
    if (!employee) return false;
    return employee.level === 0;
  },

  /**
   * Strict RBAC for Bank & Statutory Tax Identifiers (PAN, Aadhaar, UAN, Bank Account, IFSC):
   * Viewable and editable ONLY by the employee themselves, Admin, or designated Accounts staff.
   */
  canViewBankAndStatutory(viewer: Employee | null, targetEmployee: Employee): boolean {
    if (!viewer) return false;
    if (viewer.role === 'Admin') return true;
    if (viewer.id === targetEmployee.id) return true;
    if (viewer.isAccountsStaff || viewer.department === 'Finance & Accounts') return true;
    return false;
  },

  canEditBankAndStatutory(viewer: Employee | null, targetEmployee: Employee): boolean {
    return this.canViewBankAndStatutory(viewer, targetEmployee);
  },

  /**
   * Checks whether Compensation / CTC / Payslip details are locked for a given viewer & target employee.
   * Admin always bypasses compensation locks.
   */
  isCompensationLockedForViewer(
    viewer: Employee | null,
    targetEmployeeId: string,
    lockConfig: CompensationLockConfig | null
  ): boolean {
    if (!viewer) return true;
    if (viewer.role === 'Admin') return false;
    if (!lockConfig || lockConfig.mode === 'unlocked') return false;

    if (lockConfig.mode === 'all') {
      return true;
    }

    if (lockConfig.mode === 'selective') {
      const isSelected = lockConfig.selectedEmployeeIds.includes(targetEmployeeId);
      if (lockConfig.selectiveModeType === 'whitelist') {
        // Only whitelisted employees can view
        return !isSelected;
      } else {
        // Blacklisted employees are locked out
        return isSelected;
      }
    }

    return false;
  },

  /**
   * Checks whether the Perform (KPI Appraisal & OKR) module is locked for a given viewer/target employee.
   * Admin always bypasses Perform module locks.
   */
  isPerformLockedForViewer(
    viewer: Employee | null,
    targetEmployeeId: string,
    lockConfig: PerformLockConfig | null
  ): boolean {
    if (!viewer) return true;
    if (viewer.role === 'Admin') return false;
    if (!lockConfig || lockConfig.mode === 'unlocked') return false;

    if (lockConfig.mode === 'all') {
      return true;
    }

    if (lockConfig.mode === 'selective') {
      const isSelected = lockConfig.selectedEmployeeIds.includes(targetEmployeeId);
      if (lockConfig.selectiveModeType === 'whitelist') {
        // Only whitelisted employees can access Perform
        return !isSelected;
      } else {
        // Blacklisted employees are locked out of Perform
        return isSelected;
      }
    }

    return false;
  },

  /**
   * Circular reporting prevention (`checkCircularReporting`):
   * Prevents an employee from being their own manager or creating a reporting loop
   * (e.g., A reports to B, and B is assigned to report to A or A's subordinate).
   */
  checkCircularReporting(
    employeeId: string,
    proposedManagerId: string,
    allEmployees: Employee[]
  ): { isCircular: boolean; chain: string[] } {
    if (!proposedManagerId) {
      return { isCircular: false, chain: [] };
    }
    if (employeeId && employeeId === proposedManagerId) {
      return { isCircular: true, chain: [employeeId, proposedManagerId] };
    }

    const empMap = new Map<string, Employee>();
    allEmployees.forEach((e) => empMap.set(e.id, e));

    const visited = new Set<string>();
    const chain: string[] = [employeeId || 'NEW', proposedManagerId];
    let currentId: string | undefined = proposedManagerId;

    while (currentId) {
      if (employeeId && currentId === employeeId) {
        return { isCircular: true, chain };
      }
      if (visited.has(currentId)) {
        // Existing loop in hierarchy
        return { isCircular: true, chain };
      }
      visited.add(currentId);

      const currentEmp = empMap.get(currentId);
      const nextManagerId = currentEmp?.reportingManagerId;
      if (!nextManagerId) break;

      chain.push(nextManagerId);
      if (employeeId && nextManagerId === employeeId) {
        return { isCircular: true, chain };
      }
      currentId = nextManagerId;
    }

    return { isCircular: false, chain };
  },
};
