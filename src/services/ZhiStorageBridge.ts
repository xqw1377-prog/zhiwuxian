let aws: any = null;
async function loadAws(): Promise<any> {
  if (aws) return aws;
  try {
    const s3 = await import('@aws-sdk/client-s3');
    const presign = await import('@aws-sdk/s3-request-presigner');
    aws = { ...s3, ...presign };
    return aws;
  } catch {
    return null;
  }
}
import { createHash } from 'crypto';
import { getLearningDb } from '../../server/wuxian-learning-db';
import { updateDirectorySyncStatus, upsertArtifact } from '../db/zhi-cloud-schema';

export type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  cdnBaseUrl?: string;
};

export type PushResult = { success: boolean; url?: string; cloudKey?: string };

function readConfig(): StorageConfig | null {
  const endpoint = process.env.ZHI_S3_ENDPOINT?.trim();
  const region = (process.env.ZHI_S3_REGION?.trim() || 'auto').trim();
  const bucket = process.env.ZHI_S3_BUCKET?.trim();
  const accessKeyId = process.env.ZHI_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.ZHI_S3_SECRET_ACCESS_KEY?.trim();
  const cdnBaseUrl = process.env.ZHI_S3_CDN_BASE_URL?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, region, bucket, accessKeyId, secretAccessKey, cdnBaseUrl: cdnBaseUrl || undefined };
}

async function getClient(cfg: StorageConfig): Promise<any | null> {
  const a = await loadAws();
  if (!a?.S3Client) return null;
  return new a.S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

function buildCloudKey(input: { userId: string; dirId: string; artifactId: string; version: string }): string {
  const safe = (s: string) => s.replace(/[^\w\-]+/g, '_').slice(0, 64) || 'X';
  return `zhi_wuxian/${safe(input.userId)}/artifacts/${safe(input.dirId)}/${safe(input.artifactId)}_${safe(input.version)}.json`;
}

function buildUserSettingKey(input: { userId: string; setting: string }): string {
  const safe = (s: string) => s.replace(/[^\w\-]+/g, '_').slice(0, 64) || 'X';
  return `zhi_wuxian/${safe(input.userId)}/settings/${safe(input.setting)}.json`;
}

function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 12);
}

export class ZhiStorageBridge {
  public static isConfigured(): boolean {
    return Boolean(readConfig());
  }

  public static async pushUserSettingToCloud(input: {
    userId: string;
    setting: string;
    content: string;
  }): Promise<PushResult> {
    const cfg = readConfig();
    if (!cfg) return { success: false };
    const userId = input.userId.trim();
    const setting = input.setting.trim() || 'SETTING';
    const cloudKey = buildUserSettingKey({ userId, setting });
    const a = await loadAws();
    if (!a?.PutObjectCommand || !a?.GetObjectCommand || !a?.getSignedUrl) return { success: false };
    const client = await getClient(cfg);
    if (!client) return { success: false };
    const { PutObjectCommand, GetObjectCommand, getSignedUrl } = a;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: cloudKey,
          Body: Buffer.from(input.content, 'utf8'),
          ContentType: 'application/json',
        }),
      );

      const url =
        cfg.cdnBaseUrl && cfg.cdnBaseUrl.length > 0
          ? `${cfg.cdnBaseUrl.replace(/\/$/, '')}/${cloudKey}`
          : await getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: cloudKey }), {
              expiresIn: 60 * 30,
            });
      return { success: true, url, cloudKey };
    } catch {
      return { success: false };
    }
  }

  public static async pushArtifactToCloud(input: {
    userId: string;
    dirId: string;
    title: string;
    content: string;
    version: string;
    artifactId?: string;
  }): Promise<PushResult> {
    const cfg = readConfig();
    if (!cfg) return { success: false };

    const userId = input.userId.trim();
    const dirId = input.dirId.trim();
    const artifactId = (input.artifactId?.trim() || `ART_${contentHash(input.content)}`).slice(0, 72);
    const version = input.version.trim() || 'V1';

    const cloudKey = buildCloudKey({ userId, dirId, artifactId, version });
    const a = await loadAws();
    if (!a?.PutObjectCommand || !a?.GetObjectCommand || !a?.getSignedUrl) return { success: false };
    const client = await getClient(cfg);
    if (!client) return { success: false };
    const { PutObjectCommand, GetObjectCommand, getSignedUrl } = a;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: cloudKey,
          Body: Buffer.from(input.content, 'utf8'),
          ContentType: 'application/json',
        }),
      );

      const url =
        cfg.cdnBaseUrl && cfg.cdnBaseUrl.length > 0
          ? `${cfg.cdnBaseUrl.replace(/\/$/, '')}/${cloudKey}`
          : await getSignedUrl(client, new GetObjectCommand({ Bucket: cfg.bucket, Key: cloudKey }), {
              expiresIn: 60 * 30,
            });

      upsertArtifact({
        artifactId,
        userId,
        dirId,
        fileTitle: input.title,
        versionTag: version,
        storageProvider: 'S3_COMPATIBLE',
        cloudKey,
        cdnUrl: url,
        cloudSyncStatus: 'SYNCED',
        syncTimestamp: Date.now(),
      });

      updateDirectorySyncStatus(userId, dirId, 'SYNCED', url);
      return { success: true, url, cloudKey };
    } catch {
      try {
        updateDirectorySyncStatus(userId, dirId, 'FAILED');
        const db = getLearningDb();
        db.prepare(
          `UPDATE zhi_cloud_artifacts SET cloud_sync_status = 'FAILED', sync_timestamp = ? WHERE user_id = ? AND dir_id = ? AND version_tag = ?`,
        ).run(Date.now(), userId, dirId, version);
      } catch {
        /* ignore */
      }
      return { success: false };
    }
  }
}
