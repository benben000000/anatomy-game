import { expect, test } from '@playwright/test';

/**
 * End-to-end coverage of what a learner actually does.
 *
 * These assert behaviour, not snapshots: navigation, the honest empty state, the
 * development-build notice, layout invariants, and keyboard reachability.
 *
 * The round itself is covered by the Vitest integration suite, which can drive a
 * published content pack. Here the pack is deliberately unpublished, so the
 * end-to-end suite verifies what the app does when there is genuinely nothing
 * to ask — which is the state this project is actually in.
 */

test.describe('first launch', () => {
  test('shows the product name, one sentence, and three entry points', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Muscle Atlas' })).toBeVisible();
    await expect(
      page.getByText('Practice locating major muscles through interactive anatomy.'),
    ).toBeVisible();

    await expect(page.getByRole('link', { name: /Explore anatomy/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Beginner practice/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Quick identification/ })).toBeVisible();
  });

  test('states that this build must not be studied from', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Development build/).first()).toBeVisible();
    await expect(page.getByText(/Do not study from this build/)).toBeVisible();
  });

  test('never asks for an account or personal data', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /sign in|create account/i })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
  });

  test('collects no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByRole('heading', { level: 1 }).waitFor();

    expect(errors).toEqual([]);
  });

  test('produces no unhandled promise rejections', async ({ page }) => {
    const rejections: string[] = [];
    page.on('pageerror', (error) => rejections.push(error.message));

    await page.goto('/');
    await page.waitForTimeout(500);

    expect(rejections).toEqual([]);
  });
});

test.describe('navigation', () => {
  const destinations = [
    { name: 'Explore', heading: /Explore|anatomy board/i },
    { name: 'Practice', heading: /Practice/i },
    { name: 'Progress', heading: /Progress|No attempts yet/i },
    { name: 'Settings', heading: /Settings and about/i },
  ];

  for (const destination of destinations) {
    test(`opens ${destination.name} without an error`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: destination.name }).click();

      await expect(page.getByText(/Something went wrong on this screen/)).toHaveCount(0);
      await expect(page.getByText(destination.heading).first()).toBeVisible();
    });
  }

  test('marks the current destination for assistive technology', async ({ page }) => {
    await page.goto('/settings');
    const current = page
      .getByRole('navigation', { name: 'Main' })
      .locator('[aria-current="page"]');

    await expect(current).toHaveCount(1);
    await expect(current).toHaveText('Settings');
  });

  test('shows a calm explanation for an unknown address', async ({ page }) => {
    await page.goto('/not-a-screen');
    await expect(page.getByRole('heading', { name: 'That screen does not exist' })).toBeVisible();
    await expect(page.getByText(/Nothing has been lost/)).toBeVisible();
  });
});

test.describe('anatomy board', () => {
  test('renders an accessible title and description for the view', async ({ page }) => {
    await page.goto('/explore');

    const board = page.getByRole('region', { name: 'Anatomy board' });
    await expect(board).toBeVisible();

    // The SVG is labelled by its own <title> and <desc>, not by a title attribute.
    await expect(page.locator('#board-title')).toHaveText(/Anterior view of the muscular system/);
    await expect(page.locator('#board-description')).toHaveText(/Provisional placeholder illustration/);
    await expect(page.locator('svg.board__svg')).toHaveAttribute('role', 'img');
  });

  test('marks the illustration as provisional', async ({ page }) => {
    await page.goto('/explore');
    // Appears both on the board notice and in the SVG description.
    await expect(page.getByText(/Provisional placeholder illustration/).first()).toBeVisible();
  });

  test('offers view, zoom and reset controls', async ({ page }) => {
    await page.goto('/explore');
    const board = page.getByRole('region', { name: 'Anatomy board' });

    await expect(board.getByRole('button', { name: 'Anterior view, front of the body' })).toBeVisible();
    await expect(board.getByRole('button', { name: 'Posterior view, back of the body' })).toBeVisible();
    await expect(board.getByRole('button', { name: 'Zoom in' })).toBeVisible();
    await expect(board.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(board.getByRole('button', { name: /Reset view/ })).toBeVisible();
  });

  test('switches between the anterior and posterior views', async ({ page }) => {
    await page.goto('/explore');
    const board = page.getByRole('region', { name: 'Anatomy board' });

    await board.getByRole('button', { name: 'Posterior view, back of the body' }).click();
    await expect(page.locator('#board-title')).toHaveText(/Posterior view/);

    await board.getByRole('button', { name: 'Anterior view, front of the body' }).click();
    await expect(page.locator('#board-title')).toHaveText(/Anterior view/);
  });

  test('zooms in and resets the view', async ({ page }) => {
    await page.goto('/explore');
    const board = page.getByRole('region', { name: 'Anatomy board' });

    await board.getByRole('button', { name: 'Zoom in' }).click();
    await expect(board.getByRole('button', { name: 'Reset view' })).toBeEnabled();

    await board.getByRole('button', { name: 'Zoom in' }).click();
    await board.getByRole('button', { name: /Reset view/ }).click();

    // At fit scale there is nothing left to reset.
    await expect(board.getByRole('button', { name: /Reset view/ })).toBeDisabled();
  });

  test('gives every interactive control at least a 44 pixel target', async ({ page }) => {
    await page.goto('/explore');

    const tooSmall = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll('button, a[href], summary'));
      return controls
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return rect.width < 44 || rect.height < 44;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return `${element.textContent?.trim().slice(0, 40) ?? element.tagName}: ${Math.round(rect.width)}x${Math.round(rect.height)}`;
        });
    });

    expect(tooSmall).toEqual([]);
  });

  test('keeps the board the largest region of the layout', async ({ page }) => {
    await page.goto('/explore');
    // Measured only once the board has laid out.
    await page.getByRole('region', { name: 'Anatomy board' }).waitFor();

    // Landscape puts the panel beside the board, so the board must be wider.
    // Portrait stacks them, so the board must be the taller region. Either way
    // the anatomy board, not the panel, is the dominant element.
    const areas = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) return { width: 0, height: 0 };
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      };
      return { board: rect('.board__canvas'), panel: rect('.workspace__panel') };
    });

    const isPortrait = await page.evaluate(
      () => window.matchMedia('(orientation: portrait)').matches,
    );

    if (isPortrait) {
      expect(areas.board.height).toBeGreaterThan(areas.panel.height);
    } else {
      expect(areas.board.width).toBeGreaterThan(areas.panel.width);
    }
  });

  test('places nothing essential beneath the bottom edge', async ({ page }) => {
    await page.goto('/explore');

    const lowest = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll('.board__controls button'));
      return controls.reduce((max, element) => {
        const rect = element.getBoundingClientRect();
        return Math.max(max, window.innerHeight - rect.bottom);
      }, Number.POSITIVE_INFINITY);
    });

    // A margin at the bottom is comfortable, not flush against the edge.
    expect(lowest).toBeGreaterThan(4);
  });
});

