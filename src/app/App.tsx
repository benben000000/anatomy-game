import { AppShell } from './AppShell';
import { AppRoutes } from './routes';

/**
 * Application root.
 *
 * Providers are mounted in `main.tsx`; this component owns the three-zone shell
 * and the route outlet, and nothing else.
 */
export function App() {
  return (
    <AppShell>
      <AppRoutes />
    </AppShell>
  );
}
