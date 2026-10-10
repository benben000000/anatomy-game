/**
 * Plain-language region descriptions used by the disambiguation chooser.
 *
 * In blind quiz mode the chooser must not name the structures, because naming
 * them would give away the answer. It describes where each candidate is instead.
 * Explore mode shows names, because there is nothing to hide there.
 *
 * GENERATED FILE — regenerate with `node scripts/generate-board-data.mjs`.
 */

export const REGION_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "muscular.frontalis": "front of the forehead",
  "muscular.sternocleidomastoid": "side of the neck",
  "muscular.deltoid": "shoulder",
  "muscular.pectoralis_major": "front of the chest",
  "muscular.serratus_anterior": "side of the rib cage, below the armpit",
  "muscular.biceps_brachii": "front of the upper arm",
  "muscular.rectus_abdominis": "front of the abdomen",
  "muscular.external_oblique": "outer side of the abdomen",
  "muscular.rectus_femoris": "front of the thigh",
  "muscular.vastus_lateralis": "outer side of the thigh",
  "muscular.vastus_medialis": "inner thigh, just above the knee",
  "muscular.tibialis_anterior": "front of the lower leg",
  "muscular.trapezius": "upper back, from the neck out to both shoulders",
  "muscular.triceps_brachii": "back of the upper arm",
  "muscular.latissimus_dorsi": "lower back, sweeping up toward the armpit",
  "muscular.erector_spinae": "either side of the spine, in the lower back",
  "muscular.gluteus_maximus": "buttock",
  "muscular.gastrocnemius": "upper back of the lower leg, the calf",
  "muscular.soleus": "lower back of the lower leg, below the calf"
};
