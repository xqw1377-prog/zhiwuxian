import { createCanvas, Image } from '@napi-rs/canvas';
import QRCode from 'qrcode';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getSharesDir } from '../../server/data-path';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { getReversingMetrics } from '../db/milestone-schema';
import { initializeUnifiedWalletSystem } from '../db/wallet-schema';
import { initializeRelayNetwork } from '../db/relay-network-schema';
import { initializeRelayNetworkSystem } from '../db/relay-schema';
import { posterFont } from './poster-fonts';

export interface StarNode {
  userId: string;
  userName: string;
  contributedTokens: number;
}

interface MatrixView {
  targetDestination: string;
  progressPercentage: number;
  completedUnits: number;
  totalUnits: number;
  daysLeft: number;
  gravityRelayStars: number;
}

function resolveMatrix(userId: string): MatrixView {
  const metrics = getReversingMetrics(userId);
  if (metrics) {
    return {
      targetDestination: metrics.targetDestination,
      progressPercentage: metrics.progressPercentage,
      completedUnits: metrics.completedUnits,
      totalUnits: metrics.totalUnits,
      daysLeft: metrics.daysLeft,
      gravityRelayStars: metrics.gravityRelayStars,
    };
  }
  return {
    targetDestination: '未知高维引力源',
    progressPercentage: 1,
    completedUnits: 1,
    totalUnits: 100,
    daysLeft: 99,
    gravityRelayStars: 0,
  };
}

function resolveUserDisplayName(userId: string): string | null {
  initializeUnifiedWalletSystem();
  const db = getLearningDb();
  const row = db.prepare(`
    SELECT display_name FROM (
      SELECT display_name, created_at
      FROM user_sessions_v2
      WHERE user_id = ?
        AND display_name IS NOT NULL
        AND display_name != ''
      UNION ALL
      SELECT display_name, created_at
      FROM user_sessions
      WHERE user_id = ?
        AND display_name IS NOT NULL
        AND display_name != ''
    )
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId, userId) as { display_name: string } | undefined;
  return row?.display_name?.trim() ? row.display_name.trim() : null;
}

function listTopRelayStars(referrerUserId: string, limit = 6): StarNode[] {
  initializeRelayNetworkSystem();
  initializeRelayNetwork();
  const db = getLearningDb();

  const rows = db.prepare(`
    SELECT
      r.invitee_user_id AS invitee_user_id,
      COALESCE(w.accumulated_contributed_tokens, 0) AS contributed_tokens
    FROM star_alliance_referrals r
    LEFT JOIN warp_ledger w ON w.user_id = r.invitee_user_id
    WHERE r.referrer_user_id = ?
      AND COALESCE(w.accumulated_contributed_tokens, 0) > 0
    ORDER BY contributed_tokens DESC
    LIMIT ?
  `).all(referrerUserId, limit) as { invitee_user_id: string; contributed_tokens: number }[];

  return rows.map((r) => {
    const userId = String(r.invitee_user_id);
    const display = resolveUserDisplayName(userId);
    return {
      userId,
      userName: (display ?? userId).slice(0, 14),
      contributedTokens: Math.max(0, Number(r.contributed_tokens ?? 0)),
    };
  });
}

export class StarLeaguePosterEngine {
  private readonly width = 1080;
  private readonly height = 1350;
  private readonly sharesDir: string;

  constructor() {
    this.sharesDir = getSharesDir();
  }

  public async generateLeagueStarCard(userId: string, userName: string): Promise<string> {
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const displayName = (userName || safeUserId).slice(0, 14);
    const matrix = resolveMatrix(userId);
    const starNodes = listTopRelayStars(userId, 6);

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
    ctx.font = posterFont('bold', 32);
    ctx.fillText('WUXIAN // COGNITIVE STAR LEAGUE 2.0', 80, 80);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = posterFont('bold', 56);
    ctx.fillText(displayName, 80, 160);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.font = posterFont('normal', 24);
    ctx.fillText('星盟一级算力供给者 / 引力中继织者', 80, 235);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.font = posterFont('normal', 20);
    ctx.fillText(`RELAY STARS: ${matrix.gravityRelayStars}`, 80, 275);

    const centerX = this.width / 2;
    const centerY = 580;
    const coreRadius = 70;

    ctx.shadowBlur = 30;
    ctx.shadowColor = '#00FF7F';
    ctx.fillStyle = '#00FF7F';
    ctx.beginPath();
    ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#0D0E12';
    ctx.font = posterFont('bold', 24);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CORE', centerX, centerY);

    if (starNodes.length > 0) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      starNodes.forEach((node, index) => {
        const angle = (index * (Math.PI * 2)) / starNodes.length;
        const distance = 220 + (index % 2) * 40;
        const starX = centerX + Math.cos(angle) * distance;
        const starY = centerY + Math.sin(angle) * distance;

        ctx.strokeStyle = index % 2 === 0 ? 'rgba(0, 255, 127, 0.3)' : 'rgba(255, 69, 0, 0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(starX, starY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#FF4500';
        ctx.beginPath();
        ctx.arc(starX, starY, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = posterFont('bold', 22);
        ctx.fillText(node.userName, starX + 20, starY - 20);

        ctx.fillStyle = 'rgba(0, 255, 127, 0.7)';
        ctx.font = posterFont('normal', 16);
        ctx.fillText(`+${node.contributedTokens} Tkn`, starX + 20, starY + 6);
      });
    } else {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.font = posterFont('bold', 24);
      ctx.fillText('NO RELAY STARS YET', centerX, centerY + 140);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.font = posterFont('normal', 18);
      ctx.fillText('分享邀请码，点亮第一颗中继星', centerX, centerY + 175);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(80, 900, 920, 112);
    ctx.strokeStyle = 'rgba(0, 255, 127, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(80, 900, 920, 112);

    ctx.fillStyle = '#161820';
    ctx.fillRect(120, 958, 840, 16);
    const gradient = ctx.createLinearGradient(120, 0, 960, 0);
    gradient.addColorStop(0, '#00FF7F');
    gradient.addColorStop(1, '#FF4500');
    ctx.fillStyle = gradient;
    const barWidth = Math.max(15, Math.round((matrix.progressPercentage / 100) * 840));
    ctx.fillRect(120, 958, barWidth, 16);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = posterFont('bold', 28);
    const dest = matrix.targetDestination.length > 28 ? `${matrix.targetDestination.slice(0, 26)}…` : matrix.targetDestination;
    ctx.fillText(`航标目标: 《${dest}》 进度: ${matrix.progressPercentage}%`, 120, 915);

    const shareBase = process.env.WUXIAN_SHARE_BASE_URL?.trim() || 'https://wuxian.app';
    const inviteUrl = `${shareBase}/join?referrer=${encodeURIComponent(userId)}`;
    const qrBuffer = await QRCode.toBuffer(inviteUrl, {
      margin: 1,
      color: { dark: '#00FF7F', light: '#0D0E12' },
      width: 180,
    });

    const qrImage = new Image();
    qrImage.src = qrBuffer;
    ctx.drawImage(qrImage, 820, 1090);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = posterFont('normal', 24);
    ctx.fillText('扫描引力透镜 ➔ 加入去中心化自学同盟', 80, 1140);
    ctx.fillText('与其在传统教育体制里慢性内卷，不如在此折叠时空。', 80, 1180);

    const fileName = `league_card_${safeUserId}_${Date.now()}.png`;
    const outputPath = join(this.sharesDir, fileName);
    writeFileSync(outputPath, canvas.toBuffer('image/png'));

    return `/shares/${fileName}`;
  }
}
