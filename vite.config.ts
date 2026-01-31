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
          rewrite: (path) => path.replace(/^\/api\/appscript/, '/macros/s/AKfycby1yWOWCgOBe_T_J6zggGygMN5DFhj-t0AAHvsvNM9hdFZKSbXdFNFp4OrVGnKnYI0/exec'),
          secure: true,
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
