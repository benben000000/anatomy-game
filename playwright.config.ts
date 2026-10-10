import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * WebKit is the closest available approximation of Safari and is what runs for
 * the 2D suites. It is **not** Safari on iPadOS: it does not reproduce real Safari
 * chrome, iPadOS safe-area insets, Home Screen web-app mode, Apple Pencil input, or
 * real backgrounding under memory pressure. Those require the physical device and
 * the checklist in docs/ipad-safari-test-plan.md.
 *
 * Three projects for the 2D flow, because touch emulation and keyboard emulation
 * are mutually exclusive here:
 *
 * - `ipad-landscape`  touch, landscape — the primary study layout
 * - `ipad-portrait`   touch, portrait  — the secondary layout
 * - `keyboard`        keyboard focus, landscape viewport
 *
 * Under WebKit *touch* emulation, `Tab` does not move focus at all (it stays on
 * `document.body`). That is an emulation limitation, not an application defect:
 * an iPad with a hardware keyboard does perform sequential focus navigation. The
 * keyboard project therefore runs against desktop-Safari emulation at the iPad
 * viewport, and real hardware keyboard verification stays in the manual
 * checklist.
 *
 * A fourth project, `private-3d`, runs the WebGL renderer suite against a live
 * dev server started with `--mode private3d` on port 4199. That is the only
 * configuration in which `VITE_PRIVATE_3D` is set **and** the model files are
 * served from `/private-models`, because models are deliberately never built into
 * `dist/`. It uses Chromium with a real (software or SwiftShader) GL backend,
 * which proves the model decodes and draws — not that it feels right on an iPad.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'ipad-landscape',
      testIgnore: /keyboard\.spec\.ts|three-d-renderer\.spec\.ts/,
      use: {
        ...devices['iPad Pro 11'],
        viewport: { width: 1194, height: 834 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'ipad-portrait',
      testIgnore: /keyboard\.spec\.ts|three-d-renderer\.spec\.ts/,
      use: {
        ...devices['iPad Pro 11'],
        viewport: { width: 834, height: 1194 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      // Keyboard traversal runs under Chromium.
      //
      // Playwright's WebKit build on Windows does not implement sequential focus
      // navigation at all — `Tab` never leaves `document.body` — because Safari's
      // behaviour depends on macOS Full Keyboard Access, which the Windows WebKit
      // build does not model. Chromium does implement it, so the keyboard contract
      // is verified there. Real hardware keyboard verification on an iPad Air M4
      // stays in docs/ipad-safari-test-plan.md.
      name: 'keyboard',
      testMatch: /keyboard\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1194, height: 834 },
      },
    },
    {
      name: 'private-3d',
      testMatch: /three-d-renderer\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        baseURL: 'http://localhost:4199',
      },
    },
  ],

  webServer: [
    {
      command: 'npm run build && npm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
    {
      // The private-3D dev server. Serves the model from private/assets, which
      // no build ever does. Skipped entirely when the originals are absent, so
      // the default test:e2e run works on a checkout without model files.
      command: 'npm run dev:3d:e2e',
      url: 'http://localhost:4199',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      env: { MUSCLE_ATLAS_SKIP_IF_NO_MODELS: '1' },
    },
  ],
});