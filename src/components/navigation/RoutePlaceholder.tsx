import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageScroll } from '@/app/AppShell';
import { useContent } from '@/features/content/ContentProvider';

interface Props {
  readonly title: string;
  readonly summary?: string;
  readonly children?: ReactNode;
}

/**
 * Honest placeholder for a route that is specified but not built yet.
 *
 * Used only where a route is genuinely pending. Every MVP route has a real
 * implementation; this exists so navigation is never a dead end, and it says
 * which phase delivers it rather than pretending the feature exists.
 */
export function RoutePlaceholder({ title, summary, children }: Props) {
  return (
    <PageScroll>
      <div className="stack" style={{ maxWidth: '42rem' }}>
        <h1>{title}</h1>
        <p className="prose">
          {summary ?? 'This screen is part of the planned structure for Muscle Atlas.'}
        </p>
        <p className="prose">
          It is not built yet. Nothing here is a mock-up of a finished feature, and no placeholder
          data is presented as real content.
        </p>
        {children}
        <p>
          <Link to="/">Return to the start</Link>
        </p>
      </div>
    </PageScroll>
  );
}

export function DeveloperView() {
  return (
    <PageScroll>
      <div className="stack" style={{ maxWidth: '56rem' }}>
        <h1>Developer tools</h1>
        <p className="prose">
          These are development aids. They are removed from release bundles by the
          <code> ENABLE_DEBUG_TOOLS </code> build flag.
        </p>

        <ContentValidationPanel />

        <section className="surface stack">
          <h2>Board debug overlay</h2>
          <p className="prose">
            On the Explore board, the toolbar exposes four overlay modes: off, hit regions,
            structure and visual identifiers, and eligible question targets. Hit regions is the
            one worth using when a muscle cannot be selected reliably — it draws every forgiving
            stroke so overlaps become visible.
          </p>
        </section>

        <section className="surface stack">
          <h2>Inspecting storage</h2>
          <p className="prose">
            Storage can be inspected read-only from the Progress screen's reset section, which
            reports whether local storage is available in the current browsing mode. Individual
            records are deliberately not dumped into the interface: they are validated on read
            and corrupt records are discarded with a message.
          </p>
        </section>

        <p>
          <Link to="/settings">Back to settings</Link>
        </p>
      </div>
    </PageScroll>
  );
}

function ContentValidationPanel() {
  const { report, contentCount } = useContent();

  return (
    <section className="surface stack">
      <h2>Content validation</h2>
      <p className="prose">
        {report.ok
          ? 'The content pack passes validation.'
          : `The content pack has ${report.errors.length} validation error(s).`}
      </p>

      <table className="data-table">
        <caption>Pack summary — {contentCount} structures loaded</caption>
        <tbody>
          <tr>
            <th scope="row">Published</th>
            <td>{report.stats.published}</td>
          </tr>
          <tr>
            <th scope="row">In review</th>
            <td>{report.stats.reviewed}</td>
          </tr>
          <tr>
            <th scope="row">Draft</th>
            <td>{report.stats.draft}</td>
          </tr>
          <tr>
            <th scope="row">Retired</th>
            <td>{report.stats.retired}</td>
          </tr>
          <tr>
            <th scope="row">Visual mappings</th>
            <td>{report.stats.mappings}</td>
          </tr>
          <tr>
            <th scope="row">Selectable mappings</th>
            <td>{report.stats.selectableMappings}</td>
          </tr>
          <tr>
            <th scope="row">Approved sources</th>
            <td>{report.stats.sources}</td>
          </tr>
          <tr>
            <th scope="row">Approved assets</th>
            <td>{report.stats.approvedAssets}</td>
          </tr>
        </tbody>
      </table>

      {report.blockingReason === null ? null : (
        <p className="notice notice--warning">{report.blockingReason}</p>
      )}

      {report.errors.length === 0 ? null : (
        <details className="deferred-render">
          <summary>Validation errors ({report.errors.length})</summary>
          <ul className="debug-log">
            {report.errors.map((error) => (
              <li key={`${error.rule}-${error.path}`}>
                <strong>{error.rule}</strong> {error.path} — {error.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function NotFoundView() {
  return (
    <PageScroll>
      <div className="stack" style={{ maxWidth: '42rem' }}>
        <h1>That screen does not exist</h1>
        <p className="prose">
          The address you followed is not part of Muscle Atlas. Nothing has been lost.
        </p>
        <p>
          <Link to="/">Return to the start</Link>
        </p>
      </div>
    </PageScroll>
  );
}