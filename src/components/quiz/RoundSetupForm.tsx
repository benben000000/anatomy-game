import { LEARNING_CONFIG } from '@/config/learning-config';
import { Button } from '@/components/shared/Button';
import { Icon } from '@/components/shared/Icon';
import type { QuizMode, ViewFilter } from '@/domain/learning/learning';

export interface RoundConfigShape {
  readonly mode: QuizMode;
  readonly view_filter: ViewFilter;
  readonly region_ids: readonly string[];
  readonly difficulty_tiers: readonly string[];
  readonly target_size: number;
  readonly focus_structure_ids: readonly string[];
  readonly time_limit_seconds: number | null;
}

export interface RoundSetupFormProps {
  readonly title: string;
  readonly description: string;
  readonly config: RoundConfigShape;
  readonly onConfigChange: (config: RoundConfigShape) => void;
  readonly eligibleCount: number;
  readonly canStart: boolean;
  readonly onStart: () => void;
  readonly emptyReason: string | null;
  readonly regions?: readonly { readonly id: string; readonly name: string }[];
}

/**
 * Round configuration.
 *
 * Six controls, no wizard, no hidden steps. Nothing here is required to play:
 * the defaults produce a valid round.
 */
export function RoundSetupForm({
  title,
  description,
  config,
  onConfigChange,
  eligibleCount,
  canStart,
  onStart,
  emptyReason,
  regions = [],
}: RoundSetupFormProps) {
  const maxSize = Math.max(1, eligibleCount);
  const sizes = [...LEARNING_CONFIG.roundSizes, 0].filter((size) => size <= maxSize);
  if (sizes.length === 0) sizes.push(Math.min(5, maxSize));

  const update = <K extends keyof RoundConfigShape>(key: K, value: RoundConfigShape[K]) => {
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <div className="stack stack--loose" style={{ maxWidth: '44rem' }}>
      <div className="stack stack--tight">
        <h1>{title}</h1>
        <p className="prose">{description}</p>
      </div>

      {emptyReason !== null ? (
        <div className="notice notice--warning" role="status">
          <p>{emptyReason}</p>
        </div>
      ) : null}

      <fieldset className="stack stack--tight">
        <legend>Body view</legend>
        <div className="choice-group">
          {(['anterior', 'posterior', 'mixed'] as const).map((view) => (
            <button
              key={view}
              type="button"
              className="choice"
              aria-pressed={config.view_filter === view}
              onClick={() => update('view_filter', view)}
            >
              {view === 'anterior' ? 'Anterior (front)' : view === 'posterior' ? 'Posterior (back)' : 'Both'}
            </button>
          ))}
        </div>
      </fieldset>

      {regions.length > 0 ? (
        <fieldset className="stack stack--tight">
          <legend>Region (optional)</legend>
          <div className="choice-group">
            <button
              type="button"
              className="choice"
              aria-pressed={config.region_ids.length === 0}
              onClick={() => update('region_ids', [])}
            >
              All regions
            </button>
            {regions.map((region) => (
              <button
                key={region.id}
                type="button"
                className="choice"
                aria-pressed={config.region_ids.includes(region.id)}
                onClick={() =>
                  update(
                    'region_ids',
                    config.region_ids.includes(region.id)
                      ? config.region_ids.filter((id) => id !== region.id)
                      : [...config.region_ids, region.id],
                  )
                }
              >
                {region.name}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="stack stack--tight">
        <legend>Round size</legend>
        <div className="choice-group">
          {sizes.map((size) => (
            <button
              key={size === 0 ? 'max' : size}
              type="button"
              className="choice"
              aria-pressed={size === 0 ? config.target_size >= maxSize : config.target_size === size}
              onClick={() => update('target_size', size === 0 ? maxSize : size)}
            >
              {size === 0 ? `All ${maxSize}` : size}
            </button>
          ))}
        </div>
        <p className="field__hint">
          {eligibleCount} structure{eligibleCount === 1 ? '' : 's'} are currently eligible to be
          asked about.
        </p>
      </fieldset>

      <div>
        <Button variant="primary" size="large" onClick={onStart} disabled={!canStart}>
          <span>Start round</span>
          <Icon name="chevronRight" size={18} />
        </Button>
      </div>
    </div>
  );
}
