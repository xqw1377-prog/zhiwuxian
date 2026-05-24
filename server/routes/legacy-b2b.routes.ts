/**
 * WUXIAN · B2B / 实验室遗留路由（ToC 模式下由 tocGate 拦截）
 */

import type { Application } from 'express';
import { wrap, sendSuccess, param, tocGate } from './shared';
import { validateBody, validateParams } from '../middleware/validate';
import { z } from 'zod';
import { projectDreamerToSchool, listSchoolProfiles } from '../../engine/api/school-intelligence';
import { interactWithOrganism, listOrganismPool, attractOrganisms, getOrganism } from '../../engine/api/evolutionary';
import { synchronizeTwin, getDreamerTwin } from '../../engine/api/cognitive-twin';
import { NotFoundError } from '../errors';

const schoolProjectSchema = z.object({
  schoolName: z.string().trim().min(1, '缺少学校名称'),
  studentId: z.string().trim().min(1, '缺少学生 ID'),
  currentKnowledgeNode: z.string().optional(),
}).passthrough();

const studentIdBodySchema = z.object({
  studentId: z.string().trim().min(1, '缺少 studentId'),
}).passthrough();

const organismAttractSchema = z.object({
  laTeXTrace: z.string().trim().min(1, '缺少 laTeXTrace'),
  limit: z.coerce.number().optional(),
});

const entityIdParamsSchema = z.object({
  entityId: z.string().trim().min(1),
});

const studentIdParamsSchema = z.object({
  studentId: z.string().trim().min(1),
});

export function registerLegacyB2BRoutes(app: Application): void {
  app.post(
    '/api/v1/school/project',
    validateBody(schoolProjectSchema),
    tocGate((req, res) => {
      const body = req.body as { schoolName: string; studentId: string; currentKnowledgeNode?: string };
      sendSuccess(res, projectDreamerToSchool(body.schoolName, body.studentId, body.currentKnowledgeNode));
    }),
  );

  app.get('/api/v1/school/profiles', tocGate((_req, res) => {
    sendSuccess(res, listSchoolProfiles());
  }));

  app.post(
    '/api/v1/organism/interact',
    validateBody(studentIdBodySchema),
    tocGate((req, res) => {
      sendSuccess(res, interactWithOrganism(req.body));
    }),
  );

  app.get('/api/v1/organism/pool', tocGate((req, res) => {
    const kind = req.query.kind as 'course' | 'exam_current' | 'exam_target' | undefined;
    sendSuccess(res, listOrganismPool(kind));
  }));

  app.post(
    '/api/v1/organism/attract',
    validateBody(organismAttractSchema),
    tocGate((req, res) => {
      const body = req.body as { laTeXTrace: string; limit?: number };
      sendSuccess(res, attractOrganisms(body.laTeXTrace, body.limit));
    }),
  );

  app.get(
    '/api/v1/organism/:entityId',
    validateParams(entityIdParamsSchema),
    tocGate((req, res) => {
      const entityId = param(req.params.entityId);
      const result = getOrganism(entityId);
      if (result.code === 404) throw new NotFoundError('Organism', entityId);
      sendSuccess(res, result);
    }),
  );

  app.post(
    '/api/v1/twin/synchronize',
    validateBody(z.object({ studentId: z.string().trim().min(1, '缺少梦想家 ID (studentId)') }).passthrough()),
    tocGate((req, res) => {
      sendSuccess(res, synchronizeTwin(req.body));
    }),
  );

  app.get(
    '/api/v1/twin/:studentId',
    validateParams(studentIdParamsSchema),
    tocGate((req, res) => {
      const studentId = param(req.params.studentId);
      const result = getDreamerTwin(studentId);
      if (result.code === 404) throw new NotFoundError('CognitiveTwin', studentId);
      sendSuccess(res, result);
    }),
  );
}
