import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api/appscript': {
          target: 'https://script.google.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/appscript/, '/macros/s/AKfycbyb5bD0VkvmeL1qwZxz6ngTB0INTs2FAEukaf7GbO5m-mXGnykTEqltcBiYJI1vDlC_1g/exec'),
          secure: true,
        }
      }
    },
    plugins: [react()],
    define: {
      // ⚠️ NOTE: Do NOT bundle API keys here!
      // Move sensitive API keys to backend or environment-specific configs
      // 'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
