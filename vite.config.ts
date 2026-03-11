import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin, ViteDevServer } from 'vite';

// ✅ Local Dev API Middleware Plugin
// Thay thế Vite proxy thông thường bằng middleware thực sự
// để xử lý /api/readSheet và /api/sync giống như Vercel functions
function localApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'local-api-middleware',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';

        // Chỉ xử lý /api/* requests
        if (!url.startsWith('/api/')) {
          return next();
        }

        const GAS_URL = env.GAS_EXEC_URL || env.VITE_BACKEND_URL || env.VITE_GAS_EXEC_URL;
        const GAS_SECRET = env.GAS_SECRET || env.VITE_GAS_SECRET;

        if (!GAS_URL) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'GAS_EXEC_URL chưa được cấu hình trong .env.local' }));
          return;
        }

        // Đọc request body
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            let payload: any = {};
            if (body) {
              try {
                payload = JSON.parse(body);
              } catch {
                payload = {};
              }
            }

            // Inject GAS_SECRET tự động
            const finalPayload = {
              ...payload,
              secret: GAS_SECRET || payload.secret,
            };

            console.log(`\n🔗 [Local API] ${req.url} → GAS (action: ${finalPayload.action || 'sync'})`);

            // Import node-fetch động (ESM)
            const { default: fetch } = await import('node-fetch');

            // Thêm cache-buster
            const bustUrl = `${GAS_URL}${GAS_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;

            const gasResponse = await fetch(bustUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(finalPayload),
              // node-fetch tự follow redirect CÓ GIỮ method POST
              follow: 10,
              redirect: 'follow',
            } as any);

            const responseText = await gasResponse.text();

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');

            // Kiểm tra nếu GAS trả về HTML (lỗi deploy hoặc chưa authorize)
            if (responseText.trim().startsWith('<')) {
              const cleanText = responseText.replace(/<[^>]+>/g, ' ').substring(0, 300).trim();
              console.error('❌ [Local API] GAS trả về HTML - Kiểm tra lại Deploy URL hoặc Authorization:');
              console.error('   URL:', GAS_URL);
              console.error('   HTML snippet:', cleanText.substring(0, 150));
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'error',
                error: 'Google Apps Script trả về HTML thay vì JSON.',
                detail: cleanText,
                hint: 'Kiểm tra: (1) GAS đã Deploy với "Anyone" access? (2) URL trong .env.local là URL /exec? (3) Script có doPost function?',
              }));
              return;
            }

            // Parse và trả về JSON
            try {
              const data = JSON.parse(responseText);
              res.writeHead(gasResponse.status && gasResponse.status < 400 ? 200 : gasResponse.status || 200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            } catch {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'error',
                error: 'Không thể parse JSON từ GAS',
                detail: responseText.substring(0, 200),
              }));
            }
          } catch (err: any) {
            console.error('❌ [Local API] Lỗi kết nối tới GAS:', err.message);
            res.writeHead(504, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'error',
              error: 'Không thể kết nối tới Google Apps Script',
              message: err.message,
              hint: 'Kiểm tra kết nối mạng và GAS_EXEC_URL trong .env.local',
            }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      // ✅ Custom middleware: xử lý /api/* thực sự giống Vercel functions
      localApiPlugin(env),
    ],
    define: {
      // ⚠️ Không bundle API keys ở đây
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
