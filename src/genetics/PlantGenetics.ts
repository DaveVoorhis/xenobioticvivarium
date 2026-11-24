import * as THREE from 'three';
import { clamp, randChoice, randInt, randRange } from '../core/math';
import {
  FLORA_DEFENSES,
  FLORA_FORMS,
  FLORA_METABOLISMS,
  FLORA_MORPHOLOGIES,
  FLORA_PROPAGATIONS,
  FLORA_ROOT_SYSTEMS,
  FLORA_SURFACE_TEXTURES,
  FUNGUS_ONLY_FORMS,
  PLANT_ONLY_FORMS,
  allocateSpeciesId,
  generateSpeciesName,
  kingdomForFloraForm,
} from './taxonomy';
import type {
  FloraDefense,
  FloraForm,
  FloraKingdom,
  FloraMetabolism,
  FloraMorphology,
  FloraPropagation,
  FloraRootSystem,
  FloraSurfaceTexture,
  PlantGenome,
} from './types';

function pickInitialMorphology(form: FloraForm): FloraMorphology {
  if (form === 'parasol_mushroom' || form === 'shelf_cluster') return 'gilled_cap';
  if (form === 'puffball_mycelium' || form === 'coral_fungus') return 'porous_sponge';
  if (form === 'canopy_blossom' || form === 'pitcher_trap') return 'bell_petal';
  if (form === 'crystal_succulent') return 'crystalline_rosette';
  if (form === 'spiral_fern') return Math.random() < 0.65 ? 'serrated_blade' : 'broad_frond';
  return randChoice(FLORA_MORPHOLOGIES);
}

function pickInitialSurfaceTexture(form: FloraForm): FloraSurfaceTexture {
  if (form === 'parasol_mushroom' || form === 'shelf_cluster') return 'gilled_cap';
  if (form === 'puffball_mycelium' || form === 'coral_fungus') return 'velvet_mycelium';
  if (form === 'crystal_succulent') return 'crystalline';
  if (form === 'tendril_vine') return 'spined_bark';
  return 'veined_leaf';
}

function pickInitialRootSystem(form: FloraForm, kingdom: FloraKingdom): FloraRootSystem {
  if (kingdom === 'fungus') return 'mycelial_web';
  if (form === 'tendril_vine') return 'aerial_stilts';
  if (form === 'crystal_succulent') return 'deep_taproot';
  return randChoice(['fibrous_roots', 'deep_taproot', 'aerial_stilts']);
}

