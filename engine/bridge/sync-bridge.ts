/**
 * WUXIAN · 数据同步桥梁
 * 管理端模板 → 毫秒级 → 用户端梦想空间
 */

import { WuxianCoreEngine } from '../core/wuxian-core-engine';
import type { AtomTask, DreamSpace, Milestone } from '../core/types';
import { templateStore } from './template-store';
import type {
  AdminTemplatePayload,
  DeviceAdaptedPayload,
  DeviceType,
  UserActivationResult,
  UserSpaceActivation,
} from './types';

const userSpaces = new Map<string, DreamSpace>();

export class SyncBridge {
  /**
   * 用户终端激活：拉取管理端模板 + 本地时间轴二次动态剪裁
   */
  activate(input: UserSpaceActivation): UserActivationResult {
    const start = performance.now();

    const template = templateStore.get(input.chosenTemplateId);
    if (!template) {
      throw new Error(`[WUXIAN Sync] 模板不存在: ${input.chosenTemplateId}`);
    }

    const compressionRatio = input.userTimeBaseline / template.standardDays;
    const goalText = input.userGoalText ?? template.title;

    const engine = new WuxianCoreEngine();
    const init = engine.initializeDreamSpace({
      goalBaseline: goalText,
      timeBaseline: input.userTimeBaseline,
      isDeadlineFixed: template.isDeadlineFixed,
      currentStatus: input.currentStatus ?? '',
    });

    const dreamSpace = this.applyTemplateMilestones(
      init.dreamSpace,
      template,
      compressionRatio,
    );

    userSpaces.set(input.userId, dreamSpace);

    const device = adaptForDevice(input.deviceType);
    const syncLatencyMs = Math.round(performance.now() - start);

    return {
      status: 'ACTIVATED',
      userId: input.userId,
      dreamSpaceId: dreamSpace.id,
      templateId: template.templateId,
      templateVersion: template.version,
      syncedAt: new Date().toISOString(),
      syncLatencyMs,
      timeCompressionRatio: compressionRatio,
      initialSlope: init.initialSlope,
      device,
      todayTasks: filterForDevice(init.todayTasks, device),
      milestones: filterMilestonesForDevice(dreamSpace.milestones, device),
      dreamSpace,
    };
  }

  getUserSpace(userId: string): DreamSpace | null {
    return userSpaces.get(userId) ?? null;
  }

  getTemplateForSync(templateId: string): AdminTemplatePayload | null {
    return templateStore.get(templateId);
  }

  /**
   * 将管理端标准里程碑注入用户梦想空间
   */
  private applyTemplateMilestones(
    space: DreamSpace,
    template: AdminTemplatePayload,
    compressionRatio: number,
  ): DreamSpace {
    const totalWeeks = Math.max(1, Math.ceil(space.timeBaseline.totalDays / 7));
    const milestones: Milestone[] = template.standardMilestones.map((sm, i) => {
      const weekIndex = Math.max(
        1,
        Math.round((sm.phase / template.standardMilestones.length) * totalWeeks * compressionRatio),
      );
      return {
        id: `tpl-${template.templateId}-p${sm.phase}`,
        label: sm.description,
        weekIndex,
        targetEnergy: template.totalBaseEnergy * sm.energyPercentage,
        status: i === 0 ? 'active' : 'pending',
      };
    });

    space.energyMatrix.totalEnergyRequired = template.totalBaseEnergy;
    space.energyMatrix.remainingEnergy = template.totalBaseEnergy - space.energyMatrix.consumedEnergy;
    space.goalBaseline.vector.evolutionPath = `template-${template.templateId}-v${template.version}`;
    space.goalBaseline.vector.category = template.title;
    space.milestones = milestones;
    space.status = 'ACTIVE';

    return space;
  }
}

function adaptForDevice(deviceType: DeviceType): DeviceAdaptedPayload {
  if (deviceType === 'PC') {
    return {
      deviceType: 'PC',
      layout: 'immersive',
      interactionCadence: 'low',
      showFullRoadmap: true,
      showTodayOnly: false,
    };
  }
  return {
    deviceType: 'MOBILE',
    layout: 'compact',
    interactionCadence: 'high',
    showFullRoadmap: false,
    showTodayOnly: true,
  };
}

function filterForDevice(tasks: AtomTask[], device: DeviceAdaptedPayload): AtomTask[] {
  if (device.showTodayOnly) {
    return tasks.filter(t => t.scheduledDay === 0).slice(0, 3);
  }
  return tasks;
}

function filterMilestonesForDevice(
  milestones: Milestone[],
  device: DeviceAdaptedPayload,
): Milestone[] {
  if (!device.showFullRoadmap) {
    return milestones.filter(m => m.status === 'active');
  }
  return milestones;
}

export const syncBridge = new SyncBridge();
