import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Build optimizations
  build: {
    // Enable minification
    minify: 'esbuild',
    // Enable CSS code splitting for better caching
    cssCodeSplit: true,
    // Enable source maps for production debugging (remove if not needed)
    sourcemap: false,
    // Optimize chunk size
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'charts': ['recharts'],
          'dnd': ['@hello-pangea/dnd'],
        },
      },
    },
    // Target modern browsers for better optimization
    target: 'esnext',
    // Report compressed size
    reportCompressedSize: true,
  },

  // Enable esbuild optimizations
  esbuild: {
    // Remove console.logs and debugger statements in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Enable tree-shaking
    treeShaking: true,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
