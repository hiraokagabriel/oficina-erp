import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const isProd = mode === 'production';
  
  // Lazy load imagemin plugin only when needed
  let viteImagemin: any = null;
  if (isProd) {
    try {
      viteImagemin = (await import('vite-plugin-imagemin')).default;
    } catch (e) {
      console.warn('vite-plugin-imagemin not installed. Image optimization disabled.');
    }
  }

  return {
    plugins: [
      react(),
      // Optimize images in production (only if plugin is available)
      isProd && viteImagemin && viteImagemin({
        gifsicle: {
          optimizationLevel: 7,
          interlaced: false,
        },
        optipng: {
          optimizationLevel: 7,
        },
        mozjpeg: {
          quality: 80,
        },
        pngquant: {
          quality: [0.8, 0.9],
          speed: 4,
        },
        svgo: {
          plugins: [
            {
              name: 'removeViewBox',
              active: false,
            },
            {
              name: 'removeEmptyAttrs',
              active: false,
            },
          ],
        },
      }),
    ].filter(Boolean),

    // Build optimizations
    build: {
      // Enable minification
      minify: 'esbuild',
      // Enable CSS code splitting for better caching
      cssCodeSplit: true,
      // Disable source maps for production (smaller bundle)
      sourcemap: false,
      // Optimize chunk size
      rollupOptions: {
        output: {
          // Manual chunk splitting for better caching
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'charts': ['recharts'],
            'dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          },
        },
      },
      // Target modern browsers for better optimization
      target: 'esnext',
      // Report compressed size
      reportCompressedSize: true,
      // Chunk size warning limit
      chunkSizeWarningLimit: 1000,
    },

    // Enable esbuild optimizations
    esbuild: {
      // Remove console.logs and debugger statements in production
      drop: isProd ? ['console', 'debugger'] : [],
      // Enable tree-shaking
      treeShaking: true,
      // Legal comments: none = remove all comments
      legalComments: 'none',
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
  };
});