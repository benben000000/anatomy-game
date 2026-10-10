import { useMemo, useState } from 'react';
import attribution from '@/data/manifests/open3dmodel-attribution.json';
import { Icon } from '@/components/shared/Icon';

/**
 * Model attribution panel.
 *
 * ## Why this renders from data rather than prose
 *
 * CC BY-SA 4.0 section 3(a) requires attribution to accompany the work. A
 * paragraph naming "the Open3Dmodel team" would be a summary, and for a model
 * with this provenance a summary is not a reasonable identification of the
 * authors. So the full roster is rendered from a data file captured verbatim
 * from the project's own credit page, and that file is the single place where
 * the roster is edited.
 *
 * It is deliberately long, collapsed by default, and clearly labelled. Nobody
 * should have to read thirty names to use the app; nobody should be able to use
 * it without being able to reach the names.
 */

interface Contributor {
  readonly name: string;
  readonly role?: string;
  readonly institution?: string;
  readonly area?: string;
  readonly note?: string;
}

type ContributorGroup = {
  readonly [group: string]: Contributor[] | string | undefined;
};

const CREDITS = attribution as unknown as {
  readonly project: string;
  readonly platform: string;
  readonly supported_by: string;
  readonly source_page: string;
  readonly captured_at: string;
  readonly contributors: ContributorGroup;
  readonly provenance_chain_attribution: {
    readonly generations: readonly {
      readonly name: string;
      readonly licence?: string;
      readonly reference: string;
      readonly url?: string;
    }[];
  };
  readonly anatomical_references_cited_by_the_project: readonly string[];
  readonly medical_caveats_from_the_source_project: readonly string[];
  readonly display_requirements: {
    readonly must_show_in_app: boolean;
    readonly must_not: readonly string[];
  };
};

const GROUP_LABELS: Readonly<Record<string, string>> = {
  project_lead: 'Project lead',
  project_support: 'Project support',
  core_team: 'Core team',
  anatomists: 'Anatomists',
  clinicians: 'Clinicians',
  modellers: 'Modellers',
  contributing_modellers: 'Contributing modellers',
  web_viewer_programming: 'Viewer and programming',
  further_contributors: 'Further contributors',
};

const GROUP_ORDER = [
  'project_lead',
  'project_support',
  'core_team',
  'anatomists',
  'clinicians',
  'modellers',
  'contributing_modellers',
  'web_viewer_programming',
  'further_contributors',
];

export function ModelAttributionPanel() {
  const [expanded, setExpanded] = useState(false);

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((key) => ({
        key,
        label: GROUP_LABELS[key] ?? key,
        contributors: (CREDITS.contributors as Record<string, Contributor[]>)[key] ?? [],
      })).filter((group) => group.contributors.length > 0),
    [],
  );

  const totalContributors = groups.reduce(
    (sum, group) => sum + group.contributors.length,
    0,
  );

  return (
    <section className="surface stack" aria-labelledby="attribution-heading" data-testid="model-attribution">
      <div className="stack stack--tight">
        <p className="section-title">Third-party model</p>
        <h2 id="attribution-heading">{CREDITS.project}</h2>
        <p className="prose">
          Made available by the <a href="https://anatomytool.org/open3dmodel">Open3Dmodel project</a>{' '}
          through <a href="https://anatomytool.org">{CREDITS.platform}</a>, with support from the{' '}
          {CREDITS.supported_by}.
        </p>
      </div>

      <div className="notice notice--info">
        <div>
          <p>
            <strong>Licence: Creative Commons Attribution-ShareAlike 4.0 International.</strong>{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/">Read the licence</a>.
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            Muscle Atlas modifies and optimises this model for browser delivery. Under the
            ShareAlike condition, the modified model is distributed under CC BY-SA 4.0.
          </p>
        </div>
      </div>

      <p className="muted" style={{ fontSize: '0.875rem' }}>
        Contributor list captured from the project's credit page on {CREDITS.captured_at}.
      </p>

      <button
        type="button"
        className="btn btn--secondary btn--block"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <Icon name={expanded ? 'close' : 'info'} size={18} />
        <span>
          {expanded ? 'Hide' : 'Show'} the {totalContributors}-person contributor list
        </span>
      </button>

      {expanded ? (
        <div className="stack stack--tight">
          {groups.map((group) => (
            <div key={group.key} className="stack stack--tight">
              <h3 className="section-title">{group.label}</h3>
              <ul style={{ fontSize: '0.875rem' }}>
                {group.contributors.map((contributor) => (
                  <li key={`${group.key}-${contributor.name}-${contributor.role ?? ''}`}>
                    {contributor.name}
                    {contributor.role ? `, ${contributor.role}` : ''}
                    {contributor.area ? ` (${contributor.area})` : ''}
                    {contributor.institution ? ` — ${contributor.institution}` : ''}
                    {contributor.note ? ` [${contributor.note}]` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="stack stack--tight">
            <h3 className="section-title">Built on earlier work</h3>
            <ul style={{ fontSize: '0.875rem' }}>
              {CREDITS.provenance_chain_attribution.generations.map((generation) => (
                <li key={generation.name}>
                  {generation.name}
                  {generation.licence ? `, ${generation.licence}` : ''} — {generation.reference}
                  {generation.url ? (
                    <>
                      {' '}
                      <a href={generation.url}>{generation.url}</a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="stack stack--tight">
            <h3 className="section-title">What the source project says about accuracy</h3>
            <ul style={{ fontSize: '0.875rem' }}>
              {CREDITS.medical_caveats_from_the_source_project.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
            <p className="prose" style={{ fontSize: '0.875rem' }}>
              Muscle Atlas does not endorse or certify this model. Its anatomical review is the
              responsibility of the Open3Dmodel project.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}