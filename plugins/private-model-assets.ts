/**
 * Vite plugin: serve private local 3D model assets, never copy them into a build.
 *
 * ## The rule this enforces
 *
 * Model binaries must never end up in `dist/`. Muscle Atlas is for private local
 * use and is not published, and the model is CC BY-SA licensed content that is not
 * cleared for redistribution. Copying a 3D asset into a build output is exactly
 * the kind of accident that turns private use into distribution.
 *
 * So the files are served *only* by the dev and preview servers, from outside
 * `public/`, and never emitted into a build. There is no build flag that turns
 * this on, because there should not be one.
 *
 * ## Why a plugin and not `publicDir`
 *
 * `public/` is copied verbatim into `dist/`. Anything placed there ships. Serving
 * from `private/` through middleware keeps the files out of every build by
 * construction rather than by convention.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Connect, Plugin } from 'vite';
import type { ServerResponse } from 'node:http';

const PRIVATE_MODEL_ROOT = resolve(process.cwd(), 'private', 'assets', 'open3dmodel', 'derived');
const MOUNT_PATH = '/private-models';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.json': 'application/json',
};

export function privateModelAssets(): Plugin {
  const serve = (req: Connect.IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url === undefined || !req.url.startsWith(MOUNT_PATH)) {
      next();
      return;
    }

    const requested = decodeURIComponent(req.url.slice(MOUNT_PATH.length).split('?')[0] ?? '');
    // Resolve and confirm the result is still inside the root. Without this a
    // crafted path could read arbitrary files from the filesystem.
    const filePath = normalize(join(PRIVATE_MODEL_ROOT, requested));
    if (!filePath.startsWith(PRIVATE_MODEL_ROOT + sep) && filePath !== PRIVATE_MODEL_ROOT) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      // 404 rather than the dev server's index.html fallback, so a missing model
      // surfaces as a load error the app can explain instead of a parse error.
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'model-not-found', path: requested }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(filePath).pipe(res);
  };

  return {
    name: 'muscle-atlas:private-model-assets',
    apply: () => true,
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}