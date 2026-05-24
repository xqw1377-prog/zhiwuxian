import { authFetch } from './api-auth';
import { unwrapEnvelope } from './api-envelope';

export type AuthMeDto = {
  userId: string;
  displayName: string | null;
  role?: string;
  isAdmin?: boolean;
  wallet?: { warpPoints?: number };
};

export async function fetchAuthMe(): Promise<AuthMeDto | null> {
  const res = await authFetch('/api/v1/auth/me');
  const json = await res.json().catch(() => null);
  if (!res.ok) return null;
  return unwrapEnvelope<AuthMeDto>(json);
}
