import { Link } from 'react-router-dom';
import { PageScroll } from '@/app/AppShell';
import { APP_CONFIG } from '@/config/app-config';
import { resolveBuildFlags } from '@/config/build-flags';
import { ContentStatusGate } from '@/components/navigation/ContentStatusGate';

const FLAGS = resolveBuildFlags(import.meta.env);

/**
 * First launch.
 *
 * Three entry points and nothing else. No account, no onboarding carousel, no
 * data requests, no permission prompts, no network gate.
 */
export function HomeView() {
  const previewMode = FLAGS.ALLOW_DRAFT_CONTENT;

  return (
    <PageScroll>
      <div className="home__intro stack">
        <h1>{APP_CONFIG.name}</h1>
        <p className="home__lead">
          Practice locating major muscles through interactive anatomy.
        </p>
        <ContentStatusGate />
      </div>

      <section aria-labelledby="entry-points-heading">
        <h2 className="section-title" id="entry-points-heading">
          Choose how to study
        </h2>
        <div className="entry-grid">
          <Link className="entry" to="/explore">
            <span className="entry__title">Explore anatomy</span>
            <span className="entry__description">
              Tap any muscle to see where it is and what it does. No score, no pressure.
            </span>
          </Link>

          <Link className="entry" to="/practice">
            <span className="entry__title">Beginner practice</span>
            <span className="entry__description">
              Learn a small group of muscles with labels on, then find them again with the
              labels hidden.
            </span>
          </Link>

          <Link className="entry" to="/identify">
            <span className="entry__title">Quick identification</span>
            <span className="entry__description">
              Straight to a round of locate-the-muscle questions. Hints are always free.
            </span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="why-heading">
        <h2 className="section-title" id="why-heading">
          What this app is
        </h2>
        <p className="prose">{APP_CONFIG.disclaimer}</p>
      </section>

      <p className="muted" style={{ fontSize: '0.875rem' }}>
        {previewMode
          ? 'Development build: unreviewed draft content and placeholder illustration are shown so the interaction model can be tested. This must not be published.'
          : 'Content pack loaded.'}{' '}
        <Link to="/settings/credits">Credits, licences and content status</Link>
      </p>
    </PageScroll>
  );
}