export function createPlantGenome(
  forcedMetabolism: FloraMetabolism | null = null,
  forcedForm: FloraForm | null = null,
  forcedKingdom: FloraKingdom | null = null
): PlantGenome {
  let form: FloraForm;
  if (forcedForm) {
    form = forcedForm;
  } else if (forcedKingdom === 'fungus') {
    form = randChoice(FUNGUS_ONLY_FORMS);
  } else if (forcedKingdom === 'plant') {
    form = randChoice(PLANT_ONLY_FORMS);
  } else if (
    forcedMetabolism === 'Saprotrophic_Fungi' ||
    forcedMetabolism === 'Mycorrhizal_Fungi'
  ) {
    form = randChoice(FUNGUS_ONLY_FORMS);
  } else if (forcedMetabolism === 'Carnivorous_Flora') {
    form = 'pitcher_trap';
  } else {
    form = randChoice(FLORA_FORMS);
  }

  const kingdom = kingdomForFloraForm(form);
  const metabolism: FloraMetabolism =
    forcedMetabolism ??
    (form === 'pitcher_trap'
      ? 'Carnivorous_Flora'
      : kingdom === 'fungus'
      ? Math.random() < 0.55
        ? 'Saprotrophic_Fungi'
        : 'Mycorrhizal_Fungi'
      : Math.random() < 0.72
      ? 'Photosynthetic'
      : 'Mixotrophic');

  const propagation: FloraPropagation =
    kingdom === 'fungus'
      ? randChoice(['Wind_Spores', 'Mycelial_Runners', 'Explosive_Pods', 'Wind_Spores'])
      : form === 'tendril_vine'
      ? randChoice(['Mycelial_Runners', 'Budding_Offshoot', 'Heavy_Seeds'])
      : randChoice(FLORA_PROPAGATIONS);

  const leafMorphology = pickInitialMorphology(form);
  const defense: FloraDefense =
    metabolism === 'Carnivorous_Flora'
      ? randChoice(['sticky_resin', 'alkaloid_toxin', 'thorns'])
      : kingdom === 'fungus'
      ? randChoice(['spore_burst', 'alkaloid_toxin', 'none', 'spore_burst'])
      : randChoice(FLORA_DEFENSES);
  const rootSystem = pickInitialRootSystem(form, kingdom);
  const surfaceTexture = pickInitialSurfaceTexture(form);

  // Distinct chromatic niches for xenobiotic flora vs fungi
  const hue =
    metabolism === 'Photosynthetic'
      ? randRange(0.24, 0.48) // Lush alien emeralds, chartreuse, teal-jade
      : metabolism === 'Carnivorous_Flora'
      ? randRange(0.84, 0.98) // Crimson-magenta pitcher traps
      : metabolism === 'Saprotrophic_Fungi'
      ? randRange(0.05, 0.16) // Amber, ochre, warm copper mushrooms
      : metabolism === 'Mycorrhizal_Fungi'
      ? randRange(0.54, 0.76) // Cyan-indigo-violet bioluminescent mycelium
      : randRange(0.38, 0.58); // Mixotrophic turquoise

  const baseColor = new THREE.Color().setHSL(hue, randRange(0.54, 0.86), randRange(0.24, 0.44));
  const accentColor = new THREE.Color().setHSL(
    (hue + randRange(0.05, 0.14)) % 1.0,
    randRange(0.58, 0.9),
    randRange(0.4, 0.62)
  );
  const glowColor = new THREE.Color().setHSL(
    (hue + randRange(0.1, 0.28)) % 1.0,
    randRange(0.8, 0.98),
    randRange(0.56, 0.74)
  );

  const toxicity =
    defense === 'alkaloid_toxin'
      ? randRange(0.52, 0.92)
      : defense === 'thorns' || defense === 'spore_burst'
      ? randRange(0.2, 0.48)
      : randRange(0.0, 0.22);

  const nutrientEfficiency =
    kingdom === 'fungus' || rootSystem === 'mycelial_web'
      ? randRange(1.06, 1.35)
      : randRange(0.84, 1.18);

  const canopySpread =
    form === 'parasol_mushroom' || form === 'spiral_fern' || form === 'canopy_blossom'
      ? randRange(0.95, 1.34)
      : randRange(0.78, 1.22);

  const biolumIntensity =
    kingdom === 'fungus' || form === 'canopy_blossom' || defense === 'spore_burst'
      ? randRange(0.78, 1.32)
      : randRange(0.42, 0.92);

  const maxHeight =
    form === 'spiral_fern' || form === 'tendril_vine'
      ? randRange(1.45, 2.55)
      : form === 'canopy_blossom'
      ? randRange(1.25, 2.2)
      : form === 'parasol_mushroom'
      ? randRange(1.05, 2.05)
      : form === 'puffball_mycelium' || form === 'crystal_succulent'
      ? randRange(0.75, 1.38)
      : randRange(0.9, 1.72);

  const frondCount =
    form === 'spiral_fern' || form === 'canopy_blossom'
      ? randInt(6, 10)
      : form === 'shelf_cluster' || form === 'coral_fungus'
      ? randInt(5, 9)
      : randInt(4, 8);

  return {
    speciesId: allocateSpeciesId(),
    parentSpeciesId: null,
    speciesName: generateSpeciesName(kingdom === 'fungus' ? 'fungus' : 'flora'),
    generation: 1,
    kingdom,
    form,
    metabolism,
    propagation,
    leafMorphology,
    defense,
    rootSystem,
    surfaceTexture,
    maxHeight,
    frondCount,
    canopySpread,
    toxicity,
    nutrientEfficiency,
    biolumIntensity,
    maxAge: randRange(155, 240),
    baseHex: baseColor.getHex(),
    accentHex: accentColor.getHex(),
    glowHex: glowColor.getHex(),
    swayFreq: kingdom === 'fungus' ? randRange(0.55, 1.05) : randRange(0.88, 1.48),
  };
}

