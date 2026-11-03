import React from 'react';
import {
  TrendingUp,
  Trophy,
  Percent,
  BarChart3,
  CalendarClock,
  FilterX,
} from 'lucide-react';
import { Card, Badge, Button } from '../../core/components/DesignSystem';
import type { Lead, DealStage, LeadSource } from '../../core/types';

export const DEAL_STAGES: DealStage[] = [
  'Lead',
  'Contacted',
  'Discovery',
  'Proposal',
  'Negotiation',
  'Won',
  'Lost',
];

export const LEAD_SOURCES: LeadSource[] = [
  'Website',
  'Referral',
  'Cold Outreach',
  'Event',
  'Partner',
  'Inbound Call',
  'Other',
];

export const ConnectMetricsDashboard: React.FC<{
  leads: Lead[];
  selectedStageFilter: DealStage | null;
  selectedSourceFilter: LeadSource | null;
  onSelectStage: (stage: DealStage | null) => void;
  onSelectSource: (source: LeadSource | null) => void;
}> = ({
  leads,
  selectedStageFilter,
  selectedSourceFilter,
  onSelectStage,
  onSelectSource,
}) => {
  const totalPipelineValue = leads
    .filter((l) => l.stage !== 'Lost')
    .reduce((sum, l) => sum + l.value, 0);

  const wonLeads = leads.filter((l) => l.stage === 'Won');
  const lostLeads = leads.filter((l) => l.stage === 'Lost');
  const totalWonValue = wonLeads.reduce((sum, l) => sum + l.value, 0);

  const closedCount = wonLeads.length + lostLeads.length;
  const winRatePct =
    closedCount > 0
      ? Math.round((wonLeads.length / closedCount) * 100)
      : leads.length > 0
      ? Math.round((wonLeads.length / leads.length) * 100)
      : 0;

  const avgDealSize =
    leads.length > 0
      ? Math.round(
          leads.reduce((sum, l) => sum + l.value, 0) / leads.length
        )
      : 0;

  const currentYearMonth = new Date().toISOString().slice(0, 7);
  const dealsClosingThisMonth = leads.filter((l) =>
    l.expectedCloseDate.startsWith(currentYearMonth)
  ).length;

  return (
    <div className="space-y-4">
      {/* 5 Top Interactive Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold">
            <span>Total Pipeline Value</span>
            <TrendingUp className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-lg font-mono font-extrabold text-neutral-900 mt-1.5">
            ₹{totalPipelineValue.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Active & Won deals
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold">
            <span>Total Won Value</span>
            <Trophy className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-mono font-extrabold text-emerald-700 mt-1.5">
            ₹{totalWonValue.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            {wonLeads.length} closed-won deal(s)
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold">
            <span>Win Rate %</span>
            <Percent className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-lg font-mono font-extrabold text-neutral-900 mt-1.5">
            {winRatePct}%
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Won vs closed ratio
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold">
            <span>Average Deal Size</span>
            <BarChart3 className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg font-mono font-extrabold text-neutral-900 mt-1.5">
            ₹{avgDealSize.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Across {leads.length} total lead(s)
          </div>
        </div>

        <div className="p-4 bg-white border border-neutral-200 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold">
            <span>Closing This Month</span>
            <CalendarClock className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-lg font-mono font-extrabold text-neutral-900 mt-1.5">
            {dealsClosingThisMonth}
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            Target month {currentYearMonth}
          </div>
        </div>
      </div>

      {/* Interactive Breakdown by Stage & Lead Source (Clicking filters Kanban & Table) */}
      <Card
        title="Interactive Pipeline Breakdown by Stage & Lead Source"
        subtitle="Click any Stage or Lead Source card below to dynamically filter both the Kanban Board and Table views."
        action={
          (selectedStageFilter || selectedSourceFilter) && (
            <Button
              size="xs"
              variant="outline"
              icon={<FilterX className="w-3.5 h-3.5" />}
              onClick={() => {
                onSelectStage(null);
                onSelectSource(null);
              }}
            >
              Clear Active Filters
            </Button>
          )
        }
      >
        <div className="space-y-4">
          <div>
            <div className="text-[11px] font-bold uppercase text-neutral-500 mb-2">
              Filter by 7 Deal Stages
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {DEAL_STAGES.map((stage) => {
                const stageLeads = leads.filter((l) => l.stage === stage);
                const val = stageLeads.reduce((s, l) => s + l.value, 0);
                const active = selectedStageFilter === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => onSelectStage(active ? null : stage)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                        : 'bg-neutral-50 text-neutral-800 border-neutral-200 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>{stage}</span>
                      <span className="font-mono">{stageLeads.length}</span>
                    </div>
                    <div
                      className={`text-[11px] font-mono mt-1 truncate ${
                        active ? 'text-sky-300' : 'text-neutral-500'
                      }`}
                    >
                      ₹{val.toLocaleString('en-IN')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase text-neutral-500 mb-2">
              Filter by 7 Lead Sources
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {LEAD_SOURCES.map((source) => {
                const srcLeads = leads.filter((l) => l.source === source);
                const active = selectedSourceFilter === source;
                return (
                  <button
                    key={source}
                    type="button"
                    onClick={() => onSelectSource(active ? null : source)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-neutral-50 text-neutral-800 border-neutral-200 hover:bg-white'
                    }`}
                  >
                    <div className="text-xs font-bold truncate">{source}</div>
                    <div
                      className={`text-[11px] font-mono mt-0.5 ${
                        active ? 'text-white' : 'text-neutral-500'
                      }`}
                    >
                      {srcLeads.length} deal{srcLeads.length === 1 ? '' : 's'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
