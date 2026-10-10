#!/usr/bin/env tsx
/**
 * Content validation CLI.
 *
 * Run with: npm run validate:content
 *
 * Exits non-zero when content is invalid, so it can gate a commit or a release.
 *
 * Two outcomes are treated as *correct and expected* rather than as failures:
 *
 * 1. Zero published structures, because `sources.json` is empty. No qualified
 *    anatomy reviewer has signed off yet, so nothing is publishable. The CLI
 *    says so plainly instead of leaving a developer to guess.
 * 2. Unset asset licences, while the project still carries placeholder artwork.
 *
 * Both become errors the moment the corresponding human review or licence
 * verification actually happens.
 */

import { validateContent } from '../src/features/content/validation/ContentValidator.ts';
import { resolveBuildFlags } from '../src/config/build-flags.ts';

import systemFile from '../src/data/systems/muscular/anatomy-system.json';
import regionsFile from '../src/data/systems/muscular/regions.json';
import structuresFile from '../src/data/systems/muscular/structures.json';
import visualMappingsFile from '../src/data/systems/muscular/visual-mappings.json';
import questionTemplatesFile from '../src/data/systems/muscular/question-templates.json';
import sourcesFile from '../src/data/systems/muscular/sources.json';
import assetManifestFile from '../src/data/manifests/asset-manifest.json';
import threeDMappingsFile from '../src/data/systems/muscular/three-d-visual-mappings.json';
import threeDPackManifestFile from '../src/models/open3dmodel/muscular-3d-pack.manifest.json';

const flags = resolveBuildFlags({
  MODE: process.env['MODE'] ?? 'development',
  PROD: false,
  VITE_ALLOW_DRAFT_CONTENT: process.env['VITE_ALLOW_DRAFT_CONTENT'] ?? 'true',
  VITE_PROVISIONAL_ART: process.env['VITE_PROVISIONAL_ART'] ?? 'true',
});

const report = validateContent(
  {
    systemFile,
    regionsFile,
    structuresFile,
    visualMappingsFile,
    questionTemplatesFile,
    sourcesFile,
    assetManifestFile,
    threeDMappingsFile,
    threeDPackManifestFile,
  },
  { provisionalArt: flags.PROVISIONAL_ART, allowDraftContent: flags.ALLOW_DRAFT_CONTENT },
);

const line = '─'.repeat(72);
const out = process.stdout;

out.write(`\n${line}\n  Muscle Atlas — content validation\n${line}\n`);
out.write(
  `  pack              1.0.0\n` +
    `  provisional art   ${flags.PROVISIONAL_ART ? 'YES (placeholder geometry)' : 'no'}\n` +
    `  draft content     ${flags.ALLOW_DRAFT_CONTENT ? 'allowed in this build' : 'forbidden in this build'}\n\n`,
);

out.write(
  `  systems ${report.stats.systems}   structures ${report.stats.structures}   ` +
    `mappings ${report.stats.mappings} (${report.stats.selectableMappings} selectable)\n` +
    `  published ${report.stats.published}   reviewed ${report.stats.reviewed}   ` +
    `draft ${report.stats.draft}   retired ${report.stats.retired}\n` +
    `  sources ${report.stats.sources}   approved assets ${report.stats.approvedAssets}\n\n`,
);

if (report.warnings.length > 0) {
  out.write(`  Warnings (${report.warnings.length})\n`);
  for (const warning of report.warnings) {
    out.write(`    · [${warning.rule}] ${warning.path}\n      ${warning.message}\n`);
  }
  out.write('\n');
}

if (report.errors.length > 0) {
  out.write(`  Errors (${report.errors.length})\n`);
  for (const error of report.errors) {
    out.write(`    ! [${error.rule}] ${error.path}\n      ${error.message}\n`);
  }
  out.write('\n');
}

if (report.blockingReason !== null) {
  out.write(`  Not publishable yet\n    ${report.blockingReason}\n\n`);
}

if (report.ok) {
  out.write('  Result: VALID\n\n');
  process.exit(0);
}

out.write(`  Result: INVALID — ${report.errors.length} error(s)\n\n`);
process.exit(1);
