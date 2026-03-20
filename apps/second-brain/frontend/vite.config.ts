import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3010",
      "/ws": { target: "ws://localhost:3010", ws: true },
    },
  },
});
