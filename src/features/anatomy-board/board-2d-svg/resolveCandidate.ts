import type { CandidateHit, SelectionResolution } from '@/features/anatomy-board/contracts/anatomy-board-adapter';

/**
 * Multi-candidate resolution.
 *
 * This is the mechanism that satisfies both halves of design brief conflict C3:
 * hit regions can be forgiving enough for a fingertip, and a selection is never
 * silently attributed to the wrong neighbouring structure.
 *
 * Given the elements under a point:
 *
 * - no candidate        → no selection, and no error. Tapping empty board does nothing.
 * - one candidate       → select it directly.
 * - several, and one requires disambiguation → ask the learner to choose.
 * - several, with distinct priorities         → take the highest, but report all.
 * - several, tied priorities                  → ask the learner to choose.
 *
 * Nothing here ever guesses. A tie goes to the learner, not to a sort order.
 */

export interface ResolutionOutcome {
  readonly selected: CandidateHit | null;
  readonly candidates: readonly CandidateHit[];
  readonly resolution: SelectionResolution;
  readonly needsDisambiguation: boolean;
}

export function resolveCandidates(
  candidates: readonly CandidateHit[],
  options: { readonly maxCandidates: number },
): ResolutionOutcome {
  const deduplicated = dedupeByStructure(candidates);

  if (deduplicated.length === 0) {
    return {
      selected: null,
      candidates: [],
      resolution: 'direct',
      needsDisambiguation: false,
    };
  }

  if (deduplicated.length === 1) {
    return {
      selected: deduplicated[0] ?? null,
      candidates: deduplicated,
      resolution: 'direct',
      needsDisambiguation: false,
    };
  }

  // The data already knows this spot is crowded, so ask rather than guess.
  const flagged = deduplicated.filter((candidate) => candidate.requiresDisambiguation);
  if (flagged.length > 0) {
    return {
      selected: null,
      candidates: cap(deduplicated, options.maxCandidates),
      resolution: 'disambiguation',
      needsDisambiguation: true,
    };
  }

  const highest = Math.max(...deduplicated.map((candidate) => candidate.selectionPriority));
  const winners = deduplicated.filter((candidate) => candidate.selectionPriority === highest);

  if (winners.length > 1) {
    return {
      selected: null,
      candidates: cap(deduplicated, options.maxCandidates),
      resolution: 'disambiguation',
      needsDisambiguation: true,
    };
  }

  return {
    selected: winners[0] ?? null,
    candidates: deduplicated,
    resolution: 'priority',
    needsDisambiguation: false,
  };
}

/**
 * Two visual mappings can point at the same structure in one view (a bilateral
 * muscle drawn twice). Selecting either is the same answer, so keep the best
 * candidate per structure and report it once.
 */
function dedupeByStructure(candidates: readonly CandidateHit[]): CandidateHit[] {
  const byStructure = new Map<string, CandidateHit>();
  for (const candidate of candidates) {
    const existing = byStructure.get(candidate.structureId);
    if (existing === undefined || candidate.selectionPriority > existing.selectionPriority) {
      byStructure.set(candidate.structureId, candidate);
    }
  }
  return [...byStructure.values()].sort((a, b) => b.selectionPriority - a.selectionPriority);
}

function cap(candidates: readonly CandidateHit[], max: number): CandidateHit[] {
  return candidates.slice(0, max);
}

/* ------------------------------------------------------------------ *
 * Board-to-screen coordinate conversion
 * ------------------------------------------------------------------ */

export interface ScreenToBoardInput {
  readonly clientX: number;
  readonly clientY: number;
  readonly rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly viewBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/**
 * Convert a screen point to board (viewBox user) units.
 *
 * Uses `preserveAspectRatio="xMidYMid meet"`, so the scale is uniform and
 * derived from the larger of the two ratios.
 */
export function screenToBoard(input: ScreenToBoardInput): { readonly x: number; readonly y: number } {
  const { rect, viewBox } = input;
  const scale = Math.max(viewBox.width / rect.width, viewBox.height / rect.height);
  const renderedWidth = viewBox.width / scale;
  const renderedHeight = viewBox.height / scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;

  return {
    x: viewBox.x + (input.clientX - rect.left - offsetX) * scale,
    y: viewBox.y + (input.clientY - rect.top - offsetY) * scale,
  };
}
