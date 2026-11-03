import { FirestoreEngine } from '../firebase/firebaseConfig';
import type { AuditLogEntry, CorporateRole, Employee } from '../types';

// ============================================================================
// AUDIT SERVICE (audit_logs)
// ============================================================================
// Append-only logging capturing: action, actorId, actorName, actorRole,
// targetId, targetType, details, and timestamp.
// Central inspection modal accessible only to Admin and CEO.

export const AuditService = {
  async log(params: {
    action: string;
    actor: Pick<Employee, 'id' | 'name' | 'role'> | { id: string; name: string; role: CorporateRole };
    targetId: string;
    targetType: string;
    details: string;
  }): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      action: params.action,
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      targetId: params.targetId,
      targetType: params.targetType,
      details: params.details,
      timestamp: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('audit_logs', entry.id, entry);
    return entry;
  },

  subscribeLogs(callback: (logs: AuditLogEntry[]) => void): () => void {
    return FirestoreEngine.subscribeCollection<AuditLogEntry>('audit_logs', (items) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      callback(sorted);
    });
  },
};
