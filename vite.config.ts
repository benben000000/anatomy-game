/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { releaseBlockingFlags, resolveBuildFlags } from './src/config/build-flags.ts';
import { privateModelAssets } from './plugins/private-model-assets.ts';

/**
 * A release build (`npm run build:release`) refuses to run while the project is
 * still carrying placeholder anatomy artwork or unreviewed draft content.
 *
 * A normal production build (`npm run build`) succeeds but prints a prominent
 * warning, because the technical MVP has to be buildable and testable before a
 * qualified reviewer and an asset owner have supplied reviewed content and
 * licensed artwork. See docs/07-mvp-acceptance.md section 3.
 */
function assertReleaseReadiness(mode: string): void {
  if (mode !== 'release') return;

  const flags = resolveBuildFlags({ MODE: mode, PROD: true });
  const blocking = releaseBlockingFlags(flags);

  if (blocking.length > 0) {
    throw new Error(
      [
        '',
        'RELEASE BUILD REFUSED.',
        '',
        `Blocking build flags: ${blocking.join(', ')}`,
        '',
        'Muscle Atlas must not be published with unreviewed anatomy content or',
        'placeholder artwork. To publish:',
        '',
        '  1. A qualified anatomy reviewer must review the content in',
        '     src/data/systems/muscular/, recording sources in sources.json and',
        '     reviewer metadata on every structure.',
        '  2. Licensed vector artwork must replace the placeholder geometry in',
        '     src/features/anatomy-board/board-2d-svg/provisional-geometry.data.ts,',
        '     with per-structure layers matching visual-mappings.json.',
        '  3. Real licences must be recorded in src/data/manifests/asset-manifest.json.',
        '',
        'Then set VITE_ALLOW_DRAFT_CONTENT=false and VITE_PROVISIONAL_ART=false.',
        'See docs/05-content-review-workflow.md and docs/04-asset-pipeline-and-licensing.md.',
        '',
      ].join('\n'),
    );
  }
}

export default defineConfig(({ mode }) => {
  assertReleaseReadiness(mode);

  const isRelease = mode === 'release';

  if (!isRelease) {
    console.warn(
      [
        '',
        '  Muscle Atlas — DEVELOPMENT BUILD',
        '  Anatomy artwork is provisional placeholder geometry.',
        '  Anatomy content is unreviewed draft content.',
        '  This build must not be published. Use `npm run build:release` to',
        '  verify the release guard.',
        '',
      ].join('\n'),
    );
  }

  return {
    base: '/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      react(),
      // Serves private/assets/open3dmodel/derived over HTTP for the dev and
      // preview servers only. Model binaries are never copied into a build.
      privateModelAssets(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        manifest: {
          id: '/',
          name: 'Muscle Atlas',
          short_name: 'Muscle Atlas',
          description:
            'Practice locating major muscles through interactive anatomy. Works offline once downloaded.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#0f1115',
          theme_color: '#0f1115',
          categories: ['education', 'medical', 'productivity'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globDirectory: 'dist',
          globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,json,webmanifest}'],
          // Never precache the 3D renderer, its loaders, or the Draco decoder.
          //
          // Those total roughly 950 kB - over 80% of what a PWA install downloads -
          // and serve a feature that is private-only and cannot work offline
          // anyway, because model binaries are deliberately never built. Precaching
          // them would make installation slower for every learner in order to
          // deliver something nobody without private 3D enabled can use.
          globIgnores: [
            '**/three.module-*.js',
            '**/GLTFLoader-*.js',
            '**/DRACOLoader-*.js',
            '**/ThreeDAnatomyBoard-*.js',
            '**/ThreeDExploreView-*.js',
            '**/threeDMappings-*.js',
            'vendor/draco/**',
          ],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          // Never take over an open tab: the learner's active round must not be
          // replaced underneath them by a service worker update. The update is
          // applied only when the learner explicitly asks for it.
          clientsClaim: false,
          skipWaiting: false,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'font',
              handler: 'CacheFirst',
              options: {
                cacheName: 'muscle-atlas-fonts-v1',
                expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'muscle-atlas-assets-v1',
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 90 },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    build: {
      target: 'es2020',
      sourcemap: mode !== 'release',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: false,
    },
    preview: {
      port: 4173,
      strictPort: false,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup/vitest.setup.ts'],
      include: ['src/**/*.spec.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/test/**',
          'src/main.tsx',
          'src/**/*.d.ts',
          'src/features/anatomy-board/contracts/**',
        ],
        thresholds: {
          statements: 70,
          branches: 65,
          functions: 65,
          lines: 70,
        },
      },
    },
  };
});
