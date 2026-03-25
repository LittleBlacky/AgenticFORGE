import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // SSE 流式端点 — selfHandleResponse 接管响应，逐块透传，禁止缓冲
      "/api/chat/stream": {
        target: "http://localhost:3010",
        changeOrigin: true,
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes, _req, res) => {
            // 原样透传所有 headers
            Object.entries(proxyRes.headers).forEach(([k, v]) => {
              if (v !== undefined) res.setHeader(k, v as string | string[]);
            });
            res.setHeader("cache-control", "no-cache, no-transform");
            res.setHeader("x-accel-buffering", "no");
            res.statusCode = proxyRes.statusCode ?? 200;
            // 逐块写入，立即冲刷到浏览器
            proxyRes.on("data", (chunk: Buffer) => {
              res.write(chunk);
            });
            proxyRes.on("end", () => res.end());
            proxyRes.on("error", () => res.end());
          });
        },
      },
      // 普通 API
      "/api": {
        target: "http://localhost:3010",
        changeOrigin: true,
      },
      "/ws": { target: "ws://localhost:3010", ws: true },
    },
  },
});
