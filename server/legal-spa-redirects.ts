/** 商店合规 URL（无 hash）→ SPA hash 路由 */
export const LEGAL_SPA_REDIRECTS: Record<string, string> = {
  '/privacy': '/#/privacy',
  '/privacy.html': '/#/privacy',
  '/terms': '/#/terms',
  '/terms.html': '/#/terms',
};

export function registerLegalSpaRedirects(
  app: import('express').Application,
): void {
  for (const [path, target] of Object.entries(LEGAL_SPA_REDIRECTS)) {
    app.get(path, (_req, res) => {
      res.redirect(302, target);
    });
  }
}
