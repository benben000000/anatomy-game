import { expect, test } from '@playwright/test';

/**
 * The 3D route, as it behaves under private local use.
 *
 * The E2E run uses the default dev mode, where `VITE_PRIVATE_3D` is not set, so
 * these tests exercise the **blocked** path: the build gate stops 3D existing at
 * all. That is the state a shared machine or a plain `npm run dev` lands in, and
 * it must be handled honestly rather than by a silent failure.
 *
 * The enabled path needs a real WebGL context and the model on disk, so it is
 * covered by the manual checklist in docs/three-d-ipad-safari-test-plan.md and
 * by `npm run verify:3d-assets` for the files themselves.
 */

test.describe('3D route with the private build flag off', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore/3d');
  });

  test('loads without blocking the app', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Explore in 3D' })).toBeVisible();
  });

  test('says plainly that 3D is switched off in this build', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Private 3D is switched off in this build/i }),
    ).toBeVisible();
    await expect(page.getByText(/was built without local 3D/i)).toBeVisible();
  });

  test('tells the owner how to enable it', async ({ page }) => {
    await expect(page.getByText(/VITE_PRIVATE_3D=true/)).toBeVisible();
  });

  test('never claims the model is loaded or the licence is cleared', async ({ page }) => {
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('public domain');
    expect(body).not.toMatch(/\bopen source\b/);
    expect(body).not.toContain('licence cleared');
    expect(body).not.toContain('license cleared');
  });

  test('always offers a route back to the 2D board', async ({ page }) => {
    // The 2D board is reachable from the main navigation regardless of the 3D
    // state, so this must never be blocked.
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Explore' })).toBeVisible();
  });

  test('keeps the model credits reachable regardless of state', async ({ page }) => {
    await page.getByRole('button', { name: /model credits and licence/i }).click();
    await expect(page.getByTestId('model-attribution')).toBeVisible();
  });

  test('renders the real contributor roster, not a vague summary', async ({ page }) => {
    await page.getByRole('button', { name: /model credits and licence/i }).click();
    const panel = page.getByTestId('model-attribution');
    await panel.getByRole('button', { name: /contributor list/i }).click();

    await expect(panel).toContainText('Gobée');
    await expect(panel).toContainText('BodyParts3D');
    await expect(panel).toContainText('Z-Anatomy');
  });

  test('states the licence by name and links its deed', async ({ page }) => {
    await page.getByRole('button', { name: /model credits and licence/i }).click();
    const panel = page.getByTestId('model-attribution');

    await expect(panel).toContainText('Attribution-ShareAlike 4.0');
    await expect(panel.getByRole('link', { name: /read the licence/i })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    );
  });

  test('carries the source project own accuracy caveats', async ({ page }) => {
    await page.getByRole('button', { name: /model credits and licence/i }).click();
    const panel = page.getByTestId('model-attribution');
    await panel.getByRole('button', { name: /contributor list/i }).click();

    await expect(panel).toContainText('some errors may still be present');
  });

  test('links to the source project', async ({ page }) => {
    await page.getByRole('button', { name: /model credits and licence/i }).click();
    const panel = page.getByTestId('model-attribution');
    await expect(panel.getByRole('link', { name: 'Open3Dmodel project' })).toHaveAttribute(
      'href',
      'https://anatomytool.org/open3dmodel',
    );
  });
});

test.describe('the private 3D settings switch', () => {
  test('is present and explains itself', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Private 3D models' })).toBeVisible();
    await expect(page.getByText(/stored only on this device/i)).toBeVisible();
  });

  test('says the licence is not verified, and explains what that means', async ({ page }) => {
    await page.goto('/settings');

    // The notice must state the licence is unverified AND explain that private
    // use does not trigger ShareAlike, rather than simply refusing without a
    // reason.
    await expect(page.getByText(/model licence is not verified/i)).toBeVisible();
    await expect(page.getByText(/does not require ShareAlike to be triggered/i)).toBeVisible();
  });

  test('does not offer an enable control when the build flag is off', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText(/Not available in this build/i)).toBeVisible();
  });

  test('does not load any model when 3D is unavailable', async ({ page }) => {
    const modelRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/private-models/')) modelRequests.push(request.url());
    });

    await page.goto('/explore/3d');
    await expect(page.getByRole('heading', { level: 1, name: 'Explore in 3D' })).toBeVisible();

    expect(modelRequests).toEqual([]);
  });
});

test.describe('the 2D flow is unaffected', () => {
  test('a learner can leave 3D and use the board immediately', async ({ page }) => {
    await page.goto('/explore/3d');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Explore' }).click();

    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByTestId('board-canvas')).toBeVisible();
  });

  test('the 2D board never requests a 3D asset', async ({ page }) => {
    const threeDRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('three.module') || url.includes('/private-models/')) {
        threeDRequests.push(url);
      }
    });

    await page.goto('/explore');
    await expect(page.getByTestId('board-canvas')).toBeVisible();

    expect(threeDRequests).toEqual([]);
  });
});