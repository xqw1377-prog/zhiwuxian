import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = ((process.env.WUXIAN_API_BASE || env.WUXIAN_API_BASE || 'http://localhost:3401')).replace(/\/$/, '');
  const forCapacitor = process.env.CAPACITOR === '1';

  return {
    plugins: [react()],
    base: forCapacitor ? './' : '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/framer-motion')) return 'motion';
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react-vendor';
            if (id.includes('node_modules/i18next') || id.includes('react-i18next')) return 'i18n';
            if (id.includes('@capacitor')) return 'capacitor';
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiBase, changeOrigin: true },
      },
    },
  };
});
