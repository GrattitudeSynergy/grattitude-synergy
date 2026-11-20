import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Save,
  FileEdit,
  RotateCcw,
  Lock,
  Users,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Table,
  EmptyState,
  useToast,
} from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { PermissionsService } from '../../core/services/permissionsService';
import { AuditService } from '../../core/services/auditService';
import { NotificationService } from '../../core/services/notificationService';
import {
  AVAILABLE_FISCAL_YEARS,
  AVAILABLE_QUARTERS,
} from '../../core/services/fiscalService';
import { SEED_GRADE_CONFIG } from '../../core/seedData';
import {
  TARGET_VALUE_TYPES,
  resolveTargetValueType,
  formatTargetDisplay,
  calculateKpiScore,
  calculateTotalWeightedScore,
  resolveLetterGrade,
} from './scoringEngine';
import type {
  Employee,
  Quarter,
  TargetValueType,
  PerformKpiMaster,
  PerformScorecard,
  PerformScorecardItem,
  PerformGradeConfig,
} from '../../core/types';

// ============================================================================
// ADMIN KPI ASSIGNMENT (per Employee × Fiscal Year × Quarter)
// ----------------------------------------------------------------------------
// Each employee has 4 independent quarterly KPI sheets (Q1–Q4). A sheet IS the
// employee's `perform_scorecards` document (id: `${empId}_${FY}_${Q}`), so any
// change made here flows directly into Employee Self-Appraisal, Manager Review,
// CEO Calibration and the printable scorecard. Sheets that don't exist yet are
// prefilled from the employee's level-based template (perform_kpi_masters) and
// are only written to the database when the Admin saves.
// ============================================================================

const sheetIdFor = (empId: string, fy: string, q: Quarter) =>
  `${empId}_${fy}_${q}`;

const draftSheetIdFor = (empId: string, fy: string, q: Quarter) =>
  `admin_draft_${empId}_${fy}_${q}`;

/** Remove `undefined` keys so the document is safe for Firestore writes. */
const stripUndefined = <T extends object>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
};

const hasValidTarget = (
  t: unknown,
  targetType: TargetValueType
): t is number | string => {
  if (targetType === 'Text') {
    return typeof t === 'string' && t.trim().length > 0;
  }
  const num = typeof t === 'number' ? t : typeof t === 'string' && t.trim() !== '' ? Number(t) : NaN;
  if (!Number.isFinite(num)) return false;
  if (targetType === 'Percentage') return num >= 0 && num <= 100;
  return true;
};

