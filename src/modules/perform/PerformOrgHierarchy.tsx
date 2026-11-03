import React from 'react';
import { GitBranch, Users, Award } from 'lucide-react';
import { Card, Badge } from '../../core/components/DesignSystem';
import type { Employee, PerformScorecard } from '../../core/types';

export const PerformOrgHierarchy: React.FC<{
  employees: Employee[];
  scorecards: PerformScorecard[];
}> = ({ employees, scorecards }) => {
  const scMap = new Map<string, PerformScorecard>();
  scorecards.forEach((sc) => scMap.set(sc.employeeId, sc));

  // Find root nodes (no reportingManagerId or reportingManagerId not in employees)
  const empIds = new Set(employees.map((e) => e.id));
  const roots = employees.filter(
    (e) => !e.reportingManagerId || !empIds.has(e.reportingManagerId)
  );

  const getDirectReports = (managerId: string): Employee[] =>
    employees.filter((e) => e.reportingManagerId === managerId);

  const renderNode = (emp: Employee, depth = 0): React.ReactNode => {
    const reports = getDirectReports(emp.id);
    const sc = scMap.get(emp.id);

    return (
      <div key={emp.id} className="space-y-2">
        <div
          className={`p-3.5 rounded-xl border bg-white shadow-2xs flex flex-wrap items-center justify-between gap-3 ${
            depth === 0
              ? 'border-neutral-900 bg-neutral-50'
              : 'border-neutral-200'
          }`}
          style={{ marginLeft: `${Math.min(depth * 28, 140)}px` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white text-xs font-extrabold flex items-center justify-center">
              L{emp.level}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-neutral-900">
                  {emp.name}
                </span>
                <span className="text-[11px] font-mono text-neutral-500">
                  ({emp.ecode})
                </span>
                <Badge variant="neutral">{emp.role}</Badge>
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                {emp.designation} • {emp.department}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {emp.level === 0 ? (
              <Badge variant="info">Intern Enablement Track</Badge>
            ) : sc ? (
              <>
                <Badge variant="info">{sc.status}</Badge>
                <Badge variant="success">
                  <Award className="w-3 h-3" />
                  {sc.totalWeightedScore.toFixed(1)}% ({sc.grade})
                </Badge>
              </>
            ) : (
              <Badge variant="neutral">Scorecard Not Initialized</Badge>
            )}
            {reports.length > 0 && (
              <Badge variant="warning">
                <Users className="w-3 h-3" />
                {reports.length} Report{reports.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </div>

        {reports.length > 0 && (
          <div className="space-y-2 border-l-2 border-neutral-200 ml-4 pl-2">
            {reports.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-sky-600" />
          <span>Organizational Reporting Hierarchy & Appraisal Matrix</span>
        </div>
      }
      subtitle="Live tree visualization of reporting lines, hierarchy levels (L0–L5), and active scorecard grades."
    >
      <div className="space-y-3">
        {roots.map((root) => renderNode(root, 0))}
      </div>
    </Card>
  );
};
