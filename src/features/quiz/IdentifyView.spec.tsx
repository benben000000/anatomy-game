import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import IdentifyView from './IdentifyView';
import { SettingsProvider } from '@/app/providers/SettingsProvider';
import { RepositoryProvider } from '@/app/providers/RepositoryProvider';
import { ContentProvider } from '@/features/content/ContentProvider';
import { PwaUpdateProvider } from '@/features/pwa/updates/PWAUpdateService';
import { getContentRepository } from '@/features/content/repository/ContentRepository';
import { resolveBuildFlags } from '@/config/build-flags';
import { MuscleAtlasDatabase, resetDatabaseInstance } from '@/services/storage/db';
import { STORAGE_CONFIG } from '@/config/storage-config';
import { sourceIdSchema } from '@/domain/anatomy/ids';
import { quizSessionSchema, type QuizSessionConfig } from '@/domain/learning/learning';
import type { QuizSession } from '@/domain/learning/learning';

/**
 * Identify mode, driven as a learner would drive it.
 *
 * The shipped content pack is deliberately unpublished, so these tests publish
 * it in memory first — standing in for the state the project will be in once a
 * reviewer has signed off — and then play a real round through the interface.
 *
 * The fake source used here is obviously a test artefact. It must never be
 * treated as a citation for anything.
 */

const FLAGS = resolveBuildFlags({ VITE_ALLOW_DRAFT_CONTENT: 'true' });
const TEST_SOURCE = sourceIdSchema.parse('source.test');

function publishPack(): void {
  const repository = getContentRepository(FLAGS);
  for (const structure of repository.all.structures) {
    structure.content_status = 'published';
    structure.medical_review_status = 'approved';
    structure.source_references = [TEST_SOURCE];
  }
  for (const mapping of repository.all.mappings) {
    mapping.visual_status = 'approved';
    mapping.license_reference = 'commissioned_owned';
  }
}

function unpublishPack(): void {
  const repository = getContentRepository(FLAGS);
  for (const structure of repository.all.structures) {
    structure.content_status = 'draft';
    structure.medical_review_status = 'provisional';
    structure.source_references = [];
  }
  for (const mapping of repository.all.mappings) {
    mapping.visual_status = 'provisional';
    mapping.license_reference = 'UNSET';
  }
}

function renderIdentify() {
  return render(
    <MemoryRouter initialEntries={['/identify']}>
      <SettingsProvider>
        <RepositoryProvider>
          <ContentProvider>
            <PwaUpdateProvider>
              <IdentifyView />
            </PwaUpdateProvider>
          </ContentProvider>
        </RepositoryProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );
}

/** Answers the current question by choosing the correct structure by name. */
async function answerCorrectly(): Promise<void> {
  const prompt = await screen.findByText('Find the');
  const target = prompt.parentElement?.querySelector('.prompt-bar__target');
  const name = target?.textContent ?? '';

  const list = screen.getByText('Choose a structure without tapping');
  await userEvent.click(list);
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
}

beforeEach(async () => {
  resetDatabaseInstance();
  await Dexie.delete(STORAGE_CONFIG.databaseName);
  const database = new MuscleAtlasDatabase();
  await database.open();
  // Every case declares its own starting state.
  unpublishPack();
});

describe('Identify mode with nothing published', () => {
  it('refuses to start and explains why', async () => {
    renderIdentify();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Quick identification' })).toBeVisible();
    });

    expect(screen.getByText(/awaiting review by a qualified anatomy reviewer/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start round' })).toBeDisabled();
  });
});

