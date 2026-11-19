import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Save,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  Layers,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Table,
  Modal,
  useToast,
} from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { AuditService } from '../../core/services/auditService';
import { PerformLockSettings } from '../../core/directory/PerformLockSettings';
import type {
  Employee,
  PerformKpiMaster,
  PerformGradeConfig,
  PerformScorecard,
  PerformPillarsConfig,
  ScoringFormula,
  PerformancePillar,
} from '../../core/types';

export const DEFAULT_PERFORMANCE_PILLARS: string[] = [
  'Delivery & Quality',
  'Technical/Domain Excellence',
  'Leadership & Ownership',
  'Client & Process Impact',
];

export const AdminConfigTab: React.FC<{
  currentAdmin: Employee;
  allEmployees: Employee[];
  kpiMasters: PerformKpiMaster[];
  gradeConfig: PerformGradeConfig;
  scorecards?: PerformScorecard[];
  pillars?: string[];
}> = ({
  currentAdmin,
  allEmployees,
  kpiMasters,
  gradeConfig,
  scorecards = [],
  pillars: propPillars,
}) => {
  const { showToast } = useToast();
  const [selectedLevel, setSelectedLevel] = useState<number>(3);
  const [editingKpi, setEditingKpi] = useState<PerformKpiMaster | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Performance Pillars State
  const [pillarsList, setPillarsList] = useState<string[]>(
    propPillars && propPillars.length > 0
      ? propPillars
      : DEFAULT_PERFORMANCE_PILLARS
  );
  const [newPillarInput, setNewPillarInput] = useState('');
  const [editingPillarIdx, setEditingPillarIdx] = useState<number | null>(null);
  const [editingPillarValue, setEditingPillarValue] = useState('');

  useEffect(() => {
    if (propPillars && propPillars.length > 0) {
      setPillarsList(propPillars);
    }
  }, [propPillars]);

  // Also ensure any custom categories already used in kpiMasters are included in the dropdown list
  const effectivePillars = Array.from(
    new Set([
      ...pillarsList,
      ...kpiMasters.map((k) => k.category).filter(Boolean),
    ])
  );

  // Create KPI State (with optional Default Target & Target Visibility toggle)
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<PerformancePillar>(
    'Delivery & Quality'
  );
  const [newTargetInput, setNewTargetInput] = useState<string>('');
  const [newShowTarget, setNewShowTarget] = useState<boolean>(true);
  const [newUnit, setNewUnit] = useState('%');
  const [newWeightage, setNewWeightage] = useState<number>(5);
  const [newFormula, setNewFormula] =
    useState<ScoringFormula>('DIRECT_PROPORTION');

  // Grade Cutoff State
  const [aPlus, setAPlus] = useState<number>(gradeConfig.cutoffs.APlus);
  const [aCut, setACut] = useState<number>(gradeConfig.cutoffs.A);
  const [bCut, setBCut] = useState<number>(gradeConfig.cutoffs.B);
  const [cCut, setCCut] = useState<number>(gradeConfig.cutoffs.C);

  const levelKpis = kpiMasters
    .filter((k) => k.level === selectedLevel)
    .sort((a, b) => a.id.localeCompare(b.id));

  const totalLevelWeight = levelKpis.reduce((sum, k) => sum + k.weightage, 0);

  /**
   * Synchronize a Master KPI update across all existing employee scorecards
   * so updated description, title, category, target, and showTarget are reflected everywhere.
   */
  const syncMasterKpiToScorecards = async (updatedMaster: PerformKpiMaster) => {
    const affectedScorecards = scorecards.filter((sc) =>
      sc.items.some((item) => item.kpiId === updatedMaster.id)
    );
    for (const sc of affectedScorecards) {
      const nextItems = sc.items.map((item) => {
        if (item.kpiId !== updatedMaster.id) return item;
        // Preserve per-employee/per-quarter overrides made in Admin KPI Assignment
        if (item.isCustomized) {
          return {
            ...item,
            category: updatedMaster.category,
            unit: updatedMaster.unit,
            scoringFormula: updatedMaster.scoringFormula,
          };
        }
        return {
          ...item,
          title: updatedMaster.title,
          description: updatedMaster.description,
          category: updatedMaster.category,
          target: updatedMaster.target,
          showTarget: updatedMaster.showTarget ?? true,
          unit: updatedMaster.unit,
          weightage: updatedMaster.weightage,
          scoringFormula: updatedMaster.scoringFormula,
        };
      });
      await FirestoreEngine.setDocument('perform_scorecards', sc.id, {
        ...sc,
        items: nextItems,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  /**
   * Toggle Target Visibility directly from the KPI table or modal
   */
  const handleToggleTargetVisibility = async (kpi: PerformKpiMaster) => {
    const currentVisible = kpi.showTarget !== false;
    const nextVisible = !currentVisible;
    const updatedKpi: PerformKpiMaster = {
      ...kpi,
      showTarget: nextVisible,
    };

    await FirestoreEngine.setDocument(
      'perform_kpi_masters',
      updatedKpi.id,
      updatedKpi
    );
    await syncMasterKpiToScorecards(updatedKpi);

    await AuditService.log({
      action: 'KPI_TARGET_VISIBILITY_TOGGLED',
      actor: currentAdmin,
      targetId: updatedKpi.id,
      targetType: 'PerformKpiMaster',
      details: `${nextVisible ? 'Enabled' : 'Disabled'} target visibility for KPI ${updatedKpi.code} (${updatedKpi.title}).`,
    });

    showToast(
      'info',
      nextVisible ? 'Target Visibility Enabled' : 'Target Hidden',
      nextVisible
        ? `Target value is now visible for ${updatedKpi.code}.`
        : `Target value is now hidden (blank) for ${updatedKpi.code}.`
    );
  };

  /**
   * Save Performance Pillars list to Firestore (perform_config / performance_pillars)
   */
  const persistPillarsList = async (
    nextPillars: string[],
    renamedFrom?: string,
    renamedTo?: string
  ) => {
    setPillarsList(nextPillars);
    const cfg: PerformPillarsConfig = {
      id: 'performance_pillars',
      pillars: nextPillars,
      updatedAt: new Date().toISOString(),
    };
    await FirestoreEngine.setDocument(
      'perform_config',
      'performance_pillars',
      cfg
    );

    // If a pillar was renamed, update all KPIs and scorecard items referencing the old pillar name
    if (renamedFrom && renamedTo && renamedFrom !== renamedTo) {
      const kpisToUpdate = kpiMasters.filter((k) => k.category === renamedFrom);
      for (const kpi of kpisToUpdate) {
        const updatedKpi: PerformKpiMaster = {
          ...kpi,
          category: renamedTo,
        };
        await FirestoreEngine.setDocument(
          'perform_kpi_masters',
          updatedKpi.id,
          updatedKpi
        );
      }

      for (const sc of scorecards) {
        if (sc.items.some((i) => i.category === renamedFrom)) {
          const nextItems = sc.items.map((i) =>
            i.category === renamedFrom ? { ...i, category: renamedTo } : i
          );
          await FirestoreEngine.setDocument('perform_scorecards', sc.id, {
            ...sc,
            items: nextItems,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  };

  const handleAddPillar = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPillarInput.trim();
    if (!trimmed) return;
    if (
      effectivePillars.some((p) => p.toLowerCase() === trimmed.toLowerCase())
    ) {
      showToast(
        'warning',
        'Duplicate Pillar',
        `"${trimmed}" already exists in Performance Pillars.`
      );
      return;
    }
    const next = [...effectivePillars, trimmed];
    await persistPillarsList(next);
    await AuditService.log({
      action: 'PERFORMANCE_PILLAR_ADDED',
      actor: currentAdmin,
      targetId: 'performance_pillars',
      targetType: 'PerformConfig',
      details: `Added new Performance Pillar: "${trimmed}".`,
    });
    setNewPillarInput('');
    showToast(
      'success',
      'Performance Pillar Added',
      `"${trimmed}" is now available across all KPIs.`
    );
  };

  const handleSaveEditedPillar = async (idx: number) => {
    const trimmed = editingPillarValue.trim();
    const oldName = effectivePillars[idx];
    if (!trimmed || !oldName) {
      setEditingPillarIdx(null);
      return;
    }
    if (
      effectivePillars.some(
        (p, i) => i !== idx && p.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      showToast(
        'warning',
        'Duplicate Pillar Name',
        `Another pillar named "${trimmed}" already exists.`
      );
      return;
    }
    const next = effectivePillars.map((p, i) => (i === idx ? trimmed : p));
    await persistPillarsList(next, oldName, trimmed);
    await AuditService.log({
      action: 'PERFORMANCE_PILLAR_UPDATED',
      actor: currentAdmin,
      targetId: 'performance_pillars',
      targetType: 'PerformConfig',
      details: `Renamed Performance Pillar from "${oldName}" to "${trimmed}".`,
    });
    setEditingPillarIdx(null);
    setEditingPillarValue('');
    showToast(
      'success',
      'Performance Pillar Updated',
      `Updated "${oldName}" to "${trimmed}".`
    );
  };

  const handleDeletePillar = async (pillarName: string) => {
    const inUseCount = kpiMasters.filter(
      (k) => k.category === pillarName
    ).length;
    if (inUseCount > 0) {
      showToast(
        'warning',
        'Pillar In Use',
        `"${pillarName}" is currently assigned to ${inUseCount} KPI(s). Reassign or rename it instead.`
      );
      return;
    }
    const next = effectivePillars.filter((p) => p !== pillarName);
    await persistPillarsList(next);
    showToast(
      'info',
      'Performance Pillar Removed',
      `Removed "${pillarName}" from Performance Pillars.`
    );
  };

  const handleSaveCutoffs = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: PerformGradeConfig = {
      id: 'grade_cutoffs',
      cutoffs: {
        APlus: Number(aPlus),
        A: Number(aCut),
        B: Number(bCut),
        C: Number(cCut),
      },
      updatedAt: new Date().toISOString(),
    };
    await FirestoreEngine.setDocument(
      'perform_config',
      'grade_cutoffs',
      updated
    );
    await AuditService.log({
      action: 'GRADE_CUTOFFS_UPDATED',
      actor: currentAdmin,
      targetId: 'grade_cutoffs',
      targetType: 'PerformConfig',
      details: `Updated letter grade cutoffs: A+ >= ${aPlus}%, A >= ${aCut}%, B >= ${bCut}%, C >= ${cCut}%.`,
    });
    showToast(
      'success',
      'Grade Cutoffs Updated',
      'New grading thresholds applied.'
    );
  };

  const handleSaveKpiEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKpi) return;
    const updatedKpi: PerformKpiMaster = {
      ...editingKpi,
      title: editingKpi.title.trim(),
      description: editingKpi.description.trim(),
      showTarget: editingKpi.showTarget !== false,
    };

    await FirestoreEngine.setDocument(
      'perform_kpi_masters',
      updatedKpi.id,
      updatedKpi
    );
    await syncMasterKpiToScorecards(updatedKpi);

    await AuditService.log({
      action: 'KPI_MASTER_UPDATED',
      actor: currentAdmin,
      targetId: updatedKpi.id,
      targetType: 'PerformKpiMaster',
      details: `Updated KPI ${updatedKpi.code} (${updatedKpi.title}): Pillar=${updatedKpi.category}, Description="${updatedKpi.description}", Target=${updatedKpi.target !== undefined ? `${updatedKpi.target} ${updatedKpi.unit}` : 'None'}, ShowTarget=${updatedKpi.showTarget}, Weight=${updatedKpi.weightage}%, Formula=${updatedKpi.scoringFormula}.`,
    });
    showToast(
      'success',
      'Master KPI Saved',
      `${updatedKpi.code} updated and synced across scorecards.`
    );
    setEditingKpi(null);
  };

  const handleCreateKpiMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const code =
      newCode.trim() ||
      `KPI-L${selectedLevel}-${String(levelKpis.length + 1).padStart(2, '0')}`;
    const parsedTarget =
      newTargetInput.trim() === '' ? undefined : Number(newTargetInput);

    const newKpi: PerformKpiMaster = {
      id: code,
      level: selectedLevel,
      code,
      title: newTitle.trim(),
      description:
        newDescription.trim() || 'Configured KPI performance metric.',
      category: newCategory,
      target: parsedTarget,
      showTarget: newShowTarget,
      unit: newUnit.trim() || '%',
      weightage: Number(newWeightage) || 5,
      scoringFormula: newFormula,
    };

    await FirestoreEngine.setDocument('perform_kpi_masters', newKpi.id, newKpi);
    await AuditService.log({
      action: 'KPI_MASTER_CREATED',
      actor: currentAdmin,
      targetId: newKpi.id,
      targetType: 'PerformKpiMaster',
      details: `Created Master KPI ${newKpi.code} (${newKpi.title}) for Level ${selectedLevel}. Pillar: ${newKpi.category}, Target Visible: ${newShowTarget}.`,
    });

    showToast(
      'success',
      'New KPI Created',
      `${newKpi.code}: ${newKpi.title} added to Level ${selectedLevel}.`
    );
    setNewCode('');
    setNewTitle('');
    setNewDescription('');
    setNewTargetInput('');
    setNewShowTarget(true);
    setCreateModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Perform Module Access & Lock Controls */}
      <PerformLockSettings
        currentAdmin={currentAdmin}
        allEmployees={allEmployees}
      />

      {/* Editable Performance Pillars Management Card */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-600" />
            <span>Performance Pillars Configuration</span>
          </div>
        }
        subtitle="Edit existing performance pillars or add new performance pillars for KPI categorization."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {effectivePillars.map((pillar, idx) => {
              const count = kpiMasters.filter(
                (k) => k.category === pillar
              ).length;
              const isEditingThis = editingPillarIdx === idx;

              return (
                <div
                  key={pillar}
                  className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex flex-col justify-between gap-2"
                >
                  {isEditingThis ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editingPillarValue}
                        onChange={(e) => setEditingPillarValue(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-bold border border-sky-400 rounded-lg bg-white"
                        autoFocus
                      />
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => handleSaveEditedPillar(idx)}
                        >
                          Save
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setEditingPillarIdx(null);
                            setEditingPillarValue('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-neutral-900">
                            {pillar}
                          </div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            {count} KPI{count === 1 ? '' : 's'} assigned
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPillarIdx(idx);
                              setEditingPillarValue(pillar);
                            }}
                            className="p-1 text-neutral-500 hover:text-sky-700 hover:bg-neutral-200/60 rounded-md cursor-pointer"
                            title="Edit Pillar Name"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {count === 0 && (
                            <button
                              type="button"
                              onClick={() => handleDeletePillar(pillar)}
                              className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                              title="Remove Unused Pillar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleAddPillar}
            className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-200"
          >
            <input
              type="text"
              value={newPillarInput}
              onChange={(e) => setNewPillarInput(e.target.value)}
              placeholder="Enter new Performance Pillar name (e.g. Innovation & Strategic Growth)..."
              className="flex-1 min-w-[240px] px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            />
            <Button
              type="submit"
              size="sm"
              variant="primary"
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Performance Pillar
            </Button>
          </form>
        </div>
      </Card>

      {/* Letter Grade Cutoff Configuration */}
      <Card
        title="Enterprise Letter Grade Cutoffs Configuration (AdminConfigTab)"
        subtitle="Configure minimum percentage thresholds for A+, A, B, C, and D grades across all organizational scorecards."
      >
        <form
          onSubmit={handleSaveCutoffs}
          className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-bold text-emerald-800 mb-1">
              Grade A+ Cutoff (&gt;= %)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={aPlus}
              onChange={(e) => setAPlus(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-sky-800 mb-1">
              Grade A Cutoff (&gt;= %)
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={aCut}
              onChange={(e) => setACut(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1">
              Grade B Cutoff (&gt;= %)
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={bCut}
              onChange={(e) => setBCut(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-amber-800 mb-1">
              Grade C Cutoff (&gt;= %)
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={cCut}
              onChange={(e) => setCCut(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
            />
          </div>
          <div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              icon={<Save className="w-4 h-4" />}
            >
              Save Grade Cutoffs
            </Button>
          </div>
        </form>
        <div className="mt-3 text-[11px] text-neutral-500">
          Scores below <strong>{cCut}%</strong> automatically resolve to{' '}
          <Badge variant="danger">Grade D</Badge>.
        </div>
      </Card>

      {/* 75 Master KPI Catalog & Weightage Editor */}
      <Card
        title="75 Pre-Seeded Master KPI Catalog (perform_kpi_masters)"
        subtitle="15 standardized KPIs per Hierarchy Level (Levels 1 to 5). Total weightage per level must equal 100%."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                  selectedLevel === lvl
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                Level {lvl}
              </button>
            ))}
            <Button
              size="xs"
              variant="primary"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setCreateModalOpen(true)}
            >
              + Create KPI (Target Optional)
            </Button>
          </div>
        }
      >
        <div className="flex items-center justify-between mb-4 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
          <div className="text-xs font-bold text-neutral-800">
            Viewing Hierarchy Level {selectedLevel} Master KPIs (
            {levelKpis.length} items)
          </div>
          <div className="flex items-center gap-2">
            {totalLevelWeight === 100 ? (
              <Badge variant="success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Total Level Weight: {totalLevelWeight}% (Balanced)
              </Badge>
            ) : (
              <Badge variant="warning">
                <AlertTriangle className="w-3.5 h-3.5" />
                Total Level Weight: {totalLevelWeight}% (Target: 100%)
              </Badge>
            )}
          </div>
        </div>

        <Table
          headers={[
            'Code',
            'KPI Title & Description',
            'Performance Pillar',
            'Scoring Algorithm',
            'Default Target',
            'Target Visibility',
            'Weightage',
            'Edit',
          ]}
        >
          {levelKpis.map((kpi) => {
            const isTargetVisible = kpi.showTarget !== false;
            return (
              <tr key={kpi.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-xs font-mono font-bold text-neutral-800 whitespace-nowrap">
                  {kpi.code}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900">
                      {kpi.title}
                    </span>
                    {kpi.isHighImpact && (
                      <Badge variant="warning">High Impact</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    {kpi.description}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="info">{kpi.category}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="neutral" className="font-mono">
                    {kpi.scoringFormula}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs font-mono font-bold">
                  {isTargetVisible &&
                  kpi.target !== undefined &&
                  kpi.target !== null
                    ? `${kpi.target} ${kpi.unit}`
                    : ''}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleToggleTargetVisibility(kpi)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                      isTargetVisible
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                        : 'bg-neutral-100 text-neutral-500 border-neutral-300 hover:bg-neutral-200'
                    }`}
                    title={
                      isTargetVisible
                        ? 'Target is visible — Click to hide target'
                        : 'Target is hidden — Click to show target'
                    }
                  >
                    {isTargetVisible ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Visible</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Hidden</span>
                      </>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs font-mono font-bold text-sky-700">
                  {kpi.weightage}%
                </td>
                <td className="px-4 py-3">
                  <Button
                    size="xs"
                    variant="outline"
                    icon={<Sliders className="w-3 h-3" />}
                    onClick={() =>
                      setEditingKpi({
                        ...kpi,
                        showTarget: kpi.showTarget !== false,
                      })
                    }
                  >
                    Configure
                  </Button>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {/* Edit Master KPI Modal */}
      <Modal
        isOpen={Boolean(editingKpi)}
        onClose={() => setEditingKpi(null)}
        size="md"
        title={
          editingKpi
            ? `Configure Master KPI — ${editingKpi.code}`
            : 'Configure KPI'
        }
      >
        {editingKpi && (
          <form onSubmit={handleSaveKpiEdit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                KPI Title *
              </label>
              <input
                type="text"
                required
                value={editingKpi.title}
                onChange={(e) =>
                  setEditingKpi({ ...editingKpi, title: e.target.value })
                }
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                KPI Description *
              </label>
              <textarea
                rows={3}
                required
                value={editingKpi.description}
                onChange={(e) =>
                  setEditingKpi({
                    ...editingKpi,
                    description: e.target.value,
                  })
                }
                placeholder="Enter detailed KPI description..."
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Performance Pillar *
              </label>
              <select
                value={editingKpi.category}
                onChange={(e) =>
                  setEditingKpi({
                    ...editingKpi,
                    category: e.target.value as PerformancePillar,
                  })
                }
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                {effectivePillars.map((pillar) => (
                  <option key={pillar} value={pillar}>
                    {pillar}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Visibility Toggle inside Edit Modal */}
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-neutral-900">
                  Target Visibility
                </div>
                <div className="text-[11px] text-neutral-500">
                  {editingKpi.showTarget !== false
                    ? 'Enabled: Target value is displayed on scorecards and tables.'
                    : 'Disabled: Target section is left completely blank.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingKpi({
                    ...editingKpi,
                    showTarget: editingKpi.showTarget === false ? true : false,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  editingKpi.showTarget !== false
                    ? 'bg-emerald-600'
                    : 'bg-neutral-300'
                }`}
                role="switch"
                aria-checked={editingKpi.showTarget !== false}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                    editingKpi.showTarget !== false
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {editingKpi.showTarget !== false && (
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    Default Target (Optional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="Optional"
                    value={editingKpi.target ?? ''}
                    onChange={(e) =>
                      setEditingKpi({
                        ...editingKpi,
                        target:
                          e.target.value.trim() === ''
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Unit
                </label>
                <input
                  type="text"
                  value={editingKpi.unit}
                  onChange={(e) =>
                    setEditingKpi({
                      ...editingKpi,
                      unit: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Weightage (%)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={100}
                  value={editingKpi.weightage}
                  onChange={(e) =>
                    setEditingKpi({
                      ...editingKpi,
                      weightage: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Deterministic Scoring Formula
              </label>
              <select
                value={editingKpi.scoringFormula}
                onChange={(e) =>
                  setEditingKpi({
                    ...editingKpi,
                    scoringFormula: e.target.value as ScoringFormula,
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg bg-white"
              >
                <option value="DIRECT_PROPORTION">DIRECT_PROPORTION</option>
                <option value="INVERSE_PROPORTION">INVERSE_PROPORTION</option>
                <option value="STEP_MILESTONE">STEP_MILESTONE</option>
                <option value="SLAB_SCALE">SLAB_SCALE</option>
                <option value="BOOLEAN_BINARY">BOOLEAN_BINARY</option>
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingKpi(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Master KPI
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Create New Master KPI Modal (Default Target Optional + Target Visibility Toggle) */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        size="md"
        title={`Create New Master KPI — Level ${selectedLevel}`}
        subtitle="Configure title, description, performance pillar, and target visibility."
      >
        <form onSubmit={handleCreateKpiMaster} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                KPI Code (Optional Auto)
              </label>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder={`e.g. KPI-L${selectedLevel}-16`}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Performance Pillar *
              </label>
              <select
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as PerformancePillar)
                }
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                {effectivePillars.map((pillar) => (
                  <option key={pillar} value={pillar}>
                    {pillar}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              KPI Title *
            </label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Sprint Predictability & Delivery Quality"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Describe how this KPI is evaluated..."
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          {/* Target Visibility Toggle */}
          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-neutral-900">
                Target Visibility
              </div>
              <div className="text-[11px] text-neutral-500">
                {newShowTarget
                  ? 'Enabled: Display target value for this KPI.'
                  : 'Disabled: Hide target value and leave target section blank.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNewShowTarget((prev) => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                newShowTarget ? 'bg-emerald-600' : 'bg-neutral-300'
              }`}
              role="switch"
              aria-checked={newShowTarget}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                  newShowTarget ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {newShowTarget && (
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Default Target (Optional)
                </label>
                <input
                  type="number"
                  step="any"
                  value={newTargetInput}
                  onChange={(e) => setNewTargetInput(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Unit
              </label>
              <input
                type="text"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="%, hrs, count"
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Weightage (%) *
              </label>
              <input
                type="number"
                required
                min={1}
                max={100}
                value={newWeightage}
                onChange={(e) => setNewWeightage(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Scoring Algorithm
            </label>
            <select
              value={newFormula}
              onChange={(e) => setNewFormula(e.target.value as ScoringFormula)}
              className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg bg-white"
            >
              <option value="DIRECT_PROPORTION">DIRECT_PROPORTION</option>
              <option value="INVERSE_PROPORTION">INVERSE_PROPORTION</option>
              <option value="STEP_MILESTONE">STEP_MILESTONE</option>
              <option value="SLAB_SCALE">SLAB_SCALE</option>
              <option value="BOOLEAN_BINARY">BOOLEAN_BINARY</option>
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create KPI
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
