/**
 * The 3D renderer.
 *
 * ## Loaded how
 *
 * This module imports three.js, so nothing else in the codebase may import it
 * statically. It is reached only through `React.lazy`, which means the renderer
 * and the ~600 kB of three.js live in their own chunk and are never fetched by a
 * learner who only ever uses the 2D board. `assertNoStaticThreeImport` in the
 * test suite checks that.
 *
 * ## What it implements
 *
 * `AnatomyBoardAdapter`, unchanged from the 2D contract. The learning engine
 * cannot tell the difference between the two boards, which is the entire reason
 * that contract was written before either renderer existed.
 *
 * ## What it knows about anatomy: nothing
 *
 * No muscle name, no structure id, and no mapping logic appear in this file. A
 * hit arrives as a Three.js object name, goes to `MeshStructureMapper`, and comes
 * back as a stable structure id. That separation is what lets a different model
 * be swapped in without touching the quiz engine.
 */

import type {
  AnatomyBoardAdapter,
  AnatomyBoardEvent,
  AnatomyBoardEventHandler,
  CandidateHit,
  FocusStructureOptions,
  PointerInputType,
  StructureVisualState,
  ViewportState,
} from '@/features/anatomy-board/contracts/anatomy-board-adapter';
import { structureIdSchema, type LayerId, type RegionId, type StructureId, type ViewId } from '@/domain/anatomy/ids';
import {
  boundsContain,
  boundsToSphere,
  clampPhi,
  clampRadius,
  emptyBounds,
  evaluateTap,
  isEmptyBounds,
  orbitForView,
  orbitFromPosition,
  orbitPosition,
  panFromDrag,
  pinchDistance,
  radiusToFit,
  unionBounds,
  zoomRatio,
  type AnatomicalView,
  type Bounds,
  type GestureInput,
  type OrbitState,
  type Vec2,
  type Vec3,
} from './cameraMath';
import type { MeshStructureMapper } from './MeshStructureMapper';
import { DRACO_DECODER_PATH } from './privateMode';

/*
 * three.js types, imported as types only.
 *
 * The runtime module is loaded dynamically by the caller and handed in through
 * `options.three`. That indirection is deliberate: a static import here would
 * pull three.js into whatever bundle imports this file, defeating the lazy
 * chunking the viewer depends on.
 */
