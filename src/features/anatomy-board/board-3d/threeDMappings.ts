import { modelPackManifestSchema, threeDMappingsFileSchema } from '@/domain/anatomy/three-d-mapping';
import rawMappings from '@/data/systems/muscular/three-d-visual-mappings.json';
import rawPackManifest from '@/models/open3dmodel/muscular-3d-pack.manifest.json';

/**
 * Typed access to 3D mapping and pack data.
 *
 * Parsed once at module load so a malformed mapping file fails loudly at build
 * time rather than at the moment a learner opens 3D. A parse failure is not
 * swallowed: it means the content pipeline is broken.
 */

export const threeDMappingsFile = threeDMappingsFileSchema.parse(rawMappings);

export const modelPackManifest = modelPackManifestSchema.parse({
  content_version: rawPackManifest.content_version,
  source_project: rawPackManifest.source_project,
  packs: rawPackManifest.packs.map((pack) => ({
    model_pack_id: pack.model_pack_id,
    display_name: pack.display_name,
    asset_path: pack.asset_path,
    size_bytes: pack.size_bytes,
    approx_triangles: pack.approx_triangles,
    mesh_count: pack.mesh_count,
    requires_draco: pack.requires_draco,
    integration_status: pack.integration_status,
    blocking_reason: pack.blocking_reason,
  })),
});

/** Mappings grouped by pack, for per-pack auditing. */
export function mappingsForPack(packId: string) {
  return threeDMappingsFile.mappings.filter((mapping) => mapping.model_pack_id === packId);
}

/**
 * Structures that must never become blind quiz questions in 3D.
 *
 * Soleus is largely hidden behind gastrocnemius from the only posterior view
 * these packs provide, so asking "find the soleus" would test whether the learner
 * can guess an invisible structure. It stays visible and inspectable — removing
 * it entirely would misrepresent the model — but it is never generated as a
 * question without an explicit explanation.
 */
export const INSPECT_ONLY_STRUCTURE_IDS = ['muscular.soleus'] as const;

/** Human-readable reason, shown in the UI when an inspect-only muscle is selected. */
export const INSPECT_ONLY_REASONS: Readonly<Record<string, string>> = {
  'muscular.soleus':
    'Soleus sits underneath gastrocnemius from behind, which is the only posterior view ' +
    'these model packs provide. It cannot be fairly pointed at, so it is shown for ' +
    'inspection only and is not used as a blind question.',
};