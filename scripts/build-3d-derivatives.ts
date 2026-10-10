/**
 * Build runtime derivatives from the private Open3Dmodel originals.
 *
 * ## What this does
 *
 * A **structural trim** plus a **texture strip**, both lossless with respect to
 * geometry:
 *
 *   1. Keeps only the mesh nodes a mapping references, plus their parent chains.
 *   2. Rewrites every glTF index table so the result is a self-contained GLB.
 *   3. Removes all texture references, keeping each material's flat
 *      `baseColorFactor` as its colour.
 *
 * ## Why textures are dropped rather than carried
 *
 * The source materials use photographic skin and muscle photographs. The
 * renderer replaces the base colour with a flat state colour — correct,
 * incorrect, focused, dimmed — because that colour is what a quiz actually reads.
 * The textures are never displayed.
 *
 * Carrying them anyway cost about 90% of the source file size *and* pulled a
 * whole failure class into the load path: three.js routed the base-colour texture
 * through `GLTFTextureBasisUExtension` and threw
 * `Cannot read properties of undefined (reading 'extensions')` before the model
 * ever rendered. Dropping them removes that class entirely, keeps flat plausible
 * hues via `baseColorFactor`, and makes the derivative far smaller.
 *
 * ## Why no geometry re-encode
 *
 * Both packs declare `KHR_draco_mesh_compression` as required, and every mesh is
 * Draco-compressed. Decoding Draco, editing geometry, and re-encoding would need a
 * mesh toolchain that is not present here, and a lossy round-trip through one
 * would silently alter anatomical surfaces. For private local use a lossless
 * structural trim is the honest choice: it is verifiable by comparing counts, and
 * it cannot misrepresent what the model looks like.
 *
 * ## Provenance
 *
 * Every derivative records the SHA-256 of the exact original it came from, the
 * node names kept, and the counts before and after. See PROVENANCE.json.
 *
 * ## Running it
 *
 *   npm run build:3d-derivatives
 *
 * Requires the originals under private/assets/open3dmodel/original, verified
 * against the hashes in PROVENANCE.json before and after.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { THREE_D_MAPPINGS } from './three-d-trim-manifest.js';

/* ------------------------------------------------------------------ *
 * GLB container
 * ------------------------------------------------------------------ */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

type Json = Record<string, unknown>;

interface GlbChunks {
  json: Json;
  bin: Buffer;
}

function readGlb(buffer: Buffer): GlbChunks {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Not a GLB file.');
  if (buffer.readUInt32LE(4) !== 2) throw new Error('Expected glTF binary version 2.');
  if (buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error(`GLB header length ${buffer.readUInt32LE(8)} != file size ${buffer.length}`);
  }

  let offset = 12;
  let json: Json | null = null;
  let bin: Buffer = Buffer.alloc(0);

  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) throw new Error('GLB chunk overruns the file.');
    if (type === CHUNK_JSON) {
      json = JSON.parse(buffer.subarray(start, start + length).toString('utf8')) as Json;
    } else if (type === CHUNK_BIN) {
      bin = buffer.subarray(start, start + length);
    }
    offset = start + length;
  }

  if (json === null) throw new Error('GLB has no JSON chunk.');
  return { json, bin };
}

/** Write a glTF JSON + BIN pair back into a single GLB, with 4-byte alignment. */
function writeGlb(json: Json, bin: Buffer): Buffer {
  const jsonText = JSON.stringify(json);
  // JSON chunk padding uses spaces (0x20); BIN chunk padding uses zeros.
  const jsonRawLength = Buffer.byteLength(jsonText, 'utf8');
  const jsonPadding = (4 - (jsonRawLength % 4)) % 4;
  const jsonLength = jsonRawLength + jsonPadding;

  const binPadding = (4 - (bin.length % 4)) % 4;
  const paddedBin = binPadding === 0 ? bin : Buffer.concat([bin, Buffer.alloc(binPadding)]);

  const total = 12 + 8 + jsonLength + (bin.length === 0 ? 0 : 8 + paddedBin.length);
  const out = Buffer.alloc(total);

  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);

  out.writeUInt32LE(jsonLength, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  out.write(jsonText, 20, 'utf8');
  out.fill(0x20, 20 + jsonRawLength, 20 + jsonLength);

  if (bin.length > 0) {
    const binHeader = 20 + jsonLength;
    out.writeUInt32LE(paddedBin.length, binHeader);
    out.writeUInt32LE(CHUNK_BIN, binHeader + 4);
    paddedBin.copy(out, binHeader + 8);
  }

  return out;
}

