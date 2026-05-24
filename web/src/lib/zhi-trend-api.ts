import { authFetch, jsonAuthHeaders } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export interface LearningTrend {
  userId: string;
  momentum: number;
  consistency: number;
  velocity: number;
  predictedCompletionRate: number;
  riskLevel: 'low' | 'medium' | 'high';
  insights: string[];
  recommendedActions: string[];
}

export async function fetchLearningTrend(userId: string): Promise<LearningTrend | null> {
  try {
    const res = await authFetch(`/api/v3.5/zhi/trend/${userId}`, {
      headers: jsonAuthHeaders(),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return unwrapEnvelope<LearningTrend>(json) ?? null;
  } catch {
    return null;
  }
}
