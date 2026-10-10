/**
 * Explicit node allowlist for building private runtime derivatives.
 *
 * ## Human-confirmed, never derived by matching
 *
 * Every name in this file was read out of the published GLB node lists and
 * confirmed by a person against those lists. Nothing here is produced by a
 * substring search, and `build-3d-derivatives.ts` throws if a name is absent
 * rather than guessing which node was meant.
 *
 * This is deliberate. A search for "oblique" in the real node list returns only
 * unrelated structures — the radio-ulnar syndesmosis, the oblique ligament of the
 * 1st finger, the oblique head of adductor pollicis. A search for "serratus"
 * returns the muscle *and* two bursae. Mapping by match would produce a file
 * that loads cleanly and is anatomically wrong.
 *
 * ## Overlay parts are excluded on purpose
 *
 * Where the source project models a named part of a muscle as an object sitting
 * above the parent — the acromial, clavicular and spinal parts of the deltoid —
 * only the parent is kept. Including the overlays would let a learner be scored
 * correct for identifying a whole muscle by tapping one of its parts, which
 * records a wrong answer as a right one.
 *
 * ## Tendons, bursae and sheaths are excluded on purpose
 *
 * The packs contain "Common tendon of biceps brachii", "Subacromial-subdeltoid
 * bursa", "Tibialis anterior tendon sheath" and similar. They are real anatomy
 * but they are not the muscle being asked about, and a tap on one must not
 * count.
 */

export interface TrimPack {
  readonly originalFile: string;
  readonly derivedFile: string;
  /** Official download URL, recorded in PROVENANCE.json for traceability. */
  readonly sourceUrl: string;
  readonly displayName: string;
  readonly keepNodeNames: readonly string[];
  /** Nodes deliberately kept but not answerable, kept for visual context only. */
  readonly contextOnlyNodeNames?: readonly string[];
}

export const THREE_D_MAPPINGS: readonly TrimPack[] = [
  {
    originalFile: 'upper-limb.glb',
    derivedFile: 'upper-limb-muscles.glb',
    sourceUrl: 'https://caskanatomy.info/open3dmodelfiles/upper-limb/upper-limb-glb.zip',
    displayName: 'Upper limb muscles',
    keepNodeNames: [
      // Whole-muscle nodes. Each exists in the pack alongside its overlay parts.
      'Deltoid muscle.r',
      'Pectoralis major.r',
      'Trapezius muscle.r',
      'Latissimus dorsi.r',
      // Single-node muscles.
      'Serratus anterior muscle.r',
      // Multi-head muscles with no whole-muscle parent node in this pack.
      'Long head of biceps brachii.r',
      'Short head of biceps brachii.r',
      'Long head of triceps brachii.r',
      'Lateral head of triceps brachii.r',
      'Medial head of triceps brachii.r',
    ],
  },
  {
    originalFile: 'lower-limb.glb',
    derivedFile: 'lower-limb-muscles.glb',
    sourceUrl: 'https://caskanatomy.info/open3dmodelfiles/lower-limb/lower-limb-glb.zip',
    displayName: 'Lower limb muscles',
    keepNodeNames: [
      'Rectus femoris.r',
      'Vastus lateralis muscle.r',
      'Vastus medialis muscle.r',
      'Tibialis anterior muscle.r',
      'Gluteus maximus muscle.r',
      'Soleus muscle.r',
      'Lateral head of gastrocnemius.r',
      'Medial head of gastrocnemius.r',
    ],
  },
];

/**
 * Nodes that exist in the packs and must NEVER be mapped to a structure.
 *
 * Used by the mapping test suite as a negative list, so a future edit that
 * accidentally adds one of these fails loudly.
 */
export const FORBIDDEN_NODES: readonly string[] = [
  'Common tendon of biceps brachii.r',
  'Common tendon of triceps brachii.r',
  'Long head of biceps brachii tendon sheath.r',
  'Tibialis anterior tendon sheath.r',
  'Subacromial-subdeltoid bursa.r',
  'Subdeltoid bursa.r',
  'Infraserratus bursa.r',
  'Supraserratus bursa.r',
  'Subtendinous bursa of triceps brachii.r',
  'Lateral subtendinous bursa of gastrocnemius muscle.r',
  'Medial subtendinous bursa of gastrocnemius muscle.r',
  'Subtendinous bursa of trapezius.r',
  'Thoracoacromial artery Deltoid br.r',
  // Overlay parts: present in the pack, deliberately not answerable.
  'Acromial part of deltoid muscle.r',
  'Clavicular part of deltoid muscle.r',
  'Spinal part of deltoid muscle.r',
  'Abdominal head of pectoralis major muscle.r',
  'Clavicular head of pectoralis major muscle.r',
  'Sternocostal head of pectoralis major muscle.r',
  'Ascending part of Trapezius muscle.r',
  'Descending part of Trapezius muscle.r',
  'Transverse part of trapezius muscle.r',
];