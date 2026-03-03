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
          secure: true,
          rewrite: (path) => {
            // 🚀 Rewrite /api/sync?... to ?... or empty string.
            // This prevents adding a trailing slash like /exec/ which Google dislikes.
            return path.replace(/^\/api\/[^/?]+/, '');
          },
          // 🛡️ Monitor proxy errors
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, res) => {
              console.error('❌ Proxy error:', err);
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
              }
              res.end(JSON.stringify({ error: 'Proxy failed', message: err.message }));
            });
          },
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
