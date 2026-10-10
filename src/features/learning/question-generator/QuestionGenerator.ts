import type { AnatomyStructure } from '@/domain/anatomy/anatomy';
import { viewIdSchema } from '@/domain/anatomy/ids';
import type { Question } from '@/domain/learning/learning';
import { LEARNING_CONFIG } from '@/config/learning-config';
import type { ContentStatus } from '@/domain/content/content-status';
import type { ContentRepository } from '@/features/content/repository/ContentRepository';

/**
 * Question generation.
 *
 * Eligibility is decided here and nowhere else. The rules are deliberately
 * strict, because the worst possible failure in this product is asking a
 * learner to find something they cannot fairly find, or asking them to confirm
 * something nobody has reviewed.
 *
 * A structure is eligible only when:
 *   1. its content status permits showing it (published, or draft in a build
 *      that explicitly allows preview),
 *   2. it belongs to the active anatomy system,
 *   3. it cites at least one source,
 *   4. it has a selectable visual mapping in a view the round uses,
 *   5. it matches the chosen region, difficulty and mode filters,
 *   6. it has not just been asked in this round.
 */

export interface EligibilityInput {
  readonly repository: ContentRepository;
  readonly systemId: string;
  readonly viewFilter: 'anterior' | 'posterior' | 'mixed';
  readonly regionIds: readonly string[];
  readonly difficultyTiers: readonly string[];
  /** Restricts the pool, e.g. Learn Then Test or a focused practice round. */
  readonly onlyStructureIds?: readonly string[] | undefined;
  readonly allowDraftContent: boolean;
}

export interface EligibleStructure {
  readonly structure: AnatomyStructure;
  readonly viewId: string;
}

export function findEligibleStructures(input: EligibilityInput): readonly EligibleStructure[] {
  const { repository } = input;

  const permittedStatuses: readonly ContentStatus[] = input.allowDraftContent
    ? ['published', 'reviewed', 'draft']
    : ['published'];

  const candidates = repository.visibleStructures({
    statuses: permittedStatuses,
    systemId: input.systemId,
  });

  const allowed = input.onlyStructureIds ? new Set<string>(input.onlyStructureIds) : null;
  const regions = input.regionIds.length > 0 ? new Set<string>(input.regionIds) : null;
  const tiers = input.difficultyTiers.length > 0 ? new Set<string>(input.difficultyTiers) : null;

  const eligible: EligibleStructure[] = [];

  for (const structure of candidates) {
    if (allowed !== null && !allowed.has(structure.structure_id)) continue;
    if (tiers !== null && !tiers.has(structure.difficulty_tier)) continue;
    if (regions !== null && !structure.region_ids.some((regionId) => regions.has(regionId))) continue;

    // Sources are required. Draft content has none yet, which is exactly why
    // it cannot enter a learner round.
    if (structure.source_references.length === 0) continue;

    const mapping = repository
      .selectableMappingsForStructure(structure.structure_id)
      .find((candidate) => matchesView(candidate.view_id, input.viewFilter));

    if (mapping === undefined) continue;

    eligible.push({ structure, viewId: mapping.view_id });
  }

  return eligible;
}

function matchesView(mappingView: string, filter: 'anterior' | 'posterior' | 'mixed'): boolean {
  return filter === 'mixed' || mappingView === filter;
}

/* ------------------------------------------------------------------ *
 * Question construction
 * ------------------------------------------------------------------ */

export interface BuildQuestionsInput {
  readonly eligible: readonly EligibleStructure[];
  readonly packVersion: string;
  readonly sessionId: string;
  readonly onlyStructureIds?: readonly string[];
}

export function buildQuestions(input: BuildQuestionsInput): readonly Question[] {
  const allowed = input.onlyStructureIds ? new Set(input.onlyStructureIds) : null;
  const questions: Question[] = [];
  const seen = new Set<string>();

  for (const item of input.eligible) {
    const { structure, viewId } = item;
    if (allowed !== null && !allowed.has(structure.structure_id)) continue;
    // One question per structure per round, even when it is visible in two views.
    if (seen.has(structure.structure_id)) continue;
    seen.add(structure.structure_id);

    questions.push({
      question_id: `${input.sessionId}.q${questions.length + 1}`,
      structure_id: structure.structure_id,
      view_id: viewIdSchema.parse(viewId),
      region_ids: [...structure.region_ids],
      difficulty_tier: structure.difficulty_tier,
      prompt_format: 'locate_named_structure',
      pack_version: input.packVersion,
    });
  }

  return questions;
}

/* ------------------------------------------------------------------ *
 * Review ordering
 * ------------------------------------------------------------------ */

export interface ReviewCandidate {
  readonly structureId: string;
  readonly priority: number;
}

/**
 * Review pool.
 *
 * Structure ids come from the progress scheduler; this function only filters
 * them down to structures that are actually eligible to be asked, so a review
 * round can never ask something the board cannot show.
 */
export function buildReviewPool(
  candidates: readonly ReviewCandidate[],
  eligible: readonly EligibleStructure[],
  limit: number,
): readonly string[] {
  const eligibleIds = new Set<string>(eligible.map((item) => item.structure.structure_id));

  return candidates
    .filter((candidate) => eligibleIds.has(candidate.structureId))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((candidate) => candidate.structureId);
}

/** Round sizes the UI offers, filtered to what the pool can actually supply. */
export function availableRoundSizes(eligibleCount: number): readonly number[] {
  return LEARNING_CONFIG.roundSizes.filter((size) => size <= eligibleCount);
}
