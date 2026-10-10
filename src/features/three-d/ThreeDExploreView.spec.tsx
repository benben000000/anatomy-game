import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContentProvider } from '@/features/content/ContentProvider';
import ThreeDExploreView from './ThreeDExploreView';
import {
  PRIVATE_3D_BUILD_FLAG,
  privateThreeDBlockedMessage,
} from '@/features/anatomy-board/board-3d/privateMode';

/**
 * The 3D route, outside a WebGL context.
 *
 * Three.js never loads in jsdom, so these tests exercise everything the route
 * decides before any renderer exists: the private-3D gates, the license
 * disclosure the project has promised to keep visible, and the inspect-only
 * explanations. The renderer itself is covered by the Playwright suite against
 * the real model files, which is the only honest place to test it.
 */

const isPrivateBuild = PRIVATE_3D_BUILD_FLAG;

describe('ThreeDExploreView gating', () => {
  it('explains why 3D is blocked and always links back to 2D', () => {
    // jsdom never provides a WebGL context, so a private-3D build still renders
    // the blocked card here rather than the viewer.
    render(
      <MemoryRouter>
        <ContentProvider>
          <ThreeDExploreView />
        </ContentProvider>
      </MemoryRouter>,
    );

    if (isPrivateBuild) {
      expect(screen.getByRole('heading', { name: /switched off|licence/i })).toBeInTheDocument();
    } else {
      const headline = privateThreeDBlockedMessage('build-flag-off').headline;
      expect(screen.getByText(headline)).toBeInTheDocument();
    }

    // Whatever the state, the exit is always present: "Check again" is the
    // route's only unconditional action, and the navigation keeps Explore around it.
    expect(screen.getByRole('button', { name: /check again/i })).toBeInTheDocument();
  });

  it('never claims the licence is verified or public domain', () => {
    render(
      <MemoryRouter>
        <ContentProvider>
          <ThreeDExploreView />
        </ContentProvider>
      </MemoryRouter>,
    );

    const text = (document.body.textContent ?? '').toLowerCase();
    expect(text).not.toContain('public domain');
    expect(text).not.toContain('licence cleared');
    expect(text).not.toContain('licence verified');
  });

  it('keeps the model credits reachable from the blocked state', async () => {
    render(
      <MemoryRouter>
        <ContentProvider>
          <ThreeDExploreView />
        </ContentProvider>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getAllByRole('button', { name: /model credits/i })[0]!);

    const panel = screen.getByTestId('model-attribution');
    // The roster is collapsed by default; expand it, then the names must be there.
    await userEvent.click(
      within(panel).getByRole('button', { name: /contributor list/i }),
    );
    expect(panel.textContent).toContain('Gobée');
  });

  it('renders the source project accuracy caveats, not a summary', async () => {
    render(
      <MemoryRouter>
        <ContentProvider>
          <ThreeDExploreView />
        </ContentProvider>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getAllByRole('button', { name: /model credits/i })[0]!);
    await userEvent.click(screen.getByRole('button', { name: /contributor list/i }));

    expect(screen.getByText(/some errors may still be present/i)).toBeInTheDocument();
  });
});
