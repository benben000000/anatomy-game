import { z } from 'zod';
import { assetIdSchema, contentVersionSchema, systemIdSchema } from '@/domain/anatomy/ids';
import { licenseSchema, medicalReviewStatusSchema } from '@/domain/content/content-status';

/**
 * Provenance for an educational claim or for an asset.
 *
 * `sources.json` ships empty during development. Inventing plausible-looking
 * citations would be worse than having none: a fabricated citation in a study
 * aid is a fabrication the learner cannot detect, and it undermines every real
 * citation beside it. See docs/05-content-review-workflow.md.
 */

/** ISO calendar date, `YYYY-MM-DD`. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date, YYYY-MM-DD');

export const sourceReferenceSchema = z
  .object({
    source_id: z.string().min(1),
    title: z.string().min(3).max(300),
    author_or_organization: z.string().min(2).max(200),
    edition_or_version: z.string().max(120).nullable().default(null),
    publication_year: z.number().int().min(1800).max(2200).nullable().default(null),
    url_or_library_reference: z.string().min(3).max(600),
    accessed_date: isoDateSchema.nullable().default(null),
    license_notes: z.string().max(600).nullable().default(null),
    content_scope: z.string().min(3).max(400),
    reviewer_name: z.string().min(2).max(160).nullable().default(null),
    reviewer_credentials: z.string().max(200).nullable().default(null),
    review_date: isoDateSchema.nullable().default(null),
  })
  .superRefine((source, ctx) => {
    // A named reviewer without a date is not a review.
    if (source.reviewer_name && !source.review_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['review_date'],
        message: `Source "${source.source_id}" names a reviewer but has no review date.`,
      });
    }
    if (source.review_date && !source.reviewer_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reviewer_name'],
        message: `Source "${source.source_id}" records a review date but no reviewer.`,
      });
    }
  });

export type SourceReference = z.infer<typeof sourceReferenceSchema>;

export const sourcesFileSchema = z.object({
  $schema: z.string().optional(),
  sources: z.array(sourceReferenceSchema),
});

export const assetManifestEntrySchema = z.object({
  asset_id: assetIdSchema,
  file_path: z.string().min(3),
  asset_type: z.enum(['svg', 'png', 'webp', 'woff2', 'glb', 'gltf', 'mp3', 'ogg']),
  associated_system_id: systemIdSchema.nullable().default(null),
  associated_structure_id: z.string().nullable().default(null),

  source_creator: z.string().min(2).max(200),
  source_url_or_reference: z.string().min(3).max(600),
  license: licenseSchema,
  attribution_requirement: z.string().max(600).nullable().default(null),
  modification_notes: z.string().max(600).nullable().default(null),

  medical_review_status: medicalReviewStatusSchema,
  reviewer: z.string().max(160).nullable().default(null),
  review_date: isoDateSchema.nullable().default(null),

  content_version: contentVersionSchema,
});

export type AssetManifestEntry = z.infer<typeof assetManifestEntrySchema>;

export const assetManifestSchema = z.object({
  $schema: z.string().optional(),
  content_version: contentVersionSchema,
  entries: z.array(assetManifestEntrySchema),
});

export const contentPackManifestSchema = z.object({
  pack_id: systemIdSchema,
  pack_version: contentVersionSchema,
  built_at: z.string().min(4),
  structure_count: z.number().int().min(0),
  published_structure_count: z.number().int().min(0),
  views: z.array(z.string()),
  regions: z.array(z.string()),
  asset_ids: z.array(assetIdSchema),
  files: z.array(
    z.object({
      path: z.string(),
      bytes: z.number().int().nonnegative().optional(),
      sha256: z.string().length(64).optional(),
    }),
  ),
  content_status_summary: z.object({
    draft: z.number().int().min(0),
    reviewed: z.number().int().min(0),
    published: z.number().int().min(0),
    retired: z.number().int().min(0),
  }),
});

export type ContentPackManifest = z.infer<typeof contentPackManifestSchema>;

export function isValidLicenceForRelease(license: z.infer<typeof licenseSchema>): boolean {
  return license !== 'UNSET' && license !== 'proprietary_restricted';
}
