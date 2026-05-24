import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type EvolutionFlowDto = {
  id: string;
  label: string;
  battle: string;
  amount: number;
  at: number;
  kind: 'warp' | 'token' | 'milestone';
};

export type EvolutionLedgerDto = {
  challengeIndex: number;
  dreamPct: number;
  dreamDelta7d: number;
  warpPoints: number;
  corePercent: number;
  deepPercent: number;
  frozenTokens: number;
  weekStats: {
    languageSessions: number;
    videoCheckpoints: number;
    warpSpent: number;
  };
  flows: EvolutionFlowDto[];
  coachLine: string;
};

export async function fetchEvolutionLedger(userId: string): Promise<EvolutionLedgerDto | null> {
  const res = await authFetch(`/api/v3.5/zhi/evolution-ledger/${encodeURIComponent(userId)}`);
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<EvolutionLedgerDto>(json);
}
