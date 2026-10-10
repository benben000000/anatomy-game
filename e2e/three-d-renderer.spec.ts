import { expect, test } from '@playwright/test';

/**
 * Private 3D, with the flag ON and the model present.
 *
 * This is the test that proves the renderer works against the real GLB rather
 * than a stub. It runs against a live dev server started with `--mode private3d`,
 * loads the actual derived model, and asserts that pixels are drawn.
 *
 * ## What this cannot prove
 *
 * It runs in headless Chromium with a software or SwiftShader GL backend. It is
 * **not** Safari on iPadOS, and it does not measure frame rate. It proves the
 * model decodes, meshes resolve to structures, and something is drawn. Whether
 * that feels right in the hand on an iPad Air M4 is a device question, listed in
 * docs/three-d-ipad-safari-test-plan.md.
 */

/**
 * Console noise produced by the Vite dev server, not by this app.
 *
 * Verified as unrelated to 3D: the identical message appears on `/` and
 * `/settings`, which load no model, no three.js and no Draco decoder. The
 * production build emits no console errors at all — `e2e/app.spec.ts`
 * ("collects no console errors on load") asserts that against `vite preview`.
 * This suite has to run against the dev server because that is the only mode
 * that serves model files, so the message has to be filtered by exact text
 * rather than ignored wholesale.
 */
const DEV_SERVER_NOISE = ["The script has an unsupported MIME type ('text/html')."];

function realConsoleErrors(errors: readonly string[]): string[] {
  return errors.filter(
    (text) =>
      !text.includes('favicon') &&
      !DEV_SERVER_NOISE.some((noise) => text.includes(noise)),
  );
}

test.describe('private 3D with the flag enabled', () => {
  test.beforeEach(async ({ page }) => {
    // Opt in at runtime, mirroring what a person does in Settings.
    await page.addInitScript(() => {
      window.localStorage.setItem('muscle-atlas.private-3d', 'enabled');
    });
  });

  test('loads the real model and draws pixels', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/explore/3d?pixelProbe=1');

    // The stage and its controls must exist.
    await expect(page.getByTestId('three-d-stage')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to 2D' })).toBeVisible();

    // Wait for the renderer to report ready. The status line is the honest
    // signal that decoding finished, rather than an arbitrary sleep.
    await expect(page.getByTestId('three-d-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('three-d-status')).toContainText(/muscles available in 3D/i);

    // The canvas must contain actual rendered pixels, not a blank buffer.
    const canvas = page.getByTestId('three-d-canvas');
    await expect(canvas).toBeVisible();

    const distinctColours = await page.evaluate(async () => {
      const element = document.querySelector('canvas');
      if (!(element instanceof HTMLCanvasElement)) return -1;
      // Read back through a 2D copy; a WebGL canvas cannot be read directly
      // once the frame is presented unless preserveDrawingBuffer is set.
      const copy = document.createElement('canvas');
      copy.width = element.width;
      copy.height = element.height;
      const context = copy.getContext('2d');
      if (context === null) return -1;
      context.drawImage(element, 0, 0);
      const { data } = context.getImageData(0, 0, copy.width, copy.height);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4 * 97) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return seen.size;
    });

    // A blank or single-colour buffer means the model did not draw.
    expect(distinctColours).toBeGreaterThan(3);

    expect(realConsoleErrors(consoleErrors)).toEqual([]);
  });

  test('offers visible controls for every gesture', async ({ page }) => {
    await page.goto('/explore/3d?pixelProbe=1');
    await expect(page.getByTestId('three-d-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('three-d-status')).toContainText(/muscles available in 3D/i);

    const controls = page.getByRole('group', { name: '3D view controls' });
    await expect(controls).toBeVisible();

    // Orientation, zoom, reset and the route back. Nothing is gesture-only.
    for (const name of ['Anterior', 'Posterior', 'Lateral', 'Medial', 'Zoom in', 'Zoom out', 'Reset view']) {
      await expect(controls.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(controls.getByRole('link', { name: 'Back to 2D' })).toBeVisible();
  });

  test('never claims the licence is verified while showing the model', async ({ page }) => {
    await page.goto('/explore/3d?pixelProbe=1');
    await expect(page.getByTestId('three-d-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('three-d-status')).toContainText(/muscles available in 3D/i);

    const body = (await page.locator('body').innerText()).toLowerCase();

    // The model is on screen and its licence status is disclosed, unverified.
    expect(body).toContain('licence not verified');
    expect(body).not.toContain('public domain');
    expect(body).not.toMatch(/\bopen source\b/);
    expect(body).not.toContain('licence cleared');
  });

  test('keeps the contributor roster reachable with the model on screen', async ({ page }) => {
    await page.goto('/explore/3d?pixelProbe=1');
    await expect(page.getByTestId('three-d-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('three-d-status')).toContainText(/muscles available in 3D/i);

    await page.getByRole('button', { name: /model credits and licence/i }).click();
    const panel = page.getByTestId('model-attribution');
    await panel.getByRole('button', { name: /contributor list/i }).click();

    await expect(panel).toContainText('Gobée');
    await expect(panel).toContainText('BodyParts3D');
  });

  test('returns to the complete 2D board without reloading', async ({ page }) => {
    await page.goto('/explore/3d?pixelProbe=1');
    await expect(page.getByTestId('three-d-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('three-d-status')).toContainText(/muscles available in 3D/i);

    await page.getByRole('link', { name: 'Back to 2D' }).click();

    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByTestId('board-canvas')).toBeVisible();
  });

  test('releases the WebGL context when leaving 3D, so returning still works', async ({ page }) => {
    await page.goto('/explore/3d?pixelProbe=1');
    await expect(page.getByTestId('three-d-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('three-d-status')).toContainText(/muscles available in 3D/i);

    // Navigate away and back several times. If contexts leaked, the browser
    // starts dropping the oldest one and the canvas stops rendering.
    for (let round = 0; round < 3; round += 1) {
      await page.getByRole('link', { name: 'Back to 2D' }).click();
      await expect(page.getByTestId('board-canvas')).toBeVisible();
      await page.goto('/explore/3d?pixelProbe=1');
      await expect(page.getByTestId('three-d-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('three-d-status')).toContainText(/muscles available in 3D/i);
    }
  });

  test('names the structures that have no 3D counterpart somewhere', async ({ page }) => {
    // 5 of 19 structures have no model. The UI must not imply total coverage.
    await page.goto('/explore/3d?pixelProbe=1');
    await expect(page.getByTestId('three-d-stage')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('three-d-status')).toContainText(/muscles available in 3D/i);

    await expect(page.getByText(/2D board therefore remains the complete route/i)).toBeVisible();
  });
});