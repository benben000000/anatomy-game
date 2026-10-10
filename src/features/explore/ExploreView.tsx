import { useCallback, useMemo, useState } from 'react';
import { useContent } from '@/features/content/ContentProvider';
import { AnatomyBoard, type ViewId } from '@/components/anatomy/AnatomyBoard';
import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import { IconButton } from '@/components/shared/Button';
import type {
  AnatomyBoardEvent,
  CandidateHit,
  StructureVisualState,
} from '@/features/anatomy-board/contracts/anatomy-board-adapter';
import { APP_FLAGS } from '@/features/content/ContentProvider';

/**
 * Explore mode.
 *
 * Pressure-free orientation. No score, no timer, no failure state, and no
 * question. Tap anything to see where it is and what it does.
 *
 * The information panel is deliberately concise, and detailed fields are behind
 * an explicit expansion so a learner is never buried in text they did not ask
 * for.
 */
export default function ExploreView() {
  const { repository, flags, systemId, loadError } = useContent();
  const [view, setView] = useState<ViewId>('anterior');
  const [selected, setSelected] = useState<string | null>(null);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const structures = useMemo(
    () =>
      loadError === null ? repository.previewStructures(systemId, flags) : [],
    [flags, loadError, repository, systemId],
  );

  const mappingLookup = useCallback(
    (structureId: string, boardView: ViewId): CandidateHit | null => {
      const mapping = repository
        .selectableMappingsForStructure(structureId)
        .find((candidate) => candidate.view_id === boardView);
      if (mapping === undefined) return null;
      return {
        visualId: mapping.visual_id,
        structureId: mapping.structure_id,
        selectionPriority: mapping.selection_priority,
        requiresDisambiguation: mapping.requires_disambiguation,
      };
    },
    [repository],
  );

  const candidates = useMemo(() => {
    const result: CandidateHit[] = [];
    const seen = new Set<string>();
    for (const structure of structures) {
      if (seen.has(structure.structure_id)) continue;
      const hit = mappingLookup(structure.structure_id, view);
      if (hit === null) continue;
      seen.add(structure.structure_id);
      result.push(hit);
    }
    return result;
  }, [mappingLookup, structures, view]);

  const visualStates = useMemo<ReadonlyMap<string, StructureVisualState>>(
    () => (selected === null ? new Map() : new Map([[selected, 'selected' as StructureVisualState]])),
    [selected],
  );

  const onEvent = useCallback((event: AnatomyBoardEvent) => {
    if (event.type === 'structure-selected') setSelected(event.structureId);
  }, []);

  const structure = selected === null ? null : repository.structure(selected);
  const regions = selected === null ? [] : repository.regionsForStructure(selected);
  const sources =
    selected === null
      ? []
      : (repository.structure(selected)?.source_references ?? [])
          .map((sourceId) => repository.source(sourceId))
          .filter((source) => source !== null);

  return (
    <main className="workspace" id="main-content">
      <div className="workspace__board">
        <AnatomyBoard
          view={view}
          onViewChange={setView}
          candidates={candidates}
          visualStates={visualStates}
          interactionEnabled
          labelsVisible={labelsVisible}
          onEvent={onEvent}
          showDebugTools={APP_FLAGS.ENABLE_DEBUG_TOOLS}
          prompt={
            <div className="prompt-bar">
              <span className="prompt-bar__label">Explore</span>
              <strong className="prompt-bar__target">
                {structure === null ? 'Tap any muscle to learn about it' : structure.canonical_name}
              </strong>
            </div>
          }
          boardControls={
            <div className="board__controls-group" role="group" aria-label="Display">
              <IconButton
                label={labelsVisible ? 'Hide region labels' : 'Show region labels'}
                pressed={labelsVisible}
                onClick={() => setLabelsVisible((value) => !value)}
              >
                <Icon name="eye" />
              </IconButton>
            </div>
          }
        />
      </div>

      <aside className="workspace__panel" aria-label="Structure information">
        {structure === null ? (
          <div className="stack">
            <div>
              <h2 className="section-title">Nothing selected</h2>
              <p className="prose">
                Tap a muscle on the board to see where it is and what it does. There is no score
                here and nothing to get wrong.
              </p>
            </div>
            <ExploreIndex structures={structures.map((item) => item.structure_id)} onSelect={setSelected} />
          </div>
        ) : (
          <div className="stack">
            <div>
              <h2>{structure.canonical_name}</h2>
              {structure.latin_name === null ? null : (
                <p className="muted" style={{ fontSize: '0.875rem' }}>
                  {structure.latin_name}
                </p>
              )}
              <p style={{ marginTop: '0.5rem' }}>
                <span className={`tag tag--${structure.content_status}`}>
                  {structure.content_status}
                </span>{' '}
                <span className="tag">{structure.structure_type.replace('_', ' ')}</span>{' '}
                <span className="tag">{structure.laterality}</span>
              </p>
            </div>

            <div>
              <h3 className="section-title">Where it is</h3>
              <p className="prose">{structure.summary}</p>
            </div>

            <div>
              <h3 className="section-title">What it does</h3>
              <p className="prose">{structure.function_summary}</p>
            </div>

            <div>
              <h3 className="section-title">Region</h3>
              <p className="prose">{regions.map((region) => region.display_name).join(' · ')}</p>
            </div>

            {showDetails ? (
              <div className="stack stack--tight">
                <h3 className="section-title">More detail</h3>
                <dl className="detail-list">
                  <DetailRow term="Origin" value={structure.origin_summary} />
                  <DetailRow term="Insertion" value={structure.insertion_summary} />
                  <DetailRow term="Innervation" value={structure.innervation_summary} />
                </dl>

                <h3 className="section-title">Sources</h3>
                {sources.length === 0 ? (
                  <p className="prose" style={{ fontSize: '0.875rem' }}>
                    No source has been recorded for this structure yet, so it cannot be published.
                  </p>
                ) : (
                  <ul style={{ fontSize: '0.875rem' }}>
                    {sources.map((source) => (
                      <li key={source.source_id}>
                        {source.title}
                        {source.reviewer_name === null ? null : (
                          <> — reviewed by {source.reviewer_name}</>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div className="panel-actions">
              <Button variant="secondary" block onClick={() => setShowDetails((value) => !value)}>
                {showDetails ? 'Show less' : 'View details'}
              </Button>
              <Button
                variant="primary"
                block
                onClick={() => {
                  window.location.assign(`/identify?focus=${encodeURIComponent(structure.structure_id)}`);
                }}
              >
                <Icon name="hint" size={18} />
                <span>Practice this muscle</span>
              </Button>
            </div>
          </div>
        )}
      </aside>
    </main>
  );
}

function DetailRow({ term, value }: { readonly term: string; readonly value: string | null }) {
  return (
    <div className="detail-list__row">
      <dt className="detail-list__term">{term}</dt>
      <dd>{value ?? 'Not recorded'}</dd>
    </div>
  );
}

/** Keyboard- and screen-reader-reachable index of everything on the board. */
function ExploreIndex({
  structures,
  onSelect,
}: {
  readonly structures: readonly string[];
  readonly onSelect: (structureId: string) => void;
}) {
  const { repository } = useContent();

  return (
    <details className="surface deferred-render">
      <summary>
        <strong>Structure index</strong>{' '}
        <span className="muted">({structures.length})</span>
      </summary>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.75rem' }}>
        {structures.map((structureId) => {
          const structure = repository.structure(structureId);
          if (structure === null) return null;
          return (
            <li key={structureId}>
              <button
                type="button"
                className="disambiguation__option"
                style={{ width: '100%' }}
                onClick={() => onSelect(structureId)}
              >
                <span className="disambiguation__option-name">{structure.canonical_name}</span>
                <span className="disambiguation__option-region">
                  {repository
                    .regionsForStructure(structureId)
                    .map((region) => region.display_name)
                    .join(' · ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
