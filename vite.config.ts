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
        '/api': {
          target: 'https://script.google.com',
          changeOrigin: true,
          followRedirects: true,
          rewrite: (path) => {
            const url = env.GAS_EXEC_URL || env.VITE_BACKEND_URL;
            if (!url) return path;
            
            try {
              const urlObj = new URL(url);
              // Lấy phần /macros/s/XXX/exec
              const targetBase = urlObj.pathname;
              // Thay thế /api/readSheet bằng /macros/s/XXX/exec
              // Giữ nguyên phần query string (?action=...)
              return path.replace(/^\/api\/[a-zA-Z0-9_-]+/, targetBase);
            } catch (e) {
              return path;
            }
          },
          secure: true,
        },
      },
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
