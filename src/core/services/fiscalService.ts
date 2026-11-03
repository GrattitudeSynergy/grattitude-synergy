import { FirestoreEngine } from '../firebase/firebaseConfig';
import type { FiscalSettings, Quarter } from '../types';

// ============================================================================
// FISCAL CONTEXT SERVICE (/app_settings/fiscal_settings + localStorage)
// ============================================================================

export const AVAILABLE_FISCAL_YEARS = [
  'FY 2024-25',
  'FY 2025-26',
  'FY 2026-27',
  'FY 2027-28',
];

export const AVAILABLE_QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

const LOCAL_FISCAL_KEY = 'gs_active_fiscal_context_v1';

export const FiscalService = {
  getInitialLocal(): { fiscalYear: string; quarter: Quarter } {
    try {
      const raw = localStorage.getItem(LOCAL_FISCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.fiscalYear && parsed.quarter) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return { fiscalYear: 'FY 2025-26', quarter: 'Q3' };
  },

  async updateFiscalContext(
    fiscalYear: string,
    quarter: Quarter,
    actorId: string
  ): Promise<void> {
    localStorage.setItem(LOCAL_FISCAL_KEY, JSON.stringify({ fiscalYear, quarter }));
    const payload: FiscalSettings = {
      id: 'fiscal_settings',
      fiscalYear,
      quarter,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };
    await FirestoreEngine.setDocument('app_settings', 'fiscal_settings', payload);
  },

  subscribeFiscalContext(
    callback: (ctx: { fiscalYear: string; quarter: Quarter }) => void
  ): () => void {
    return FirestoreEngine.subscribeCollection<FiscalSettings>('app_settings', (items) => {
      const found = items.find((i) => i.id === 'fiscal_settings');
      if (found && found.fiscalYear && found.quarter) {
        localStorage.setItem(
          LOCAL_FISCAL_KEY,
          JSON.stringify({ fiscalYear: found.fiscalYear, quarter: found.quarter })
        );
        callback({ fiscalYear: found.fiscalYear, quarter: found.quarter });
      }
    });
  },
};
