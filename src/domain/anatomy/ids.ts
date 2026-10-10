import { z } from 'zod';

/**
 * Stable identifiers.
 *
 * Display names are never identifiers. Every cross-reference between content,
 * visual mapping and learning logic uses a branded string, so a `StructureId`
 * cannot be passed where a `VisualId` is expected — a class of bug that is
 * otherwise very easy to introduce and very hard to find.
 *
 * Brand parameters come from Zod's own `.brand()` so no unchecked casts are
 * needed: a value of the branded type can only be produced by parsing.
 */

const ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

const brandedId = <B extends string>(description: string) =>
  z
    .string()
    .min(1)
    .regex(ID_PATTERN, `${description} must be lower_snake_case dot-separated, e.g. region.upper_limb.arm`)
    .brand<B>();

export const systemIdSchema = brandedId<'SystemId'>('system_id');
export const structureIdSchema = brandedId<'StructureId'>('structure_id');
export const visualIdSchema = brandedId<'VisualId'>('visual_id');
export const regionIdSchema = brandedId<'RegionId'>('region_id');
export const viewIdSchema = brandedId<'ViewId'>('view_id');
export const layerIdSchema = brandedId<'LayerId'>('layer_id');
export const questionIdSchema = brandedId<'QuestionId'>('question_id');
export const templateIdSchema = brandedId<'TemplateId'>('template_id');
export const sourceIdSchema = brandedId<'SourceId'>('source_id');
export const assetIdSchema = brandedId<'AssetId'>('asset_id');
export const profileIdSchema = brandedId<'ProfileId'>('profile_id');
export const sessionIdSchema = brandedId<'SessionId'>('session_id');

export type SystemId = z.infer<typeof systemIdSchema>;
export type StructureId = z.infer<typeof structureIdSchema>;
export type VisualId = z.infer<typeof visualIdSchema>;
export type RegionId = z.infer<typeof regionIdSchema>;
export type ViewId = z.infer<typeof viewIdSchema>;
export type LayerId = z.infer<typeof layerIdSchema>;
export type QuestionId = z.infer<typeof questionIdSchema>;
export type TemplateId = z.infer<typeof templateIdSchema>;
export type SourceId = z.infer<typeof sourceIdSchema>;
export type AssetId = z.infer<typeof assetIdSchema>;
export type ProfileId = z.infer<typeof profileIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;

/**
 * Semantic version of a content pack. Compared, never parsed loosely, so a pack
 * downgrade can be detected.
 */
export const contentVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'content_version must be semver, e.g. 1.0.0')
  .brand<'ContentVersion'>();

export type ContentVersion = z.infer<typeof contentVersionSchema>;

export function compareContentVersions(a: ContentVersion, b: ContentVersion): number {
  const parse = (value: ContentVersion): number[] =>
    value.split('.').map((part) => Number.parseInt(part, 10));
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l !== r) return l - r;
  }
  return 0;
}

/** Regions, views and layers are declared once in the content pack and validated here. */
export const VIEW_IDS = {
  anterior: viewIdSchema.parse('anterior'),
  posterior: viewIdSchema.parse('posterior'),
} as const;

export const LAYER_IDS = {
  superficial: layerIdSchema.parse('layer.superficial'),
} as const;

export type ViewIdLiteral = keyof typeof VIEW_IDS;
