import i18n from '../i18n/config';
import { authFetch } from '../lib/api-auth';
import { emitWuxianEvent, WUXIAN_EVENTS } from '../lib/wuxian-events';

type Lang = string;

export class ZhiLanguageSyncer {
  public static switchLanguage(lang: Lang, userId?: string) {
    i18n.changeLanguage(lang);
    localStorage.setItem('zhi_wuxian_lang', lang);
    (window.wuxianDesktop as any)?.syncSystemLanguage?.(lang);
    (window.electronAPI as any)?.syncSystemLanguage?.(lang);
    emitWuxianEvent(WUXIAN_EVENTS.langChanged, { lang });

    const uid = (userId || localStorage.getItem('wuxian_user_id') || '').trim();
    if (uid) {
      void authFetch('/api/v1/user/preferences/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, lang, syncCloud: true }),
      }).catch(() => null);
    }
  }
}
