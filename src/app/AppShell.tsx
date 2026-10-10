import type { ReactNode } from 'react';
import { AppBar } from '@/components/navigation/AppBar';

interface WorkspaceProps {
  readonly children: ReactNode;
}

/**
 * Three-zone layout.
 *
 * Landscape: compact app bar, anatomy workspace taking the largest area, and a
 * contextual panel on the side. The panel is capped so the body never shrinks
 * below usefulness, and there is no permanent oversized sidebar.
 *
 * Portrait: the panel becomes a controlled bottom sheet (Phase 5) and the board
 * keeps the middle of the screen.
 *
 * Safe areas come from `env()` tokens and the app height from `--app-height`,
 * which prefers `dvh` and falls back to `svh` then `vh`. Nothing assumes a fixed
 * viewport height, so Safari browser chrome expanding and collapsing does not
 * move or clip the controls.
 */
export function AppShell({ children }: WorkspaceProps) {
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <AppBar />
      {children}
    </div>
  );
}

/** Standard page frame for routes that are not board-based. */
export function PageScroll({ children }: WorkspaceProps) {
  return (
    <main className="home" id="main-content">
      <div className="home__inner">{children}</div>
    </main>
  );
}
