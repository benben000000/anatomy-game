import { Link } from 'react-router-dom';
import { PageScroll } from '@/app/AppShell';
import { useContent } from '@/features/content/ContentProvider';
import { APP_CONFIG } from '@/config/app-config';

/**
 * Credits, licences and content status.
 *
 * Rendered from the asset manifest and the source list rather than hand-written,
 * so the credits can never drift from what is actually bundled. Where a licence
 * or a review is missing, this screen says so plainly instead of omitting it.
 */
export default function CreditsView() {
  const { repository, report, flags, contentCount } = useContent();

  const assets = repository.all.assets;
  const sources = repository.all.sources;
  const structures = repository.all.structures;

  return (
    <PageScroll>
      <div className="stack stack--loose" style={{ maxWidth: '52rem' }}>
        <div className="stack stack--tight">
          <h1>Credits, licences and content status</h1>
          <p className="prose">{APP_CONFIG.disclaimer}</p>
        </div>

        <section className="surface stack" aria-labelledby="status-heading">
          <h2 id="status-heading">Content pack status</h2>
          <p className="prose">
            This screen reports the real state of the content pack, including when it is not
            releasable. It is generated from the same validation report the build uses.
          </p>

          <table className="data-table">
            <caption>Content pack 1.0.0</caption>
            <tbody>
              <Row label="Structures" value={String(report.stats.structures)} />
              <Row label="Published" value={String(report.stats.published)} />
              <Row label="In review" value={String(report.stats.reviewed)} />
              <Row label="Draft" value={String(report.stats.draft)} />
              <Row label="Retired" value={String(report.stats.retired)} />
              <Row label="Visual mappings" value={String(report.stats.mappings)} />
              <Row label="Selectable mappings" value={String(report.stats.selectableMappings)} />
              <Row label="Approved sources" value={String(report.stats.sources)} />
              <Row label="Approved assets" value={String(report.stats.approvedAssets)} />
            </tbody>
          </table>

          {report.blockingReason !== null ? (
            <div className="notice notice--warning" role="status">
              <p>{report.blockingReason}</p>
            </div>
          ) : null}

          {flags.PROVISIONAL_ART ? (
            <div className="notice notice--warning" role="status">
              <p>
                <strong>The illustration in this build is placeholder geometry.</strong> It marks
                roughly where each muscle is expected to sit so the interaction model can be tested.
                It is not a medical illustration and must not be studied from.
              </p>
            </div>
          ) : null}

          {report.warnings.length > 0 ? (
            <details>
              <summary>Validation warnings ({report.warnings.length})</summary>
              <ul>
                {report.warnings.map((warning) => (
                  <li key={`${warning.rule}-${warning.path}`}>
                    <strong>{warning.rule}</strong> — {warning.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section className="surface stack" aria-labelledby="art-heading">
          <h2 id="art-heading">Anatomy illustration</h2>
          {assets.length === 0 ? (
            <p className="prose">No artwork is bundled in this build.</p>
          ) : (
            <table className="data-table">
              <caption>Artwork and licence</caption>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Creator</th>
                  <th scope="col">Licence</th>
                  <th scope="col">Review</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.asset_id}>
                    <td>{asset.file_path}</td>
                    <td>{asset.source_creator}</td>
                    <td>
                      {asset.license === 'UNSET' ? (
                        <strong>Not licensed</strong>
                      ) : (
                        asset.license
                      )}
                      {asset.attribution_requirement === null ? null : (
                        <>
                          <br />
                          <small>{asset.attribution_requirement}</small>
                        </>
                      )}
                    </td>
                    <td>
                      {asset.medical_review_status}
                      {asset.reviewer === null ? null : ` — ${asset.reviewer}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="prose" style={{ fontSize: '0.875rem' }}>
            Before any public release, a qualified illustrator must supply licensed vector artwork
            and a qualified anatomy reviewer must confirm that each layer depicts the structure it
            claims to. See <code>docs/04-asset-pipeline-and-licensing.md</code>.
          </p>
        </section>

        <section className="surface stack" aria-labelledby="sources-heading">
          <h2 id="sources-heading">Educational sources</h2>
          {sources.length === 0 ? (
            <div className="notice notice--warning" role="status">
              <p>
                No educational source has been recorded. Until a qualified anatomy reviewer signs
                off on at least one source, no structure can be published and no question can be
                asked. {contentCount} structures are loaded as development placeholders.
              </p>
            </div>
          ) : (
            <table className="data-table">
              <caption>Sources</caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Author or organisation</th>
                  <th scope="col">Reviewer</th>
                  <th scope="col">Review date</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.source_id}>
                    <td>{source.title}</td>
                    <td>{source.author_or_organization}</td>
                    <td>{source.reviewer_name ?? 'Not reviewed'}</td>
                    <td>{source.review_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="surface stack" aria-labelledby="structures-heading">
          <h2 id="structures-heading">Structures and their review state</h2>
          <table className="data-table">
            <caption>Every structure in the pack</caption>
            <thead>
              <tr>
                <th scope="col">Structure</th>
                <th scope="col">Identifier</th>
                <th scope="col">Content status</th>
                <th scope="col">Sources</th>
              </tr>
            </thead>
            <tbody>
              {structures.map((structure) => (
                <tr key={structure.structure_id}>
                  <td>{structure.canonical_name}</td>
                  <td>
                    <code>{structure.structure_id}</code>
                  </td>
                  <td>
                    <span className={`tag tag--${structure.content_status}`}>
                      {structure.content_status}
                    </span>{' '}
                    <span className="tag">{structure.medical_review_status}</span>
                  </td>
                  <td>{structure.source_references.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p>
          <Link to="/settings">Back to settings</Link>
        </p>
      </div>
    </PageScroll>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{value}</td>
    </tr>
  );
}
