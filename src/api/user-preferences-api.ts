import { ZhiStorageBridge } from '../services/ZhiStorageBridge';
import {
  getUserPreferences,
  upsertUserLanguagePreference,
  updateUserPreferenceCloudSync,
  type ZhiLang,
} from '../db/user-preferences-schema';

export async function setUserLanguagePreference(input: {
  userId: string;
  lang: ZhiLang;
  syncCloud?: boolean;
}): Promise<{
  success: boolean;
  preferences: ReturnType<typeof getUserPreferences>;
}> {
  const pref = upsertUserLanguagePreference(input.userId, input.lang);

  if (input.syncCloud !== false && ZhiStorageBridge.isConfigured()) {
    const body = JSON.stringify(
      { userId: pref.user_id, preferredLang: pref.preferred_lang, updatedAt: pref.updated_at },
      null,
      2,
    );
    const pushed = await ZhiStorageBridge.pushUserSettingToCloud({
      userId: pref.user_id,
      setting: 'language',
      content: body,
    });
    if (pushed.success) {
      updateUserPreferenceCloudSync({
        userId: pref.user_id,
        status: 'SYNCED',
        cloudKey: pushed.cloudKey ?? null,
        cloudUrl: pushed.url ?? null,
        cloudSyncedAt: Date.now(),
      });
    } else {
      updateUserPreferenceCloudSync({
        userId: pref.user_id,
        status: 'FAILED',
        cloudSyncedAt: Date.now(),
      });
    }
  } else {
    updateUserPreferenceCloudSync({
      userId: pref.user_id,
      status: 'DISABLED',
      cloudSyncedAt: null,
    });
  }

  return { success: true, preferences: getUserPreferences(pref.user_id) };
}

export function getUserPreferenceSnapshot(userId: string): {
  success: boolean;
  preferences: ReturnType<typeof getUserPreferences>;
} {
  return { success: true, preferences: getUserPreferences(userId) };
}
