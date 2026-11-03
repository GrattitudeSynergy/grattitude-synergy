import React, { useEffect, useState } from 'react';
import { Shield, Search, Clock } from 'lucide-react';
import { Modal, Table, Badge, EmptyState } from './DesignSystem';
import { AuditService } from '../services/auditService';
import type { AuditLogEntry } from '../types';

export const AuditLogModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const unsub = AuditService.subscribeLogs((items) => setLogs(items));
    return () => unsub();
  }, [isOpen]);

  const filtered = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.actorName.toLowerCase().includes(search.toLowerCase()) ||
      l.details.toLowerCase().includes(search.toLowerCase()) ||
      l.targetId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title={
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-sky-600" />
          <span>Immutable Enterprise Audit Trail (audit_logs)</span>
        </div>
      }
      subtitle="Append-only security & compliance ledger accessible exclusively to Admin and CEO roles."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by action, actor, target ID, or details..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900"
            />
          </div>
          <Badge variant="info">{filtered.length} Audit Events Recorded</Badge>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No Audit Trail Entries Found"
            description="All sensitive state transitions, employee creations, password resets, and lifecycle overrides are automatically logged here in real time."
          />
        ) : (
          <Table
            headers={['Timestamp', 'Action', 'Actor & Role', 'Target Entity', 'Details']}
          >
            {filtered.map((entry) => (
              <tr key={entry.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-xs font-mono text-neutral-500 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="neutral" className="font-mono">
                    {entry.action}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-bold text-neutral-900">{entry.actorName}</div>
                  <div className="text-neutral-500">
                    {entry.actorRole} ({entry.actorId})
                  </div>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-neutral-700">
                  {entry.targetType}: {entry.targetId}
                </td>
                <td className="px-4 py-3 text-xs text-neutral-700 max-w-md">
                  {entry.details}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Modal>
  );
};
