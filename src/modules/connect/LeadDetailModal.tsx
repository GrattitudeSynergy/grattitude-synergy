import React, { useState } from 'react';
import {
  Phone,
  Mail,
  Users,
  FileText,
  Clock,
  History,
  Plus,
} from 'lucide-react';
import {
  Modal,
  Button,
  Badge,
} from '../../core/components/DesignSystem';
import type {
  Lead,
  LeadActivityType,
  Employee,
} from '../../core/types';

export const LeadDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  currentEmployee: Employee;
  onLogActivity: (
    lead: Lead,
    activity: {
      type: LeadActivityType;
      date: string;
      durationOrSummary: string;
      notes: string;
    }
  ) => Promise<void>;
}> = ({ isOpen, onClose, lead, onLogActivity }) => {
  const [actType, setActType] = useState<LeadActivityType>('Call');
  const [actDate, setActDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [durationOrSummary, setDurationOrSummary] = useState('');
  const [notes, setNotes] = useState('');

  if (!lead) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!durationOrSummary.trim() || !notes.trim()) return;
    await onLogActivity(lead, {
      type: actType,
      date: actDate,
      durationOrSummary: durationOrSummary.trim(),
      notes: notes.trim(),
    });
    setDurationOrSummary('');
    setNotes('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title={`${lead.title} — ${lead.company}`}
      subtitle={`Contact: ${lead.contactName} (${lead.email} • ${lead.phone}) • Rep: ${lead.assignedRepName}`}
    >
      <div className="space-y-6">
        {/* Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs">
          <div>
            <span className="text-neutral-500">Deal Value:</span>
            <div className="font-mono font-extrabold text-sm text-neutral-900 mt-0.5">
              ₹{lead.value.toLocaleString('en-IN')}
            </div>
          </div>
          <div>
            <span className="text-neutral-500">Current Stage:</span>
            <div className="mt-0.5">
              <Badge
                variant={
                  lead.stage === 'Won'
                    ? 'success'
                    : lead.stage === 'Lost'
                    ? 'danger'
                    : 'info'
                }
              >
                {lead.stage}
              </Badge>
            </div>
          </div>
          <div>
            <span className="text-neutral-500">Lead Source:</span>
            <div className="font-bold text-neutral-900 mt-0.5">
              {lead.source}
            </div>
          </div>
          <div>
            <span className="text-neutral-500">Expected Close:</span>
            <div className="font-mono font-bold text-neutral-900 mt-0.5">
              {lead.expectedCloseDate}
            </div>
          </div>
        </div>

        {(lead.wonReason || lead.lostReason || lead.closeNotes) && (
          <div className="p-3.5 bg-sky-50 border border-sky-200 text-neutral-900 rounded-xl text-xs space-y-1">
            <div className="font-bold text-sky-800">
              Closure Attribution ({lead.stage}):{' '}
              {lead.wonReason || lead.lostReason}
            </div>
            {lead.closeNotes && <p className="text-neutral-700">{lead.closeNotes}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Column: Log Activity & Activity Feed */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 border-b border-neutral-200 pb-1.5">
              Log Commercial Activity (Calls, Emails, Meetings, Notes)
            </h4>

            <form
              onSubmit={handleAdd}
              className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3"
            >
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Activity Type
                  </label>
                  <select
                    value={actType}
                    onChange={(e) =>
                      setActType(e.target.value as LeadActivityType)
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                  >
                    <option value="Call">Call</option>
                    <option value="Email">Email</option>
                    <option value="Meeting">Meeting</option>
                    <option value="Note">Note</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Activity Date
                  </label>
                  <input
                    type="date"
                    required
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                  Duration / Headline Summary *
                </label>
                <input
                  type="text"
                  required
                  value={durationOrSummary}
                  onChange={(e) => setDurationOrSummary(e.target.value)}
                  placeholder="e.g. 25 mins Discovery Call with VP Engineering"
                  className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                  Detailed Interaction Notes *
                </label>
                <textarea
                  rows={2}
                  required
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Key takeaways, action items, next steps..."
                  className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="xs"
                  variant="primary"
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  Log Activity
                </Button>
              </div>
            </form>

            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {lead.activities.length === 0 ? (
                <div className="text-xs text-neutral-400 text-center py-6 border border-dashed border-neutral-200 rounded-lg">
                  No activities logged yet.
                </div>
              ) : (
                lead.activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-3 bg-white border border-neutral-200 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-neutral-900">
                        {act.type === 'Call' && (
                          <Phone className="w-3.5 h-3.5 text-sky-600" />
                        )}
                        {act.type === 'Email' && (
                          <Mail className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        {act.type === 'Meeting' && (
                          <Users className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        {act.type === 'Note' && (
                          <FileText className="w-3.5 h-3.5 text-neutral-600" />
                        )}
                        <span>
                          {act.type}: {act.durationOrSummary}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {act.date}
                      </span>
                    </div>
                    <p className="text-neutral-700">{act.notes}</p>
                    <div className="text-[10px] text-neutral-400">
                      Logged by {act.authorName}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Chronological Audit Timeline of Stage Movements */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600 border-b border-neutral-200 pb-1.5 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-sky-600" />
              <span>Chronological Stage Movement Audit Timeline</span>
            </h4>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {lead.stageHistory.map((sh) => (
                <div
                  key={sh.id}
                  className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-900">
                      {sh.fromStage} → {sh.toStage}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(sh.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-neutral-600 mt-1">
                    Actor: <strong>{sh.changedByName}</strong>
                  </div>
                  {sh.reason && (
                    <div className="text-[11px] text-sky-800 mt-1 font-medium">
                      Reason / Notes: {sh.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
