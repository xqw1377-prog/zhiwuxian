/**
 * WUXIAN · 海报服务门面（委托 CombinedPosterEngine）
 */

import { CombinedPosterEngine, type ExtendedPosterData } from '../src/services/poster-generator';

export type { ExtendedPosterData };

/** @deprecated 兼容旧虫洞/星卡接口字段 */
export interface ReportData {
  userId: string;
  userName: string;
  goalTitle: string;
  wormholeCount: number;
  timeSavedMinutes: number;
  resilienceScore: number;
}

export class PosterGeneratorService {
  private readonly engine = new CombinedPosterEngine();

  async generateNeonPoster(data: ReportData): Promise<string> {
    const whisper = data.wormholeCount > 0
      ? `虫洞跃迁 ×${data.wormholeCount} · 折叠 ${data.timeSavedMinutes} 分钟 · 韧性 ${data.resilienceScore}%`
      : `正在折叠时空拟合: ${data.goalTitle}`;
    return this.engine.generateDynamicStarCard({
      userId: data.userId,
      userName: data.userName,
      currentWhisper: whisper,
    });
  }

  generateDynamicStarCard(data: ExtendedPosterData): Promise<string> {
    return this.engine.generateDynamicStarCard(data);
  }
}