import type * as ThreeNamespace from 'three';
import type {
  Group,
  Intersection,
  Mesh,
  Object3D,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';

type AnyThree = typeof ThreeNamespace;

export interface ThreeDBoardOptions {
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly mapper: MeshStructureMapper;
  readonly assetPath: string;
  readonly three: AnyThree;
  /** Reduced motion disables continuous rendering; on-demand only. */
  readonly animationAllowed: boolean;
  /**
   * Keeps the drawing buffer readable after present, so an automated test can
   * verify that real pixels were drawn.
   *
   * Off by default: it costs a full-buffer copy every frame, which is real
   * overhead on the iPad this app is built for. Enabled only when the host asks
   * for it over the test-only `?pixelProbe=1` query parameter.
   */
  readonly preserveDrawingBuffer?: boolean;
  readonly onError?: (code: string, message: string, recoverable: boolean) => void;
  readonly onDisambiguation?: (candidates: readonly CandidateHit[], point: Vec2) => void;
}

const MIN_RADIUS_FACTOR = 0.25;
const MAX_RADIUS_FACTOR = 4;

export class ThreeDAnatomyBoard implements AnatomyBoardAdapter {
  private readonly three: AnyThree;
  private readonly options: ThreeDBoardOptions;
  private readonly handlers = new Set<AnatomyBoardEventHandler>();

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private root: Group | null = null;
  private loadPromise: Promise<void> | null = null;

  /** Mesh name -> structure id, resolved through the mapper. */
  private readonly meshToStructure = new Map<Mesh, StructureId>();
  private readonly structureBounds = new Map<StructureId, Bounds>();
  private readonly allSelectableMeshes: Mesh[] = [];

  private orbit: OrbitState = { theta: 0, phi: 0, radius: 1 };
  private target: Vec3 = { x: 0, y: 0, z: 0 };
  private modelBounds: Bounds = emptyBounds();
  private fittedRadius = 1;

  private activeView: ViewId = 'anterior' as ViewId;
  private activeLayer: LayerId = 'layer.superficial' as LayerId;
  private interactionEnabled = true;
  private labelsVisible = false;
  private ready = false;
  private destroyed = false;
  private readyAtMs = 0;

  private frameHandle: number | null = null;
  private dirty = true;
  private disposables: { dispose(): void }[] = [];

  /* pointer state */
  private readonly pointers = new Map<number, GestureInput>();
  private pointerStart: Vec2 | null = null;
  private lastPinchDistance = 0;
  private lastOrbit: OrbitState | null = null;
  private lastPanStart: Vec2 | null = null;
  private inputType: PointerInputType = 'mouse';

  private visualStates = new Map<StructureId, StructureVisualState>();
  /** Memoised neutral tints, keyed by structure id. See neutralColorFor. */
  private readonly neutralColors = new Map<StructureId, InstanceType<typeof ThreeNamespace.Color>>();
  private focusSet: readonly StructureId[] | null = null;

  /* queued host calls made before ready */
  private readonly queuedCalls: (() => void)[] = [];

  constructor(options: ThreeDBoardOptions) {
    this.options = options;
    this.three = options.three;
    this.attachListeners();
  }

  /* ================================================================ *
   * Lifecycle
   * ================================================================ */

  async load(): Promise<void> {
    if (this.loadPromise !== null) return this.loadPromise;

    this.loadPromise = (async () => {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');

      this.initRenderer();

      const draco = new DRACOLoader();
      // Served from our own origin: offline support, and no third-party request
      // revealing that this model is in use.
      draco.setDecoderPath(DRACO_DECODER_PATH);
      draco.setDecoderConfig({ type: 'wasm' });
      this.disposables.push(draco);

      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);

      const gltf = await loader.loadAsync(this.options.assetPath);

      if (this.destroyed) {
        disposeObjectTree(gltf.scene);
        return;
      }

      this.scene?.add(gltf.scene);
      this.root = gltf.scene;
      this.indexMeshes(gltf.scene);
      this.computeModelBounds();
      this.fittedRadius = this.fitRadius();

      this.ready = true;
      this.readyAtMs = performance.now();
      this.resetViewport();

      /*
       * Paint the neutral state once the board is ready.
       *
       * Order matters: `applyVisualStates` returns early while `ready` is false,
       * so calling it before this point was a no-op and every muscle kept its
       * material colour — which, with textures stripped, was near-white.
       */
      this.applyVisualStates();

      const queued = this.queuedCalls.splice(0, this.queuedCalls.length);
      for (const call of queued) call();

      this.emit({
        type: 'board-ready',
        viewId: this.activeView,
        structureCount: this.structureBounds.size,
        timestampMs: 0,
      });

      this.requestRender();
    })().catch((error: unknown) => {
      this.options.onError?.(
        'asset-load-failed',
        error instanceof Error ? error.message : 'The model could not be loaded.',
        true,
      );
      throw error;
    });

    return this.loadPromise;
  }

  private initRenderer(): void {
    const { canvas, container } = this.options;
    const { WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Color } =
      this.three;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      ...(this.options.preserveDrawingBuffer === true
        ? { preserveDrawingBuffer: true }
        : {}),
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer!.setSize(container.clientWidth || 1, container.clientHeight || 1, false);

    const scene = new Scene();
    this.scene = scene;
    scene.background = new Color('#f7f6f3');

    this.camera = new PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.set(0, 0, 2);

    // Two lights: one ambient so nothing is pure black, one directional so
    // muscle relief reads. A single light makes a body look like a flat blob.
    const ambient = new AmbientLight(0xffffff, 1.9);
    const key = new DirectionalLight(0xffffff, 1.5);
    key.position.set(1.5, 2, 2.5);
    scene.add(ambient, key);

    const resize = () => this.handleResize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    this.disposables.push({ dispose: () => window.removeEventListener('resize', resize) });
    this.disposables.push({ dispose: () => window.removeEventListener('orientationchange', resize) });

    this.handleResize();
    this.startRenderLoop();
  }

  private handleResize(): void {
    if (this.renderer === null) return;
    const { container } = this.options;
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    if (this.camera === null) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private startRenderLoop(): void {
    const tick = () => {
      if (this.destroyed) return;
      this.frameHandle = requestAnimationFrame(tick);

      // Reduced motion, or nothing changed: do not burn battery redrawing an
      // identical frame. On a held iPad this is the difference between a warm
      // device and a hot one over a study session.
      if (!this.dirty) return;
      this.dirty = false;

      if (this.camera === null || this.renderer === null || this.scene === null) return;

      /*
       * Drive the camera from the orbit state every frame.
       *
       * The position must be derived here, not set once at init: rotation, zoom
       * and pan all mutate `this.orbit` and `this.target`, and nothing else
       * moves the camera. Setting position only in the constructor — which is what
       * this did originally — left the camera parked at its initial (0,0,2) while
       * the orbit maths was computed correctly but never applied, so the model
       * rendered from a fixed arbitrary angle and the view buttons did nothing.
       */
      const position = orbitPosition(this.orbit, this.target);
      this.camera.position.set(position.x, position.y, position.z);
      this.camera.lookAt(this.target.x, this.target.y, this.target.z);
      this.renderer.render(this.scene, this.camera);
    };
    this.frameHandle = requestAnimationFrame(tick);
  }

  private requestRender(): void {
    this.dirty = true;
  }

  subscribe(handler: AnatomyBoardEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: AnatomyBoardEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;

    this.detachListeners();
    for (const item of this.disposables) item.dispose();

    if (this.root !== null) {
      this.scene?.remove(this.root);
      disposeObjectTree(this.root);
    }

    this.renderer?.dispose();
    // Force-release the context. Without this, iOS Safari keeps a WebGL context
    // alive until GC, and a few board mounts exhaust the per-page context limit
    // and silently break every remaining canvas.
    this.renderer?.forceContextLoss?.();

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.root = null;
    this.meshToStructure.clear();
    this.structureBounds.clear();
    this.neutralColors.clear();
    this.allSelectableMeshes.length = 0;
    this.handlers.clear();
  }

  /* ================================================================ *
   * Mesh indexing
   * ================================================================ */

  private indexMeshes(root: Object3D): void {
    root.traverse((object: Object3D) => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      const name: string = mesh.name ?? '';
      const resolved = this.options.mapper.resolveNode(name);

      // Only mapped, selectable meshes are raycast targets. Everything else is
      // scenery: hitting it must produce nothing rather than a wrong answer.
      if (resolved !== null && resolved.selectable && resolved.structureId !== null) {
        mesh.userData['structureId'] = resolved.structureId;
        mesh.userData['selectionPriority'] = resolved.selectionPriority;
        this.meshToStructure.set(mesh, resolved.structureId);
        this.allSelectableMeshes.push(mesh);

        const geometryBounds = this.geometryBounds(mesh);
        if (geometryBounds !== null) {
          this.structureBounds.set(
            resolved.structureId,
            unionBounds(this.structureBounds.get(resolved.structureId) ?? null, geometryBounds),
          );
        }
      }

      this.disposables.push(mesh.geometry);

      /*
       * Give every mesh its own material.
       *
       * The source packs share material instances across many muscles — all ten
       * upper-limb muscles reference a single "Muscle basic". Recolouring that
       * shared instance to show a correct or incorrect answer would therefore
       * repaint every other muscle too, which is not a subtle bug: a learner
       * would see the whole limb change colour when they tapped one muscle, and
       * the feedback would be meaningless.
       *
       * It also makes the per-structure neutral tint impossible, since one
       * material cannot hold several colours at once.
       */
      const source = mesh.material;
      if (Array.isArray(source)) {
        const cloned = source.map((material) => {
          const copy = material.clone();
          this.disposables.push(copy);
          return copy;
        });
        mesh.material = cloned;
      } else if (source !== undefined) {
        const copy = source.clone();
        mesh.material = copy;
        this.disposables.push(copy);
      }
    });

    // Excluded overlay parts are present in the model but must not answer.
    // Hiding them is clearer than leaving them visible-but-dead, because a
    // visible part that cannot be selected looks like a bug to the user.
    root.traverse((object: Object3D) => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      const resolved = this.options.mapper.resolveNode(mesh.name ?? '');
      if (resolved !== null && !resolved.selectable) {
        mesh.visible = false;
      }
    });
  }

  private geometryBounds(object: Object3D): Bounds | null {
    const { Box3, Vector3 } = this.three;
    try {
      const box = new Box3().setFromObject(object);
      if (box.isEmpty()) return null;
      return {
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z },
      };
    } catch {
      return null;
    }
    void Vector3;
  }

  private computeModelBounds(): void {
    if (this.root === null) return;
    const { Box3 } = this.three;
    const box = new Box3().setFromObject(this.root);
    this.modelBounds = {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    };
  }

  private fitRadius(): number {
    if (this.root === null || this.camera === null) return 1;
    const { Box3, Sphere } = this.three;
    const sphere = new Sphere();
    new Box3().setFromObject(this.root).getBoundingSphere(sphere);
    const { clientWidth, clientHeight } = this.options.container;
    const aspect = Math.max(clientWidth, 1) / Math.max(clientHeight, 1);
    return radiusToFit(sphere.radius, this.camera.fov * (Math.PI / 180), aspect);
  }

  /* ================================================================ *
   * Pointer input
   * ================================================================ */

  private attachListeners(): void {
    const { canvas } = this.options;
    // Native listeners, not React synthetic events, matching the 2D board.
    // Synthetic events are unreliable for multi-touch on iOS and untestable.
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('pointerleave', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.preventContextMenu);
    // Safari fires gesturestart/gesturechange for its own pinch-zoom on the
    // page. Preventing them stops the whole viewport zooming while the learner
    // is trying to zoom the model.
    canvas.addEventListener('gesturestart', this.preventDefault);
    canvas.addEventListener('gesturechange', this.preventDefault);
  }

  private detachListeners(): void {
    const { canvas } = this.options;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('pointercancel', this.handlePointerUp);
    canvas.removeEventListener('pointerleave', this.handlePointerUp);
    canvas.removeEventListener('wheel', this.handleWheel);
    canvas.removeEventListener('contextmenu', this.preventContextMenu);
    canvas.removeEventListener('gesturestart', this.preventDefault);
    canvas.removeEventListener('gesturechange', this.preventDefault);
  }

  private readonly preventContextMenu = (event: Event): void => event.preventDefault();
  private readonly preventDefault = (event: Event): void => event.preventDefault();

  private toInputType(pointerType: string): PointerInputType {
    // Apple Pencil reports 'pen'. Trackpad pinch arrives as wheel with ctrlKey.
    if (pointerType === 'pen') return 'pen';
    if (pointerType === 'touch') return 'touch';
    return 'mouse';
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.interactionEnabled) return;
    // Stop the browser from scrolling the page under the model on iOS.
    event.preventDefault();
    this.options.canvas.setPointerCapture?.(event.pointerId);
    this.inputType = this.toInputType(event.pointerType);

    this.pointers.set(event.pointerId, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType === 'pen' ? 'pen' : event.pointerType === 'touch' ? 'touch' : 'mouse',
    });

    this.pointerStart = { x: event.clientX, y: event.clientY };
    this.lastOrbit = { ...this.orbit };
    this.lastPanStart = { x: event.clientX, y: event.clientY };
    if (this.pointers.size === 2) {
    const pair = [...this.pointers.values()];
    if (pair.length >= 2) {
      this.lastPinchDistance = pinchDistance(pair[0]!, pair[1]!);
    }
    }

    this.emitInteraction('pointer-down', 0);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pointers.size === 0) return;
    const existing = this.pointers.get(event.pointerId);
    if (existing === undefined) return;

    const current: GestureInput = { ...existing, x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, current);
    this.inputType = this.toInputType(event.pointerType);

    const count = this.pointers.size;

    if (count === 1 && this.lastOrbit !== null) {
      // One finger (or a single mouse/pen drag): rotate.
      const dx = event.clientX - (this.lastPanStart?.x ?? event.clientX);
      const dy = event.clientY - (this.lastPanStart?.y ?? event.clientY);
      this.orbit = {
        ...this.lastOrbit,
        theta: this.lastOrbit.theta - dx * 0.008,
        phi: clampPhi(this.lastOrbit.phi + dy * 0.008),
      };
      this.lastPanStart = { x: event.clientX, y: event.clientY };
      this.requestRender();
    } else if (count === 2) {
      const pair = [...this.pointers.values()];
      if (pair.length < 2) return;
      const a = pair[0]!;
      const b = pair[1]!;
      const distance = pinchDistance(a, b);

      // Two fingers: pinch zooms, and the midpoint drag pans. Both at once, so a
      // two-finger gesture can zoom and reposition in a single movement.
      if (this.lastPinchDistance > 0 && distance > 0) {
        const ratio = zoomRatio(this.lastPinchDistance, distance);
        this.orbit = { ...this.orbit, radius: clampRadius(this.orbit.radius / ratio, this.minRadius(), this.maxRadius()) };
      }
      this.lastPinchDistance = distance;

      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.lastPanStart !== null) {
        this.panByScreen(this.lastPanStart, midpoint);
        this.lastPanStart = midpoint;
      }
      this.requestRender();
    }

    const travelled =
      this.pointerStart === null ? 0 : evaluateTap(this.pointerStart, { x: event.clientX, y: event.clientY }).distanceTravelled;
    this.emitInteraction('pointer-move', travelled);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    const moved =
      start === null ? 0 : evaluateTap(start, { x: event.clientX, y: event.clientY }).distanceTravelled;

    this.options.canvas.releasePointerCapture?.(event.pointerId);
    this.pointers.delete(event.pointerId);

    // A tap is a release with no intervening movement. Only then does the ray
    // hit the model, so dragging to look around never selects anything.
    if (moved <= 10 && this.interactionEnabled) {
      this.selectAt(event.clientX, event.clientY, this.inputType);
    }

    this.pointerStart = null;
    this.lastOrbit = null;
    this.lastPanStart = null;
    if (this.pointers.size < 2) this.lastPinchDistance = 0;

    this.emitInteraction('pointer-up', moved);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    // ctrlKey means a trackpad pinch, which browsers report as a wheel event.
    // Both that and a mouse wheel zoom the model.
    const delta = event.ctrlKey ? event.deltaY * 2 : event.deltaY;
    const factor = Math.exp(delta * 0.0015);
    this.orbit = {
      ...this.orbit,
      radius: clampRadius(this.orbit.radius / factor, this.minRadius(), this.maxRadius()),
    };
    this.requestRender();
  };

  private panByScreen(from: Vec2, to: Vec2): void {
    const { clientWidth, clientHeight } = this.options.container;
    const worldHeight = this.fittedRadius * 2;
    const delta = panFromDrag(from, to, Math.max(clientWidth, 1), Math.max(clientHeight, 1), worldHeight);
    this.target = {
      x: this.target.x + delta.x,
      y: this.target.y + delta.y,
      z: this.target.z,
    };
  }

  private emitInteraction(
    kind: 'pointer-down' | 'pointer-move' | 'pointer-up' | 'pointer-cancel',
    travelled: number,
  ): void {
    const { clientWidth, clientHeight } = this.options.container;
    this.emit({
      type: 'interaction',
      kind,
      inputType: this.inputType,
      point: { x: clientWidth / 2, y: clientHeight / 2 },
      exceedsTapThreshold: travelled > 10,
      pointerCount: this.pointers.size,
      timestampMs: performance.now() - this.readyAtMs,
    });
  }

  /* ================================================================ *
   * Selection
   * ================================================================ */

  private selectAt(clientX: number, clientY: number, inputType: PointerInputType): void {
    if (!this.ready || this.renderer === null || this.camera === null) return;

    const { container } = this.options;
    const rect = container.getBoundingClientRect();
    const ndc = {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: -((clientY - rect.top) / rect.height) * 2 + 1,
    };

    const hits = this.raycast(ndc);

    if (hits.length === 0) return;

    // Hand off to the shared resolver so 3D selection obeys exactly the same
    // rule as 2D: one candidate selects, several prompt, ties never guess.
    const candidates: CandidateHit[] = [];
    const seen = new Set<string>();
    for (const object of hits) {
      const structureId = this.meshToStructure.get(object);
      if (structureId === undefined || seen.has(structureId)) continue;
      seen.add(structureId);
      const mapping = this.options.mapper.mappingForStructure(structureId as string);
      if (mapping === null) continue;
      candidates.push({
        visualId: mapping.visual_id as CandidateHit['visualId'],
        structureId: structureIdSchema.parse(structureId),
        selectionPriority: object.userData['selectionPriority'] ?? 500,
        requiresDisambiguation: mapping.requires_disambiguation,
      });
    }

    if (candidates.length === 0) return;

    const point: Vec2 = { x: clientX - rect.left, y: clientY - rect.top };

    if (candidates.length === 1) {
      const only = candidates[0]!;
      const mapping = this.options.mapper.mappingForStructure(only.structureId as string);
      this.emit({
        type: 'structure-selected',
        structureId: only.structureId,
        visualId: (mapping !== null ? mapping.visual_id : only.visualId) as CandidateHit['visualId'],
        inputType,
        point,
        candidates: [{ ...only, resolution: 'direct' }],
        resolution: 'direct',
        activeView: this.activeView,
        activeLayer: this.activeLayer,
        timestampMs: performance.now() - this.readyAtMs,
      });
      return;
    }

    // Overlapping geometry. Ask rather than guess.
    this.options.onDisambiguation?.(candidates, point);
    this.emit({
      type: 'disambiguation-requested',
      candidates,
      point,
      viewId: this.activeView,
    });
  }

  private raycast(ndc: { x: number; y: number }): Mesh[] {
    if (this.camera === null) return [];
    const { Raycaster, Vector2 } = this.three;
    const raycaster = new Raycaster();
    // Widen the set slightly: a strict centre-pixel ray misses thin muscles that
    // a fingertip clearly covers.
    raycaster.params.Points = { threshold: 0.01 };

    raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), this.camera);

    // Only mapped meshes are candidates, so scenery and excluded overlay parts
    // can never produce a selection.
    const intersections = raycaster.intersectObjects(this.allSelectableMeshes, false);
    return intersections.map((intersection: Intersection) => intersection.object as Mesh);
  }

  requestDisambiguation(candidates: readonly CandidateHit[]): void {
    this.options.onDisambiguation?.(candidates, { x: 0, y: 0 });
  }

  /* ================================================================ *
   * Adapter: inventory
   * ================================================================ */

  listAvailableStructureIds(): readonly StructureId[] {
    const ids = [...this.structureBounds.keys()].sort();
    return ids as StructureId[];
  }

  /* ================================================================ *
   * Adapter: view and layer
   * ================================================================ */

  setActiveView(viewId: ViewId): void {
    this.activeView = viewId;
    const anatomical = ANATOMICAL_VIEW_FOR_VIEW_ID[viewId] ?? null;
    if (anatomical !== null) {
      this.orbit = orbitForView(anatomical, this.orbit.radius);
      this.requestRender();
    }
  }

  getActiveView(): ViewId {
    return this.activeView;
  }

  setActiveLayer(layerId: LayerId): void {
    this.activeLayer = layerId;
  }

  getActiveLayer(): LayerId {
    return this.activeLayer;
  }

  setInteractionEnabled(enabled: boolean): void {
    this.interactionEnabled = enabled;
    if (!enabled) this.pointers.clear();
  }

  isInteractionEnabled(): boolean {
    return this.interactionEnabled;
  }

  /* ================================================================ *
   * Adapter: visual state
   * ================================================================ */

  setStructureVisualState(structureId: StructureId, state: StructureVisualState): void {
    this.visualStates.set(structureId, state);
    this.applyVisualStates();
  }

  setVisualStates(states: ReadonlyMap<StructureId, StructureVisualState>): void {
    this.visualStates = new Map(states);
    this.applyVisualStates();
  }

  clearVisualStates(): void {
    this.visualStates.clear();
    this.applyVisualStates();
  }

  setFocusSet(structureIds: readonly StructureId[] | null): void {
    this.focusSet = structureIds;
    this.applyVisualStates();
  }

  /**
 * A stable, muted tint per structure for the neutral state.
 *
 * Hues are spaced around the muscle-tone range rather than assigned randomly, so
 * neighbouring muscles in the model land far apart in colour. Saturation and
 * lightness stay in a narrow band: strong colours would read as "highlighted",
 * which is reserved for correct/incorrect/focused.
 *
 * Memoised because `applyVisualStates` runs on every state change and would
 * otherwise allocate a Color per mesh per frame of interaction.
 */
