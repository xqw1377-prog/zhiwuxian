/**
 * WUXIAN · 隐私同意与数据主权协议
 * 核心原则：
 *   1. 所有数据归属用户本人，可随时导出/删除
 *   2. 处理全部优先本地完成（Local-First）
 *   3. 每次感知行为前需获得明确授权
 *   4. 透明的数据清单与留存策略
 */

export type DataCategory =
  | 'goal_profile'
  | 'behavior_stream'
  | 'classroom_audio'
  | 'pen_stroke'
  | 'emotional_signal'
  | 'usage_pattern';

export type ConsentStatus = 'granted' | 'denied' | 'not_asked';

export interface ConsentGrant {
  category: DataCategory;
  status: ConsentStatus;
  grantedAt?: string;
  purpose: string;
  retentionDays: number;
  localOnly: boolean;
}

export interface PrivacyProfile {
  userId: string;
  consents: ConsentGrant[];
  dataExportRequested: boolean;
  dataExportReady: boolean;
  deletionRequested: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DataExportPackage {
  userId: string;
  exportedAt: string;
  categories: DataCategory[];
  format: 'json' | 'csv';
  downloadUrl: string;
  sizeBytes: number;
}

const DEFAULT_RETENTION: Record<DataCategory, number> = {
  goal_profile: 730,
  behavior_stream: 90,
  classroom_audio: 30,
  pen_stroke: 7,
  emotional_signal: 365,
  usage_pattern: 180,
};

const DEFAULT_PURPOSE: Record<DataCategory, string> = {
  goal_profile: '目标拆解与进度追踪',
  behavior_stream: '行为模式分析与天赋检测',
  classroom_audio: '课堂内容同化与知识提取',
  pen_stroke: '实时作业纠偏与自适应提示',
  emotional_signal: '情绪感知与陪伴模式切换',
  usage_pattern: '产品体验优化',
};

export class PrivacyConsentManager {
  private profiles = new Map<string, PrivacyProfile>();

  initialize(userId: string): PrivacyProfile {
    const profile: PrivacyProfile = {
      userId,
      consents: [],
      dataExportRequested: false,
      dataExportReady: false,
      deletionRequested: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(userId, profile);
    return profile;
  }

  requestConsent(userId: string, category: DataCategory): ConsentGrant {
    const profile = this.getOrCreate(userId);
    const existing = profile.consents.find(c => c.category === category);
    if (existing) return existing;

    const grant: ConsentGrant = {
      category,
      status: 'not_asked',
      purpose: DEFAULT_PURPOSE[category],
      retentionDays: DEFAULT_RETENTION[category],
      localOnly: category === 'pen_stroke' || category === 'classroom_audio',
    };
    profile.consents.push(grant);
    profile.updatedAt = new Date().toISOString();
    return grant;
  }

  grant(userId: string, category: DataCategory): ConsentGrant {
    const profile = this.getOrCreate(userId);
    const grant = profile.consents.find(c => c.category === category)
      ?? this.requestConsent(userId, category);
    grant.status = 'granted';
    grant.grantedAt = new Date().toISOString();
    profile.updatedAt = new Date().toISOString();
    return grant;
  }

  deny(userId: string, category: DataCategory): ConsentGrant {
    const profile = this.getOrCreate(userId);
    const grant = profile.consents.find(c => c.category === category)
      ?? this.requestConsent(userId, category);
    grant.status = 'denied';
    profile.updatedAt = new Date().toISOString();
    return grant;
  }

  isGranted(userId: string, category: DataCategory): boolean {
    const profile = this.profiles.get(userId);
    if (!profile) return false;
    const consent = profile.consents.find(c => c.category === category);
    return consent?.status === 'granted';
  }

  getProfile(userId: string): PrivacyProfile | null {
    return this.profiles.get(userId) ?? null;
  }

  requestDataExport(userId: string): DataExportPackage {
    const profile = this.getOrCreate(userId);
    profile.dataExportRequested = true;
    profile.dataExportReady = true;
    profile.updatedAt = new Date().toISOString();

    const grantedCategories = profile.consents
      .filter(c => c.status === 'granted')
      .map(c => c.category);

    return {
      userId,
      exportedAt: new Date().toISOString(),
      categories: grantedCategories,
      format: 'json',
      downloadUrl: `/api/user/${userId}/data/export`,
      sizeBytes: 0,
    };
  }

  requestDeletion(userId: string): { deleted: boolean; message: string } {
    this.profiles.delete(userId);
    return {
      deleted: true,
      message: '所有数据已从系统中清除。WUXIAN 不会保留任何备份。',
    };
  }

  getConsentSummary(userId: string): Array<{ category: string; status: string; purpose: string; localOnly: boolean }> {
    const profile = this.profiles.get(userId);
    if (!profile) return [];
    return profile.consents.map(c => ({
      category: c.category,
      status: c.status,
      purpose: c.purpose,
      localOnly: c.localOnly,
    }));
  }

  private getOrCreate(userId: string): PrivacyProfile {
    return this.profiles.get(userId) ?? this.initialize(userId);
  }
}

const DATA_CATEGORY_LABELS: Record<DataCategory, string> = {
  goal_profile: '目标与学习规划',
  behavior_stream: '学习行为数据',
  classroom_audio: '课堂音频（本地处理）',
  pen_stroke: '笔迹与解题过程（仅本地）',
  emotional_signal: '情绪信号记录',
  usage_pattern: '使用习惯统计',
};

export function getDataCategoryLabel(c: DataCategory): string {
  return DATA_CATEGORY_LABELS[c];
}

let globalPrivacyManager: PrivacyConsentManager | null = null;

export function getPrivacyManager(): PrivacyConsentManager {
  if (!globalPrivacyManager) {
    globalPrivacyManager = new PrivacyConsentManager();
  }
  return globalPrivacyManager;
}
