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
          followRedirects: true,
          rewrite: (path) => {
            const backendUrl = env.VITE_BACKEND_URL;
            if (!backendUrl) return path;
            try {
              const urlObj = new URL(backendUrl);
              return path.replace(/^\/api\/appscript/, urlObj.pathname + urlObj.search);
            } catch (e) {
              console.error('Invalid VITE_BACKEND_URL:', backendUrl);
              return path;
            }
          },
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
