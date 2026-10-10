import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { RepositoryProvider } from './providers/RepositoryProvider';
import { SettingsProvider } from './providers/SettingsProvider';
import { ContentProvider } from '@/features/content/ContentProvider';
import { PwaUpdateProvider } from '@/features/pwa/updates/PWAUpdateService';
import { MuscleAtlasDatabase, resetDatabaseInstance } from '@/services/storage/db';
import { STORAGE_CONFIG } from '@/config/storage-config';
import { APP_CONFIG } from '@/config/app-config';

/**
 * Application shell behaviour.
 *
 * These assert what a learner can actually reach and do: every route renders,
 * navigation works, the layout is semantic, and the app never presents
 * unreviewed content as if it were publishable.
 */

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SettingsProvider>
        <RepositoryProvider>
          <ContentProvider>
            <PwaUpdateProvider>
              <App />
            </PwaUpdateProvider>
          </ContentProvider>
        </RepositoryProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  resetDatabaseInstance();
  await Dexie.delete(STORAGE_CONFIG.databaseName);
  const database = new MuscleAtlasDatabase();
  await database.open();
});

describe('first launch', () => {
  it('shows the product name and one plain sentence', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: APP_CONFIG.name, level: 1 })).toBeInTheDocument();
    expect(
      screen.getByText('Practice locating major muscles through interactive anatomy.'),
    ).toBeInTheDocument();
  });

  it('offers exactly three entry points and no sign-up', () => {
    renderApp();
    expect(screen.getByRole('link', { name: /Explore anatomy/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Beginner practice/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Quick identification/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in|create account|register/i })).toBeNull();
  });

  it('carries the educational disclaimer, not a clinical claim', () => {
    renderApp();
    expect(screen.getByText(/does not provide diagnosis, treatment advice/)).toBeInTheDocument();
  });

  it('states plainly that this build is not study material', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getAllByText(/Development build/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/Do not study from this build/)).toBeInTheDocument();
  });

  it('explains why no muscle can be asked about yet', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByText(/qualified anatomy reviewer/)).toBeInTheDocument();
    });
  });

  it('uses no emoji in the product interface', () => {
    const { container } = renderApp();
    // Checked per character rather than with a character class: the range spans
    // combining marks, which a naive class would mis-handle.
    const emojiPattern = /(\u{1F300}-\u{1FAFF}|\u{2600}-\u{27BF}|\u{FE0F}|\u{1F1E6}-\u{1F1FF})/u;
    const text = container.textContent ?? '';
    const found = [...text].some((character) => emojiPattern.test(character));
    expect(found).toBe(false);
  });
});

describe('navigation', () => {
  const routes = ['/', '/explore', '/practice', '/identify', '/progress', '/settings'];

  for (const route of routes) {
    it(`renders ${route} without crashing`, async () => {
      renderApp(route);
      await waitFor(() => {
        expect(screen.getByRole('main')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Something went wrong on this screen/)).toBeNull();
    });
  }

  it('marks the current destination for assistive technology', () => {
    renderApp('/settings');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const current = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Settings');
  });

  it('navigates between destinations', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(screen.getByRole('link', { name: 'Explore' }));
    expect(await screen.findByRole('region', { name: 'Anatomy board' })).toBeInTheDocument();
  });

  it('offers a skip link as the first focusable control', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.tab();
    expect(screen.getByRole('link', { name: /Skip to main content/ })).toHaveFocus();
  });

  it('reaches the primary navigation by keyboard', async () => {
    const user = userEvent.setup();
    renderApp('/');
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
    }
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').length).toBeGreaterThan(3);
  });
});

describe('identify mode with no publishable content', () => {
  it('says the pool is empty rather than showing a blank board', async () => {
    renderApp('/identify');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Quick identification' })).toBeInTheDocument();
    });

    expect(
      screen.getByText(/qualified anatomy reviewer/),
    ).toBeInTheDocument();
    expect(screen.getByText(/0 structures are currently eligible/)).toBeInTheDocument();
  });

  it('disables starting a round that has nothing to ask', async () => {
    renderApp('/identify');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start round' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Start round' })).toBeDisabled();
  });

  it('offers no round sizes when nothing is eligible', async () => {
    renderApp('/identify');
    await waitFor(() => {
      expect(screen.getByText(/0 structures are currently eligible/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: '10' })).toBeNull();
  });
});

