/**
 * WUXIAN · 多路径动态参数海报引擎
 * 路径 A：goal_reversing_matrix 真实逆向矩阵 → 1080×1350 赛博星卡 PNG
 */

import { createCanvas, Image } from '@napi-rs/canvas';
import QRCode from 'qrcode';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getSharesDir } from '../../server/data-path';
import { getReversingMetrics } from '../db/milestone-schema';

export interface ExtendedPosterData {
  userId: string;
  userName: string;
  /** 织者当前低语（路径 B 情绪 / 跃迁反馈） */
  currentWhisper: string;
}

interface MatrixView {
  targetDestination: string;
  completedUnits: number;
  totalUnits: number;
  progressPercentage: number;
  daysLeft: number;
}

function resolveMatrix(userId: string): MatrixView {
  const metrics = getReversingMetrics(userId);
  if (metrics) {
    return {
      targetDestination: metrics.targetDestination,
      completedUnits: metrics.completedUnits,
      totalUnits: metrics.totalUnits,
      progressPercentage: metrics.progressPercentage,
      daysLeft: metrics.daysLeft,
    };
  }
  return {
    targetDestination: '未知高维引力源',
    completedUnits: 1,
    totalUnits: 100,
    progressPercentage: 1,
    daysLeft: 99,
  };
}

function wrapLines(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, text: string, maxWidth: number): string[] {
  const raw = text.replace(/^["']|["']$/g, '').trim();
  if (!raw) return [''];
  const lines: string[] = [];
  let line = '';
  for (const ch of raw) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export class CombinedPosterEngine {
  private readonly width = 1080;
  private readonly height = 1350;
  private readonly sharesDir: string;

  constructor() {
    this.sharesDir = getSharesDir();
  }

  /**
   * 从 SQLite 路径 A 矩阵榨取真实指标，在内存中渲染高保真赛博星卡
   */
  async generateDynamicStarCard(data: ExtendedPosterData): Promise<string> {
    const matrix = resolveMatrix(data.userId);
    const {
      targetDestination,
      completedUnits,
      totalUnits,
      progressPercentage,
      daysLeft,
    } = matrix;

    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0D0E12';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.strokeStyle = 'rgba(0, 255, 127, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < this.width; i += 60) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, this.height);
      ctx.stroke();
    }
    for (let j = 0; j < this.height; j += 60) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(this.width, j);
      ctx.stroke();
    }

    ctx.strokeStyle = '#00FF7F';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, this.width - 80, this.height - 80);

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#00FF7F';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('WUXIAN // AI-NATIVE 认知重路由系统', 80, 80);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 64px sans-serif';
    const name = data.userName.slice(0, 12);
    ctx.fillText(`自学者: ${name}`, 80, 180);

    ctx.font = 'normal 36px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    const dest = targetDestination.length > 28 ? `${targetDestination.slice(0, 26)}…` : targetDestination;
    ctx.fillText(`逆向折叠目的地: 《${dest}》`, 80, 270);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(80, 360, 920, 240);
    ctx.strokeStyle = 'rgba(0, 255, 127, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(80, 360, 920, 240);

    ctx.fillStyle = '#161820';
    ctx.fillRect(130, 480, 820, 24);

    const gradient = ctx.createLinearGradient(130, 0, 950, 0);
    gradient.addColorStop(0, '#00FF7F');
    gradient.addColorStop(1, '#FF4500');
    ctx.fillStyle = gradient;
    const fillWidth = Math.max(20, Math.round((progressPercentage / 100) * 820));
    ctx.fillRect(130, 480, fillWidth, 24);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`${progressPercentage}%`, 130, 405);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'normal 28px sans-serif';
    ctx.fillText(`已跨越 ${completedUnits} / ${totalUnits} 量子认知块`, 400, 418);

    ctx.fillStyle = '#FF4500';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`${daysLeft} Days`, 780, 405);

    ctx.font = 'italic 32px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    const whisperLines = wrapLines(ctx, data.currentWhisper, 900);
    let wy = 720;
    for (const ln of whisperLines) {
      ctx.fillText(`"${ln}"`, 80, wy);
      wy += 44;
    }

    const shareBase = process.env.WUXIAN_SHARE_BASE_URL?.trim() || 'https://wuxian.app';
    const shareUrl = `${shareBase}/r/${encodeURIComponent(data.userId)}?dest=${encodeURIComponent(targetDestination)}`;
    const qrBuffer = await QRCode.toBuffer(shareUrl, {
      margin: 1,
      color: { dark: '#00FF7F', light: '#0D0E12' },
      width: 220,
    });

    const qrImage = new Image();
    qrImage.src = qrBuffer;
    ctx.drawImage(qrImage, 780, 1020);

    ctx.font = 'normal 28px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('长按识别指引钥匙', 80, 1060);
    ctx.fillText('让空间为你折叠，开启你的时间作弊器', 80, 1110);

    const fileName = `starcard_${data.userId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.png`;
    const outputPath = join(this.sharesDir, fileName);
    writeFileSync(outputPath, canvas.toBuffer('image/png'));

    return `/shares/${fileName}`;
  }
}
