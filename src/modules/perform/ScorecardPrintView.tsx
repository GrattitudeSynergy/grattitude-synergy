import React from 'react';
import { Printer, Award, CheckCircle2 } from 'lucide-react';
import { Modal, Button, Badge, Table } from '../../core/components/DesignSystem';
import { getEffectiveItemScore } from './scoringEngine';
import type { PerformScorecard } from '../../core/types';

export const ScorecardPrintView: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  scorecard: PerformScorecard | null;
}> = ({ isOpen, onClose, scorecard }) => {
  if (!scorecard) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title={
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-sky-600" />
          <span>Official KPI Appraisal Scorecard Statement</span>
        </div>
      }
      subtitle={`${scorecard.employeeName} (${scorecard.employeeEcode}) • ${scorecard.fiscalYear} (${scorecard.quarter})`}
      footer={
        <div className="flex items-center gap-2 no-print">
          <Button variant="outline" onClick={onClose}>
            Close Preview
          </Button>
          <Button
            variant="primary"
            icon={<Printer className="w-4 h-4" />}
            onClick={handlePrint}
          >
            Print / Save as PDF
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Official Header */}
        <div className="p-5 bg-neutral-50 text-neutral-900 border border-neutral-200 rounded-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-sky-700">
              Grattitude Synergy — Enterprise Performance Management
            </div>
            <h3 className="text-lg font-extrabold mt-0.5 text-neutral-900">
              {scorecard.employeeName} ({scorecard.employeeEcode})
            </h3>
            <p className="text-xs text-neutral-600 mt-0.5">
              Department: {scorecard.department} • Level {scorecard.employeeLevel} • Cycle:{' '}
              {scorecard.fiscalYear} / {scorecard.quarter}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] uppercase text-neutral-500">
                Weighted Score
              </div>
              <div className="text-2xl font-extrabold text-neutral-900">
                {scorecard.totalWeightedScore.toFixed(2)}%
              </div>
            </div>
            <div className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-center">
              <div className="text-[10px] font-bold uppercase">Final Grade</div>
              <div className="text-2xl font-extrabold">{scorecard.grade}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-2.5">
          <div>
            <strong>Lifecycle Status:</strong>{' '}
            <Badge variant="info">{scorecard.status}</Badge>
          </div>
          <div className="font-mono text-neutral-500">
            Document ID: {scorecard.id}
          </div>
        </div>

        {/* 15 KPI Matrix Table */}
        <Table
          headers={[
            '#',
            'KPI & Performance Pillar',
            'Algorithm',
            'Target',
            'Actual',
            'Weight',
            'Self',
            'Mgr',
            'CEO',
            'Weighted Pts',
          ]}
        >
          {scorecard.items.map((item, idx) => {
            const effScore = getEffectiveItemScore(item, scorecard.status);
            const weightedPts = ((effScore * item.weightage) / 100).toFixed(2);
            return (
              <tr key={item.kpiId}>
                <td className="px-3 py-2.5 text-xs font-mono text-neutral-500">
                  {idx + 1}
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-xs font-bold text-neutral-900">
                    {item.title}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {item.category}
                  </div>
                  {item.selfJustification && (
                    <div className="text-[11px] text-neutral-600 mt-1 italic">
                      Justification: "{item.selfJustification}"
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[10px] font-mono text-neutral-600">
                  {item.scoringFormula}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono">
                  {item.target} {item.unit}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono font-bold">
                  {item.actual} {item.unit}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono">
                  {item.weightage}%
                </td>
                <td className="px-3 py-2.5 text-xs font-mono">
                  {item.selfScore.toFixed(0)}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono">
                  {item.managerScore > 0 ? item.managerScore.toFixed(0) : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono">
                  {item.ceoScore > 0 ? item.ceoScore.toFixed(0) : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono font-bold text-emerald-700">
                  {weightedPts}
                </td>
              </tr>
            );
          })}
        </Table>

        {(scorecard.manager1on1Notes || scorecard.ceoCalibrationNotes) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scorecard.manager1on1Notes && (
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs">
                <div className="font-bold text-neutral-900 mb-1">
                  Manager 1:1 Review Notes
                </div>
                <p className="text-neutral-700">{scorecard.manager1on1Notes}</p>
              </div>
            )}
            {scorecard.ceoCalibrationNotes && (
              <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs">
                <div className="font-bold text-neutral-900 mb-1">
                  CEO Executive Calibration Notes
                </div>
                <p className="text-neutral-700">{scorecard.ceoCalibrationNotes}</p>
              </div>
            )}
          </div>
        )}

        <div className="pt-4 border-t border-neutral-200 flex items-center justify-between text-[11px] text-neutral-500">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Deterministically Verified by Grattitude Synergy Scoring Engine</span>
          </div>
          <span>Printed on {new Date().toLocaleString()}</span>
        </div>
      </div>
    </Modal>
  );
};
