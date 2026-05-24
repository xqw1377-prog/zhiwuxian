/**
 * WUXIAN · OpenClaw Agent API
 */

import { getOpenClawOrchestrator } from '../openclaw/orchestrator';
import { OPENCLAW_SKILLS } from '../openclaw/types';

export interface OpenClawDispatchRequest {
  input: string;
  plannerId?: string;
}

export async function openClawDispatch(req: OpenClawDispatchRequest) {
  const orchestrator = getOpenClawOrchestrator();
  const result = await orchestrator.dispatch(req.input);

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      openclaw: result,
      role: 'CHIEF_AUDITOR_AND_RESOURCE_DISPATCHER',
      skills: OPENCLAW_SKILLS,
      philosophy: 'POINTER_ONLY_ZERO_STORAGE',
      tagline: '你只需要提创意思路，它负责落地。',
    },
  };
}

export function listOpenClawSkills() {
  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      skills: OPENCLAW_SKILLS,
      commander: 'OpenClaw',
      tagline: '你只需要提创意思路，它负责落地。',
    },
  };
}
