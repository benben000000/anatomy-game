import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PromptBar, OutcomeBadge, PrimaryActions, SourcedNote } from './PromptBar';
import { ResultsView } from './ResultsView';
import { RoundSetupForm, type RoundConfigShape } from './RoundSetupForm';
import { DisambiguationChooser } from './DisambiguationChooser';
import { ContentProvider } from '@/features/content/ContentProvider';
import { structureIdSchema, visualIdSchema } from '@/domain/anatomy/ids';
import type { CandidateHit } from '@/features/anatomy-board/contracts/anatomy-board-adapter';
import type { SessionSummary } from '@/features/learning/answer-evaluator/AnswerEvaluator';

/**
 * Quiz interface behaviour.
 *
 * Focuses on what a learner is actually promised: calm, non-punitive feedback
 * that never overstates what one answer proves, and a disambiguation chooser
 * that describes positions rather than leaking structure names in blind mode.
 */

function withContent(node: React.ReactNode) {
  // Some of these screens link onward, so a router is part of the context they
  // legitimately expect.
  return render(
    <MemoryRouter>
      <ContentProvider>{node}</ContentProvider>
    </MemoryRouter>,
  );
}

const summary: SessionSummary = {
  sessionId: 'session.test',
  total: 5,
  correct: 3,
  incorrect: 1,
  assisted: 0,
  revealed: 1,
  skipped: 0,
  accuracy: 0.6,
  durationMs: 60_000,
  reviewTargets: ['muscular.serratus_anterior', 'muscular.soleus'],
};