describe('Identify mode with published content', () => {
  beforeEach(() => {
    publishPack();
  });

  it('starts a round and shows a prompt above the board', async () => {
    renderIdentify();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Start round' })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Start round' }));

    await waitFor(() => {
      expect(screen.getByText('Find the')).toBeVisible();
    });
    expect(screen.getByRole('region', { name: 'Anatomy board' })).toBeVisible();
    expect(screen.getByText(/Question 1 of/)).toBeVisible();
  });

  it('gives calm, unpunitive feedback for a correct answer', async () => {
    renderIdentify();
    await userEvent.click(await screen.findByRole('button', { name: 'Start round' }));
    await waitFor(() => expect(screen.getByText('Find the')).toBeVisible());

    await answerCorrectly();

    await waitFor(() => {
      expect(screen.getByText(/^Correct/, { selector: '.outcome__title' })).toBeVisible();
    });
    expect(screen.getByText(/You located it without a hint/)).toBeVisible();

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/congratul|well done|awesome|stars?\b/i);
    expect(text).not.toMatch(/(\u{1F300}-\u{1FAFF}|\u{FE0F})/u);
  });

  it('names both the chosen and the correct structure on a miss', async () => {
    renderIdentify();
    await userEvent.click(await screen.findByRole('button', { name: 'Start round' }));
    await waitFor(() => expect(screen.getByText('Find the')).toBeVisible());

    const prompt = screen.getByText('Find the');
    const target = prompt.parentElement?.querySelector('.prompt-bar__target')?.textContent ?? '';

    // Pick a structure that is definitely not the target.
    const wrong = target === 'Deltoid' ? 'Rectus abdominis' : 'Deltoid';

    await userEvent.click(screen.getByText('Choose a structure without tapping'));
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(wrong) }));

    await waitFor(() => {
      expect(screen.getByText(/^Not quite/, { selector: '.outcome__title' })).toBeVisible();
    });
    expect(screen.getByText(new RegExp(`You selected ${wrong}`))).toBeVisible();
    expect(screen.getByText(new RegExp(`The target was ${target}`))).toBeVisible();
  });

  it('never advances automatically; the learner chooses to continue', async () => {
    renderIdentify();
    await userEvent.click(await screen.findByRole('button', { name: 'Start round' }));
    await waitFor(() => expect(screen.getByText('Find the')).toBeVisible());

    await answerCorrectly();
    await waitFor(() => expect(screen.getByText(/^Correct/, { selector: '.outcome__title' })).toBeVisible());

    // Still on question one until Continue is pressed.
    expect(screen.getByText(/Question 1 of/)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: /Continue/ }));

    await waitFor(() => {
      expect(screen.getByText(/Question 2 of/)).toBeVisible();
    });
  });

  // This drives a full ten-question round with a persisted IndexedDB session
  // behind it, so it is the slowest test in the suite: ~3.1s in isolation, and
  // over the 5s default once V8 coverage instrumentation is applied. The limit
  // is raised here rather than globally because every other test is comfortably
  // inside 5s and a global increase would hide genuinely slow tests elsewhere.
  it('completes a round and reports the result honestly', { timeout: 15_000 }, async () => {
    renderIdentify();
    await userEvent.click(await screen.findByRole('button', { name: 'Start round' }));
    await waitFor(() => expect(screen.getByText('Find the')).toBeVisible());

    // Answer every question correctly.
    for (let i = 0; i < 10; i += 1) {
      if (screen.queryByText('Find the') === null) break;
      await answerCorrectly();
      await waitFor(() => expect(screen.getByRole('button', { name: /Continue/ })).toBeVisible());
      await userEvent.click(screen.getByRole('button', { name: /Continue/ }));
    }

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round complete' })).toBeVisible();
    });

    expect(screen.getByText('100%')).toBeVisible();
    expect(screen.getByText(/Nothing flagged for review/)).toBeVisible();
    expect((document.body.textContent ?? '').toLowerCase()).not.toContain('master');
  });

  it('offers a skip that is recorded without penalising the learner', async () => {
    renderIdentify();
    await userEvent.click(await screen.findByRole('button', { name: 'Start round' }));
    await waitFor(() => expect(screen.getByText('Find the')).toBeVisible());

    await userEvent.click(screen.getByRole('button', { name: /Skip/ }));

    await waitFor(() => {
      expect(screen.getByText(/^Skipped/, { selector: '.outcome__title' })).toBeVisible();
    });
    expect(screen.getByText(/will come back sooner/)).toBeVisible();
  });

  it('offers a free hint that does not punish the learner', async () => {
    renderIdentify();
    await userEvent.click(await screen.findByRole('button', { name: 'Start round' }));
    await waitFor(() => expect(screen.getByText('Find the')).toBeVisible());

    await userEvent.click(screen.getByRole('button', { name: /Hint/ }));

    await waitFor(() => {
      expect(screen.getByText(/Start with the general region/)).toBeVisible();
    });
    expect(screen.getByText('1 hint used')).toBeVisible();
  });

  it('records a hint-then-correct answer as assisted, not unassisted', async () => {
    renderIdentify();
    await userEvent.click(await screen.findByRole('button', { name: 'Start round' }));
    await waitFor(() => expect(screen.getByText('Find the')).toBeVisible());

    await userEvent.click(screen.getByRole('button', { name: /Hint/ }));
    await answerCorrectly();

    await waitFor(() => {
      expect(screen.getByText(/^Correct with a hint/, { selector: '.outcome__title' })).toBeVisible();
    });
    expect(screen.getByText(/will return sooner than an unassisted answer/)).toBeVisible();
  });

  it('persists the round so an interruption loses nothing', async () => {
    renderIdentify();
    await userEvent.click(await screen.findByRole('button', { name: 'Start round' }));
    await waitFor(() => expect(screen.getByText('Find the')).toBeVisible());

    await answerCorrectly();
    await waitFor(() => expect(screen.getByText(/^Correct/, { selector: '.outcome__title' })).toBeVisible());

    // Read the stored round directly from the database layer.
    const database = new MuscleAtlasDatabase();
    await database.open();
    const stored = await database.activeSession.toArray();
    const active = stored.find((session) => session.status === 'in_progress');

    expect(active).toBeDefined();
    expect(active?.records).toHaveLength(1);
    expect(active?.records[0]?.outcome).toBe('correct');
  });

  it('restores an interrupted round when the screen is reopened', async () => {
    const database = new MuscleAtlasDatabase();
    await database.open();

    const config: QuizSessionConfig = quizSessionSchema.shape.config.parse({
      mode: 'identify',
      view_filter: 'anterior',
      target_size: 5,
    });

    const session: QuizSession = quizSessionSchema.parse({
      session_id: 'session.interrupted',
      profile_id: 'profile.test',
      config,
      pool_structure_ids: ['muscular.biceps_brachii', 'muscular.deltoid'],
      queue: ['muscular.biceps_brachii', 'muscular.deltoid'],
      records: [
        {
          question_id: 'session.interrupted.q1',
          structure_id: 'muscular.biceps_brachii',
          selected_structure_id: 'muscular.biceps_brachii',
          outcome: 'correct',
          hints_used: [],
          elapsed_ms: 1200,
          view_id: 'anterior',
          region_ids: [],
          question_type: 'locate_named_structure',
          pack_version: '1.0.0',
          recorded_at: Date.now(),
        },
      ],
      current_question_id: 'session.interrupted.q2',
      status: 'in_progress',
      started_at: Date.now() - 5000,
      ended_at: null,
      pack_version: '1.0.0',
      schema_version: 1,
    });
    await database.activeSession.put(session);

    renderIdentify();

    // The learner is dropped back into the round, on the unanswered question.
    await waitFor(() => {
      expect(screen.getByText('Find the')).toBeVisible();
    });
    expect(screen.getByText(/Question 2 of/)).toBeVisible();
  });
});
