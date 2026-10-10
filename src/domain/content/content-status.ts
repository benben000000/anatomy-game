import { z } from 'zod';

/**
 * Content status is the single most important gate in this product.
 *
 * Only `published` content may reach a learner. Every transition is
 * mechanical, recorded, and enforced by `ContentValidator`.
 */
export const contentStatusSchema = z.enum(['draft', 'reviewed', 'published', 'retired']);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const medicalReviewStatusSchema = z.enum([
  'provisional',
  'pending',
  'approved',
  'rejected',
]);
export type MedicalReviewStatus = z.infer<typeof medicalReviewStatusSchema>;

export const visualStatusSchema = z.enum(['provisional', 'pending', 'approved', 'rejected']);
export type VisualStatus = z.infer<typeof visualStatusSchema>;

export const licenseSchema = z.enum([
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'CC-BY-NC-4.0',
  'public_domain',
  'proprietary_permitted',
  'proprietary_restricted',
  'commissioned_owned',
  'UNSET',
]);
export type License = z.infer<typeof licenseSchema>;

/** Statuses that a learner may be shown in standard gameplay. */
export const LEARNER_VISIBLE_STATUSES: readonly ContentStatus[] = ['published'];

export function isLearnerVisible(status: ContentStatus): boolean {
  return LEARNER_VISIBLE_STATUSES.includes(status);
}

/** Statuses shown only when a developer explicitly enables draft content. */
export const PREVIEW_STATUSES: readonly ContentStatus[] = ['draft', 'reviewed'];

export function isPreviewVisible(status: ContentStatus): boolean {
  return isLearnerVisible(status) || PREVIEW_STATUSES.includes(status);
}

export const systemStatusSchema = z.enum(['planned', 'authoring', 'in_review', 'released', 'retired']);
export type SystemStatus = z.infer<typeof systemStatusSchema>;

export const structureTypeSchema = z.enum([
  'muscle',
  'muscle_group',
  'ligament',
  'bone',
  'organ',
  'vessel',
  'nerve',
]);
export type StructureType = z.infer<typeof structureTypeSchema>;

export const lateralitySchema = z.enum(['left', 'right', 'bilateral', 'midline', 'not_applicable']);
export type Laterality = z.infer<typeof lateralitySchema>;

export const difficultyTierSchema = z.enum(['introductory', 'intermediate', 'advanced']);
export type DifficultyTier = z.infer<typeof difficultyTierSchema>;