private neutralColorFor(structureId: StructureId, Color: AnyThree['Color']) {
  const cached = this.neutralColors.get(structureId);
  if (cached !== undefined) return cached.clone();

  let hash = 0;
  for (let i = 0; i < structureId.length; i += 1) {
    hash = (hash * 31 + structureId.charCodeAt(i)) >>> 0;
  }
  const hue = (hash % 360) / 360;

  const color = new Color().setHSL(hue, 0.34, 0.56 + ((hash >>> 9) % 7) * 0.012);
  this.neutralColors.set(structureId, color);
  return color.clone();
}

private applyVisualStates(): void {
    if (!this.ready) return;

    const { Color } = this.three;
    const correctColor = new Color('#2f7d54');
    const incorrectColor = new Color('#a33a2f');
    const focusColor = new Color('#c98a3a');
    const dimColor = new Color('#d8d3cc');

    const inFocus = this.focusSet;
    const focusMembers = inFocus === null ? null : new Set(inFocus);

    for (const [object, structureId] of this.meshToStructure) {
      const state = this.visualStates.get(structureId);
      /*
       * Neutral state uses a stable per-structure tint rather than one flat
       * muscle colour.
       *
       * A single colour made every muscle identical, so their boundaries were
       * invisible and the model was hard to study: you could see the shapes but
       * not where one ended and the next began. Distinct tints let a learner see
       * deltoid against pectoralis major at a glance, which is most of the point
       * of having separate muscles in a scene.
       *
       * The tint is derived from the structure id, so a muscle keeps the same
       * colour between sessions and between reloads — relearning is not slowed
       * by a colour that changes each time the app opens.
       */
      let color = this.neutralColorFor(structureId, Color);
      let opacity = 1;

      switch (state) {
        case 'correct':
          color = correctColor.clone();
          break;
        case 'incorrect':
          color = incorrectColor.clone();
          break;
        case 'focus':
        case 'selected':
          color = focusColor.clone();
          break;
        case 'dimmed':
          color = dimColor.clone();
          break;
        case 'hidden':
          opacity = 0.08;
          break;
        default:
          break;
      }

      if (focusMembers !== null && !focusMembers.has(structureId)) {
        color = dimColor.clone();
        opacity = Math.min(opacity, 0.35);
      }

      const rawMaterials = object.material;
      const materials = (
        Array.isArray(rawMaterials) ? rawMaterials : [rawMaterials]
      ) as MeshStandardMaterial[];
      for (const material of materials) {
        if (material === undefined || material === null) continue;
        material.color.copy(color);
        material.opacity = opacity;
        material.transparent = opacity < 1;
        // Drop the model's own skin textures: they are photographic and fight
        // the state colours, which is what the quiz actually reads.
        material.map = null;
        material.needsUpdate = true;
      }
    }

    this.requestRender();
  }

  /* ================================================================ *
   * Adapter: viewport
   * ================================================================ */

  private minRadius(): number {
    return this.fittedRadius * MIN_RADIUS_FACTOR;
  }

  private maxRadius(): number {
    return this.fittedRadius * MAX_RADIUS_FACTOR;
  }

  getCurrentViewState(): ViewportState {
    return {
      transform: {
        scale: this.fittedRadius / this.orbit.radius,
        tx: -this.target.x,
        ty: -this.target.y,
        mode: 'free',
      },
      // In 3D there is no SVG viewBox. Board space is model space, and the
      // visible region is reported in model units so the host can show scale
      // consistently across both boards.
      viewBox: {
        x: this.target.x - this.orbit.radius,
        y: this.target.y - this.orbit.radius,
        width: this.orbit.radius * 2,
        height: this.orbit.radius * 2,
      },
      visibleBounds: {
        x: this.target.x - this.orbit.radius,
        y: this.target.y - this.orbit.radius,
        width: this.orbit.radius * 2,
        height: this.orbit.radius * 2,
      },
      canZoomIn: this.orbit.radius > this.minRadius(),
      canZoomOut: this.orbit.radius < this.maxRadius(),
      canReset: true,
      panEnabled: true,
    };
  }

  zoomBy(factor: number): void {
    this.orbit = {
      ...this.orbit,
      radius: clampRadius(this.orbit.radius / factor, this.minRadius(), this.maxRadius()),
    };
    this.requestRender();
  }

  setZoom(scale: number): void {
    this.orbit = {
      ...this.orbit,
      radius: clampRadius(this.fittedRadius / scale, this.minRadius(), this.maxRadius()),
    };
    this.requestRender();
  }

  /**
   * Rotate by a delta around the vertical axis.
   *
   * Exists so the viewer's visible Rotate button does the thing its label
   * promises. The button previously called zoomBy(1), which divides the radius
   * by 1 — an arithmetically exact no-op that looked like a working control and
   * did nothing. Camera orientation is user state here, not a quiz answer: the
   * learner is free to rotate however they like, and the button reflects that
   * instead of pretending gesture-only rotation is the only path.
   */
  rotateBy(deltaTheta: number): void {
    this.orbit = { ...this.orbit, theta: this.orbit.theta - deltaTheta };
    this.requestRender();
  }

  panBy(dx: number, dy: number): void {
    this.target = { x: this.target.x + dx, y: this.target.y + dy, z: this.target.z };
    this.requestRender();
  }

  /**
   * Frame a structure.
   *
   * Uses the bounds computed at load rather than the 2D mapping's bounding box,
   * because the 2D coordinates describe a flat illustration and have no meaning
   * against the model.
   */
  focusStructure(structureId: StructureId, options?: FocusStructureOptions): void {
    const bounds = this.structureBounds.get(structureId);
    if (bounds === undefined || isEmptyBounds(bounds)) return;

    const sphere = boundsToSphere(bounds);
    const padding = options?.paddingUnits ?? sphere.radius * 0.35;
    this.target = sphere.center;
    this.fittedRadius = Math.max(sphere.radius + padding, 0.001);
    // OrbitState is readonly, so the radius changes by building a new state
    // rather than mutating in place.
    const radius =
      typeof options?.targetScale === 'number'
        ? clampRadius(
            this.fittedRadius / options.targetScale,
            this.minRadius(),
            this.maxRadius(),
          )
        : this.fittedRadius;
    this.orbit = { ...this.orbit, radius };
    this.requestRender();
  }

  focusRegion(_regionId: RegionId, options?: FocusStructureOptions): void {
    // Regions are 2D-board concepts. In 3D the equivalent is focusing the
    // structures mapped to that region, which the host does via setFocusSet.
    void options;
  }

  resetViewport(): void {
    this.fittedRadius = this.fitRadius();
    const sphere = isEmptyBounds(this.modelBounds) ? null : boundsToSphere(this.modelBounds);
    this.target = sphere?.center ?? { x: 0, y: 0, z: 0 };
    const view = ANATOMICAL_VIEW_FOR_VIEW_ID[this.activeView] ?? 'anterior';
    this.orbit = orbitForView(view, this.fittedRadius);
    this.requestRender();
  }

  /**
   * Restore the state a learner recognises as "home": whole model in view,
   * anterior, no selection, no focus, no visual states.
   *
   * resetViewport() deliberately leaves selection alone — the 2D board's reset
   * also owns only the viewport — so a viewer-level reset that wiped a choice
   * the learner just made would destroy work. The viewer's Reset view button
   * means "back to the start", so it calls this.
   */
  resetViewerState(): void {
    this.visualStates.clear();
    this.focusSet = null;
    if (this.activeView !== ('anterior' as ViewId)) {
      this.setActiveView('anterior' as ViewId);
    }
    this.resetViewport();
  }

  /* ================================================================ *
   * Adapter: presentation
   * ================================================================ */

  setLabelsVisible(visible: boolean): void {
    // 3D labels are rendered by the React layer, not the canvas, so the board
    // only records the preference.
    this.labelsVisible = visible;
  }

  areLabelsVisible(): boolean {
    return this.labelsVisible;
  }

  getStructureBounds(structureId: StructureId): {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null {
    const bounds = this.structureBounds.get(structureId);
    if (bounds === undefined || isEmptyBounds(bounds)) return null;
    return {
      x: bounds.min.x,
      y: bounds.min.y,
      width: bounds.max.x - bounds.min.x,
      height: bounds.max.y - bounds.min.y,
    };
  }

  /**
   * Project a structure's centre to canvas pixels, for placing DOM labels.
   *
   * Returns null when the point is behind the camera, so a label is hidden
   * rather than drawn mirrored in the wrong place.
   */
  projectStructure(structureId: StructureId, width: number, height: number): Vec2 | null {
    const bounds = this.structureBounds.get(structureId);
    if (bounds === undefined || isEmptyBounds(bounds)) return null;

    const center = boundsToSphere(bounds).center;
    const { Vector3 } = this.three;
    if (this.camera === null) return null;
    const point = new Vector3(center.x, center.y, center.z);
    point.project(this.camera);

    if (point.z < -1 || point.z > 1) return null;

    return {
      x: ((point.x + 1) / 2) * width,
      y: ((1 - point.y) / 2) * height,
    };
  }

  /** Camera position, for tests and for the debug overlay. */
  getCameraPosition(): Vec3 {
    if (this.camera === null) return { x: 0, y: 0, z: 0 };
    const position = this.camera.position;
    return { x: position.x, y: position.y, z: position.z };
  }

  setDebugOverlay(mode: 'off' | 'hit-regions' | 'ids' | 'eligible-targets'): void {
    if (mode === 'off') return;
    if (this.root === null) return;
    this.root.traverse((object: Object3D) => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      const structureId = this.meshToStructure.get(mesh);
      const isEligible = structureId !== undefined;
      // Only mapped, selectable meshes are raycast targets. Everything else is
      // scenery: hitting it must produce nothing rather than a wrong answer.
      const raw = mesh.material;
      const materials = (Array.isArray(raw) ? raw : [raw]) as MeshStandardMaterial[];
      for (const material of materials) {
        if (material === undefined || material === null) continue;
        material.wireframe = mode === 'hit-regions' && isEligible;
        material.needsUpdate = true;
      }
    });
    this.requestRender();
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Map the board's ViewId vocabulary onto anatomical camera directions. */
const ANATOMICAL_VIEW_FOR_VIEW_ID: Readonly<Record<string, AnatomicalView>> = {
  anterior: 'anterior',
  posterior: 'posterior',
  lateral: 'lateral',
  medial: 'medial',
  superior: 'superior',
  inferior: 'inferior',
};

/**
 * Release every GPU resource under an object.
 *
 * A WebGL context on iOS is a scarce resource: six live contexts and the oldest
 * is dropped by the browser. Explicit disposal is what keeps navigating between
 * the 3D and 2D views from eventually breaking the 3D view on a phone.
 */
export function disposeObjectTree(root: Object3D): void {
  root.traverse((object: Object3D) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose?.();
    const raw = mesh.material;
    const materials = (Array.isArray(raw) ? raw : [raw]) as MeshStandardMaterial[];
    for (const material of materials) {
      if (material === undefined || material === null) continue;
      for (const key of [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'emissiveMap',
      ] as const) {
        material[key]?.dispose?.();
      }
      material.dispose?.();
    }
  });
}

export { boundsContain, orbitFromPosition, orbitPosition };
export type { Bounds, Vec2, Vec3 };