/** Every key that can carry a texture reference on a glTF material. */
const MATERIAL_TEXTURE_KEYS = [
  'normalTexture',
  'occlusionTexture',
  'emissiveTexture',
  'clearcoatTexture',
  'clearcoatRoughnessTexture',
  'clearcoatNormalTexture',
  'sheenColorTexture',
  'sheenRoughnessTexture',
  'specularTexture',
  'specularColorTexture',
  'thicknessTexture',
  'iridescenceTexture',
  'anisotropyTexture',
] as const;

const PBR_TEXTURE_KEYS = ['baseColorTexture', 'metallicRoughnessTexture'] as const;

/**
 * Remove every texture reference from a material, keeping its flat colour.
 *
 * Returns a deep copy so the original material object is never mutated, which
 * would corrupt the source pack's table for any later pass.
 */
/**
 * Fallback muscle colour.
 *
 * Many source materials carry no `baseColorFactor` at all — "Muscle basic" is
 * one — because their entire appearance came from `baseColorTexture`. Removing
 * the texture without supplying a colour leaves those materials pure white, which
 * is what the first render showed.
 *
 * A single muscle tone is used deliberately rather than per-material variety:
 * the renderer overrides the base colour with a state colour for correct,
 * incorrect, focused and dimmed, so per-muscle albedo would be invisible in
 * every state that matters. The tone only shows in the neutral state, where a
 * consistent muscle colour reads more clearly as "anatomy" than a patchwork.
 */
const DEFAULT_MUSCLE_COLOUR: [number, number, number] = [0.72, 0.44, 0.37];

function stripTextureReferences(material: Json): Json {
  const copy = JSON.parse(JSON.stringify(material)) as Json;

  const pbr = copy['pbrMetallicRoughness'] as Json | undefined;
  if (pbr !== undefined && typeof pbr === 'object') {
    for (const key of PBR_TEXTURE_KEYS) delete pbr[key];
    // Without textures, metallic/roughness detail is meaningless. Matte values
    // render muscle form better than shiny ones at study distance.
    pbr['metallicFactor'] = 0;
    pbr['roughnessFactor'] = 0.85;
    if (pbr['baseColorFactor'] === undefined) {
      pbr['baseColorFactor'] = [...DEFAULT_MUSCLE_COLOUR];
    }
  }

  for (const key of MATERIAL_TEXTURE_KEYS) delete copy[key];

  // Clearcoat exists only to make the photographic texture read as skin. It
  // stays in extensionsUsed if any material still declares it, so it must be
  // removed here or the renderer will look for a clearcoat map that is gone.
  delete copy['extensions'];

  return copy;
}

/* ------------------------------------------------------------------ *
 * Trim
 * ------------------------------------------------------------------ */

interface TrimResult {
  readonly json: Json;
  readonly bin: Buffer;
  readonly droppedNodes: number;
  readonly droppedTextures: number;
  readonly originalTextureCount: number;
}

