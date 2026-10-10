import { useState } from 'react';
import { useContent } from '@/features/content/ContentProvider';
import { REGION_DESCRIPTIONS } from '@/features/anatomy-board/board-2d-svg/region-descriptions.data';
import type { CandidateHit } from '@/features/anatomy-board/contracts/anatomy-board-adapter';
import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import { FocusTrap } from '@/components/shared/FocusTrap';

/**
 * Nearby-target disambiguation.
 *
 * Reached when several structures legitimately sit under one tap. The chooser
 * lists candidates rather than silently choosing one, because guessing here is
 * how a learner ends up being told they identified the wrong muscle.
 *
 * In blind quiz mode the entries describe *where* each candidate is and never
 * name it — naming them would give the answer away. Explore mode shows names,
 * because there is nothing to hide.
 */
export function DisambiguationChooser({
  candidates,
  blind,
  onSelect,
  onCancel,
}: {
  readonly candidates: readonly CandidateHit[];
  /** True in a quiz: describe positions, do not name structures. */
  readonly blind: boolean;
  readonly onSelect: (candidate: CandidateHit) => void;
  readonly onCancel: () => void;
}) {
  const { repository } = useContent();
  const [announce] = useState('');

  return (
    <div className="disambiguation" data-testid="disambiguation">
      <button
        type="button"
        className="disambiguation__backdrop"
        aria-label="Cancel selection"
        onClick={onCancel}
      />
      <FocusTrap active onEscape={onCancel}>
        <div className="disambiguation__panel">
          <h2 id="disambiguation-heading">
            {blind ? 'Which one did you mean?' : 'Which muscle is that?'}
          </h2>
          <p className="muted" style={{ fontSize: '0.875rem' }}>
            {blind
              ? 'These muscles sit close together. Choose the one you tapped.'
              : 'Choose the muscle you tapped.'}
          </p>

          <div className="disambiguation__list" role="listbox" aria-labelledby="disambiguation-heading">
            {candidates.map((candidate, index) => {
              const structure = repository.structure(candidate.structureId);
              const regions = structure === null ? [] : repository.regionsForStructure(candidate.structureId);
              const label = blind
                ? (REGION_DESCRIPTIONS[candidate.structureId] ??
                  regions.map((region) => region.display_name).join(', ') ??
                  'Unlabelled region')
                : (structure?.canonical_name ?? candidate.structureId);

              return (
                <button
                  key={`${candidate.visualId}:${candidate.structureId}`}
                  type="button"
                  className="disambiguation__option"
                  role="option"
                  aria-selected={false}
                  {...(index === 0 ? { 'data-autofocus': true } : {})}
                  onClick={() => onSelect(candidate)}
                >
                  <span className="disambiguation__option-name">{label}</span>
                  {blind && structure !== null ? null : (
                    <span className="disambiguation__option-region">
                      {regions.map((region) => region.display_name).join(' · ')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <Button variant="secondary" block onClick={onCancel}>
            <Icon name="close" size={18} />
            <span>Cancel</span>
          </Button>
          <p className="visually-hidden" role="status">
            {announce}
          </p>
        </div>
      </FocusTrap>
    </div>
  );
}

/**
 * Accessible structure list.
 *
 * Every learning action is reachable here without spatial targeting. This is a
 * functional requirement, not an accessibility afterthought: it is what makes a
 * small or overlapping muscle fair to answer with, and it is how the product
 * stays usable with a keyboard, a switch, or a screen reader.
 */
export function StructureList({
  structureIds,
  selectedStructureId,
  onSelect,
  disabled,
  title,
}: {
  readonly structureIds: readonly string[];
  readonly selectedStructureId: string | null;
  readonly onSelect: (structureId: string) => void;
  readonly disabled: boolean;
  readonly title: string;
}) {
  const { repository } = useContent();

  return (
    <details className="surface deferred-render">
      <summary>
        <strong>{title}</strong>{' '}
        <span className="muted">({structureIds.length} selectable without tapping the board)</span>
      </summary>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.75rem' }}>
        {structureIds.map((structureId) => {
          const structure = repository.structure(structureId);
          if (structure === null) return null;
          const regions = repository.regionsForStructure(structureId);
          return (
            <li key={structureId}>
              <button
                type="button"
                className="disambiguation__option"
                style={{ width: '100%' }}
                aria-pressed={selectedStructureId === structureId}
                disabled={disabled}
                onClick={() => onSelect(structureId)}
              >
                <span className="disambiguation__option-name">{structure.canonical_name}</span>
                <span className="disambiguation__option-region">
                  {regions.map((region) => region.display_name).join(' · ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
