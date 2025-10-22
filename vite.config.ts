import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Fix Vite + Node 22 parsing issues
export default defineConfig({
  plugins: [react()],
  esbuild: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  // Optional: disable error overlay if you prefer
  server: {
    hmr: {
      overlay: true, // or false to disable red overlay
    },
  },
});
