import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { HomeView } from '@/components/navigation/HomeView';
import { DeveloperView, NotFoundView } from '@/components/navigation/RoutePlaceholder';
import { ErrorBoundary } from '@/app/ErrorBoundary';

/**
 * Routes.
 *
 * The first route is deliberately small. Secondary views — progress, settings,
 * credits — are code-split so the initial transfer stays inside the performance
 * budget documented in docs/01-architecture.md.
 */
const ExploreView = lazy(() => import('@/features/explore/ExploreView'));
const IdentifyView = lazy(() => import('@/features/quiz/IdentifyView'));
const PracticeView = lazy(() => import('@/features/learning-modes/PracticeView'));
const ProgressView = lazy(() => import('@/components/progress/ProgressView'));
const SettingsView = lazy(() => import('@/components/settings/SettingsView'));
const CreditsView = lazy(() => import('@/components/settings/CreditsView'));
const ThreeDExploreView = lazy(() => import('@/features/three-d/ThreeDExploreView'));

function RouteFallback() {
  return (
    <div className="board__placeholder" role="status" aria-live="polite">
      <p>Loading this section…</p>
    </div>
  );
}

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/explore" element={<ExploreView />} />
          <Route path="/explore/3d" element={<ThreeDExploreView />} />
          <Route path="/practice" element={<PracticeView />} />
          <Route path="/identify" element={<IdentifyView />} />
          <Route path="/progress" element={<ProgressView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/settings/credits" element={<CreditsView />} />
          <Route path="/settings/developer" element={<DeveloperView />} />
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
