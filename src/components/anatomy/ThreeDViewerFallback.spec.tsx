import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThreeDViewerFallback } from './ThreeDViewerFallback';
import { unavailableMessage } from '@/features/anatomy-board/board-3d/MeshStructureMapper';

/**
 * The 3D fallback, outside a WebGL context.
 *
 * Every situation in which 3D cannot run must present a way back to 2D, never
 * look like an error the learner caused, and distinguish "you can fix this"
 * from "you cannot". These are the exact behaviours the fallback was written
 * for, and jsdom can verify all of them without a renderer.
 */

function withRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('ThreeDViewerFallback', () => {
  it('offers a way back to 2D in every blocked state', () => {
    for (const reason of [
      'no-cached-pack',
      'pack-licence-blocked',
      'no-webgl',
      'reduced-data-saver',
      'insufficient-performance',
    ] as const) {
      withRouter(
        <ThreeDViewerFallback reason={reason} onClose={() => undefined} />,
      );

      expect(
        screen.getAllByRole('link', { name: /continue in the 2d anatomy view/i }).length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: /close 3d/i })).toBeInTheDocument();

      const headline = unavailableMessage(reason).headline;
      expect(screen.getByText(headline)).toBeInTheDocument();

      cleanup();
    }
  });

  it('does not suggest fixing the connection when the licence is the blocker', () => {
    withRouter(
      <ThreeDViewerFallback reason="pack-licence-blocked" onClose={() => undefined} />,
    );

    const detail = unavailableMessage('pack-licence-blocked').detail;
    expect(screen.getByText(/licensing decision/i)).toBeInTheDocument();
    expect(detail).toMatch(/not a problem with your device or connection/i);
  });

  it('shows the download action only when a downloadable pack exists and is not in progress', () => {
    const onDownload = vi.fn();
    const pack = {
      packId: 'open3dmodel.upper_limb.v1',
      version: '1.0.0',
      displayName: 'Upper limb',
      assetPath: '/private-models/upper-limb-muscles.glb',
      sizeBytes: 90_080,
      requiresDraco: true,
    };

    const { rerender } = withRouter(
      <ThreeDViewerFallback
        reason="no-cached-pack"
        onClose={() => undefined}
        pack={pack}
        onDownload={onDownload}
      />,
    );

    expect(screen.getByRole('button', { name: /download for offline use/i })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ThreeDViewerFallback
          reason="no-cached-pack"
          onClose={() => undefined}
          pack={pack}
          onDownload={onDownload}
          downloadState="downloading"
        />
      </MemoryRouter>,
    );

    // While downloading, the button disappears and progress is stated.
    expect(screen.queryByRole('button', { name: /download for offline use/i })).toBeNull();
    expect(screen.getByText(/downloading the model/i)).toBeInTheDocument();
  });

  it('never looks like an error the learner caused', () => {
    withRouter(<ThreeDViewerFallback reason="no-webgl" onClose={() => undefined} />);

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\berror\b|failed|broken/i);
  });

  it('wires the close action through', async () => {
    const onClose = vi.fn();
    withRouter(<ThreeDViewerFallback reason="no-webgl" onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: /close 3d/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
