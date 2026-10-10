import { describe, expect, it } from 'vitest';
import { resolveCandidates, screenToBoard } from './resolveCandidate';
import type { CandidateHit } from '@/features/anatomy-board/contracts/anatomy-board-adapter';
import { structureIdSchema, visualIdSchema } from '@/domain/anatomy/ids';

const OPTIONS = { maxCandidates: 5 };

function candidate(
  structureId: string,
  overrides: Partial<CandidateHit> = {},
): CandidateHit {
  return {
    // Parsed through the branded schemas so fixtures cannot drift from the
    // identifier contract the board enforces at runtime.
    visualId: visualIdSchema.parse(`muscular.anterior.${structureId.split('.').pop()}.surface`),
    structureId: structureIdSchema.parse(structureId),
    selectionPriority: 500,
    requiresDisambiguation: false,
    ...overrides,
  };
}

describe('resolveCandidates', () => {
  it('selects directly when exactly one structure is under the point', () => {
    const outcome = resolveCandidates([candidate('muscular.biceps_brachii')], OPTIONS);

    expect(outcome.resolution).toBe('direct');
    expect(outcome.needsDisambiguation).toBe(false);
    expect(outcome.selected?.structureId).toBe('muscular.biceps_brachii');
  });

  it('selects nothing and reports nothing when the tap hit empty board', () => {
    const outcome = resolveCandidates([], OPTIONS);

    expect(outcome.selected).toBeNull();
    expect(outcome.candidates).toEqual([]);
    expect(outcome.needsDisambiguation).toBe(false);
  });

  it('asks the learner when the data marks the spot as crowded', () => {
    const outcome = resolveCandidates(
      [
        candidate('muscular.external_oblique', { requiresDisambiguation: true }),
        candidate('muscular.rectus_abdominis', { selectionPriority: 900 }),
      ],
      OPTIONS,
    );

    expect(outcome.needsDisambiguation).toBe(true);
    expect(outcome.resolution).toBe('disambiguation');
    // It does not silently take the higher priority, even though one exists.
    expect(outcome.selected).toBeNull();
    expect(outcome.candidates).toHaveLength(2);
  });

  it('takes the highest priority deterministically, and still reports every candidate', () => {
    const outcome = resolveCandidates(
      [
        candidate('muscular.rectus_abdominis', { selectionPriority: 900 }),
        candidate('muscular.external_oblique', { selectionPriority: 400 }),
      ],
      OPTIONS,
    );

    expect(outcome.resolution).toBe('priority');
    expect(outcome.selected?.structureId).toBe('muscular.rectus_abdominis');
    expect(outcome.candidates).toHaveLength(2);
  });

  it('never guesses when priorities tie', () => {
    const outcome = resolveCandidates(
      [
        candidate('muscular.rectus_abdominis', { selectionPriority: 500 }),
        candidate('muscular.external_oblique', { selectionPriority: 500 }),
      ],
      OPTIONS,
    );

    expect(outcome.selected).toBeNull();
    expect(outcome.needsDisambiguation).toBe(true);
  });

  it('treats two visual mappings of one structure as one answer', () => {
    // A bilateral muscle drawn on both sides of the midline. Selecting either
    // side must read as the same structure, reported once.
    const outcome = resolveCandidates(
      [
        candidate('muscular.deltoid', {
          visualId: visualIdSchema.parse('muscular.anterior.deltoid.left'),
        }),
        candidate('muscular.deltoid', {
          visualId: visualIdSchema.parse('muscular.anterior.deltoid.right'),
          selectionPriority: 600,
        }),
      ],
      OPTIONS,
    );

    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.selected?.visualId).toBe('muscular.anterior.deltoid.right');
  });

  it('caps the chooser so it stays a decision rather than a list', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      candidate(`muscular.m${String(index)}`, { requiresDisambiguation: true }),
    );
    const outcome = resolveCandidates(many, { maxCandidates: 3 });

    expect(outcome.candidates).toHaveLength(3);
    expect(outcome.needsDisambiguation).toBe(true);
  });

  it('orders candidates by priority so the best match is first', () => {
    const outcome = resolveCandidates(
      [
        candidate('muscular.low', { selectionPriority: 100 }),
        candidate('muscular.high', { selectionPriority: 800 }),
      ],
      OPTIONS,
    );
    expect(outcome.candidates[0]?.structureId).toBe('muscular.high');
  });
});

describe('screenToBoard', () => {
  const viewBox = { x: 0, y: 0, width: 1000, height: 2200 };

  it('maps the top-left of an exactly-fitting rect to the viewBox origin', () => {
    const point = screenToBoard({
      clientX: 0,
      clientY: 0,
      rect: { left: 0, top: 0, width: 1000, height: 2200 },
      viewBox,
    });
    expect(point).toEqual({ x: 0, y: 0 });
  });

  it('accounts for letterboxing with xMidYMid meet', () => {
    // A wide rect makes the board render at its full height, centred
    // horizontally, so the left edge of the artwork is inset.
    const rect = { left: 0, top: 0, width: 4400, height: 2200 };
    const leftEdge = screenToBoard({ clientX: 1700, clientY: 0, rect, viewBox });
    expect(round(leftEdge.x)).toBe(0);

    const outsideBoard = screenToBoard({ clientX: 100, clientY: 0, rect, viewBox });
    expect(outsideBoard.x).toBeLessThan(0);
  });

  it('scales consistently in both axes', () => {
    const rect = { left: 50, top: 20, width: 500, height: 1100 };
    const a = screenToBoard({ clientX: 50, clientY: 20, rect, viewBox });
    const b = screenToBoard({ clientX: 550, clientY: 1120, rect, viewBox });

    expect(round(b.x - a.x)).toBe(1000);
    expect(round(b.y - a.y)).toBe(2200);
  });
});

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
