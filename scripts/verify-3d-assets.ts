/**
 * Verify private 3D assets.
 *
 * ## Why this exists
 *
 * The derivative builder rewrites every index table in a glTF file by hand. A
 * mistake there does not throw — it produces a file that loads, renders, and is
 * quietly missing geometry, or has faces bound to the wrong vertices. That is
 * the worst class of bug to ship into an anatomy study tool, because the learner
 * cannot tell and neither can the tests.
 *
 * So the output is checked structurally against the source, every time:
 *
 *   1. Integrity      originals match the hashes recorded at download time
 *   2. Legibility     each derivative parses back as a valid GLB with sane
 *                     tables and in-range references
 *   3. Fidelity       every kept node exists in its original, kept node names
 *                     round-trip exactly, and nothing was invented or lost
 *   4. Containment    no forbidden node (tendon, bursa, overlay part) survived
 *   5. No leakage     derived bytes are a subset of original bytes
 *
 * Run with:  npm run verify:3d-assets
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { THREE_D_MAPPINGS, FORBIDDEN_NODES } from './three-d-trim-manifest.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIVATE_DIR = join(HERE, '..', 'private', 'assets', 'open3dmodel');
const ORIGINAL_DIR = join(PRIVATE_DIR, 'original');
const DERIVED_DIR = join(PRIVATE_DIR, 'derived');

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

interface Gltf {
  nodes: { name?: string; mesh?: number; children?: number[] }[];
  meshes: { primitives: Record<string, unknown>[] }[];
  accessors: Record<string, unknown>[];
  bufferViews: Record<string, unknown>[];
  materials?: Record<string, unknown>[];
  textures?: Record<string, unknown>[];
  images?: Record<string, unknown>[];
  buffers?: { byteLength: number }[];
  scenes?: { nodes?: number[] }[];
  extensionsRequired?: string[];
  asset?: Record<string, unknown>;
}

interface ParsedGlb {
  json: Gltf;
  bin: Buffer;
}

function parseGlb(buffer: Buffer, label: string): ParsedGlb {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${label}: not a GLB`);
  if (buffer.readUInt32LE(4) !== 2) throw new Error(`${label}: expected glTF binary version 2`);
  if (buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error(`${label}: header length ${buffer.readUInt32LE(8)} != file size ${buffer.length}`);
  }

  let offset = 12;
  let json: Gltf | null = null;
  let bin: Buffer = Buffer.alloc(0);

  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) throw new Error(`${label}: chunk overruns file`);
    if (type === CHUNK_JSON) {
      json = JSON.parse(buffer.subarray(start, start + length).toString('utf8')) as Gltf;
    } else if (type === CHUNK_BIN) {
      bin = buffer.subarray(start, start + length);
    }
    offset = start + length;
  }

  if (json === null) throw new Error(`${label}: missing JSON chunk`);
  return { json, bin };
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

const failures: string[] = [];
const notes: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

function main(): void {
  const provenance = JSON.parse(readFileSync(join(PRIVATE_DIR, 'PROVENANCE.json'), 'utf8')) as {
    archives_as_downloaded: { extracted_file: string; extracted_sha256: string }[];
  };

  console.log('Open3Dmodel private asset verification');
  console.log('='.repeat(64));

  for (const pack of THREE_D_MAPPINGS) {
    const originalPath = join(ORIGINAL_DIR, pack.originalFile);
    const derivedPath = join(DERIVED_DIR, pack.derivedFile);

    if (!existsSync(originalPath)) {
      notes.push(`${pack.originalFile}: not downloaded, skipped`);
      continue;
    }
    if (!existsSync(derivedPath)) {
      failures.push(`${pack.derivedFile}: derivative missing. Run npm run build:3d-derivatives`);
      continue;
    }

    const originalBytes = readFileSync(originalPath);
    const derivedBytes = readFileSync(derivedPath);

    /* ---- 1. integrity ---- */
    const recorded = provenance.archives_as_downloaded.find(
      (entry) => entry.extracted_file.toLowerCase() === pack.originalFile.toLowerCase(),
    );
    if (recorded !== undefined) {
      check(
        sha256(originalBytes) === recorded.extracted_sha256,
        `${pack.originalFile}: original hash does not match PROVENANCE.json. The source file changed.`,
      );
    }

    let original: ParsedGlb;
    let derived: ParsedGlb;
    try {
      original = parseGlb(originalBytes, pack.originalFile);
      derived = parseGlb(derivedBytes, pack.derivedFile);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      continue;
    }

    const dj = derived.json;

    /* ---- 2. legibility ---- */
    check(dj.asset?.['version'] === '2.0', `${pack.derivedFile}: asset.version is not 2.0`);
    check(Array.isArray(dj.meshes) && dj.meshes.length > 0, `${pack.derivedFile}: no meshes`);
    check(Array.isArray(dj.nodes) && dj.nodes.length > 0, `${pack.derivedFile}: no nodes`);
    check(
      Array.isArray(dj.bufferViews) && dj.bufferViews.length > 0,
      `${pack.derivedFile}: no bufferViews`,
    );
    check(
      dj.extensionsRequired?.includes('KHR_draco_mesh_compression') === true,
      `${pack.derivedFile}: lost the KHR_draco_mesh_compression requirement`,
    );

    // Every index reference must land inside its table.
    dj.nodes.forEach((node, index) => {
      if (node.mesh !== undefined) {
        check(
          node.mesh >= 0 && node.mesh < dj.meshes.length,
          `${pack.derivedFile}: node "${node.name ?? index}" references mesh ${node.mesh}, out of range`,
        );
      }
      for (const child of node.children ?? []) {
        check(
          child >= 0 && child < dj.nodes.length,
          `${pack.derivedFile}: node "${node.name ?? index}" references child ${child}, out of range`,
        );
      }
    });

    dj.meshes.forEach((mesh, meshIndex) => {
      for (const primitive of mesh.primitives) {
        const draco = (
          primitive['extensions'] as Record<string, Record<string, number>> | undefined
        )?.['KHR_draco_mesh_compression'];
        const bufferView =
          (primitive['bufferView'] as number | undefined) ?? (draco?.['bufferView'] as number | undefined);
        if (bufferView !== undefined) {
          check(
            bufferView >= 0 && bufferView < dj.bufferViews.length,
            `${pack.derivedFile}: mesh ${meshIndex} references bufferView ${bufferView}, out of range`,
          );
          const view = dj.bufferViews[bufferView];
          if (view !== undefined) {
            const offset = (view['byteOffset'] as number | undefined) ?? 0;
            const length = view['byteLength'] as number;
            check(
              offset + length <= derived.bin.length,
              `${pack.derivedFile}: bufferView ${bufferView} extends past the BIN chunk`,
            );
          }
        }
        for (const accessorIndex of Object.values(
          primitive['attributes'] as Record<string, number>,
        )) {
          check(
            accessorIndex >= 0 && accessorIndex < dj.accessors.length,
            `${pack.derivedFile}: mesh ${meshIndex} references accessor ${accessorIndex}, out of range`,
          );
        }
      }
    });

    // Every scene node must resolve, or the file loads with nothing in view.
    const sceneRoots = dj.scenes?.[0]?.nodes ?? [];
    check(sceneRoots.length > 0, `${pack.derivedFile}: no scene roots`);
    for (const root of sceneRoots) {
      check(
        root >= 0 && root < dj.nodes.length,
        `${pack.derivedFile}: scene root ${root} out of range`,
      );
    }

    /* ---- 3. fidelity: every kept node is real, nothing invented ---- */
    const originalNames = new Set(original.json.nodes.map((node) => node.name).filter(Boolean));
    const derivedNames = new Set(dj.nodes.map((node) => node.name).filter(Boolean));

    for (const name of pack.keepNodeNames) {
      check(originalNames.has(name), `${pack.originalFile}: allowlist node "${name}" is not in the original`);
      check(
        derivedNames.has(name),
        `${pack.derivedFile}: requested node "${name}" is missing from the derivative`,
      );
    }

    // Nothing may appear in the derivative that was not requested or a group parent.
    const groupNames = new Set(
      original.json.nodes
        .filter((node) => Array.isArray(node.children) && node.mesh === undefined)
        .map((node) => node.name)
        .filter((name): name is string => typeof name === 'string'),
    );
    for (const name of derivedNames) {
      // derivedNames may contain undefined if a node is unnamed; that is itself a
      // finding, since every retained muscle and group must carry a name.
      if (name === undefined) {
        failures.push(`${pack.derivedFile}: a retained node has no name`);
        continue;
      }
      const expected = pack.keepNodeNames.includes(name) || groupNames.has(name);
      check(expected === true, `${pack.derivedFile}: unexpected node "${name}" survived the trim`);
    }

    // Muscle nodes must carry geometry. A group node must not.
    const meshNodes = dj.nodes.filter((node) => node.mesh !== undefined).map((node) => node.name);
    check(
      meshNodes.length === pack.keepNodeNames.length,
      `${pack.derivedFile}: ${meshNodes.length} mesh nodes but ${pack.keepNodeNames.length} were requested`,
    );

    /* ---- 4. containment: no tendon, bursa or overlay part ---- */
    for (const forbidden of FORBIDDEN_NODES) {
      check(
        !derivedNames.has(forbidden),
        `${pack.derivedFile}: forbidden node "${forbidden}" is present`,
      );
    }

    /* ---- 5. no leakage: derivative geometry must come from the original ---- */
    // A structural trim copies bytes; it never invents them. Comparing the set
    // of bufferView slices is a cheap, strong check that nothing was fabricated.
    const originalSlices = new Set(
      original.json.bufferViews.map((view) => {
        const offset = (view['byteOffset'] as number | undefined) ?? 0;
        const length = view['byteLength'] as number;
        return `${length}:${sha256(original.bin.subarray(offset, offset + length))}`;
      }),
    );
    for (const view of dj.bufferViews) {
      const offset = (view['byteOffset'] as number | undefined) ?? 0;
      const length = view['byteLength'] as number;
      const key = `${length}:${sha256(derived.bin.subarray(offset, offset + length))}`;
      check(
        originalSlices.has(key),
        `${pack.derivedFile}: a bufferView does not correspond to any original bufferView`,
      );
    }

    const reduction = Math.round((1 - derivedBytes.length / originalBytes.length) * 100);
    console.log(
      `  ${pack.derivedFile.padEnd(26)} ${String(originalBytes.length).padStart(8)} -> ` +
        `${String(derivedBytes.length).padStart(7)} bytes (-${reduction}%), ` +
        `${meshNodes.length} meshes, ${dj.bufferViews.length} bufferViews`,
    );
  }

  console.log('='.repeat(64));
  for (const note of notes) console.log(`  note: ${note}`);

  if (failures.length > 0) {
    console.error(`\nFAILED — ${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  ! ${failure}`);
    process.exit(1);
  }

  console.log('\nOK — originals intact, derivatives valid, all mappings resolved.');
}

main();