import { ErrorBoundary } from './components/ErrorBoundary';
import { CriticalErrorFallback } from './components/ErrorFallback';
import OmniCockpit from './OmniCockpit';
import { DesktopPanel } from './pages/DesktopPanel';
import { GhostCaptureOverlay } from './pages/GhostCaptureOverlay';
import { LegalShell } from './pages/LegalShell';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import { AdminStandalonePage } from './components/admin/AdminStandalonePage';
import { ParentCompanionPage } from './pages/ParentCompanionPage';

function routeHash(): string {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0] ?? '';
}

export default function App() {
  const hash = routeHash();
  if (hash === 'desktop-panel') {
    return <DesktopPanel />;
  }
  if (hash === 'ghost-capture') {
    return <GhostCaptureOverlay />;
  }
  if (hash === 'privacy') {
    return (
      <LegalShell>
        <PrivacyPolicy />
      </LegalShell>
    );
  }
  if (hash === 'terms') {
    return (
      <LegalShell>
        <TermsOfService />
      </LegalShell>
    );
  }
  if (hash === 'admin') {
    return <AdminStandalonePage onClose={() => { window.location.hash = ''; }} />;
  }
  if (hash.startsWith('parent/') || hash === 'parent') {
    return <ParentCompanionPage />;
  }
  return (
    <ErrorBoundary fallback={<CriticalErrorFallback error={null} resetError={() => window.location.reload()} />} name="App">
      <OmniCockpit />
    </ErrorBoundary>
  );
}