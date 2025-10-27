import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ✅ Optimized Vite config for React + Vercel deployment
export default defineConfig({
  plugins: [react()],

  // Ensure correct relative paths when hosted on Vercel
  base: "./",

  // Optimize build output
  build: {
    outDir: "dist",
    target: "esnext",
    chunkSizeWarningLimit: 2000, // ✅ prevents 500kB warning from showing
  },

  // Compatibility for Node 22 and modern syntax
  esbuild: {
    target: "esnext",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },

  // Dev server config (affects only local dev)
  server: {
    hmr: {
      overlay: true, // show red error overlay (set false to disable)
    },
  },
});