export function normalizePlantGenome(raw: PlantGenome): PlantGenome {
  const kingdom = raw.kingdom ?? kingdomForFloraForm(raw.form);
  return {
    ...raw,
    kingdom,
    leafMorphology: raw.leafMorphology ?? pickInitialMorphology(raw.form),
    defense: raw.defense ?? 'none',
    rootSystem: raw.rootSystem ?? pickInitialRootSystem(raw.form, kingdom),
    surfaceTexture: raw.surfaceTexture ?? pickInitialSurfaceTexture(raw.form),
    canopySpread: Number.isFinite(raw.canopySpread) ? clamp(raw.canopySpread, 0.72, 1.42) : 1.0,
    toxicity: Number.isFinite(raw.toxicity) ? clamp(raw.toxicity, 0, 1) : 0.1,
    nutrientEfficiency: Number.isFinite(raw.nutrientEfficiency)
      ? clamp(raw.nutrientEfficiency, 0.72, 1.42)
      : 1.0,
    biolumIntensity: Number.isFinite(raw.biolumIntensity)
      ? clamp(raw.biolumIntensity, 0.35, 1.4)
      : 0.75,
  };
}

export interface PlantMutationResult {
  genome: PlantGenome;
  speciated: boolean;
}

export function recombinePlantGenomes(
  parentA: PlantGenome,
  parentB: PlantGenome | null,
  mutationRateMultiplier = 1.0,
  forceSpeciation = false
): PlantMutationResult {
  const pA = normalizePlantGenome(parentA);
  const pB = parentB ? normalizePlantGenome(parentB) : pA;

  const pick = <K extends keyof PlantGenome>(k: K): PlantGenome[K] =>
    Math.random() < 0.5 ? pA[k] : pB[k];

  const mutProb = clamp(0.13 * mutationRateMultiplier, 0.02, 0.65);
  let mutations = 0;
  const mut = <T>(val: T, pool: readonly T[]): T => {
    if (Math.random() < mutProb) {
      const next = randChoice(pool);
      if (next !== val) mutations++;
      return next;
    }
    return val;
  };

  // Keep form mutations primarily within kingdom unless strong mutation jumps kingdom!
  const sameKingdomPool = pA.kingdom === 'fungus' ? FUNGUS_ONLY_FORMS : PLANT_ONLY_FORMS;
  const formPool = Math.random() < 0.85 ? sameKingdomPool : FLORA_FORMS;

  let form = mut(pick('form'), formPool);
  let metabolism = mut(pick('metabolism'), FLORA_METABOLISMS);
  const propagation = mut(pick('propagation'), FLORA_PROPAGATIONS);
  let leafMorphology = mut(pick('leafMorphology'), FLORA_MORPHOLOGIES);
  let defense = mut(pick('defense'), FLORA_DEFENSES);
  const rootSystem = mut(pick('rootSystem'), FLORA_ROOT_SYSTEMS);
  const surfaceTexture = mut(pick('surfaceTexture'), FLORA_SURFACE_TEXTURES);

  if (forceSpeciation && mutations < 2 && form === pA.form && metabolism === pA.metabolism) {
    if (Math.random() < 0.68) {
      form = randChoice(FLORA_FORMS.filter((f) => f !== pA.form));
    } else {
      metabolism = randChoice(FLORA_METABOLISMS.filter((m) => m !== pA.metabolism));
      defense = randChoice(FLORA_DEFENSES.filter((d) => d !== pA.defense));
      leafMorphology = randChoice(FLORA_MORPHOLOGIES.filter((l) => l !== pA.leafMorphology));
    }
    mutations += 2;
  }

  const kingdom = kingdomForFloraForm(form);

  const cMix = new THREE.Color(pA.baseHex).lerp(new THREE.Color(pB.baseHex), 0.5);
  const hsl = { h: 0, s: 0, l: 0 };
  cMix.getHSL(hsl);
  cMix.setHSL(
    (hsl.h + (forceSpeciation ? randRange(0.14, 0.3) : randRange(-0.045, 0.045)) + 1.0) % 1.0,
    clamp(hsl.s + randRange(-0.05, 0.05), 0.45, 0.92),
    clamp(hsl.l + randRange(-0.04, 0.04), 0.22, 0.54)
  );

  const accMix = new THREE.Color(pA.accentHex).lerp(new THREE.Color(pB.accentHex), 0.5);
  const gMix = new THREE.Color(pA.glowHex).lerp(new THREE.Color(pB.glowHex), 0.5);
  if (forceSpeciation) {
    const ghsl = { h: 0, s: 0, l: 0 };
    gMix.getHSL(ghsl);
    gMix.setHSL((ghsl.h + randRange(0.16, 0.32)) % 1.0, clamp(ghsl.s, 0.74, 0.98), clamp(ghsl.l, 0.5, 0.72));
  }

  const qScale = forceSpeciation ? 2.0 : 1.0;
  const maxHeight = clamp(
    (pA.maxHeight + pB.maxHeight) * 0.5 * randRange(1 - 0.08 * qScale, 1 + 0.08 * qScale),
    0.72,
    2.8
  );
  const frondCount = clamp(
    Math.round((pA.frondCount + pB.frondCount) * 0.5) + (Math.random() < mutProb ? randInt(-1, 1) : 0),
    3,
    11
  );
  const canopySpread = clamp(
    (pA.canopySpread + pB.canopySpread) * 0.5 + randRange(-0.08, 0.08) * qScale,
    0.72,
    1.42
  );
  const toxicity = clamp(
    (pA.toxicity + pB.toxicity) * 0.5 + randRange(-0.09, 0.09) * qScale,
    0,
    1
  );
  const nutrientEfficiency = clamp(
    (pA.nutrientEfficiency + pB.nutrientEfficiency) * 0.5 + randRange(-0.08, 0.08) * qScale,
    0.72,
    1.42
  );
  const biolumIntensity = clamp(
    (pA.biolumIntensity + pB.biolumIntensity) * 0.5 + randRange(-0.09, 0.09) * qScale,
    0.35,
    1.4
  );

  const majorShift =
    form !== pA.form ||
    metabolism !== pA.metabolism ||
    (defense !== pA.defense && leafMorphology !== pA.leafMorphology);
  const speciated = forceSpeciation || mutations >= 2 || majorShift;

  return {
    speciated,
    genome: {
      speciesId: speciated ? allocateSpeciesId() : pA.speciesId,
      parentSpeciesId: speciated ? pA.speciesId : pA.parentSpeciesId,
      speciesName: speciated ? generateSpeciesName(kingdom === 'fungus' ? 'fungus' : 'flora') : pA.speciesName,
      generation: Math.max(pA.generation, pB.generation) + 1,
      kingdom,
      form,
      metabolism,
      propagation,
      leafMorphology,
      defense,
      rootSystem,
      surfaceTexture,
      maxHeight,
      frondCount,
      canopySpread,
      toxicity,
      nutrientEfficiency,
      biolumIntensity,
      maxAge: clamp((pA.maxAge + pB.maxAge) * 0.5 * randRange(0.94, 1.06), 145, 275),
      baseHex: cMix.getHex(),
      accentHex: accMix.getHex(),
      glowHex: gMix.getHex(),
      swayFreq: clamp((pA.swayFreq + pB.swayFreq) * 0.5 * randRange(0.94, 1.06), 0.5, 1.65),
    },
  };
}

export function mutatePlantGenome(
  parent: PlantGenome,
  mutationRateMultiplier = 1.0,
  forceSpeciation = false
): PlantMutationResult {
  return recombinePlantGenomes(parent, null, mutationRateMultiplier, forceSpeciation);
}
