import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      // ✅ Local Dev Proxy: Handles /api calls during 'npm run dev'
      // This is required because Vite doesn't natively handle Vercel's /api folder.
      proxy: {
        '/api': {
          target: env.GAS_EXEC_URL || env.VITE_BACKEND_URL || 'https://script.google.com',
          changeOrigin: true,
          followRedirects: true,
          rewrite: (path) => {
            const newPath = path.replace(/^\/api\/[^/?]+/, '');
            console.log(`🔄 Proxy: ${path} -> ${newPath}`);
            return newPath;
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
