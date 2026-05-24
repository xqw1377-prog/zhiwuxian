/**
 * WUXIAN · 公共课件无存储 API
 */

import {
  getPublicCourseAuditor,
  getSemanticRouter,
  detectPlatform,
  simulatePublicCourse,
  simulateLhopitalCourse,
  seedPublicPointers,
  type PublicCoursePointer,
} from '../core/public-course-auditor';
import { getEvolutionaryEngine } from '../core/evolutionary-engine';

let seeded = false;

function ensureSeeded() {
  if (!seeded) {
    seedPublicPointers();
    seeded = true;
  }
}

export interface AuditPublicCourseRequest {
  sourceUrl: string;
  title?: string;
  platform?: PublicCoursePointer['platform'];
  autoRegister?: boolean;
  simulate?: boolean;
}

export function auditPublicCourse(req: AuditPublicCourseRequest) {
  const auditor = getPublicCourseAuditor();

  const pointer: PublicCoursePointer = req.simulate === false && req.sourceUrl
    ? {
        sourceUrl: req.sourceUrl,
        platform: req.platform ?? detectPlatform(req.sourceUrl),
        title: req.title ?? '公共课件',
        submittedBy: 'planner',
      }
    : req.sourceUrl?.includes('lhopital') || req.title?.includes('洛必达')
      ? simulateLhopitalCourse()
      : simulatePublicCourse(req.sourceUrl, req.title);

  if (req.sourceUrl && req.title) {
    pointer.sourceUrl = req.sourceUrl;
    pointer.title = req.title;
    pointer.platform = req.platform ?? detectPlatform(req.sourceUrl);
  }

  const audit = auditor.auditPublicCourse(pointer);
  let node = null;
  if (req.autoRegister !== false) {
    node = auditor.registerPointerToGraph(audit);
    if (node) {
      getEvolutionaryEngine().birthFromCourseAudit(audit);
    }
  }

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      audit,
      graphNode: node,
      rejected: audit.auditGrade === 'Drop' || audit.auditGrade === 'B',
      stats: auditor.getStats(),
      protocol: 'PUBLIC_COURSE_POINTER_v1',
      storageMode: 'ZERO_STORAGE_METADATA_ONLY',
    },
  };
}

export function listPublicPointers() {
  ensureSeeded();
  const auditor = getPublicCourseAuditor();
  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      pointers: auditor.listRegisteredPointers(),
      stats: auditor.getStats(),
    },
  };
}

export interface SemanticMatchRequest {
  topic: string;
  minWormhole?: number;
  slope?: number;
  talentConfidence?: number;
}

export function semanticMatch(req: SemanticMatchRequest) {
  ensureSeeded();
  const router = getSemanticRouter();
  const match = router.match(req.topic, { minWormhole: req.minWormhole });

  return {
    code: 200,
    status: match.matched ? 'SUCCESS' : 'NOT_FOUND',
    data: { match },
  };
}
