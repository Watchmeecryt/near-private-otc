import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@shared": path.resolve(import.meta.dirname, "../shared"), buffer: "buffer/" } },
  define: { global: "globalThis" },
  server: { port: 3000, strictPort: true, proxy: { "/api": "http://127.0.0.1:8790" }, fs: { allow: [".."] } },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
});
