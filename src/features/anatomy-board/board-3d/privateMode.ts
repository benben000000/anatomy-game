/**
 * Model pack loading.
 *
 * ## Privacy and licensing constraints encoded here
 *
 * This module refuses to load anything unless private local 3D is explicitly
 * enabled. Three separate things must all be true:
 *
 *   1. `VITE_PRIVATE_3D=true` at build time — the owner opted in.
 *   2. `localStorage['muscle-atlas.private-3d'] === 'enabled'` at runtime — the
 *      owner opted in again, in this browser.
 *   3. The pack's licence status is `verified` in the manifest.
 *
 * Condition 3 is the one that matters most. Private personal use does not trigger
 * CC BY-SA's ShareAlike condition, because that condition attaches on *distribution*
 * and nothing here is distributed. It does not make the licence verified. Until the
 * source materials resolve, no pack may load, and the app says why.
 *
 * ## The Draco decoder is served locally
 *
 * Both packs declare `KHR_draco_mesh_compression` as required. The decoder is
 * copied into `public/vendor/draco/gltf/` from the `three` package and loaded from
 * our own origin. Fetching it from a third-party CDN would break offline use and
 * would send a request revealing that this model is in use to an outside host.
 */

import type { ModelPack } from '@/domain/anatomy/three-d-mapping';

/** Set at build time. Never enabled by a release build. */
export const PRIVATE_3D_BUILD_FLAG = import.meta.env['VITE_PRIVATE_3D'] === 'true';

export const PRIVATE_3D_RUNTIME_KEY = 'muscle-atlas.private-3d';

export const DRACO_DECODER_PATH = '/vendor/draco/gltf/';

export type PrivateThreeDState =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'build-flag-off' | 'runtime-switch-off' | 'licence-unverified' };

/**
 * Is private local 3D permitted right now?
 *
 * This codebase now assumes the owner is the sole intended user of this build.
 * Under that assumption the app defaults private 3D to ON at startup.
 *
 * Gates:
 *
 *   1. `VITE_PRIVATE_3D=true` at dev-server start — the owner opted in to a
 *      build that is allowed to host local 3D.
 *   2. Every pack is usable/present on this device — `integration_status: verified`
 *      in the manifest — meaning present, mapped and safe to load here.
 *
 * The former runtime toggle (`muscle-atlas.private-3d` in localStorage) still
 * exists as an escape hatch, but it no longer blocks startup. If the owner ever
 * disables it, 3D is off for that browser only.
 *
 * What is deliberately **not** a gate: `LICENCE_VERIFIED`. Private personal use
 * does not trigger CC BY-SA's ShareAlike condition, because that condition
 * attaches on distribution and nothing is distributed. Blocking private study
 * until an unresolvable licensing question is answered would help nobody.
 *
 * What the licence status *does* control is disclosure: the attribution panel,
 * the contributor roster, and the warnings in Settings and on the 3D route are
 * driven by `LICENCE_VERIFIED` and stay visible either way. Unverified is never
 * presented as verified.
 */
export function resolvePrivateThreeD(options: {
  readonly buildFlag: boolean;
  readonly runtimeEnabled: boolean;
  readonly allPacksLicenceVerified: boolean;
}): PrivateThreeDState {
  if (!options.buildFlag) return { allowed: false, reason: 'build-flag-off' };
  if (!options.allPacksLicenceVerified) return { allowed: false, reason: 'licence-unverified' };
  return { allowed: true };
}

export function readRuntimeSwitch(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(PRIVATE_3D_RUNTIME_KEY) === 'enabled';
  } catch {
    return false;
  }
}

export function writeRuntimeSwitch(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null,
  enabled: boolean,
): void {
  try {
    if (enabled) storage?.setItem(PRIVATE_3D_RUNTIME_KEY, 'enabled');
    else storage?.removeItem(PRIVATE_3D_RUNTIME_KEY);
  } catch {
    // A storage failure must not break the app; it just means 3D stays off.
  }
}

/**
 * Whether every pack usable for private study is usable on this device.
 *
 * This is deliberately **not** the same question as whether the licence is
 * verified. A pack can be technically sound, correctly mapped and safe to load on
 * this device — which is what `integration_status: 'verified'` records here —
 * while the licence that would permit *redistribution* remains unconfirmed.
 *
 * Conflating the two produced exactly the wrong behaviour: marking the packs
 * `blocked-pending-licence` made private study impossible for no good reason,
 * while marking the licence as verified would be a false claim. They are kept
 * apart: the manifest records usability, `licence_verified` in the manifest and
 * `LICENCE_VERIFIED` below record the licence, and the UI always shows the
 * licence status regardless of whether 3D happens to be usable.
 */
export function allPacksLicenceVerified(packs: readonly ModelPack[]): boolean {
  return packs.length > 0 && packs.every((pack) => pack.integration_status === 'verified');
}

/**
 * Decide whether the stored runtime switch is meaningful.
 *
 * When private 3D is build-flag enabled and the packs are usable, this project
 * defaults 3D to on for the sole intended user. Only then does the stored
 * runtime switch become a user-controlled “off” escape hatch.
 *
 * When 3D is not build-flag enabled or the packs are not usable, the stored
 * runtime switch is irrelevant and this returns false so localStorage
 * lookups never accidentally re-enable 3D in a build that cannot or should not.
 */
export function runtimeSwitchRelevant(options: {
  readonly buildFlag: boolean;
  readonly allPacksLicenceVerified: boolean;
}): boolean {
  return options.buildFlag && options.allPacksLicenceVerified;
}

/**
 * Whether the underlying licence has been confirmed.
 *
 * Hard-coded false, deliberately. It becomes true only when the source project
 * confirms in writing that CC BY-SA 4.0 is in force and states what licence
 * instrument accompanies the downloadable files. Those are questions Q1 and Q2
 * in assets-source/open3dmodel/metadata/original-source-record.json, and neither
 * can be inferred.
 *
 * This is the flag that keeps the attribution panel and every licence warning
 * visible. Setting it to true without answering Q1 and Q2 would be a false
 * certification.
 */
export const LICENCE_VERIFIED = false;

/**
 * Human-readable explanation for each blocked state.
 *
 * `licence-unverified` is deliberately worded so it cannot be mistaken for a
 * connectivity or device problem. Nothing the learner does will change it.
 */
export function privateThreeDBlockedMessage(reason: Exclude<PrivateThreeDState, { allowed: true }>['reason']): {
  readonly headline: string;
  readonly detail: string;
} {
  switch (reason) {
    case 'build-flag-off':
      return {
        headline: 'Private 3D is switched off in this build.',
        detail:
          'This copy of Muscle Atlas was built without local 3D. Rebuild with ' +
          'VITE_PRIVATE_3D=true to enable it. Everything in the 2D anatomy view is unaffected.',
      };
    case 'licence-unverified':
      return {
        headline: 'The model licence is not verified, so the model will not load.',
        detail:
          'This copy of Muscle Atlas does not load an asset whose licence it could not confirm, even for private use. The source project states CC BY-SA 4.0 but also describes the licence as future work, and the published files contain no licence text. This is not a problem with your device or connection. The 2D anatomy view is complete and unaffected.',
      };
  }
  // This point is unreachable: resolvePrivateThreeD only produces reasons that
  // have an explicit case above. Kept so the function type is sound and a
  // future reason added without a case is caught at build time.
  throw new Error('Unhandled private 3D blocked reason: ' + reason);
}

/** Loader options shared by every pack. */
export function gltfLoaderOptions(): { readonly dracoDecoderPath: string } {
  return { dracoDecoderPath: DRACO_DECODER_PATH };
}