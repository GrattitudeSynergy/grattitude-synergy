import React, { useState } from 'react';
import { Trophy, XCircle, AlertCircle } from 'lucide-react';
import { Modal, Button } from '../../core/components/DesignSystem';
import type {
  Lead,
  WonReason,
  LostReason,
} from '../../core/types';

export const LeadWonLostModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  targetStage: 'Won' | 'Lost' | null;
  onConfirm: (params: {
    wonReason?: WonReason;
    lostReason?: LostReason;
    closeNotes: string;
  }) => void;
}> = ({ isOpen, onClose, lead, targetStage, onConfirm }) => {
  const [wonReason, setWonReason] = useState<WonReason>('Feature');
  const [lostReason, setLostReason] = useState<LostReason>('Competitor');
  const [closeNotes, setCloseNotes] = useState('');
  const [error, setError] = useState('');

  if (!lead || !targetStage) return null;

  const wonReasons: WonReason[] = ['Price', 'Feature', 'Relationship', 'Speed'];
  const lostReasons: LostReason[] = [
    'Competitor',
    'Budget',
    'Timing',
    'Ghosted',
    'Other',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeNotes.trim() || closeNotes.trim().length < 5) {
      setError('Mandatory close notes (at least 5 characters) are required to complete this stage transition.');
      return;
    }
    onConfirm({
      wonReason: targetStage === 'Won' ? wonReason : undefined,
      lostReason: targetStage === 'Lost' ? lostReason : undefined,
      closeNotes: closeNotes.trim(),
    });
    setCloseNotes('');
    setError('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          {targetStage === 'Won' ? (
            <Trophy className="w-4 h-4 text-emerald-600" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-600" />
          )}
          <span>
            Mandatory Deal Closure Attribution — Mark as "{targetStage}"
          </span>
        </div>
      }
      subtitle={`Deal: ${lead.title} (${lead.company}) • Value: ₹${lead.value.toLocaleString('en-IN')}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-700 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {targetStage === 'Won' ? (
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1.5">
              Primary Won Attribution Reason *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {wonReasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setWonReason(r)}
                  className={`p-2.5 text-xs font-bold rounded-lg border cursor-pointer ${
                    wonReason === r
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1.5">
              Primary Lost Attribution Reason *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {lostReasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setLostReason(r)}
                  className={`p-2 text-xs font-bold rounded-lg border cursor-pointer ${
                    lostReason === r
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-1">
            Mandatory Executive Close Notes *
          </label>
          <textarea
            rows={3}
            required
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder={
              targetStage === 'Won'
                ? 'Summarize commercial terms, contract length, or key winning differentiator...'
                : 'Summarize competitor chosen, budget constraint, or follow-up window...'
            }
            className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={targetStage === 'Won' ? 'success' : 'danger'}
          >
            Confirm Deal {targetStage}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
