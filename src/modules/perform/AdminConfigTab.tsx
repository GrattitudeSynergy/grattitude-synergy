import React, { useState } from 'react';
import { Sliders, Save, CheckCircle2, AlertTriangle, Plus } from 'lucide-react';
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
  ScoringFormula,
  PerformancePillar,
} from '../../core/types';

export const AdminConfigTab: React.FC<{
  currentAdmin: Employee;
  allEmployees: Employee[];
  kpiMasters: PerformKpiMaster[];
  gradeConfig: PerformGradeConfig;
}> = ({ currentAdmin, allEmployees, kpiMasters, gradeConfig }) => {
  const { showToast } = useToast();
  const [selectedLevel, setSelectedLevel] = useState<number>(3);
  const [editingKpi, setEditingKpi] = useState<PerformKpiMaster | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Create KPI State (with optional Default Target)
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<PerformancePillar>('Delivery & Quality');
  const [newTargetInput, setNewTargetInput] = useState<string>('');
  const [newUnit, setNewUnit] = useState('%');
  const [newWeightage, setNewWeightage] = useState<number>(5);
  const [newFormula, setNewFormula] = useState<ScoringFormula>('DIRECT_PROPORTION');

  // Grade Cutoff State
  const [aPlus, setAPlus] = useState<number>(gradeConfig.cutoffs.APlus);
  const [aCut, setACut] = useState<number>(gradeConfig.cutoffs.A);
  const [bCut, setBCut] = useState<number>(gradeConfig.cutoffs.B);
  const [cCut, setCCut] = useState<number>(gradeConfig.cutoffs.C);

  const levelKpis = kpiMasters
    .filter((k) => k.level === selectedLevel)
    .sort((a, b) => a.id.localeCompare(b.id));

  const totalLevelWeight = levelKpis.reduce((sum, k) => sum + k.weightage, 0);

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
    await FirestoreEngine.setDocument('perform_config', 'grade_cutoffs', updated);
    await AuditService.log({
      action: 'GRADE_CUTOFFS_UPDATED',
      actor: currentAdmin,
      targetId: 'grade_cutoffs',
      targetType: 'PerformConfig',
      details: `Updated letter grade cutoffs: A+ >= ${aPlus}%, A >= ${aCut}%, B >= ${bCut}%, C >= ${cCut}%.`,
    });
    showToast('success', 'Grade Cutoffs Updated', 'New grading thresholds applied.');
  };

  const handleSaveKpiEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKpi) return;
    await FirestoreEngine.setDocument(
      'perform_kpi_masters',
      editingKpi.id,
      editingKpi
    );
    await AuditService.log({
      action: 'KPI_MASTER_UPDATED',
      actor: currentAdmin,
      targetId: editingKpi.id,
      targetType: 'PerformKpiMaster',
      details: `Updated KPI ${editingKpi.code} (${editingKpi.title}): Target=${editingKpi.target !== undefined ? `${editingKpi.target} ${editingKpi.unit}` : 'Optional (Not Set)'}, Weight=${editingKpi.weightage}%, Formula=${editingKpi.scoringFormula}.`,
    });
    showToast('success', 'Master KPI Saved', `${editingKpi.code} updated.`);
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
      details: `Created Master KPI ${newKpi.code} (${newKpi.title}) for Level ${selectedLevel}. Default Target: ${parsedTarget !== undefined ? `${parsedTarget} ${newKpi.unit}` : 'Optional (None)'}.`,
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
    setCreateModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Perform Module Access & Lock Controls */}
      <PerformLockSettings
        currentAdmin={currentAdmin}
        allEmployees={allEmployees}
      />

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
            Viewing Hierarchy Level {selectedLevel} Master KPIs ({levelKpis.length} items)
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
            'Weightage',
            'Edit',
          ]}
        >
          {levelKpis.map((kpi) => (
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
                {kpi.target !== undefined && kpi.target !== null
                  ? `${kpi.target} ${kpi.unit}`
                  : 'Optional (Not Set)'}
              </td>
              <td className="px-4 py-3 text-xs font-mono font-bold text-sky-700">
                {kpi.weightage}%
              </td>
              <td className="px-4 py-3">
                <Button
                  size="xs"
                  variant="outline"
                  icon={<Sliders className="w-3 h-3" />}
                  onClick={() => setEditingKpi({ ...kpi })}
                >
                  Configure
                </Button>
              </td>
            </tr>
          ))}
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
                KPI Title
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Default Target (Optional)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="Optional — leave blank if none"
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

      {/* Create New Master KPI Modal (Default Target Optional) */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        size="md"
        title={`Create New Master KPI — Level ${selectedLevel}`}
        subtitle="Default Target is optional. You can create and configure KPIs without specifying a default target."
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
                <option value="Delivery & Quality">Delivery & Quality</option>
                <option value="Technical/Domain Excellence">
                  Technical/Domain Excellence
                </option>
                <option value="Leadership & Ownership">
                  Leadership & Ownership
                </option>
                <option value="Client & Process Impact">
                  Client & Process Impact
                </option>
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

          <div className="grid grid-cols-3 gap-3">
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
