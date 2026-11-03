import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  LayoutGrid,
  Table as TableIcon,
  Plus,
  Download,
  Upload,
  Search,
  ArrowRight,
  Lock,
  AlertCircle,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Table,
  Modal,
  EmptyState,
  useToast,
} from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { AuditService } from '../../core/services/auditService';
import {
  ConnectMetricsDashboard,
  DEAL_STAGES,
  LEAD_SOURCES,
} from './ConnectMetricsDashboard';
import { LeadWonLostModal } from './LeadWonLostModal';
import { LeadDetailModal } from './LeadDetailModal';
import type {
  Employee,
  Lead,
  DealStage,
  LeadSource,
  WonReason,
  LostReason,
  LeadActivityType,
} from '../../core/types';

export const ConnectModule: React.FC<{
  currentEmployee: Employee;
}> = ({ currentEmployee }) => {
  const { showToast } = useToast();
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Interactive Filters
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<DealStage | null>(null);
  const [sourceFilter, setSourceFilter] = useState<LeadSource | null>(null);
  const [sortBy, setSortBy] = useState<'value' | 'expectedCloseDate' | 'updatedAt'>(
    'updatedAt'
  );

  // Create Lead Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<LeadSource>('Website');
  const [value, setValue] = useState<number>(450000);
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [assignedRepId, setAssignedRepId] = useState(currentEmployee.id);

  // Won/Lost Modal Gate
  const [wonLostTarget, setWonLostTarget] = useState<{
    lead: Lead;
    targetStage: 'Won' | 'Lost';
  } | null>(null);

  // Lead Detail Modal
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  // Drag-and-drop state
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  // CSV Import Modal
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [csvDefaultRepId, setCsvDefaultRepId] = useState(currentEmployee.id);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  useEffect(() => {
    const u1 = FirestoreEngine.subscribeCollection<Lead>(
      'connect_leads',
      setLeads
    );
    const u2 = FirestoreEngine.subscribeCollection<Employee>(
      'employees',
      setEmployees
    );
    return () => {
      u1();
      u2();
    };
  }, []);

  if (!currentEmployee.hasCrmAccess) {
    return (
      <Card title="Connect (CRM) Access Restricted">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
          <Lock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-rose-900">
              CRM Access Disabled (`hasCrmAccess: false`)
            </h4>
            <p className="text-xs text-rose-700 mt-1">
              Your employee profile does not have Connect (CRM) pipeline permissions enabled. Contact Corporate Admin (`EMP-001`) to request CRM access.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const crmReps = employees.filter((e) => e.hasCrmAccess);

  const filteredLeads = leads
    .filter((l) => {
      const matchesSearch =
        l.title.toLowerCase().includes(search.toLowerCase()) ||
        l.company.toLowerCase().includes(search.toLowerCase()) ||
        l.contactName.toLowerCase().includes(search.toLowerCase());
      const matchesStage = !stageFilter || l.stage === stageFilter;
      const matchesSource = !sourceFilter || l.source === sourceFilter;
      return matchesSearch && matchesStage && matchesSource;
    })
    .sort((a, b) => {
      if (sortBy === 'value') return b.value - a.value;
      if (sortBy === 'expectedCloseDate')
        return a.expectedCloseDate.localeCompare(b.expectedCloseDate);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const selectedLead =
    leads.find((l) => l.id === selectedLeadId) || null;

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !company.trim() || !contactName.trim()) return;

    const rep =
      employees.find((emp) => emp.id === assignedRepId) || currentEmployee;
    const nowIso = new Date().toISOString();

    const newLead: Lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(),
      company: company.trim(),
      contactName: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      source,
      assignedRepId: rep.id,
      assignedRepName: rep.name,
      value: Number(value) || 0,
      expectedCloseDate,
      stage: 'Lead',
      stageHistory: [
        {
          id: `sh_${Date.now()}`,
          fromStage: 'Created',
          toStage: 'Lead',
          timestamp: nowIso,
          changedByName: currentEmployee.name,
          reason: `Lead created via Connect CRM (${source})`,
        },
      ],
      activities: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await FirestoreEngine.setDocument('connect_leads', newLead.id, newLead);
    await AuditService.log({
      action: 'CRM_LEAD_CREATED',
      actor: currentEmployee,
      targetId: newLead.id,
      targetType: 'Lead',
      details: `Created CRM deal "${newLead.title}" (${newLead.company}) worth ₹${newLead.value.toLocaleString('en-IN')}.`,
    });

    showToast(
      'success',
      'Deal Added to Pipeline',
      `${newLead.title} (${newLead.company}) created.`
    );
    setTitle('');
    setCompany('');
    setContactName('');
    setEmail('');
    setPhone('');
    setAddModalOpen(false);
  };

  const requestStageTransition = async (lead: Lead, nextStage: DealStage) => {
    if (lead.stage === nextStage) return;

    if (nextStage === 'Won' || nextStage === 'Lost') {
      setWonLostTarget({ lead, targetStage: nextStage });
      return;
    }

    const nowIso = new Date().toISOString();
    const updated: Lead = {
      ...lead,
      stage: nextStage,
      stageHistory: [
        {
          id: `sh_${Date.now()}`,
          fromStage: lead.stage,
          toStage: nextStage,
          timestamp: nowIso,
          changedByName: currentEmployee.name,
        },
        ...lead.stageHistory,
      ],
      updatedAt: nowIso,
    };

    await FirestoreEngine.setDocument('connect_leads', lead.id, updated);
    showToast(
      'info',
      'Pipeline Stage Advanced',
      `${lead.title} moved from ${lead.stage} → ${nextStage}.`
    );
  };

  const handleConfirmWonLost = async (params: {
    wonReason?: WonReason;
    lostReason?: LostReason;
    closeNotes: string;
  }) => {
    if (!wonLostTarget) return;
    const { lead, targetStage } = wonLostTarget;
    const nowIso = new Date().toISOString();

    const updated: Lead = {
      ...lead,
      stage: targetStage,
      wonReason: params.wonReason,
      lostReason: params.lostReason,
      closeNotes: params.closeNotes,
      stageHistory: [
        {
          id: `sh_${Date.now()}`,
          fromStage: lead.stage,
          toStage: targetStage,
          timestamp: nowIso,
          changedByName: currentEmployee.name,
          reason: `${params.wonReason || params.lostReason}: ${params.closeNotes}`,
        },
        ...lead.stageHistory,
      ],
      updatedAt: nowIso,
    };

    await FirestoreEngine.setDocument('connect_leads', lead.id, updated);
    await AuditService.log({
      action: `CRM_DEAL_${targetStage.toUpperCase()}`,
      actor: currentEmployee,
      targetId: lead.id,
      targetType: 'Lead',
      details: `Marked "${lead.title}" (${lead.company}, ₹${lead.value.toLocaleString('en-IN')}) as ${targetStage}. Reason: ${params.wonReason || params.lostReason}. Notes: ${params.closeNotes}`,
    });

    showToast(
      targetStage === 'Won' ? 'success' : 'warning',
      `Deal Closed — ${targetStage}`,
      `${lead.title} recorded as ${targetStage}.`
    );
    setWonLostTarget(null);
  };

  const handleLogActivity = async (
    lead: Lead,
    act: {
      type: LeadActivityType;
      date: string;
      durationOrSummary: string;
      notes: string;
    }
  ) => {
    const nowIso = new Date().toISOString();
    const updated: Lead = {
      ...lead,
      activities: [
        {
          id: `act_${Date.now()}`,
          type: act.type,
          date: act.date,
          durationOrSummary: act.durationOrSummary,
          notes: act.notes,
          authorName: currentEmployee.name,
          createdAt: nowIso,
        },
        ...lead.activities,
      ],
      updatedAt: nowIso,
    };
    await FirestoreEngine.setDocument('connect_leads', lead.id, updated);
    showToast('success', `${act.type} Logged`, act.durationOrSummary);
  };

  // CSV Export of Current Filtered Pipeline
  const handleExportCsv = () => {
    const headers = [
      'Title',
      'Company',
      'ContactName',
      'Email',
      'Phone',
      'Source',
      'ValueINR',
      'ExpectedCloseDate',
      'Stage',
      'AssignedRep',
    ];
    const rows = filteredLeads.map((l) => [
      `"${l.title.replace(/"/g, '""')}"`,
      `"${l.company.replace(/"/g, '""')}"`,
      `"${l.contactName.replace(/"/g, '""')}"`,
      `"${l.email}"`,
      `"${l.phone}"`,
      `"${l.source}"`,
      l.value,
      l.expectedCloseDate,
      `"${l.stage}"`,
      `"${l.assignedRepName}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join(
      '\n'
    );
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grattitude_synergy_pipeline_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
      'success',
      'Pipeline CSV Exported',
      `Exported ${filteredLeads.length} deal record(s).`
    );
  };

  // Bulk CSV Import with Client-Side Column Validation & Row-by-Row Error Reporting
  const handleBulkCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setCsvErrors([]);

    const lines = csvRawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setCsvErrors([
        'CSV must include a header row and at least 1 data row. Expected columns: Title,Company,ContactName,Email,Phone,Source,ValueINR,ExpectedCloseDate',
      ]);
      return;
    }

    const headerCols = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const requiredCols = ['title', 'company', 'contactname', 'valueinr'];
    const missingCols = requiredCols.filter((rc) => !headerCols.includes(rc));

    if (missingCols.length > 0) {
      setCsvErrors([
        `Missing mandatory CSV columns: ${missingCols.join(', ')}. Header must contain: Title,Company,ContactName,Email,Phone,Source,ValueINR,ExpectedCloseDate`,
      ]);
      return;
    }

    const rowErrors: string[] = [];
    const validLeads: Lead[] = [];
    const rep =
      employees.find((emp) => emp.id === csvDefaultRepId) || currentEmployee;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      const rowMap: Record<string, string> = {};
      headerCols.forEach((h, idx) => {
        rowMap[h] = cols[idx] || '';
      });

      const rTitle = rowMap['title'];
      const rCompany = rowMap['company'];
      const rContact = rowMap['contactname'];
      const rVal = Number(rowMap['valueinr']);
      const rSource = (rowMap['source'] || 'Website') as LeadSource;
      const rDate =
        rowMap['expectedclosedate'] || new Date().toISOString().slice(0, 10);

      if (!rTitle || !rCompany || !rContact) {
        rowErrors.push(
          `Row ${i + 1}: Missing Title, Company, or ContactName.`
        );
        continue;
      }
      if (!Number.isFinite(rVal) || rVal <= 0) {
        rowErrors.push(
          `Row ${i + 1} ("${rTitle}"): Invalid ValueINR "${rowMap['valueinr']}". Must be a positive number.`
        );
        continue;
      }

      const validSource: LeadSource = LEAD_SOURCES.includes(rSource)
        ? rSource
        : 'Other';
      const nowIso = new Date().toISOString();

      validLeads.push({
        id: `lead_csv_${Date.now()}_${i}`,
        title: rTitle,
        company: rCompany,
        contactName: rContact,
        email: rowMap['email'] || 'contact@enterprise.in',
        phone: rowMap['phone'] || '+91 98000 00000',
        source: validSource,
        assignedRepId: rep.id,
        assignedRepName: rep.name,
        value: rVal,
        expectedCloseDate: rDate,
        stage: 'Lead',
        stageHistory: [
          {
            id: `sh_${Date.now()}_${i}`,
            fromStage: 'CSV Import',
            toStage: 'Lead',
            timestamp: nowIso,
            changedByName: currentEmployee.name,
            reason: 'Imported via Bulk CSV Pipeline Loader',
          },
        ],
        activities: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    if (rowErrors.length > 0) {
      setCsvErrors(rowErrors);
      return;
    }

    for (const item of validLeads) {
      await FirestoreEngine.setDocument('connect_leads', item.id, item);
    }

    showToast(
      'success',
      'Bulk CSV Import Complete',
      `Imported ${validLeads.length} validated deal(s) into Connect CRM.`
    );
    setCsvRawText('');
    setCsvModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Metrics & Interactive Filter Dashboard */}
      <ConnectMetricsDashboard
        leads={leads}
        selectedStageFilter={stageFilter}
        selectedSourceFilter={sourceFilter}
        onSelectStage={setStageFilter}
        onSelectSource={setSourceFilter}
      />

      {/* Pipeline Action & View Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-neutral-200 rounded-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Kanban vs Table Switcher */}
          <div className="inline-flex border border-neutral-300 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-700 hover:bg-neutral-50'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Table View</span>
            </button>
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deal, company, contact..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
          >
            <option value="updatedAt">Sort: Recently Updated</option>
            <option value="value">Sort: Highest Deal Value (₹)</option>
            <option value="expectedCloseDate">Sort: Expected Close Date</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => {
              setCsvErrors([]);
              setCsvModalOpen(true);
            }}
          >
            Bulk CSV Import
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportCsv}
          >
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setAddModalOpen(true)}
          >
            New Deal / Lead
          </Button>
        </div>
      </div>

      {/* Empty Pipeline State (Pre-Seeded Requirement: Connect CRM starts empty) */}
      {leads.length === 0 ? (
        <EmptyState
          title="Sales Pipeline Starts Empty (Zero Pre-Seeded Leads)"
          description="No sales reps or leads are pre-seeded at launch. Create a new deal or run a Bulk CSV Import to populate the 7-stage pipeline."
          icon={<Briefcase className="w-6 h-6 text-sky-600" />}
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setAddModalOpen(true)}
              >
                Create First Pipeline Deal
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Upload className="w-4 h-4" />}
                onClick={() => setCsvModalOpen(true)}
              >
                Import CSV Pipeline
              </Button>
            </div>
          }
        />
      ) : viewMode === 'kanban' ? (
        /* 7-STAGE INTERACTIVE KANBAN BOARD (Drag-and-Drop + Stage Advancement) */
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 overflow-x-auto pb-2">
          {DEAL_STAGES.map((stage) => {
            const colLeads = filteredLeads.filter((l) => l.stage === stage);
            const colTotal = colLeads.reduce((s, l) => s + l.value, 0);
            const stageIdx = DEAL_STAGES.indexOf(stage);

            return (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!draggedLeadId) return;
                  const found = leads.find((l) => l.id === draggedLeadId);
                  if (found) requestStageTransition(found, stage);
                  setDraggedLeadId(null);
                }}
                className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex flex-col min-h-[420px]"
              >
                <div className="pb-2.5 mb-2.5 border-b border-neutral-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-neutral-900">
                      {stage}
                    </span>
                    <Badge
                      variant={
                        stage === 'Won'
                          ? 'success'
                          : stage === 'Lost'
                          ? 'danger'
                          : 'neutral'
                      }
                    >
                      {colLeads.length}
                    </Badge>
                  </div>
                  <div className="text-[11px] font-mono font-bold text-sky-700 mt-1">
                    ₹{colTotal.toLocaleString('en-IN')}
                  </div>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => setDraggedLeadId(lead.id)}
                      className="p-3 bg-white border border-neutral-200 rounded-lg shadow-2xs hover:border-neutral-400 transition-all space-y-2 cursor-grab"
                    >
                      <div
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="cursor-pointer"
                      >
                        <div className="text-xs font-bold text-neutral-900 leading-snug">
                          {lead.title}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {lead.company} • {lead.contactName}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono font-bold text-emerald-700">
                        <span>₹{lead.value.toLocaleString('en-IN')}</span>
                        <Badge variant="info" className="text-[10px]">
                          {lead.source}
                        </Badge>
                      </div>

                      <div className="text-[10px] text-neutral-500 flex items-center justify-between">
                        <span>Rep: {lead.assignedRepName}</span>
                        <span className="font-mono">{lead.expectedCloseDate}</span>
                      </div>

                      {/* Quick Stage Advancement Controls */}
                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-1">
                        {stageIdx < 4 && (
                          <button
                            type="button"
                            onClick={() =>
                              requestStageTransition(
                                lead,
                                DEAL_STAGES[stageIdx + 1]
                              )
                            }
                            className="px-2 py-1 text-[10px] font-bold bg-neutral-900 text-white rounded-md hover:bg-neutral-800 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>{DEAL_STAGES[stageIdx + 1]}</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        )}
                        {stage !== 'Won' && stage !== 'Lost' && (
                          <div className="flex items-center gap-1 ml-auto">
                            <button
                              type="button"
                              onClick={() =>
                                requestStageTransition(lead, 'Won')
                              }
                              className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-sm hover:bg-emerald-100 cursor-pointer"
                            >
                              Won
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                requestStageTransition(lead, 'Lost')
                              }
                              className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-sm hover:bg-rose-100 cursor-pointer"
                            >
                              Lost
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* COMPREHENSIVE SORTABLE, FILTERABLE TABLE VIEW */
        <Card title="Connect CRM — Comprehensive Pipeline Table View">
          <Table
            headers={[
              'Deal Title & Company',
              'Contact',
              'Source',
              'Value (₹ INR)',
              'Assigned Rep',
              'Expected Close',
              'Stage Switcher',
              'Details',
            ]}
          >
            {filteredLeads.map((l) => (
              <tr key={l.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <div className="text-xs font-bold text-neutral-900">
                    {l.title}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {l.company}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-semibold">{l.contactName}</div>
                  <div className="text-[11px] font-mono text-neutral-500">
                    {l.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="info">{l.source}</Badge>
                </td>
                <td className="px-4 py-3 text-xs font-mono font-bold text-emerald-700">
                  ₹{l.value.toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3 text-xs">{l.assignedRepName}</td>
                <td className="px-4 py-3 text-xs font-mono">
                  {l.expectedCloseDate}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={l.stage}
                    onChange={(e) =>
                      requestStageTransition(l, e.target.value as DealStage)
                    }
                    className="px-2.5 py-1 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
                  >
                    {DEAL_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setSelectedLeadId(l.id)}
                  >
                    Open Timeline
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* MODAL: Create New Lead */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        size="lg"
        title="Create New Commercial Deal / Lead"
      >
        <form onSubmit={handleCreateLead} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Deal Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Enterprise Cloud Migration License"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Client Company Name *
              </label>
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. FinTech Bharath Pvt Ltd"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Primary Contact Person *
              </label>
              <input
                type="text"
                required
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Vikram Singhania"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vikram@fintechbharath.in"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98200 XXXXX"
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Lead Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as LeadSource)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Deal Value (₹ INR) *
              </label>
              <input
                type="number"
                required
                min={1000}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Expected Close Date *
              </label>
              <input
                type="date"
                required
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Assigned Sales Representative
            </label>
            <select
              value={assignedRepId}
              onChange={(e) => setAssignedRepId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              {crmReps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name} ({rep.ecode} • {rep.designation})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Pipeline Deal
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Mandatory Won / Lost Attribution */}
      <LeadWonLostModal
        isOpen={Boolean(wonLostTarget)}
        onClose={() => setWonLostTarget(null)}
        lead={wonLostTarget?.lead || null}
        targetStage={wonLostTarget?.targetStage || null}
        onConfirm={handleConfirmWonLost}
      />

      {/* MODAL: Lead Detail & Activity / Stage Audit Timeline */}
      <LeadDetailModal
        isOpen={Boolean(selectedLead)}
        onClose={() => setSelectedLeadId(null)}
        lead={selectedLead}
        currentEmployee={currentEmployee}
        onLogActivity={handleLogActivity}
      />

      {/* MODAL: Bulk CSV Import */}
      <Modal
        isOpen={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        size="lg"
        title="Bulk CSV Pipeline Import & Validator"
        subtitle="Client-side column validation, sales rep mapping, and row-by-row error reporting."
      >
        <form onSubmit={handleBulkCsvImport} className="space-y-4">
          {csvErrors.length > 0 && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-xs text-rose-800">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>CSV Validation Errors Found ({csvErrors.length}):</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 font-mono text-[11px]">
                {csvErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-neutral-700">
                Paste CSV Content (or load sample template) *
              </label>
              <button
                type="button"
                onClick={() =>
                  setCsvRawText(
                    `Title,Company,ContactName,Email,Phone,Source,ValueINR,ExpectedCloseDate\nEnterprise ERP Rollout,Grattitude Synergy Logistics,Rohan Deshmukh,rohan@grattitude.in,+91 9820112233,Referral,850000,2026-11-28\nCloud Security Audit,Zenith FinServ,Meera Krishnan,meera@zenithfin.in,+91 9845099887,Website,420000,2026-11-19`
                  )
                }
                className="text-[11px] font-bold text-sky-700 hover:underline cursor-pointer"
              >
                Load Sample CSV Rows
              </button>
            </div>
            <textarea
              rows={5}
              required
              value={csvRawText}
              onChange={(e) => setCsvRawText(e.target.value)}
              placeholder="Title,Company,ContactName,Email,Phone,Source,ValueINR,ExpectedCloseDate"
              className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Map Imported Deals to Sales Representative
            </label>
            <select
              value={csvDefaultRepId}
              onChange={(e) => setCsvDefaultRepId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
            >
              {crmReps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name} ({rep.ecode})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCsvModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Validate & Import CSV Deals
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
