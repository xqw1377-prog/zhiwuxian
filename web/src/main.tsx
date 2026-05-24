import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n/config';
import { initNativeShell } from './lib/native-shell';
import { initWebVitalsReporting } from './lib/web-vitals-reporter';
import { registerServiceWorker, onNetworkChange } from './lib/offline-support';
import { initIAP } from './lib/iap-service';

void initNativeShell();
void initIAP(
  import.meta.env.VITE_REVENUECAT_API_KEY || null,
  localStorage.getItem('wuxian_user_id') || 'anonymous',
);
initWebVitalsReporting();
registerServiceWorker();

onNetworkChange((online) => {
  document.documentElement.dataset.online = String(online);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