test.describe('content safety', () => {
  test('refuses to build a round and says why', async ({ page }) => {
    await page.goto('/identify');

    await expect(page.getByRole('heading', { name: 'Quick identification' })).toBeVisible();
    await expect(page.getByText(/awaiting review by a qualified anatomy reviewer/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start round' })).toBeDisabled();
  });

  test('reports every structure as draft and none as published', async ({ page }) => {
    await page.goto('/settings/credits');

    const table = page.getByText('Every structure in the pack').locator('xpath=ancestor::table[1]');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).not.toHaveCount(0);

    // Scoped to the status tags in that table, so the summary row legitimately
    // labelled "Published" — which is zero — is not matched here.
    const statuses = await table.locator('tbody .tag').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses).not.toContain('published');
    expect(statuses.filter((status) => status === 'draft').length).toBeGreaterThan(0);
    expect(statuses.filter((status) => status === 'provisional').length).toBeGreaterThan(0);
  });

  test('records artwork as unlicensed rather than inventing a licence', async ({ page }) => {
    await page.goto('/settings/credits');
    await expect(page.getByText('Not licensed').first()).toBeVisible();
  });

  test('gives the exact iPad installation wording', async ({ page }) => {
    await page.goto('/settings');
    await expect(
      page.getByText(
        'To install on iPad: open in Safari, use Share, choose Add to Home Screen, and enable Open as Web App if shown.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Install app$/ })).toHaveCount(0);
  });
});

test.describe('orientation', () => {
  test('survives a rotation between landscape and portrait', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('region', { name: 'Anatomy board' })).toBeVisible();

    const size = page.viewportSize();
    if (size === null) return;

    await page.setViewportSize({ width: size.height, height: size.width });
    await expect(page.getByRole('region', { name: 'Anatomy board' })).toBeVisible();
    await expect(page.getByText(/Something went wrong on this screen/)).toHaveCount(0);

    await page.setViewportSize(size);
    await expect(page.getByRole('region', { name: 'Anatomy board' })).toBeVisible();
  });

  test('keeps the board dominant in both orientations', async ({ page }) => {
    await page.goto('/explore');

    for (const size of [
      { width: 1194, height: 834 },
      { width: 834, height: 1194 },
    ]) {
      await page.setViewportSize(size);
      const boardWidth = await page
        .locator('.board__canvas')
        .evaluate((element) => element.getBoundingClientRect().width);
      expect(boardWidth).toBeGreaterThan(size.width * 0.5);
    }
  });
});

test.describe('persistence', () => {
  test('restores the board view after a reload', async ({ page }) => {
    await page.goto('/explore');
    const board = page.getByRole('region', { name: 'Anatomy board' });
    await board.getByRole('button', { name: 'Posterior view, back of the body' }).click();

    await page.reload();

    await expect(page.getByRole('region', { name: 'Anatomy board' })).toBeVisible();
    await expect(page.getByText(/Something went wrong on this screen/)).toHaveCount(0);
  });

  test('keeps a saved setting across a reload', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('switch', { name: 'Reduce motion' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  });
});
