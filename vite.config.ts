import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { precacheList, renderServiceWorker } from "./src/pwa/precache";

// PWA do modo nuvem: manifest, ícones, service worker e as tags do index.html. Só entra com VITE_CLOUD=1; o build do
// modo arquivo (Tauri) não ganha nenhum arquivo nem tag.
function cloudPwa(version: string): Plugin {
  const emit = (file: string): Buffer => readFileSync(file);
  return {
    name: "oficina-cloud-pwa",
    apply: "build",
    transformIndexHtml() {
      return [
        { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" }, injectTo: "head" },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
      ];
    },
    generateBundle(_options, bundle) {
      const icon512 = "src-tauri/icons/icon.png";
      const icon192 = "src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png";
      this.emitFile({ type: "asset", fileName: "icon-512.png", source: emit(icon512) });
      this.emitFile({ type: "asset", fileName: "icon-192.png", source: emit(icon192) });
      this.emitFile({ type: "asset", fileName: "apple-touch-icon.png", source: emit(icon192) });
      this.emitFile({
        type: "asset",
        fileName: "manifest.webmanifest",
        source: JSON.stringify(
          {
            name: "OficinaPro",
            short_name: "OficinaPro",
            lang: "pt-BR",
            start_url: "/",
            scope: "/",
            display: "standalone",
            background_color: "#0E0F12",
            theme_color: "#0E0F12",
            icons: [
              { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
              { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
            ],
          },
          null,
          2,
        ),
      });
      // index.html (o plugin do Vite o emite depois deste), theme-init.js e vite.svg (pasta public) ficam fora do bundle neste ponto, mas
      // o app depende deles para abrir sem sinal.
      const names = [...Object.keys(bundle), "index.html", "icon-512.png", "icon-192.png", "apple-touch-icon.png", "manifest.webmanifest", "theme-init.js", "vite.svg"];
      const template = readFileSync("scripts/pwa/sw.template.js", "utf8");
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: renderServiceWorker(template, { version, files: precacheList(names) }),
      });
    },
  };
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const isProd = mode === 'production' || mode === 'cloud';
  const isCloud = loadEnv(mode, process.cwd(), 'VITE_').VITE_CLOUD === '1';
  
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
      isCloud && cloudPwa(`${pkg.version}-${Date.now().toString(36)}`),
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