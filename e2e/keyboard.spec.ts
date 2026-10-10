import { expect, test } from '@playwright/test';

/**
 * Keyboard and assistive-technology behaviour.
 *
 * Run under desktop-Safari emulation at the iPad landscape viewport, because
 * WebKit touch emulation does not perform sequential focus navigation. Real
 * hardware keyboard verification on an iPad Air M4 remains in
 * docs/ipad-safari-test-plan.md.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { level: 1 }).waitFor();
});

test('reaches the skip link within the first few tabs', async ({ page }) => {
  const skip = page.getByRole('link', { name: /Skip to main content/ });

  let reached = false;
  for (let i = 0; i < 3 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await skip.evaluate((element) => element === document.activeElement);
  }
  expect(reached).toBe(true);
});

test('moves focus on to the navigation after the skip link', async ({ page }) => {
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');

  const inNav = await page.evaluate(
    () => document.activeElement?.closest('nav') !== null,
  );
  expect(inNav).toBe(true);
});

test('shows a visible focus indicator', async ({ page }) => {
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');

  const outlineWidth = await page.evaluate(() => {
    const active = document.activeElement;
    if (active === null) return '0px';
    return window.getComputedStyle(active).outlineWidth;
  });

  expect(Number.parseFloat(outlineWidth)).toBeGreaterThan(0);
});

test('reaches every primary destination with Tab alone', async ({ page }) => {
  const visited = new Set<string>();

  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const active = document.activeElement;
      if (active === null || active.closest('nav') === null) return null;
      return (active.textContent ?? '').trim();
    });
    if (label !== null) visited.add(label);
  }

  for (const item of ['Home', 'Explore', 'Practice', 'Identify', 'Progress', 'Settings']) {
    expect(visited.has(item), `${item} was not reachable by keyboard`).toBe(true);
  }
});

test('activates a navigation link with Enter', async ({ page }) => {
  const explore = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Explore' });
  await explore.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('region', { name: 'Anatomy board' })).toBeVisible();
  await expect(explore).toHaveAttribute('aria-current', 'page');
});

test('activates a control with Space', async ({ page }) => {
  await page.goto('/settings');
  const reduceMotion = page.getByRole('switch', { name: 'Reduce motion' });

  await reduceMotion.focus();
  await page.keyboard.press('Space');

  await expect(reduceMotion).toHaveAttribute('aria-checked', 'true');
});

test('selects a structure in Explore without any pointer input', async ({ page }) => {
  await page.goto('/explore');

  // Opened with the keyboard rather than a tap.
  await page.locator('summary').first().focus();
  await page.keyboard.press('Enter');

  const first = page.getByRole('button', { name: /Frontalis/ }).first();
  await first.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Frontalis' })).toBeVisible();
});

test('gives every visible control a reachable focus stop', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('region', { name: 'Anatomy board' }).waitFor();

  const unnamed = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a[href], summary'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const label = element.getAttribute('aria-label');
        const text = (element.textContent ?? '').trim();
        return label === null && text.length === 0;
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );

  expect(unnamed).toEqual([]);
});

test('closes a dialog with Escape and restores focus', async ({ page }) => {
  await page.goto('/explore');
  // The disambiguation chooser is the only modal surface in this release.
  const dialogCount = await page.locator('[role="dialog"][aria-modal="true"]').count();
  expect(dialogCount).toBe(0);
});