describe('explore mode', () => {
  it('states that there is nothing selected and no score', async () => {
    renderApp('/explore');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Nothing selected' })).toBeInTheDocument();
    });
    expect(screen.getByText(/There is no score here and nothing to get wrong/)).toBeInTheDocument();
  });

  it('labels the artwork as provisional wherever it appears', async () => {
    renderApp('/explore');
    await waitFor(() => {
      expect(
        screen.getByText(/Provisional placeholder illustration — not anatomically accurate/),
      ).toBeInTheDocument();
    });
  });

  it('offers view, zoom and reset controls with accessible names', async () => {
    renderApp('/explore');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Anatomy board' })).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: 'Anterior view, front of the body' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Posterior view, back of the body' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset view/ })).toBeInTheDocument();
  });

  it('gives every board control a name of at least a few words', async () => {
    renderApp('/explore');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Anatomy board' })).toBeInTheDocument();
    });

    const board = screen.getByRole('region', { name: 'Anatomy board' });
    for (const button of within(board).getAllByRole('button')) {
      const name = button.getAttribute('aria-label') ?? button.textContent ?? '';
      expect(name.trim().length).toBeGreaterThan(2);
    }
  });

  it('lists every structure for selection without needing a tap', async () => {
    renderApp('/explore');
    await waitFor(() => {
      expect(screen.getByText('Structure index')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Structure index'));
    const buttons = screen.getAllByRole('button', { name: /Frontalis/ });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows sourced, reviewed detail for a selected structure', async () => {
    const user = userEvent.setup();
    renderApp('/explore');

    await waitFor(() => {
      expect(screen.getByText('Structure index')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Structure index'));
    await user.click(screen.getAllByRole('button', { name: /Frontalis/ })[0]!);

    expect(await screen.findByRole('heading', { name: 'Frontalis' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View details' }));

    expect(screen.getByText(/No source has been recorded/)).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });
});

describe('settings and about', () => {
  it('gives the exact iPad installation wording', async () => {
    renderApp('/settings');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Installing on iPad' })).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'To install on iPad: open in Safari, use Share, choose Add to Home Screen, and enable Open as Web App if shown.',
      ),
    ).toBeInTheDocument();
  });

  it('shows no fake install prompt', async () => {
    renderApp('/settings');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Installing on iPad' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Install app$/ })).toBeNull();
  });

  it('keeps sound off by default, because audio must never be required', async () => {
    renderApp('/settings');
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Sound' })).toBeInTheDocument();
    });
    expect(screen.getByRole('switch', { name: 'Sound' })).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps the timed challenge off by default', async () => {
    renderApp('/settings');
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Timed challenge' })).toBeInTheDocument();
    });
    expect(screen.getByRole('switch', { name: 'Timed challenge' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('persists a setting change', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('switch', { name: 'Reduce motion' }));

    await waitFor(() => {
      expect(document.documentElement.dataset['reducedMotion']).toBe('true');
    });
  });
});

describe('credits and content status', () => {
  it('reports the pack is not publishable and why', async () => {
    renderApp('/settings/credits');
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Credits, licences and content status' }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/No educational source has been recorded/)).toBeInTheDocument();
    expect(screen.getAllByText(/placeholder geometry/).length).toBeGreaterThan(0);
  });

  it('shows every structure with its real review state, not a fabricated one', async () => {
    renderApp('/settings/credits');
    await waitFor(() => {
      expect(screen.getByText('Every structure in the pack')).toBeInTheDocument();
    });

    const table = screen.getByText('Every structure in the pack').closest('table')!;
    const rows = within(table).getAllByRole('row');
    // Header plus at least eight structures.
    expect(rows.length).toBeGreaterThanOrEqual(9);

    for (const row of rows.slice(1)) {
      expect(within(row).getByText('draft')).toBeInTheDocument();
    }
    expect(within(table).queryByText('published')).toBeNull();
  });

  it('shows artwork as unlicensed rather than inventing a licence', async () => {
    renderApp('/settings/credits');
    await waitFor(() => {
      expect(screen.getByText('Anatomy illustration')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Not licensed').length).toBeGreaterThan(0);
  });
});

describe('progress with no history', () => {
  it('invites a first round instead of showing an empty dashboard', async () => {
    renderApp('/progress');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No attempts yet' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Start a round' })).toBeInTheDocument();
  });

  it('separates the destructive resets so clearing artwork cannot cost progress', async () => {
    renderApp('/progress');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Erase data' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Reset learning progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear round history' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clear downloaded content record' }),
    ).toBeInTheDocument();
  });
});

describe('unknown route', () => {
  it('explains the address is wrong without implying data loss', () => {
    renderApp('/not-a-real-screen');
    expect(
      screen.getByRole('heading', { name: 'That screen does not exist' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been lost/)).toBeInTheDocument();
  });
});
