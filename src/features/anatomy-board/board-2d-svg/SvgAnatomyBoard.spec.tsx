import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SvgAnatomyBoard, canTrackPointer, toInputType } from './SvgAnatomyBoard';
import { geometryForView, PROVISIONAL_GEOMETRY } from './provisional-geometry.data';
import { INITIAL_VIEWPORT, type ViewportState } from './viewport';
import type {
  AnatomyBoardEvent,
  CandidateHit,
  StructureVisualState,
} from '../contracts/anatomy-board-adapter';

/**
 * Board interaction.
 *
 * jsdom has no layout engine, so `elementsFromPoint` is stubbed to return the
 * hit paths that would realistically be under a tap. The tests then verify the
 * board's decision logic — tap versus pan, single versus multiple candidates,
 * cancellation — rather than anything about jsdom's geometry.
 */

function hitFor(structureId: string, view: 'anterior' | 'posterior' = 'anterior'): Element {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  element.setAttribute('data-hit-visual-id', `muscular.${view}.${structureId.replace('muscular.', '')}.surface`);
  element.setAttribute('data-hit-structure-id', structureId);
  return element;
}

function stubElementsAtPoint(elements: Element[]): void {
  Object.defineProperty(document, 'elementsFromPoint', {
    writable: true,
    configurable: true,
    value: () => elements,
  });
}

function candidatesFor(view: 'anterior' | 'posterior'): CandidateHit[] {
  return geometryForView(view).map((entry) => ({
    visualId: entry.visualId as CandidateHit['visualId'],
    structureId: entry.structureId as CandidateHit['structureId'],
    selectionPriority: entry.requiresDisambiguation ? 600 : 500,
    requiresDisambiguation: entry.requiresDisambiguation,
  }));
}

interface Harness {
  readonly events: AnatomyBoardEvent[];
}

function renderBoard(
  overrides: Partial<{
    view: 'anterior' | 'posterior';
    interactionEnabled: boolean;
    visualStates: ReadonlyMap<string, StructureVisualState>;
    candidates: CandidateHit[];
    pencilPrecision: boolean;
  }> = {},
): Harness {
  const events: AnatomyBoardEvent[] = [];

  const view = overrides.view ?? 'anterior';
  const viewportRef = { current: INITIAL_VIEWPORT as ViewportState };

  render(
    <SvgAnatomyBoard
      view={view}
      candidates={overrides.candidates ?? candidatesFor(view)}
      visualStates={overrides.visualStates ?? new Map()}
      interactionEnabled={overrides.interactionEnabled ?? true}
      labelsVisible={false}
      reducedMotion={false}
      pencilPrecision={overrides.pencilPrecision ?? false}
      onEvent={(event) => events.push(event)}
      viewportRef={viewportRef}
    />,
  );

  return { events };
}

function selectionEvents(events: AnatomyBoardEvent[]) {
  return events.filter((event) => event.type === 'structure-selected');
}

/**
 * Dispatches a pointer event with the properties the board reads.
 *
 * jsdom does not implement `PointerEvent`, so `fireEvent.pointerDown` cannot
 * carry `pointerId`, `clientX`, or `pointerType`. A plain `Event` with those
 * properties assigned is dispatched instead. This is a limitation of the test
 * environment, not of the board: the same listeners run unchanged in Safari.
 */
function dispatchPointer(
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  init: { readonly pointerId: number; readonly x: number; readonly y: number; readonly pointerType?: string },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: init.pointerId,
    clientX: init.x,
    clientY: init.y,
    pointerType: init.pointerType ?? 'touch',
    isPrimary: init.pointerId === 1,
  });
  target.dispatchEvent(event);
}

/**
 * Drives a complete gesture.
 *
 * `pointerdown` is delivered to the board, then move, release and cancel are
 * delivered to the window — which is where the board tracks a gesture in
 * progress, so that a finger sliding off the board still completes it.
 */
function gesture(
  target: HTMLElement,
  steps: readonly {
    readonly type: 'down' | 'move' | 'up' | 'cancel';
    readonly x: number;
    readonly y: number;
    readonly pointerType?: string;
  }[],
): void {
  for (const step of steps) {
    const init = {
      pointerId: 1,
      x: step.x,
      y: step.y,
      ...(step.pointerType === undefined ? {} : { pointerType: step.pointerType }),
    };
    if (step.type === 'down') dispatchPointer(target, 'pointerdown', init);
    else if (step.type === 'move') dispatchPointer(window, 'pointermove', init);
    else if (step.type === 'up') dispatchPointer(window, 'pointerup', init);
    else dispatchPointer(window, 'pointercancel', init);
  }
}

function tap(target: HTMLElement, x = 100, y = 200, pointerType = 'touch'): void {
  gesture(target, [
    { type: 'down', x, y, pointerType },
    { type: 'up', x, y, pointerType },
  ]);
}