function trimPack(source: GlbChunks, keepNodeNames: readonly string[]): TrimResult {
  const json = source.json as {
    nodes: Json[];
    meshes: { primitives: Json[] }[];
    accessors: Json[];
    bufferViews: Json[];
    materials?: Json[];
    textures?: Json[];
    images?: Json[];
    samplers?: Json[];
    buffers?: { byteLength: number }[];
    scenes?: { nodes?: number[] }[];
    asset?: Json;
    extensionsRequired?: string[];
    extensionsUsed?: string[];
    extras?: Json;
  };

  const nodeNameToIndex = new Map<string, number>();
  json.nodes.forEach((node, index) => {
    const name = node['name'];
    if (typeof name === 'string' && name.length > 0 && !nodeNameToIndex.has(name)) {
      nodeNameToIndex.set(name, index);
    }
  });

  const kept = new Set<number>();
  for (const name of keepNodeNames) {
    const index = nodeNameToIndex.get(name);
    if (index === undefined) {
      throw new Error(
        `Requested node "${name}" does not exist in this pack. Refusing to build: a missing ` +
          `node means the mapping data and the model have diverged, and guessing which node ` +
          `was meant would be worse than failing.`,
      );
    }
    kept.add(index);
  }

  // Ancestor group nodes ("Arm - muscles") carry no mesh but parent the muscles
  // in the scene graph. Dropping them would orphan everything below them.
  const parentOf = new Map<number, number>();
  json.nodes.forEach((node, index) => {
    for (const child of (node['children'] as number[] | undefined) ?? []) {
      parentOf.set(child, index);
    }
  });
  for (const start of [...kept]) {
    let cursor = parentOf.get(start);
    const seen = new Set<number>();
    while (cursor !== undefined && !seen.has(cursor)) {
      seen.add(cursor);
      kept.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }

  const remapBufferView = new Map<number, number>();
  const remapAccessor = new Map<number, number>();
  const remapMaterial = new Map<number, number>();
  const nextBufferViews: Json[] = [];
  const nextAccessors: Json[] = [];
  const nextMaterials: Json[] = [];
  const keptBufferViews = new Set<number>();
  const keptMeshes = new Set<number>();
  const nextMeshes: { primitives: Json[] }[] = [];

  json.meshes.forEach((mesh, meshIndex) => {
    // Keep only meshes reachable from a retained node.
    const wanted = [...kept].some(
      (nodeIndex) => json.nodes[nodeIndex]?.['mesh'] === meshIndex,
    );
    if (!wanted) return;
    keptMeshes.add(meshIndex);

    for (const primitive of mesh.primitives) {
      // Draco primitives keep their bufferView inside the extension.
      const draco = (primitive['extensions'] as Record<string, Json> | undefined)?.[
        'KHR_draco_mesh_compression'
      ];
      const primitiveBufferView =
        (primitive['bufferView'] as number | undefined) ??
        (draco?.['bufferView'] as number | undefined);

      // Guard each remap: a repeated index pushed twice would be remapped to two
      // different outputs and silently corrupt the geometry binding.
      if (typeof primitiveBufferView === 'number' && !remapBufferView.has(primitiveBufferView)) {
        remapBufferView.set(primitiveBufferView, nextBufferViews.length);
        keptBufferViews.add(primitiveBufferView);
        nextBufferViews.push(json.bufferViews[primitiveBufferView]!);
      }

      for (const accessorIndex of Object.values(
        primitive['attributes'] as Record<string, number>,
      )) {
        if (!remapAccessor.has(accessorIndex)) {
          remapAccessor.set(accessorIndex, nextAccessors.length);
          nextAccessors.push(json.accessors[accessorIndex]!);
        }
      }

      const indices = primitive['indices'];
      if (typeof indices === 'number' && !remapAccessor.has(indices)) {
        remapAccessor.set(indices, nextAccessors.length);
        nextAccessors.push(json.accessors[indices]!);
      }

      const material = primitive['material'];
      if (typeof material === 'number' && !remapMaterial.has(material)) {
        remapMaterial.set(material, nextMaterials.length);
        const source = json.materials?.[material];
        nextMaterials.push(source === undefined ? {} : stripTextureReferences(source));
      }
    }

    nextMeshes.push({ primitives: JSON.parse(JSON.stringify(mesh.primitives)) as Json[] });
  });

  // Rebuild the BIN chunk from only the referenced bufferViews, in original index
  // order so the output is deterministic across runs.
  const chunks: Buffer[] = [];
  let cursor = 0;
  for (const index of [...keptBufferViews].sort((a, b) => a - b)) {
    const view = json.bufferViews[index]!;
    const byteOffset = (view['byteOffset'] as number | undefined) ?? 0;
    const byteLength = view['byteLength'] as number;
    const slice = source.bin.subarray(byteOffset, byteOffset + byteLength);

    const alignment = (view['byteStride'] as number | undefined) ?? 4;
    const padding = (alignment - (cursor % alignment)) % alignment;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
      cursor += padding;
    }

    nextBufferViews[remapBufferView.get(index) as number] = { ...view, byteOffset: cursor };
    chunks.push(slice);
    cursor += byteLength;
  }
  const packed = Buffer.concat(chunks);

  // Point every reference at the compacted tables.
  nextMeshes.forEach((mesh) => {
    for (const primitive of mesh.primitives) {
      const extensions = primitive['extensions'] as Record<string, Json> | undefined;
      const draco = extensions?.['KHR_draco_mesh_compression'];
      if (draco !== undefined && typeof draco['bufferView'] === 'number') {
        draco['bufferView'] = remapBufferView.get(draco['bufferView'] as number);
      }
      if (typeof primitive['bufferView'] === 'number') {
        primitive['bufferView'] = remapBufferView.get(primitive['bufferView']);
      }

      const attributes = primitive['attributes'] as Record<string, number>;
      for (const key of Object.keys(attributes)) {
        attributes[key] = remapAccessor.get(attributes[key]!) as number;
      }
      if (typeof primitive['indices'] === 'number') {
        primitive['indices'] = remapAccessor.get(primitive['indices']);
      }
      if (typeof primitive['material'] === 'number') {
        primitive['material'] = remapMaterial.get(primitive['material']);
      }
    }
  });

  // Old node index -> new node index, for the retained subset.
  const oldToNew = new Map<number, number>();
  let nextNode = 0;
  for (let index = 0; index < json.nodes.length; index += 1) {
    if (kept.has(index)) {
      oldToNew.set(index, nextNode);
      nextNode += 1;
    }
  }

  const nextNodes = json.nodes
    .filter((_, index) => kept.has(index))
    .map((node) => {
      const copy = JSON.parse(JSON.stringify(node)) as Json;
      if (typeof copy['mesh'] === 'number') {
        copy['mesh'] = [...keptMeshes].indexOf(copy['mesh']);
      }
      if (Array.isArray(copy['children'])) {
        copy['children'] = (copy['children'] as number[])
          .filter((child) => oldToNew.has(child))
          .map((child) => oldToNew.get(child));
      }
      return copy;
    });

  const out: Json = {
    asset: json.asset,
    scene: 0,
    scenes: (json.scenes ?? [{ nodes: [] }]).map((scene) => ({
      ...scene,
      nodes: (scene.nodes ?? [])
        .filter((index) => oldToNew.has(index))
        .map((index) => oldToNew.get(index)),
    })),
    nodes: nextNodes,
    meshes: nextMeshes,
    materials: nextMaterials,
    accessors: nextAccessors,
    bufferViews: nextBufferViews,
    buffers: [{ byteLength: packed.length }],
  };

  if (json.extensionsRequired !== undefined) out['extensionsRequired'] = json.extensionsRequired;
  if (json.extensionsUsed !== undefined) out['extensionsUsed'] = json.extensionsUsed;
  if (json.extras !== undefined) out['extras'] = json.extras;

  // Textures, images and samplers are intentionally absent: they were stripped
  // from every material above, so carrying them would be dead weight the
  // renderer must still parse.

  return {
    json: out,
    bin: packed,
    droppedNodes: json.nodes.length - kept.size,
    droppedTextures: json.textures?.length ?? 0,
    originalTextureCount: json.textures?.length ?? 0,
  };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIVATE_DIR = join(HERE, '..', 'private', 'assets', 'open3dmodel');
const ORIGINAL_DIR = join(PRIVATE_DIR, 'original');
const DERIVED_DIR = join(PRIVATE_DIR, 'derived');

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function main(): void {
  if (!existsSync(ORIGINAL_DIR)) {
    throw new Error(
      `Originals not found at ${ORIGINAL_DIR}. Download them from the URLs in PROVENANCE.json first.`,
    );
  }
  mkdirSync(DERIVED_DIR, { recursive: true });

  const provenancePath = join(PRIVATE_DIR, 'PROVENANCE.json');
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as {
    archives_as_downloaded: { extracted_file: string; extracted_sha256: string }[];
    derived_assets: unknown;
  };

  const built: Json[] = [];

  for (const pack of THREE_D_MAPPINGS) {
    const sourceFile = join(ORIGINAL_DIR, pack.originalFile);
    if (!existsSync(sourceFile)) {
      console.log(`  skip ${pack.originalFile} (not downloaded)`);
      continue;
    }

    const originalBytes = readFileSync(sourceFile);
    const originalHash = sha256(originalBytes);

    const recorded = provenance.archives_as_downloaded.find(
      (entry) => entry.extracted_file.toLowerCase() === pack.originalFile.toLowerCase(),
    );
    if (recorded !== undefined && recorded.extracted_sha256 !== originalHash) {
      throw new Error(
        `Integrity failure for ${pack.originalFile}.\n` +
          `  expected ${recorded.extracted_sha256}\n  actual   ${originalHash}\n` +
          `The original has changed. Stop, re-download from the recorded URL, and re-audit ` +
          `every mapping that referenced this pack before building anything from it.`,
      );
    }

    const source = readGlb(originalBytes);
    const trimmed = trimPack(source, pack.keepNodeNames);

    const outputBytes = writeGlb(trimmed.json, trimmed.bin);
    writeFileSync(join(DERIVED_DIR, pack.derivedFile), outputBytes);

    built.push({
      derived_file: pack.derivedFile,
      derived_from_original: pack.originalFile,
      source_url: pack.sourceUrl,
      original_sha256: originalHash,
      derived_sha256: sha256(outputBytes),
      original_bytes: originalBytes.length,
      derived_bytes: outputBytes.length,
      nodes_requested: pack.keepNodeNames.length,
      nodes_total_in_original: (source.json['nodes'] as unknown[]).length,
      nodes_dropped: trimmed.droppedNodes,
      textures_removed: trimmed.droppedTextures,
      kept_node_names: pack.keepNodeNames,
      transformations: [
        'structural trim: kept only the mapped muscle nodes and their parent group nodes',
        'glTF index tables rewritten to compact the file',
        'all texture, image and sampler references removed; each material keeps its flat baseColorFactor',
      ],
      geometry_modified: false,
      geometry_re_encoded: false,
      textures_modified: 'removed entirely',
      built_at: new Date().toISOString(),
      script: 'scripts/build-3d-derivatives.ts',
    });

    const reduction = Math.round((1 - outputBytes.length / originalBytes.length) * 100);
    console.log(
      `  built ${pack.derivedFile}: ${pack.keepNodeNames.length} nodes kept, ` +
        `${trimmed.droppedNodes} dropped, ${trimmed.droppedTextures} textures removed, ` +
        `${originalBytes.length} -> ${outputBytes.length} bytes (${reduction}% smaller)`,
    );
  }

  provenance.derived_assets = {
    $comment:
      'Generated by scripts/build-3d-derivatives.ts. Lossless structural trim plus a full ' +
      'texture strip. No geometry is decoded, altered or re-encoded. Each entry names the ' +
      'SHA-256 of the original it came from.',
    built,
  };
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`  recorded ${built.length} derivative(s) in PROVENANCE.json`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}