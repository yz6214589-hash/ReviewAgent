import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 阶段一：后端 FastAPI 默认运行在 8000 端口，/api 统一走代理（SSE 长连接禁用缓冲）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // SSE 需要关闭压缩与缓冲，保证 chunk 实时下发
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (String(proxyRes.headers['content-type'] ?? '').includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
});