describe('PromptBar', () => {
  it('names the target and shows progress', () => {
    render(
      <PromptBar
        targetName="Biceps brachii"
        questionNumber={2}
        totalQuestions={10}
        hintCount={0}
      />,
    );

    expect(screen.getByText('Biceps brachii')).toBeInTheDocument();
    expect(screen.getByText('Question 2 of 10')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
  });

  it('reports hint use without hiding it', () => {
    render(
      <PromptBar targetName="Deltoid" questionNumber={1} totalQuestions={5} hintCount={2} />,
    );
    expect(screen.getByText('2 hints used')).toBeInTheDocument();
  });

  it('handles a zero-question round without dividing by zero', () => {
    render(<PromptBar targetName="Deltoid" questionNumber={0} totalQuestions={0} hintCount={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('OutcomeBadge', () => {
  const cases = [
    { outcome: 'correct' as const, title: 'Correct — Biceps brachii', spoken: 'Correct.' },
    { outcome: 'incorrect' as const, title: 'Not quite', spoken: 'Not correct.' },
    { outcome: 'revealed' as const, title: 'Answer revealed — Deltoid', spoken: 'Answer revealed.' },
    { outcome: 'assisted' as const, title: 'Correct with a hint — Deltoid', spoken: 'Correct with a hint.' },
    { outcome: 'skipped' as const, title: 'Skipped', spoken: 'Skipped.' },
  ];

  for (const testCase of cases) {
    it(`states the ${testCase.outcome} outcome in words as well as colour`, () => {
      render(<OutcomeBadge outcome={testCase.outcome} title={testCase.title} detail="Detail" />);

      const badge = screen.getByText(testCase.title).closest('.outcome');
      expect(badge).toHaveAttribute('data-outcome', testCase.outcome);
      // The state is named in text, so colour is never the only signal.
      expect(screen.getByText(testCase.spoken)).toBeInTheDocument();
    });
  }

  it('never uses confetti, exclamation marks, or shame for a mistake', () => {
    render(<OutcomeBadge outcome="incorrect" title="Not quite" detail="You selected Trapezius." />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/wrong!|fail|stupid|loser/i);
  });
});

describe('SourcedNote', () => {
  it('renders a short note', () => {
    render(<SourcedNote text="Front of the upper arm." />);
    expect(screen.getByText('Front of the upper arm.')).toBeInTheDocument();
  });
});

describe('PrimaryActions', () => {
  it('offers exactly one obvious primary action', () => {
    render(<PrimaryActions onContinue={() => undefined} onInspect={() => undefined} />);

    const buttons = screen.getAllByRole('button');
    const primary = buttons.filter((button) => button.className.includes('btn--primary'));
    expect(primary).toHaveLength(1);
  });

  it('does not advance automatically when Continue is offered', async () => {
    const onContinue = vi.fn();
    render(<PrimaryActions onContinue={onContinue} />);

    expect(onContinue).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('can offer an optional review action', async () => {
    const onAddToReview = vi.fn();
    render(<PrimaryActions onContinue={() => undefined} onAddToReview={onAddToReview} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add to review' }));
    expect(onAddToReview).toHaveBeenCalledTimes(1);
  });
});

describe('ResultsView', () => {
  it('reports accuracy with the graded denominator explained', () => {
    withContent(<ResultsView summary={summary} onRepeat={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Round complete' })).toBeVisible();
    expect(screen.getByText('60%')).toBeVisible();
    expect(screen.getByText(/3 of 5 graded/)).toBeVisible();
    expect(screen.getByText(/Skipped questions are not counted against accuracy/)).toBeVisible();
  });

  it('names the structures worth another look', () => {
    withContent(<ResultsView summary={summary} onRepeat={() => undefined} />);
    expect(screen.getByText('Worth another look')).toBeVisible();
    expect(screen.getByText('Serratus anterior')).toBeVisible();
    expect(screen.getByText('Soleus')).toBeVisible();
  });

  it('never claims mastery', () => {
    withContent(<ResultsView summary={summary} onRepeat={() => undefined} />);
    const text = document.body.textContent ?? '';
    expect(text.toLowerCase()).not.toContain('master');
    expect(text).not.toMatch(/well done|great job|awesome|superstar/i);
  });

  it('uses no emoji and no confetti language', () => {
    withContent(<ResultsView summary={summary} onRepeat={() => undefined} />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/(\u{1F300}-\u{1FAFF}|\u{2600}-\u{27BF}|\u{FE0F})/u);
    expect(text.toLowerCase()).not.toContain('congrat');
  });

  it('says plainly when nothing needs review', () => {
    withContent(
      <ResultsView summary={{ ...summary, reviewTargets: [] }} onRepeat={() => undefined} />,
    );
    expect(screen.getByText('Nothing flagged for review')).toBeVisible();
    expect(screen.getByText(/Come back later to check it has stuck/)).toBeVisible();
  });

  it('offers a way to practise again', async () => {
    const onRepeat = vi.fn();
    withContent(<ResultsView summary={summary} onRepeat={onRepeat} />);

    await userEvent.click(screen.getByRole('button', { name: 'Practise again' }));
    expect(onRepeat).toHaveBeenCalledTimes(1);
  });
});

describe('RoundSetupForm', () => {
  const baseConfig: RoundConfigShape = {
    mode: 'identify',
    view_filter: 'anterior',
    region_ids: [],
    difficulty_tiers: [],
    target_size: 10,
    focus_structure_ids: [],
    time_limit_seconds: null,
  };

  function renderForm(overrides: Partial<Parameters<typeof RoundSetupForm>[0]> = {}) {
    const onConfigChange = vi.fn();
    render(
      <RoundSetupForm
        title="Quick identification"
        description="Find the named muscle."
        config={baseConfig}
        eligibleCount={12}
        canStart
        onStart={() => undefined}
        emptyReason={null}
        onConfigChange={onConfigChange}
        {...overrides}
      />,
    );
    return { onConfigChange };
  }

  it('defaults to a valid round without any configuration', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Start round' })).toBeEnabled();
  });

  it('reports how many structures are eligible', () => {
    renderForm();
    expect(screen.getByText(/12 structures are currently eligible/)).toBeVisible();
  });

  it('disables Start when nothing is eligible', () => {
    renderForm({ eligibleCount: 0, canStart: false });
    expect(screen.getByRole('button', { name: 'Start round' })).toBeDisabled();
  });

  it('offers only round sizes the pool can supply', () => {
    renderForm({ eligibleCount: 7 });
    expect(screen.getByRole('button', { name: '5' })).toBeVisible();
    // A pool of seven cannot supply a round of twenty, so it is not offered.
    expect(screen.queryByRole('button', { name: '20' })).toBeNull();
    expect(screen.getByRole('button', { name: /All 7/ })).toBeVisible();
  });

  it('changes the view filter', async () => {
    const { onConfigChange } = renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Posterior (back)' }));
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ view_filter: 'posterior' }),
    );
  });

  it('changes the round size', async () => {
    const { onConfigChange } = renderForm();
    await userEvent.click(screen.getByRole('button', { name: '5' }));
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ target_size: 5 }));
  });

  it('explains an empty pool instead of showing a broken form', () => {
    renderForm({ eligibleCount: 0, canStart: false, emptyReason: 'Nothing is published yet.' });
    expect(screen.getByText('Nothing is published yet.')).toBeVisible();
  });
});

describe('DisambiguationChooser', () => {
  const candidates: CandidateHit[] = [
    {
      visualId: visualIdSchema.parse('muscular.anterior.external_oblique.surface'),
      structureId: structureIdSchema.parse('muscular.external_oblique'),
      selectionPriority: 600,
      requiresDisambiguation: true,
    },
    {
      visualId: visualIdSchema.parse('muscular.anterior.rectus_abdominis.surface'),
      structureId: structureIdSchema.parse('muscular.rectus_abdominis'),
      selectionPriority: 600,
      requiresDisambiguation: true,
    },
  ];

  it('describes positions instead of naming structures in blind mode', () => {
    withContent(
      <DisambiguationChooser
        candidates={candidates}
        blind
        onSelect={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText('Which one did you mean?')).toBeVisible();
    // The answer must not be given away by the chooser itself.
    expect(screen.queryByText('External oblique')).toBeNull();
    expect(screen.queryByText('Rectus abdominis')).toBeNull();
    expect(screen.getByText('outer side of the abdomen')).toBeVisible();
    expect(screen.getByText('front of the abdomen')).toBeVisible();
  });

  it('names structures in explore mode, where there is nothing to hide', () => {
    withContent(
      <DisambiguationChooser
        candidates={candidates}
        blind={false}
        onSelect={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText('External oblique')).toBeVisible();
    expect(screen.getByText('Rectus abdominis')).toBeVisible();
  });

  it('reports the chosen structure by its stable id', async () => {
    const onSelect = vi.fn();
    withContent(
      <DisambiguationChooser
        candidates={candidates}
        blind
        onSelect={onSelect}
        onCancel={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole('option', { name: /front of the abdomen/ }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ structureId: 'muscular.rectus_abdominis' }),
    );
  });

  it('can be cancelled without selecting anything', async () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    withContent(
      <DisambiguationChooser
        candidates={candidates}
        blind
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('is a modal dialog with an accessible name', () => {
    withContent(
      <DisambiguationChooser
        candidates={candidates}
        blind
        onSelect={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getAllByRole('option')).toHaveLength(2);
  });
});