describe('SvgAnatomyBoard rendering', () => {
  it('renders an accessible description of the current view', () => {
    renderBoard({ view: 'anterior' });
    expect(screen.getByText('Anterior view of the muscular system')).toBeInTheDocument();
  });

  it('names the posterior view', () => {
    renderBoard({ view: 'posterior' });
    expect(screen.getByText('Posterior view of the muscular system')).toBeInTheDocument();
  });

  it('marks the artwork as provisional in its description', () => {
    renderBoard();
    const description = document.getElementById('board-description');
    expect(description?.textContent).toContain('Provisional placeholder illustration');
  });

  it('renders a selectable hit region per structure in the view', () => {
    renderBoard();
    const hits = document.querySelectorAll('[data-hit-structure-id]');
    // Anterior structures are mirrored, so each appears once or twice.
    expect(hits.length).toBeGreaterThanOrEqual(geometryForView('anterior').length);
  });

  it('renders at least eight individually addressable targets', () => {
    renderBoard();
    const ids = new Set(
      [...document.querySelectorAll('[data-hit-structure-id]')].map((element) =>
        element.getAttribute('data-hit-structure-id'),
      ),
    );
    expect(ids.size).toBeGreaterThanOrEqual(8);
  });

  it('does not render hit regions for structures that are not candidates', () => {
    renderBoard({ candidates: [] });
    expect(document.querySelectorAll('[data-hit-structure-id]')).toHaveLength(0);
  });

  it('exposes visual state through data attributes, not inline styles', () => {
    renderBoard({
      visualStates: new Map([['muscular.biceps_brachii', 'correct' as StructureVisualState]]),
    });
    const state = document.querySelector('[data-structure-id="muscular.biceps_brachii"]');
    expect(state?.getAttribute('data-visual-state')).toBe('correct');
  });

  it('keeps every muscle out of the accessibility tree, since the list is the accessible route', () => {
    renderBoard();
    for (const group of document.querySelectorAll('[data-layer="muscle"] > g')) {
      expect(group.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('tap selection', () => {
  it('selects the single structure under a tap', () => {
    stubElementsAtPoint([hitFor('muscular.biceps_brachii')]);
    const { events } = renderBoard();

    tap(screen.getByTestId('board-canvas'));

    const selections = selectionEvents(events);
    expect(selections).toHaveLength(1);
    expect(selections[0]).toMatchObject({
      structureId: 'muscular.biceps_brachii',
      resolution: 'direct',
      activeView: 'anterior',
    });
  });

  it('reports the exact visual id alongside the structure id', () => {
    stubElementsAtPoint([hitFor('muscular.rectus_abdominis')]);
    const { events } = renderBoard();

    tap(screen.getByTestId('board-canvas'), 50, 50);

    expect(selectionEvents(events)[0]?.visualId).toBe(
      'muscular.anterior.rectus_abdominis.surface',
    );
  });

  it('selects nothing when the tap lands on empty board, without error', () => {
    stubElementsAtPoint([]);
    const { events } = renderBoard();

    tap(screen.getByTestId('board-canvas'), 10, 10);

    expect(selectionEvents(events)).toHaveLength(0);
  });

  it('asks for disambiguation rather than guessing between overlapping muscles', () => {
    stubElementsAtPoint([
      hitFor('muscular.external_oblique'),
      hitFor('muscular.rectus_abdominis'),
    ]);
    const { events } = renderBoard();

    tap(screen.getByTestId('board-canvas'), 80, 300);

    expect(selectionEvents(events)).toHaveLength(0);
    const request = events.find((event) => event.type === 'disambiguation-requested');
    expect(request).toBeDefined();
    if (request?.type === 'disambiguation-requested') {
      expect(request.candidates.length).toBe(2);
    }
  });

  it('never selects while interaction is disabled', () => {
    stubElementsAtPoint([hitFor('muscular.biceps_brachii')]);
    const { events } = renderBoard({ interactionEnabled: false });

    tap(screen.getByTestId('board-canvas'));

    expect(selectionEvents(events)).toHaveLength(0);
  });

  it('reports the input type that produced the selection', () => {
    stubElementsAtPoint([hitFor('muscular.biceps_brachii')]);
    const { events } = renderBoard();

    tap(screen.getByTestId('board-canvas'), 10, 10, 'pen');

    expect(selectionEvents(events)[0]).toMatchObject({ inputType: 'pen' });
  });

  it('maps every pointer type to an input kind', () => {
    expect(toInputType('pen')).toBe('pen');
    expect(toInputType('touch')).toBe('touch');
    expect(toInputType('mouse')).toBe('mouse');
    expect(toInputType('anything-else')).toBe('trackpad');
  });
});

describe('tap versus pan', () => {
  it('does not select after the pointer travels beyond the tap threshold', () => {
    stubElementsAtPoint([hitFor('muscular.biceps_brachii')]);
    const { events } = renderBoard();

    gesture(screen.getByTestId('board-canvas'), [
      { type: 'down', x: 100, y: 200 },
      { type: 'move', x: 100, y: 260 },
      { type: 'up', x: 100, y: 300 },
    ]);

    expect(selectionEvents(events)).toHaveLength(0);
    const release = events.find(
      (event) => event.type === 'interaction' && event.kind === 'pointer-up',
    );
    expect(release).toMatchObject({ exceedsTapThreshold: true });
  });

  it('selects a small wobble, because a finger is never perfectly still', () => {
    stubElementsAtPoint([hitFor('muscular.biceps_brachii')]);
    const { events } = renderBoard();

    gesture(screen.getByTestId('board-canvas'), [
      { type: 'down', x: 100, y: 200 },
      { type: 'move', x: 103, y: 204 },
      { type: 'up', x: 104, y: 205 },
    ]);

    expect(selectionEvents(events)).toHaveLength(1);
  });

  it('selects nothing when a pointer is cancelled mid-gesture', () => {
    stubElementsAtPoint([hitFor('muscular.biceps_brachii')]);
    const { events } = renderBoard();

    gesture(screen.getByTestId('board-canvas'), [
      { type: 'down', x: 100, y: 200 },
      { type: 'cancel', x: 100, y: 200 },
    ]);

    expect(selectionEvents(events)).toHaveLength(0);
    expect(
      events.some((event) => event.type === 'interaction' && event.kind === 'pointer-cancel'),
    ).toBe(true);
  });
});

describe('provisional geometry', () => {
  it('never uses a display name as an identifier', () => {
    for (const entry of PROVISIONAL_GEOMETRY) {
      expect(entry.structureId).toMatch(/^muscular\.[a-z0-9_]+$/);
      expect(entry.visualId).toMatch(/^muscular\.(anterior|posterior)\.[a-z0-9_]+\.surface$/);
    }
  });

  it('keeps descriptions free of structure names, so blind mode cannot leak the answer', () => {
    for (const entry of PROVISIONAL_GEOMETRY) {
      const name = entry.structureId.replace('muscular.', '').replace(/_/g, ' ');
      expect(entry.description.toLowerCase()).not.toContain(name);
    }
  });

  it('gives every entry a bounding box inside the viewBox', () => {
    for (const entry of PROVISIONAL_GEOMETRY) {
      const { x, y, width, height } = entry.boundingBox;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(1000);
      expect(y + height).toBeLessThanOrEqual(2200);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });

  it('declares a fairness affordance for every target too small to hit reliably', () => {
    // The requirement is conditional: a large target needs no affordance, but a
    // sub-44px one must offer disambiguation, a generous margin, or zoom-to-fit.
    for (const entry of PROVISIONAL_GEOMETRY) {
      const smallestSidePx = Math.min(entry.boundingBox.width, entry.boundingBox.height);
      if (smallestSidePx >= 44) continue;

      const hasAffordance = entry.requiresDisambiguation || entry.margin >= 8;
      expect(hasAffordance, entry.structureId).toBe(true);
    }
  });

  it('marks the crowded targets as needing disambiguation', () => {
    const crowded = PROVISIONAL_GEOMETRY.filter((entry) => entry.requiresDisambiguation);
    expect(crowded.length).toBeGreaterThan(0);
    for (const entry of crowded) {
      expect(entry.description.length).toBeGreaterThan(5);
    }
  });

  it('caps the forgiveness margin so it cannot swallow a neighbour', () => {
    for (const entry of PROVISIONAL_GEOMETRY) {
      expect(entry.margin).toBeLessThanOrEqual(16);
    }
  });
});

describe('pointer tracking', () => {
  it('tracks at most two pointers, ignoring a third finger', () => {
    // Pointer identifiers are unreliable in a DOM-less environment, so the rule
    // is asserted directly rather than through simulated events.
    expect(canTrackPointer(0)).toBe(true);
    expect(canTrackPointer(1)).toBe(true);
    expect(canTrackPointer(2)).toBe(false);
    expect(canTrackPointer(3)).toBe(false);
  });

  it('tracks no pointers while interaction is disabled', () => {
    const { events } = renderBoard({ interactionEnabled: false });
    const canvas = screen.getByTestId('board-canvas');

    dispatchPointer(canvas, 'pointerdown', { pointerId: 1, x: 100, y: 100 });

    expect(
      events.some((event) => event.type === 'interaction' && event.kind === 'pointer-down'),
    ).toBe(false);
  });
});