export const KpiAssignmentPanel: React.FC<{
  currentAdmin: Employee;
  defaultFiscalYear: string;
  defaultQuarter?: Quarter;
}> = ({ currentAdmin, defaultFiscalYear, defaultQuarter = 'Q1' }) => {
  const { showToast } = useToast();
  const isAdmin = PermissionsService.isAdmin(currentAdmin);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [kpiMasters, setKpiMasters] = useState<PerformKpiMaster[]>([]);
  const [scorecards, setScorecards] = useState<PerformScorecard[]>([]);
  const [gradeConfig, setGradeConfig] =
    useState<PerformGradeConfig>(SEED_GRADE_CONFIG);

  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [fiscalYear, setFiscalYear] = useState<string>(defaultFiscalYear);
  const [quarter, setQuarter] = useState<Quarter>(defaultQuarter);

  const [draftItems, setDraftItems] = useState<PerformScorecardItem[] | null>(
    null
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const u1 = FirestoreEngine.subscribeCollection<Employee>(
      'employees',
      setEmployees
    );
    const u2 = FirestoreEngine.subscribeCollection<PerformKpiMaster>(
      'perform_kpi_masters',
      setKpiMasters
    );
    const u3 = FirestoreEngine.subscribeCollection<PerformScorecard>(
      'perform_scorecards',
      setScorecards
    );
    const u4 = FirestoreEngine.subscribeCollection<any>(
      'perform_config',
      (items) => {
        const g = items.find((i) => i.id === 'grade_cutoffs');
        if (g) setGradeConfig(g);
      }
    );
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [isAdmin]);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.name.localeCompare(b.name)),
    [employees]
  );

  const selectedEmp =
    sortedEmployees.find((e) => e.id === selectedEmpId) || null;

  const levelTemplate = useMemo(() => {
    if (!selectedEmp) return [] as PerformKpiMaster[];
    return kpiMasters
      .filter((k) => k.level === selectedEmp.level)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [kpiMasters, selectedEmp]);

  const masterById = useMemo(() => {
    const m = new Map<string, PerformKpiMaster>();
    kpiMasters.forEach((k) => m.set(k.id, k));
    return m;
  }, [kpiMasters]);

  const existingSheet = selectedEmp
    ? scorecards.find(
        (sc) =>
          !sc.isAdminDraft &&
          sc.id === sheetIdFor(selectedEmp.id, fiscalYear, quarter)
      ) || null
    : null;

  const existingDraftSheet = selectedEmp
    ? scorecards.find(
        (sc) => sc.id === draftSheetIdFor(selectedEmp.id, fiscalYear, quarter)
      ) || null
    : null;

  const isLocked = existingSheet?.status === 'Final Evaluation Released';

  /** Prefill items from the employee's level-based KPI template (same logic as scorecard initialization). */
  const buildTemplateItems = (): PerformScorecardItem[] =>
    levelTemplate.map((k) => {
      const showTarget = k.showTarget !== false;
      const targetType = resolveTargetValueType(k);
      const target =
        showTarget && hasValidTarget(k.target, targetType)
          ? k.target
          : undefined;
      const initialActual =
        targetType !== 'Text' && target !== undefined && Number.isFinite(Number(target))
          ? Number(target)
          : 100;
      const formattedTarget = formatTargetDisplay(
        target,
        targetType,
        k.unit,
        showTarget
      );
      return {
        kpiId: k.id,
        title: k.title,
        description: k.description,
        category: k.category,
        target,
        targetType,
        showTarget,
        unit: targetType === 'Percentage' ? '%' : targetType === 'Text' ? '' : k.unit,
        weightage: k.weightage,
        actual: initialActual,
        selfScore: calculateKpiScore(initialActual, target, targetType),
        managerScore: 0,
        ceoScore: 0,
        selfJustification: formattedTarget
          ? `Achieved benchmark target (${formattedTarget}) during ${fiscalYear} ${quarter}.`
          : `Achieved performance score of ${initialActual} during ${fiscalYear} ${quarter}.`,
        managerComments: '',
      };
    });

  const sheetKey = `${selectedEmpId}|${fiscalYear}|${quarter}`;

  // Reset draft whenever the Admin switches employee / fiscal year / quarter
  useEffect(() => {
    setDirty(false);
    setDraftItems(null);
  }, [sheetKey]);

  // (Re)load the draft from the DB sheet (assigned or admin draft), or prefill from the level template, unless the Admin has unsaved edits
  useEffect(() => {
    if (dirty || !selectedEmp) return;
    const base = existingSheet
      ? existingSheet.items
      : existingDraftSheet
      ? existingDraftSheet.items
      : buildTemplateItems();
    setDraftItems(
      base.map((i) => ({
        ...i,
        targetType: resolveTargetValueType(i),
        showTarget: i.showTarget !== false,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sheetKey,
    existingSheet?.updatedAt,
    existingDraftSheet?.updatedAt,
    levelTemplate,
    dirty,
  ]);

  const guardedChange = (fn: () => void) => {
    if (
      dirty &&
      !window.confirm(
        'You have unsaved KPI changes for this sheet. Discard them and continue?'
      )
    ) {
      return;
    }
    fn();
  };

  const updateDraft = (kpiId: string, changes: Partial<PerformScorecardItem>) => {
    setDraftItems((prev) =>
      prev ? prev.map((i) => (i.kpiId === kpiId ? { ...i, ...changes } : i)) : prev
    );
    setDirty(true);
  };

  const handleToggleTargetApplicable = (item: PerformScorecardItem) => {
    const enabling = item.showTarget === false;
    if (enabling) {
      const master = masterById.get(item.kpiId);
      const nextType = resolveTargetValueType(
        item.targetType ? item : master || item
      );
      updateDraft(item.kpiId, {
        showTarget: true,
        targetType: nextType,
        target: hasValidTarget(item.target, nextType)
          ? item.target
          : hasValidTarget(master?.target, nextType)
          ? master!.target
          : undefined,
      });
    } else {
      updateDraft(item.kpiId, { showTarget: false, target: undefined });
    }
  };

  const handleChangeTargetType = (
    item: PerformScorecardItem,
    nextType: TargetValueType
  ) => {
    let nextTarget = item.target;
    if (
      nextType !== 'Text' &&
      typeof nextTarget === 'string' &&
      nextTarget.trim() !== '' &&
      Number.isNaN(Number(nextTarget))
    ) {
      nextTarget = undefined;
    } else if (
      nextType !== 'Text' &&
      typeof nextTarget === 'string' &&
      nextTarget.trim() !== ''
    ) {
      nextTarget = Number(nextTarget);
    }
    updateDraft(item.kpiId, {
      targetType: nextType,
      target: nextTarget,
      unit:
        nextType === 'Percentage'
          ? '%'
          : nextType === 'Text'
          ? ''
          : item.unit === '%'
          ? ''
          : item.unit,
    });
  };

  const handleResetItemToTemplate = (kpiId: string) => {
    const master = masterById.get(kpiId);
    if (!master) return;
    const showTarget = master.showTarget !== false;
    const targetType = resolveTargetValueType(master);
    updateDraft(kpiId, {
      title: master.title,
      description: master.description,
      showTarget,
      targetType,
      target:
        showTarget && hasValidTarget(master.target, targetType)
          ? master.target
          : undefined,
      unit: master.unit,
      weightage: master.weightage,
    });
  };

  const handleResetSheetToTemplate = () => {
    if (!draftItems) return;
    setDraftItems(
      draftItems.map((i) => {
        const master = masterById.get(i.kpiId);
        if (!master) return i;
        const showTarget = master.showTarget !== false;
        const targetType = resolveTargetValueType(master);
        return {
          ...i,
          title: master.title,
          description: master.description,
          showTarget,
          targetType,
          target:
            showTarget && hasValidTarget(master.target, targetType)
              ? master.target
              : undefined,
          unit: master.unit,
          weightage: master.weightage,
        };
      })
    );
    setDirty(true);
  };

  /** Whether an item's editable fields differ from the level template. */
  const computeIsCustomized = (item: PerformScorecardItem): boolean => {
    const master = masterById.get(item.kpiId);
    if (!master) return true;
    const masterShow = master.showTarget !== false;
    const itemShow = item.showTarget !== false;
    const masterType = resolveTargetValueType(master);
    const itemType = resolveTargetValueType(item);
    const masterTarget =
      masterShow && hasValidTarget(master.target, masterType)
        ? master.target
        : undefined;
    const itemTarget =
      itemShow && hasValidTarget(item.target, itemType)
        ? item.target
        : undefined;
    return (
      item.title.trim() !== master.title ||
      item.description.trim() !== master.description ||
      itemShow !== masterShow ||
      itemType !== masterType ||
      String(itemTarget ?? '') !== String(masterTarget ?? '') ||
      item.weightage !== master.weightage
    );
  };

  const totalWeight =
    Math.round(
      (draftItems || []).reduce(
        (s, i) => s + (Number.isFinite(i.weightage) ? i.weightage : 0),
        0
      ) * 100
    ) / 100;
  const isWeightValid = totalWeight === 100;
  const weightDiff = Math.round(Math.abs(100 - totalWeight) * 100) / 100;

  const handleSave = async () => {
    if (!selectedEmp || !draftItems) return;
    if (isLocked) {
      showToast(
        'error',
        'Sheet Locked',
        'This quarter has a released final evaluation. Use "Override State" in the Manager Team Hub to unlock it first.'
      );
      return;
    }

    // Validation
    for (const item of draftItems) {
      if (!item.title.trim()) {
        showToast('error', 'KPI Title Required', `KPI ${item.kpiId} needs a title.`);
        return;
      }
      const itemType = resolveTargetValueType(item);
      if (item.showTarget !== false && !hasValidTarget(item.target, itemType)) {
        showToast(
          'error',
          'Target Value Required',
          itemType === 'Percentage'
            ? `"${item.title}" requires a Percentage target between 0 and 100, or switch Target Applicable off.`
            : `"${item.title}" has Target Applicable switched on. Enter a valid ${itemType} target value or switch it off.`
        );
        return;
      }
      if (!Number.isFinite(item.weightage) || item.weightage < 0 || item.weightage > 100) {
        showToast(
          'error',
          'Invalid Weightage',
          `"${item.title}" weightage must be between 0% and 100%.`
        );
        return;
      }
    }

    if (!isWeightValid) {
      showToast(
        'error',
        'Total Weightage Must Equal 100%',
        totalWeight < 100
          ? `Current total is ${totalWeight}%. Add ${weightDiff}% more to reach 100% before saving.`
          : `Current total is ${totalWeight}%. Reduce by ${weightDiff}% to reach 100% before saving.`
      );
      return;
    }

    setSaving(true);
    try {
      const draftById = new Map(draftItems.map((i) => [i.kpiId, i]));
      const nowIso = new Date().toISOString();
      const sheetId = sheetIdFor(selectedEmp.id, fiscalYear, quarter);

      // Merge onto the freshest DB copy so employee/manager inputs (actuals, justifications, scores) are preserved
      const latest = await FirestoreEngine.getDocument<PerformScorecard>(
        'perform_scorecards',
        sheetId
      );
      const baseItems = latest ? latest.items : draftItems;
      const status = latest?.status || 'Draft';

      let changedCount = 0;
      const mergedItems: PerformScorecardItem[] = baseItems.map((orig) => {
        const d = draftById.get(orig.kpiId);
        if (!d) return orig;
        const showTarget = d.showTarget !== false;
        const targetType = resolveTargetValueType(d);
        const target =
          showTarget && hasValidTarget(d.target, targetType)
            ? targetType === 'Text'
              ? String(d.target).trim()
              : Number(d.target)
            : undefined;
        const nextWeightage = Number.isFinite(d.weightage) ? d.weightage : 0;
        const nextUnit =
          targetType === 'Percentage'
            ? '%'
            : targetType === 'Text'
            ? ''
            : d.unit;
        const next: PerformScorecardItem = {
          ...orig,
          title: d.title.trim(),
          description: d.description.trim(),
          showTarget,
          targetType,
          target,
          unit: nextUnit,
          weightage: nextWeightage,
        };
        next.isCustomized = computeIsCustomized(next);

        const prevType = resolveTargetValueType(orig);
        const prevTarget =
          orig.showTarget !== false && hasValidTarget(orig.target, prevType)
            ? orig.target
            : undefined;
        if (String(prevTarget ?? '') !== String(target ?? '') || prevType !== targetType) {
          next.selfScore = calculateKpiScore(next.actual, target, targetType);
        }
        if (
          next.title !== orig.title ||
          next.description !== orig.description ||
          (orig.showTarget !== false) !== showTarget ||
          prevType !== targetType ||
          String(prevTarget ?? '') !== String(target ?? '') ||
          orig.weightage !== nextWeightage
        ) {
          changedCount++;
        }
        return stripUndefined(next);
      });

      const totalWeightedScore = calculateTotalWeightedScore(mergedItems, status);
      const grade = resolveLetterGrade(totalWeightedScore, gradeConfig);

      const sheet: PerformScorecard = latest
        ? {
            ...latest,
            items: mergedItems,
            totalWeightedScore,
            grade,
            kpiAssignedBy: currentAdmin.name,
            kpiAssignedAt: nowIso,
            updatedAt: nowIso,
          }
        : {
            id: sheetId,
            employeeId: selectedEmp.id,
            employeeName: selectedEmp.name,
            employeeEcode: selectedEmp.ecode,
            employeeLevel: selectedEmp.level,
            department: selectedEmp.department,
            reportingManagerId: selectedEmp.reportingManagerId || 'EMP-001',
            fiscalYear,
            quarter,
            status: 'Draft',
            items: mergedItems,
            totalWeightedScore,
            grade,
            kpiAssignedBy: currentAdmin.name,
            kpiAssignedAt: nowIso,
            updatedAt: nowIso,
          };

      await FirestoreEngine.setDocument('perform_scorecards', sheet.id, {
        ...sheet,
        isAdminDraft: false,
      });

      // If an unassigned Admin draft existed for this quarter, remove it now that the sheet is assigned
      const draftId = draftSheetIdFor(selectedEmp.id, fiscalYear, quarter);
      if (existingDraftSheet) {
        await FirestoreEngine.deleteDocument('perform_scorecards', draftId);
      }

      await AuditService.log({
        action: latest ? 'KPI_SHEET_UPDATED' : 'KPI_SHEET_ASSIGNED',
        actor: currentAdmin,
        targetId: sheet.id,
        targetType: 'PerformScorecard',
        details: latest
          ? `Admin updated ${changedCount} KPI(s) on ${selectedEmp.name} (${selectedEmp.ecode}) ${fiscalYear} ${quarter} sheet.`
          : `Admin assigned ${fiscalYear} ${quarter} KPI sheet (${mergedItems.length} KPIs, Level ${selectedEmp.level} template) to ${selectedEmp.name} (${selectedEmp.ecode}).`,
      });

      if (selectedEmp.id !== currentAdmin.id) {
        await NotificationService.create({
          recipientId: selectedEmp.id,
          title: `KPI Sheet ${latest ? 'Updated' : 'Assigned'} — ${fiscalYear} ${quarter}`,
          message: `${currentAdmin.name} ${latest ? 'updated' : 'assigned'} your ${fiscalYear} ${quarter} KPI sheet.`,
          route: '/perform',
          actorName: currentAdmin.name,
        });
      }

      setDirty(false);
      showToast(
        'success',
        latest ? 'KPI Sheet Saved' : 'KPI Sheet Assigned',
        `${selectedEmp.name} • ${fiscalYear} ${quarter} saved to the central database.`
      );
    } catch (err: any) {
      showToast('error', 'Save Failed', err?.message || 'Could not save KPI sheet.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Save the KPI sheet as an unassigned Admin Draft (persists to central database,
   * does NOT assign to employee or notify them).
   */
  const handleSaveAsDraft = async () => {
    if (!selectedEmp || !draftItems || existingSheet) return;

    for (const item of draftItems) {
      if (!item.title.trim()) {
        showToast('error', 'KPI Title Required', `KPI ${item.kpiId} needs a title.`);
        return;
      }
      if (!Number.isFinite(item.weightage) || item.weightage < 0 || item.weightage > 100) {
        showToast(
          'error',
          'Invalid Weightage',
          `"${item.title}" weightage must be between 0% and 100%.`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const draftId = draftSheetIdFor(selectedEmp.id, fiscalYear, quarter);

      const preparedItems: PerformScorecardItem[] = draftItems.map((d) => {
        const showTarget = d.showTarget !== false;
        const targetType = resolveTargetValueType(d);
        const target =
          showTarget && hasValidTarget(d.target, targetType)
            ? targetType === 'Text'
              ? String(d.target).trim()
              : Number(d.target)
            : undefined;
        const nextWeightage = Number.isFinite(d.weightage) ? d.weightage : 0;
        const nextUnit =
          targetType === 'Percentage'
            ? '%'
            : targetType === 'Text'
            ? ''
            : d.unit;
        const next: PerformScorecardItem = {
          ...d,
          title: d.title.trim(),
          description: d.description.trim(),
          showTarget,
          targetType,
          target,
          unit: nextUnit,
          weightage: nextWeightage,
        };
        next.isCustomized = computeIsCustomized(next);
        next.selfScore = calculateKpiScore(next.actual, target, targetType);
        return stripUndefined(next);
      });

      const totalWeightedScore = calculateTotalWeightedScore(preparedItems, 'Draft');
      const grade = resolveLetterGrade(totalWeightedScore, gradeConfig);

      const draftSheet: PerformScorecard = {
        id: draftId,
        employeeId: selectedEmp.id,
        employeeName: selectedEmp.name,
        employeeEcode: selectedEmp.ecode,
        employeeLevel: selectedEmp.level,
        department: selectedEmp.department,
        reportingManagerId: selectedEmp.reportingManagerId || 'EMP-001',
        fiscalYear,
        quarter,
        status: 'Draft',
        isAdminDraft: true,
        items: preparedItems,
        totalWeightedScore,
        grade,
        kpiAssignedBy: currentAdmin.name,
        kpiAssignedAt: nowIso,
        updatedAt: nowIso,
      };

      await FirestoreEngine.setDocument('perform_scorecards', draftSheet.id, draftSheet);

      await AuditService.log({
        action: 'KPI_SHEET_DRAFT_SAVED',
        actor: currentAdmin,
        targetId: draftSheet.id,
        targetType: 'PerformScorecard',
        details: `Admin saved unassigned KPI draft for ${selectedEmp.name} (${selectedEmp.ecode}) ${fiscalYear} ${quarter} (Total weightage: ${totalWeight}%).`,
      });

      setDirty(false);
      showToast(
        'info',
        'KPI Saved as Draft',
        `${selectedEmp.name} • ${fiscalYear} ${quarter} saved as a draft (not assigned to employee yet).`
      );
    } catch (err: any) {
      showToast('error', 'Draft Save Failed', err?.message || 'Could not save KPI draft.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card title="KPI Assignment — Access Restricted">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          Only Admin users can view and edit employee KPI assignments.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card
        title={
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-sky-600" />
            <span>KPI Assignment</span>
          </div>
        }
        subtitle="Select an employee and quarter to view, assign, and edit their KPI sheet. Sheets are prefilled from the employee's level-based KPI template."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Employee *
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => {
                const v = e.target.value;
                guardedChange(() => setSelectedEmpId(v));
              }}
              className="w-full px-3 py-2 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
            >
              <option value="">— Select an employee —</option>
              {sortedEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.ecode}) — Level {emp.level} • {emp.designation}
                  {emp.status === 'Inactive' ? ' [Inactive]' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Fiscal Year
            </label>
            <select
              value={fiscalYear}
              onChange={(e) => {
                const v = e.target.value;
                guardedChange(() => setFiscalYear(v));
              }}
              className="w-full px-3 py-2 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
            >
              {AVAILABLE_FISCAL_YEARS.map((fy) => (
                <option key={fy} value={fy}>
                  {fy}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedEmp && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-neutral-600 mr-1">
              Quarterly KPI Sheet:
            </span>
            {AVAILABLE_QUARTERS.map((q) => {
              const isAssigned = scorecards.some(
                (sc) =>
                  !sc.isAdminDraft &&
                  sc.id === sheetIdFor(selectedEmp.id, fiscalYear, q)
              );
              const isDraft =
                !isAssigned &&
                scorecards.some(
                  (sc) => sc.id === draftSheetIdFor(selectedEmp.id, fiscalYear, q)
                );
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => guardedChange(() => setQuarter(q))}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg border cursor-pointer inline-flex items-center gap-1.5 ${
                    quarter === q
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                  }`}
                  title={
                    isAssigned
                      ? 'Assigned & saved'
                      : isDraft
                      ? 'Saved as draft (not assigned)'
                      : 'Not yet assigned (template prefill)'
                  }
                >
                  {q}
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isAssigned
                        ? 'bg-emerald-500'
                        : isDraft
                        ? 'bg-amber-500'
                        : 'bg-neutral-300'
                    }`}
                  />
                </button>
              );
            })}
            <span className="text-[11px] text-neutral-500 ml-1">
              Green = assigned • Amber = draft (not assigned)
            </span>
          </div>
        )}
      </Card>

      {!selectedEmp ? (
        <EmptyState
          title="Select an Employee"
          description="Choose an employee above to load their level-based KPI sheet for the selected quarter."
          icon={<Users className="w-6 h-6 text-sky-600" />}
        />
      ) : selectedEmp.level === 0 ? (
        <EmptyState
          title="Level 0 — Intern Enablement Track"
          description="Interns are evaluated through the Intern Enablement Track roadmap, not a numerical KPI sheet."
        />
      ) : levelTemplate.length === 0 && !existingSheet && !existingDraftSheet ? (
        <EmptyState
          title={`No KPI Template for Level ${selectedEmp.level}`}
          description="Add KPIs for this level in Admin KPI Catalog & Cutoffs to prefill this employee's sheet."
        />
      ) : (
        <Card
          title={`${selectedEmp.name} (${selectedEmp.ecode}) — ${fiscalYear} ${quarter} KPI Sheet`}
          subtitle={`Level ${selectedEmp.level} • ${selectedEmp.department}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {existingSheet ? (
                <Badge
                  variant={
                    existingSheet.status === 'Draft'
                      ? 'neutral'
                      : existingSheet.status === 'Final Evaluation Released'
                      ? 'success'
                      : 'warning'
                  }
                >
                  {existingSheet.status}
                </Badge>
              ) : existingDraftSheet ? (
                <Badge variant="warning">Saved as Draft (Not Assigned)</Badge>
              ) : (
                <Badge variant="info">Not yet assigned — template prefill</Badge>
              )}
              {dirty && <Badge variant="warning">Unsaved changes</Badge>}
              <Button
                size="sm"
                variant="outline"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                disabled={isLocked || !draftItems}
                onClick={handleResetSheetToTemplate}
              >
                Reset Sheet to Template
              </Button>
              {!existingSheet && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FileEdit className="w-3.5 h-3.5" />}
                  disabled={
                    saving ||
                    !draftItems ||
                    (!dirty && !!existingDraftSheet)
                  }
                  onClick={handleSaveAsDraft}
                >
                  {saving ? 'Saving...' : 'Save as Draft'}
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                icon={<Save className="w-3.5 h-3.5" />}
                disabled={
                  isLocked ||
                  saving ||
                  !draftItems ||
                  !isWeightValid ||
                  (!dirty && !!existingSheet)
                }
                onClick={handleSave}
              >
                {saving
                  ? 'Saving...'
                  : existingSheet
                  ? 'Save KPI Sheet'
                  : 'Assign & Save KPI Sheet'}
              </Button>
            </div>
          }
        >
          {isLocked && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              This quarter's final evaluation has been released, so the sheet is read-only. Use “Override State” in the Manager Team Hub to unlock it.
            </div>
          )}
          {existingSheet && !isLocked && existingSheet.status !== 'Draft' && (
            <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-lg flex items-start gap-2 text-xs text-sky-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              This sheet is already in “{existingSheet.status}”. Edits keep existing actuals, justifications and review scores; changing a target recalculates only the self score.
            </div>
          )}

          {/* Live Total Weightage Counter & Validation Banner */}
          <div
            className={`mb-4 p-3 rounded-lg border flex flex-wrap items-center justify-between gap-2 text-xs ${
              isWeightValid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : totalWeight > 100
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {isWeightValid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Total Weightage: <strong>{totalWeight}%</strong> — Valid (Ready to save)
                  </span>
                </>
              ) : totalWeight < 100 ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Total Weightage: <strong>{totalWeight}%</strong> — Remaining:{' '}
                    <strong>{weightDiff}%</strong> needed to reach 100%. Saving is disabled until total equals 100%.
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Total Weightage: <strong>{totalWeight}%</strong> — Excess:{' '}
                    <strong>{weightDiff}%</strong> above 100%. Reduce weightage by{' '}
                    <strong>{weightDiff}%</strong> to save.
                  </span>
                </>
              )}
            </div>
            <span className="text-[11px] opacity-80">
              {(draftItems || []).length} KPIs
              {existingSheet?.kpiAssignedBy &&
                ` • Last edited by ${existingSheet.kpiAssignedBy} on ${new Date(
                  existingSheet.kpiAssignedAt || existingSheet.updatedAt || ''
                ).toLocaleString()}`}
            </span>
          </div>

          <Table
            headers={[
              '#',
              'KPI Title',
              'KPI Description',
              'Target Applicable',
              'Data Type',
              'Target Value',
              'Weightage (%)',
              '',
            ]}
          >
            {(draftItems || []).map((item, idx) => {
              const targetOn = item.showTarget !== false;
              const targetType = resolveTargetValueType(item);
              const customized = computeIsCustomized(item);
              return (
                <tr key={item.kpiId} className="align-top hover:bg-neutral-50">
                  <td className="px-3 py-3 text-xs font-mono text-neutral-500">
                    {idx + 1}
                    <div className="text-[10px] mt-1">{item.kpiId}</div>
                  </td>
                  <td className="px-3 py-3 min-w-[200px]">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={item.title}
                      onChange={(e) =>
                        updateDraft(item.kpiId, { title: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                    />
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-[10px] text-neutral-500">
                        {item.category}
                      </span>
                      {customized && (
                        <span className="text-[10px] font-bold text-sky-700">
                          • Customized
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 min-w-[260px]">
                    <textarea
                      rows={2}
                      disabled={isLocked}
                      value={item.description}
                      onChange={(e) =>
                        updateDraft(item.kpiId, { description: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => handleToggleTargetApplicable(item)}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                        isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                      } ${targetOn ? 'bg-emerald-600' : 'bg-neutral-300'}`}
                      role="switch"
                      aria-checked={targetOn}
                      aria-label={`Target applicable for ${item.title}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                          targetOn ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {targetOn && (
                      <select
                        disabled={isLocked}
                        value={targetType}
                        onChange={(e) =>
                          handleChangeTargetType(
                            item,
                            e.target.value as TargetValueType
                          )
                        }
                        aria-label={`Target data type for ${item.title}`}
                        className="px-2.5 py-1.5 text-xs font-medium border border-neutral-300 rounded-lg bg-white disabled:bg-neutral-100"
                      >
                        {TARGET_VALUE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {targetOn &&
                      (targetType === 'Text' ? (
                        <input
                          type="text"
                          disabled={isLocked}
                          placeholder="Enter target text..."
                          value={item.target ?? ''}
                          onChange={(e) =>
                            updateDraft(item.kpiId, {
                              target:
                                e.target.value.trim() === ''
                                  ? undefined
                                  : e.target.value,
                            })
                          }
                          aria-label={`Target value for ${item.title}`}
                          className="w-36 px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            min={targetType === 'Percentage' ? 0 : undefined}
                            max={targetType === 'Percentage' ? 100 : undefined}
                            disabled={isLocked}
                            placeholder={
                              targetType === 'Percentage' ? '0–100' : '0'
                            }
                            value={item.target ?? ''}
                            onChange={(e) =>
                              updateDraft(item.kpiId, {
                                target:
                                  e.target.value.trim() === ''
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                            aria-label={`Target value for ${item.title}`}
                            className="w-24 px-2.5 py-1.5 text-xs font-mono font-bold border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                          />
                          {targetType === 'Percentage' ? (
                            <span className="text-xs font-mono font-bold text-neutral-500">
                              %
                            </span>
                          ) : (
                            item.unit &&
                            item.unit !== '%' && (
                              <span className="text-[11px] text-neutral-500">
                                {item.unit}
                              </span>
                            )
                          )}
                        </div>
                      ))}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        disabled={isLocked}
                        value={Number.isFinite(item.weightage) ? item.weightage : 0}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const num =
                            raw === '' ? 0 : Math.max(0, Math.min(100, Number(raw)));
                          updateDraft(item.kpiId, {
                            weightage: Number.isFinite(num) ? num : 0,
                          });
                        }}
                        aria-label={`Weightage (%) for ${item.title}`}
                        className="w-20 px-2.5 py-1.5 text-xs font-mono font-bold text-sky-700 border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                      />
                      <span className="text-xs font-mono font-bold text-neutral-500">
                        %
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      size="xs"
                      variant="outline"
                      icon={<RotateCcw className="w-3 h-3" />}
                      disabled={isLocked || !customized || !masterById.has(item.kpiId)}
                      onClick={() => handleResetItemToTemplate(item.kpiId)}
                    >
                      Reset
                    </Button>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
    </div>
  );
};
