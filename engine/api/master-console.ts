/**
 * WUXIAN · SaaS 上帝中台 API
 */

import { getMasterConsole } from '../core/master-console';

export function getClusterTopology() {
  const console = getMasterConsole();
  const cluster = console.getClusterTopology();

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      cluster,
      protocol: 'MASTER_CONSOLE_v1',
    },
  };
}

export function scanCrisisRadar() {
  const console = getMasterConsole();
  const { alert, updatedStar } = console.scanCrisisGravity();
  const cluster = console.getClusterTopology();

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      alert,
      updatedStar,
      cluster,
      logMessage: `[SaaS 危机嗅探] 雷达捕捉到 1 个生命个体的伴生惰性系数（Risk_lazy）连续 ${alert.consecutiveDays} 天飙升，触及二级风控触发阈值...`,
    },
  };
}

export function captureTalentBurst() {
  const console = getMasterConsole();
  const { event, updatedStar } = console.captureTalentBurst();
  const cluster = console.getClusterTopology();

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      event,
      updatedStar,
      cluster,
      logMessage: '[SaaS 雷达捕获] 狂喜！全网发现 1 名个体直觉指数跨代越迁，系统正在为其自动化定向炸开虫洞！',
    },
  };
}

export interface MassInjectRequest {
  packageId?: string;
}

export function massInjectCells(req: MassInjectRequest = {}) {
  const console = getMasterConsole();
  const result = console.massInjectCells(req.packageId ?? 'ADV_TOPOLOGY_V4');
  const cluster = console.getClusterTopology();

  return {
    code: 200,
    status: 'SUCCESS',
    data: {
      injection: result,
      cluster,
      logMessage: '[SaaS 批量注入] 正在将高级拓扑空间细胞粉碎为原子级颗粒... 正在定向注入符合条件的所有梦想家...',
      successMessage: `[SaaS 注入成功] ${result.message}`,
    },
  };
}
