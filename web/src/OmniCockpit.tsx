import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { authFetch, getOrCreateDeviceId, getAuthToken, jsonAuthHeaders, setAuthToken } from './lib/api-auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import CertificationDrawer from './components/CertificationDrawer';
import { DeepSeekLockBox } from './components/DeepSeekLockBox';
import { TabletCockpitLayout } from './components/TabletCockpitLayout';
import { ZhiLangSwitcher } from './components/ZhiLangSwitcher';
import { WalletShield } from './components/WalletShield';
import { LlmKeyringDrawer } from './components/LlmKeyringDrawer';
import { ZhiHelpPanel } from './components/ZhiHelpPanel';
import { ZhiTrendPanel } from './components/ZhiTrendPanel';
import { ZhiChatProvider } from './context/ZhiChatContext';
import { ZhiDirectoryProvider } from './context/ZhiDirectoryContext';
import { LearningProgressProvider } from './context/LearningProgressContext';
import { onWalletBump } from './lib/wuxian-events';
import { AppLegalFooter } from './components/AppLegalFooter';
import { LoadingSplash } from './components/LoadingSplash';
import { OnboardingOverlay, isOnboardingDone } from './components/OnboardingOverlay';
import { UserMenu } from './components/UserMenu';
import { PricingPage } from './components/PricingPage';
import { AuthModal } from './components/AuthModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { fetchAuthMe } from './lib/auth-me';
import { CheerOverlay } from './components/companion/CheerOverlay';

const USER_KEY = 'wuxian_user_id';

function getStoredUserId(): string {
  return localStorage.getItem(USER_KEY)?.trim() || 'u-pending-bootstrap';
}

export default function OmniCockpit() {
  const [userId, setUserId] = useState(getStoredUserId);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [walletRefreshKey, setWalletRefreshKey] = useState(0);
  const adminRef = useRef(false);
  const [fuelExpanded, setFuelExpanded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const existingToken = getAuthToken();
        const res = await authFetch('/api/v1/auth/bootstrap', {
          method: 'POST',
          headers: jsonAuthHeaders(),
          body: JSON.stringify({
            token: existingToken ?? undefined,
            deviceId: getOrCreateDeviceId(),
          }),
        });
        const json = (await res.json()) as { data?: { token?: string; userId?: string } };
        if (json.data?.token) setAuthToken(json.data.token);
        if (json.data?.userId) {
          localStorage.setItem(USER_KEY, json.data.userId);
          setUserId(json.data.userId);
        }
        const me = await fetchAuthMe();
        setIsAdmin(Boolean(me?.isAdmin));
      } catch (err) {
        console.warn('[OmniCockpit] Bootstrap failed (offline?)', err);
      } finally {
        setLoading(false);
        if (!isOnboardingDone()) setShowOnboarding(true);
      }
    })();
  }, []);

  useEffect(() => {
    const handler = () => { adminRef.current = true; setShowAdmin(true); };
    window.addEventListener('wuxian-open-admin', handler);
    return () => window.removeEventListener('wuxian-open-admin', handler);
  }, []);

  useEffect(() => onWalletBump(() => setWalletRefreshKey((v) => v + 1)), []);

  const closePricing = useCallback(() => setShowPricing(false), []);

  if (loading) return <LoadingSplash />;

  return (
    <ZhiDirectoryProvider userId={userId}>
      <LearningProgressProvider userId={userId}>
      <ZhiChatProvider userId={userId}>
      <ErrorBoundary name="CockpitLayout">
      <CheerOverlay studentId={userId}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative min-h-screen bg-[#0D0E12] font-sans text-white selection:bg-emerald-500/30"
      >
        {showOnboarding && (
          <OnboardingOverlay onDone={() => setShowOnboarding(false)} />
        )}

        {showPricing && (
          <PricingPage onClose={closePricing} />
        )}

        {showAuth && (
          <AuthModal
            onClose={() => setShowAuth(false)}
            onSuccess={(newUserId) => { setUserId(newUserId); setWalletRefreshKey((v) => v + 1); }}
          />
        )}

        {showAdmin && (
          <AdminDashboard onClose={() => setShowAdmin(false)} />
        )}

        <ErrorBoundary name="DeepSeekLockBox">
          <DeepSeekLockBox userId={userId} onBreakthrough={() => setWalletRefreshKey((v) => v + 1)} />
        </ErrorBoundary>
        <ErrorBoundary name="WalletShield">
          <WalletShield userId={userId} refreshKey={walletRefreshKey} />
        </ErrorBoundary>

        <div className="fixed top-4 left-4 z-30 flex items-center gap-2">
          <ErrorBoundary name="UserMenu">
            <UserMenu userId={userId} isAdmin={isAdmin} onOpenAuth={() => setShowAuth(true)} />
          </ErrorBoundary>
          <button
            onClick={() => setShowPricing(true)}
            className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
          >
            Pro
          </button>
        </div>

        <div
          className={`fixed top-4 z-20 transition-all safe-area-pt ${
            fuelExpanded ? 'right-[23rem] max-lg:right-4' : 'right-4 lg:right-12'
          }`}
        >
          <ErrorBoundary name="ZhiLangSwitcher">
            <ZhiLangSwitcher userId={userId} />
          </ErrorBoundary>
        </div>

        <ErrorBoundary name="TabletCockpitLayout">
          <TabletCockpitLayout
            userId={userId}
            refreshKey={walletRefreshKey}
            onFuelExpandedChange={setFuelExpanded}
          />
        </ErrorBoundary>

        <AppLegalFooter />

        <ErrorBoundary name="LlmKeyringDrawer">
          <LlmKeyringDrawer userId={userId} onSaved={() => setWalletRefreshKey((v) => v + 1)} />
        </ErrorBoundary>
        <ErrorBoundary name="CertificationDrawer">
          <CertificationDrawer userId={userId} onSync={() => setWalletRefreshKey((v) => v + 1)} />
        </ErrorBoundary>
        <ErrorBoundary name="ZhiHelpPanel">
          <ZhiHelpPanel />
        </ErrorBoundary>
      </motion.div>
      </CheerOverlay>
      <div className="fixed bottom-20 left-4 z-40 hidden w-56 lg:block">
        <ErrorBoundary name="ZhiTrendPanel">
          <ZhiTrendPanel userId={userId} />
        </ErrorBoundary>
      </div>
      </ErrorBoundary>
      </ZhiChatProvider>
      </LearningProgressProvider>
    </ZhiDirectoryProvider>
  );
}
