import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend calls the backend through a dev proxy so that all API paths are
// same-origin ("/api/...", "/health"). In production these are served behind
// one gateway. Change the target if your backend runs elsewhere.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
