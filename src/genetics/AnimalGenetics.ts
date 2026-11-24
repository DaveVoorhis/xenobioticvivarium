import * as THREE from 'three';
import { clamp, randChoice, randInt, randRange } from '../core/math';
import {
  ANIMAL_APPENDAGES,
  ANIMAL_BODY_PLANS,
  ANIMAL_COMBATS,
  ANIMAL_DIETS,
  ANIMAL_INTEGUMENTS,
  ANIMAL_PARTS,
  ANIMAL_PHYSIOLOGIES,
  ANIMAL_REPROS,
  ANIMAL_SENSORIES,
  ANIMAL_SOCIALS,
  SKIN_PATTERNS,
  allocateSpeciesId,
  generateSpeciesName,
  locomotionForBodyPlan,
} from './taxonomy';
import type {
  AnimalAppendage,
  AnimalBodyPlan,
  AnimalCombat,
  AnimalDiet,
  AnimalFunctionalPart,
  AnimalGenome,
  AnimalIntegument,
  AnimalPhysiology,
  AnimalSensory,
  AnimalSocial,
  StratumPreference,
} from './types';

function pickStratumPreference(bodyPlan: AnimalBodyPlan, diet: AnimalDiet): StratumPreference {
  if (bodyPlan === 'aerial_glider') {
    return diet === 'Nectarivore' ? 'understory' : Math.random() < 0.68 ? 'canopy' : 'understory';
  }
  if (bodyPlan === 'spring_bouncer') {
    return Math.random() < 0.4 ? 'understory' : 'ground';
  }
  return 'ground';
}

function pickInitialIntegument(bodyPlan: AnimalBodyPlan): AnimalIntegument {
  if (bodyPlan === 'armored_crawler') {
    return Math.random() < 0.72 ? 'chitin_carapace' : 'spined_hide';
  }
  if (bodyPlan === 'aerial_glider') {
    return randChoice(['iridescent_scales', 'translucent_gel', 'velvet_moss']);
  }
  if (bodyPlan === 'serpentine_slitherer') {
    return Math.random() < 0.62 ? 'iridescent_scales' : 'velvet_moss';
  }
  if (bodyPlan === 'spring_bouncer') {
    return randChoice(['translucent_gel', 'velvet_moss', 'iridescent_scales']);
  }
  return randChoice(ANIMAL_INTEGUMENTS);
}

function pickInitialSensory(diet: AnimalDiet, bodyPlan: AnimalBodyPlan): AnimalSensory {
  if (bodyPlan === 'serpentine_slitherer') {
    return Math.random() < 0.6 ? 'thermal_pits' : 'vibration_hairs';
  }
  if (bodyPlan === 'hexapod_walker' || bodyPlan === 'armored_crawler') {
    return Math.random() < 0.55 ? 'compound_optics' : 'chemo_antennae';
  }
  if (diet === 'Carnivore') {
    return randChoice(['binocular_eyes', 'thermal_pits', 'compound_optics']);
  }
  if (diet === 'Fungivore' || diet === 'Scavenger') {
    return Math.random() < 0.65 ? 'chemo_antennae' : 'vibration_hairs';
  }
  return randChoice(ANIMAL_SENSORIES);
}

function pickInitialPhysiology(diet: AnimalDiet, bodyPlan: AnimalBodyPlan): AnimalPhysiology {
  if (diet === 'Fungivore') {
    return Math.random() < 0.65 ? 'myco_symbiotic' : 'toxin_resistant';
  }
  if (diet === 'Nectarivore' || bodyPlan === 'aerial_glider') {
    return randChoice(['hyper_metabolic', 'photosymbiotic', 'ectothermic']);
  }
  if (diet === 'Herbivore') {
    return randChoice(['photosymbiotic', 'toxin_resistant', 'ectothermic']);
  }
  if (diet === 'Carnivore') {
    return randChoice(['hyper_metabolic', 'toxin_resistant', 'ectothermic']);
  }
  return randChoice(ANIMAL_PHYSIOLOGIES);
}

function pickInitialAppendage(bodyPlan: AnimalBodyPlan): AnimalAppendage {
  if (bodyPlan === 'aerial_glider') return 'membranous_wings';
  if (bodyPlan === 'serpentine_slitherer') {
    return randChoice(['dorsal_sail', 'whip_antennae', 'tail_fronds', 'spore_plumes']);
  }
  if (bodyPlan === 'spring_bouncer') {
    return randChoice(['spore_plumes', 'stalked_eyes', 'tail_fronds', 'dorsal_sail']);
  }
  return randChoice(ANIMAL_APPENDAGES);
}

function pickInitialPart(diet: AnimalDiet, bodyPlan: AnimalBodyPlan): AnimalFunctionalPart {
  if (diet === 'Nectarivore') {
    return Math.random() < 0.55 ? 'proboscis' : 'pollen_baskets';
  }
  if (diet === 'Carnivore') {
    return randChoice(['crushing_mandibles', 'venom_stinger', 'biolum_lure', 'chitin_spines']);
  }
  if (bodyPlan === 'armored_crawler') {
    return Math.random() < 0.5 ? 'armored_plates' : randChoice(ANIMAL_PARTS);
  }
  if (bodyPlan === 'spring_bouncer') {
    return Math.random() < 0.45 ? 'vocal_sac' : randChoice(ANIMAL_PARTS);
  }
  return randChoice(ANIMAL_PARTS);
}

function computeDerivedMaxHp(
  sizeScale: number,
  integument: AnimalIntegument,
  functionalPart: AnimalFunctionalPart,
  armorDensity: number
): number {
  let mult = 1.0 + armorDensity * 0.36;
  if (integument === 'chitin_carapace') mult += 0.22;
  else if (integument === 'spined_hide') mult += 0.14;
  else if (integument === 'translucent_gel') mult -= 0.1;
  if (functionalPart === 'armored_plates') mult += 0.16;
  return Math.round((56 + sizeScale * 76) * clamp(mult, 0.72, 1.88));
}

function computeDerivedSpeed(
  baseSpeed: number,
  integument: AnimalIntegument,
  physiology: AnimalPhysiology,
  armorDensity: number,
  bodyElongation: number
): number {
  let mult = 1.0 - armorDensity * 0.15 + (bodyElongation - 1.0) * 0.1;
  if (integument === 'iridescent_scales') mult += 0.06;
  else if (integument === 'chitin_carapace') mult -= 0.08;
  if (physiology === 'hyper_metabolic') mult += 0.15;
  return clamp(baseSpeed * mult, 0.95, 4.4);
}

export function createAnimalGenome(
  forcedDiet: AnimalDiet | null = null,
  forcedPlan: AnimalBodyPlan | null = null
): AnimalGenome {
  const bodyPlan = forcedPlan ?? randChoice(ANIMAL_BODY_PLANS);
  const locomotion = locomotionForBodyPlan(bodyPlan);

  let diet: AnimalDiet;
  if (forcedDiet) {
    diet = forcedDiet;
  } else if (bodyPlan === 'aerial_glider') {
    diet = randChoice(['Nectarivore', 'Herbivore', 'Carnivore', 'Omnivore', 'Nectarivore']);
  } else if (bodyPlan === 'armored_crawler') {
    diet = randChoice(['Scavenger', 'Fungivore', 'Herbivore', 'Omnivore']);
  } else if (bodyPlan === 'serpentine_slitherer') {
    diet = randChoice(['Carnivore', 'Omnivore', 'Carnivore', 'Fungivore']);
  } else if (bodyPlan === 'spring_bouncer') {
    diet = randChoice(['Herbivore', 'Fungivore', 'Nectarivore', 'Omnivore']);
  } else {
    diet = randChoice(ANIMAL_DIETS);
  }

  const appendage = pickInitialAppendage(bodyPlan);
  const functionalPart = pickInitialPart(diet, bodyPlan);
  const integument = pickInitialIntegument(bodyPlan);
  const sensoryOrgan = pickInitialSensory(diet, bodyPlan);
  const physiology = pickInitialPhysiology(diet, bodyPlan);

  let combat: AnimalCombat = randChoice(ANIMAL_COMBATS);
  if (diet === 'Carnivore') {
    combat = randChoice(['Ambush_Pounce', 'Melee_Strike', 'Venom_Spines', 'Melee_Strike']);
  } else if (diet === 'Nectarivore' || diet === 'Herbivore' || diet === 'Fungivore') {
    combat = randChoice(['Evasive_Leap', 'Bio_Flash', 'Spore_Cloud', 'Shell_Brace', 'Venom_Spines']);
  }

  let social: AnimalSocial;
  if (diet === 'Carnivore' && Math.random() < 0.48) {
    social = 'Pack_Hunter';
  } else if (diet === 'Nectarivore' || (diet === 'Fungivore' && Math.random() < 0.5)) {
    social = Math.random() < 0.65 ? 'Symbiotic_Mutualist' : 'Flocking_Herd';
  } else if (diet === 'Herbivore' && Math.random() < 0.62) {
    social = 'Flocking_Herd';
  } else {
    social = randChoice(ANIMAL_SOCIALS);
  }

  const reproduction = randChoice(ANIMAL_REPROS);
  const skinPattern = randChoice(SKIN_PATTERNS);
  const stratumPref = pickStratumPreference(bodyPlan, diet);

  // Vivid xenobiotic terrarium palettes (emerald, magenta, amber-gold, cyan, violet, coral)
  const hue = Math.random();
  const baseColor = new THREE.Color().setHSL(hue, randRange(0.56, 0.88), randRange(0.32, 0.54));
  const accentColor = new THREE.Color().setHSL(
    (hue + randRange(0.08, 0.2)) % 1.0,
    randRange(0.55, 0.88),
    randRange(0.46, 0.68)
  );
  const glowColor = new THREE.Color().setHSL(
    (hue + randRange(0.18, 0.46)) % 1.0,
    randRange(0.8, 0.98),
    randRange(0.55, 0.72)
  );

  const sizeScale =
    diet === 'Carnivore'
      ? randRange(0.54, 0.86)
      : bodyPlan === 'aerial_glider'
      ? randRange(0.38, 0.64)
      : bodyPlan === 'spring_bouncer'
      ? randRange(0.42, 0.68)
      : randRange(0.42, 0.72);

  const bodyElongation =
    bodyPlan === 'serpentine_slitherer'
      ? randRange(1.12, 1.38)
      : bodyPlan === 'armored_crawler'
      ? randRange(0.88, 1.15)
      : randRange(0.84, 1.2);

  const limbSpan =
    bodyPlan === 'aerial_glider'
      ? randRange(1.02, 1.38)
      : bodyPlan === 'hexapod_walker'
      ? randRange(0.92, 1.28)
      : randRange(0.8, 1.2);

  const armorDensity = clamp(
    (integument === 'chitin_carapace'
      ? randRange(0.56, 0.94)
      : integument === 'spined_hide'
      ? randRange(0.36, 0.72)
      : integument === 'translucent_gel'
      ? randRange(0.04, 0.24)
      : randRange(0.14, 0.48)) + (functionalPart === 'armored_plates' ? 0.18 : 0),
    0,
    1
  );

  const toxicity = clamp(
    combat === 'Venom_Spines' || functionalPart === 'venom_stinger'
      ? randRange(0.5, 0.92)
      : randRange(0.0, 0.3),
    0,
    1
  );

  const metabolicEfficiency = clamp(
    physiology === 'ectothermic'
      ? randRange(1.05, 1.28)
      : physiology === 'hyper_metabolic'
      ? randRange(0.78, 0.98)
      : randRange(0.88, 1.18),
    0.72,
    1.34
  );

  const rawSpeed =
    bodyPlan === 'aerial_glider'
      ? randRange(2.55, 3.7)
      : bodyPlan === 'hexapod_walker'
      ? randRange(1.95, 2.95)
      : bodyPlan === 'spring_bouncer'
      ? randRange(2.15, 3.25)
      : bodyPlan === 'serpentine_slitherer'
      ? randRange(1.75, 2.75)
      : randRange(1.3, 2.15);

  const jumpPower =
    bodyPlan === 'spring_bouncer'
      ? randRange(4.8, 7.2)
      : combat === 'Evasive_Leap' || combat === 'Ambush_Pounce'
      ? randRange(3.2, 4.6)
      : randRange(1.4, 2.4);

  const speed = computeDerivedSpeed(rawSpeed, integument, physiology, armorDensity, bodyElongation);
  const maxHp = computeDerivedMaxHp(sizeScale, integument, functionalPart, armorDensity);

  const baseVision = diet === 'Carnivore' ? randRange(8.2, 11.4) : randRange(6.4, 9.2);
  const visionBonus =
    sensoryOrgan === 'binocular_eyes'
      ? 1.12
      : sensoryOrgan === 'thermal_pits' || sensoryOrgan === 'compound_optics'
      ? 1.08
      : 1.0;

  return {
    speciesId: allocateSpeciesId(),
    parentSpeciesId: null,
    speciesName: generateSpeciesName('fauna'),
    generation: 1,
    bodyPlan,
    locomotion,
    appendage,
    functionalPart,
    diet,
    social,
    combat,
    reproduction,
    skinPattern,
    integument,
    sensoryOrgan,
    physiology,
    stratumPref,
    sizeScale,
    bodyElongation,
    limbSpan,
    armorDensity,
    toxicity,
    metabolicEfficiency,
    speed,
    jumpPower,
    visionRange: clamp(baseVision * visionBonus, 5.6, 13.0),
    maxHp,
    attackPower:
      diet === 'Carnivore'
        ? randRange(16, 25)
        : diet === 'Omnivore'
        ? randRange(10, 16)
        : randRange(5, 11),
    maxAge: randRange(130, 215),
    baseHex: baseColor.getHex(),
    accentHex: accentColor.getHex(),
    glowHex: glowColor.getHex(),
    segments:
      bodyPlan === 'serpentine_slitherer'
        ? randInt(8, 11)
        : bodyPlan === 'armored_crawler'
        ? randInt(5, 7)
        : 4,
    wingFreq: bodyPlan === 'aerial_glider' ? randRange(3.8, 6.2) : randRange(2.4, 3.8),
    gaitFreq: randRange(3.2, 5.2),
    slitherFreq: randRange(2.8, 4.4),
    biolumIntensity: randRange(0.55, 1.12),
  };
}

export function normalizeAnimalGenome(raw: AnimalGenome): AnimalGenome {
  const locomotion = locomotionForBodyPlan(raw.bodyPlan);
  const integument = raw.integument ?? pickInitialIntegument(raw.bodyPlan);
  const sensoryOrgan = raw.sensoryOrgan ?? pickInitialSensory(raw.diet, raw.bodyPlan);
  const physiology = raw.physiology ?? pickInitialPhysiology(raw.diet, raw.bodyPlan);
  const sizeScale = Number.isFinite(raw.sizeScale) ? clamp(raw.sizeScale, 0.34, 0.96) : 0.56;
  const armorDensity = Number.isFinite(raw.armorDensity) ? clamp(raw.armorDensity, 0, 1) : 0.25;
  return {
    ...raw,
    locomotion,
    integument,
    sensoryOrgan,
    physiology,
    stratumPref: raw.stratumPref ?? pickStratumPreference(raw.bodyPlan, raw.diet),
    sizeScale,
    bodyElongation: Number.isFinite(raw.bodyElongation) ? clamp(raw.bodyElongation, 0.74, 1.44) : 1.0,
    limbSpan: Number.isFinite(raw.limbSpan) ? clamp(raw.limbSpan, 0.72, 1.44) : 1.0,
    armorDensity,
    toxicity: Number.isFinite(raw.toxicity) ? clamp(raw.toxicity, 0, 1) : 0.1,
    metabolicEfficiency: Number.isFinite(raw.metabolicEfficiency)
      ? clamp(raw.metabolicEfficiency, 0.72, 1.34)
      : 1.0,
    speed: Number.isFinite(raw.speed) ? clamp(raw.speed, 0.95, 4.4) : 2.1,
    jumpPower: Number.isFinite(raw.jumpPower) ? clamp(raw.jumpPower, 1.2, 8.0) : 3.2,
    visionRange: Number.isFinite(raw.visionRange) ? clamp(raw.visionRange, 5.6, 13.0) : 8.0,
    maxHp: Number.isFinite(raw.maxHp)
      ? clamp(raw.maxHp, 35, 280)
      : computeDerivedMaxHp(sizeScale, integument, raw.functionalPart, armorDensity),
    attackPower: Number.isFinite(raw.attackPower) ? clamp(raw.attackPower, 4, 34) : 12,
    maxAge: Number.isFinite(raw.maxAge) ? clamp(raw.maxAge, 90, 260) : 165,
    biolumIntensity: Number.isFinite(raw.biolumIntensity) ? clamp(raw.biolumIntensity, 0.35, 1.4) : 0.78,
  };
}

export interface AnimalRecombinationResult {
  genome: AnimalGenome;
  speciated: boolean;
}

export function recombineAnimalGenomes(
  gA: AnimalGenome,
  gB: AnimalGenome | null,
  mutationRateMultiplier = 1.0,
  forceSpeciation = false
): AnimalRecombinationResult {
  const pA = normalizeAnimalGenome(gA);
  const pB = gB ? normalizeAnimalGenome(gB) : pA;

  const pick = <K extends keyof AnimalGenome>(k: K): AnimalGenome[K] =>
    Math.random() < 0.5 ? pA[k] : pB[k];

  const baseMutProb = clamp(0.12 * mutationRateMultiplier, 0.02, 0.65);
  let mutations = 0;
  const mut = <T>(val: T, pool: readonly T[]): T => {
    if (Math.random() < baseMutProb) {
      const next = randChoice(pool);
      if (next !== val) mutations++;
      return next;
    }
    return val;
  };

  let bodyPlan = mut(pick('bodyPlan'), ANIMAL_BODY_PLANS);
  const diet = mut(pick('diet'), ANIMAL_DIETS);
  let integument = mut(pick('integument'), ANIMAL_INTEGUMENTS);
  let sensoryOrgan = mut(pick('sensoryOrgan'), ANIMAL_SENSORIES);
  let physiology = mut(pick('physiology'), ANIMAL_PHYSIOLOGIES);

  if (forceSpeciation && mutations < 2 && bodyPlan === pA.bodyPlan && diet === pA.diet) {
    if (Math.random() < 0.65) {
      bodyPlan = randChoice(ANIMAL_BODY_PLANS.filter((p) => p !== pA.bodyPlan));
    } else {
      integument = randChoice(ANIMAL_INTEGUMENTS.filter((x) => x !== pA.integument));
      physiology = randChoice(ANIMAL_PHYSIOLOGIES.filter((x) => x !== pA.physiology));
      sensoryOrgan = randChoice(ANIMAL_SENSORIES.filter((x) => x !== pA.sensoryOrgan));
    }
    mutations += 2;
  }

  const locomotion = locomotionForBodyPlan(bodyPlan);
  const appendage =
    bodyPlan === 'aerial_glider' ? 'membranous_wings' : mut(pick('appendage'), ANIMAL_APPENDAGES);
  const functionalPart = mut(pick('functionalPart'), ANIMAL_PARTS);
  const social = mut(pick('social'), ANIMAL_SOCIALS);
  const combat = mut(pick('combat'), ANIMAL_COMBATS);
  const reproduction = mut(pick('reproduction'), ANIMAL_REPROS);
  const skinPattern = mut(pick('skinPattern'), SKIN_PATTERNS);
  const stratumPref =
    bodyPlan !== pA.bodyPlan || Math.random() < baseMutProb
      ? pickStratumPreference(bodyPlan, diet)
      : pick('stratumPref');

  const cMix = new THREE.Color(pA.baseHex).lerp(new THREE.Color(pB.baseHex), 0.5);
  const hsl = { h: 0, s: 0, l: 0 };
  cMix.getHSL(hsl);
  const hueShift = forceSpeciation ? randRange(0.14, 0.34) : randRange(-0.055, 0.055);
  cMix.setHSL(
    (hsl.h + hueShift + 1.0) % 1.0,
    clamp(hsl.s + randRange(-0.05, 0.05), 0.45, 0.92),
    clamp(hsl.l + randRange(-0.04, 0.04), 0.28, 0.64)
  );

  const accMix = new THREE.Color(pA.accentHex).lerp(new THREE.Color(pB.accentHex), 0.5);
  const gMix = new THREE.Color(pA.glowHex).lerp(new THREE.Color(pB.glowHex), 0.5);
  if (forceSpeciation) {
    const ghsl = { h: 0, s: 0, l: 0 };
    gMix.getHSL(ghsl);
    gMix.setHSL((ghsl.h + randRange(0.16, 0.36)) % 1.0, 0.92, 0.65);
  }

  const qScale = forceSpeciation ? 2.1 : 1.0;
  const sizeScale = clamp(
    (pA.sizeScale + pB.sizeScale) * 0.5 * randRange(1 - 0.08 * qScale, 1 + 0.08 * qScale),
    0.34,
    0.94
  );
  const bodyElongation = clamp(
    (pA.bodyElongation + pB.bodyElongation) * 0.5 + randRange(-0.09, 0.09) * qScale,
    0.74,
    1.44
  );
  const limbSpan = clamp(
    (pA.limbSpan + pB.limbSpan) * 0.5 + randRange(-0.09, 0.09) * qScale,
    0.72,
    1.44
  );
  const armorDensity = clamp(
    (pA.armorDensity + pB.armorDensity) * 0.5 + randRange(-0.1, 0.1) * qScale,
    0,
    1
  );
  const toxicity = clamp(
    (pA.toxicity + pB.toxicity) * 0.5 + randRange(-0.1, 0.1) * qScale,
    0,
    1
  );
  const metabolicEfficiency = clamp(
    (pA.metabolicEfficiency + pB.metabolicEfficiency) * 0.5 + randRange(-0.07, 0.07) * qScale,
    0.72,
    1.34
  );

  const avgSpeed = (pA.speed + pB.speed) * 0.5 * randRange(0.94, 1.06);
  const speed = computeDerivedSpeed(avgSpeed, integument, physiology, armorDensity, bodyElongation);
  const maxHp = computeDerivedMaxHp(sizeScale, integument, functionalPart, armorDensity);
  const jumpPower = clamp(
    bodyPlan === 'spring_bouncer'
      ? Math.max(4.6, (pA.jumpPower + pB.jumpPower) * 0.5 * randRange(0.94, 1.08))
      : (pA.jumpPower + pB.jumpPower) * 0.5 * randRange(0.94, 1.06),
    1.3,
    7.8
  );

  const majorShift =
    bodyPlan !== pA.bodyPlan ||
    diet !== pA.diet ||
    (physiology !== pA.physiology && integument !== pA.integument);
  const speciated = forceSpeciation || mutations >= 2 || majorShift;

  return {
    speciated,
    genome: {
      speciesId: speciated ? allocateSpeciesId() : pA.speciesId,
      parentSpeciesId: speciated ? pA.speciesId : pA.parentSpeciesId,
      speciesName: speciated ? generateSpeciesName('fauna') : pA.speciesName,
      generation: Math.max(pA.generation, pB.generation) + 1,
      bodyPlan,
      locomotion,
      appendage,
      functionalPart,
      diet,
      social,
      combat,
      reproduction,
      skinPattern,
      integument,
      sensoryOrgan,
      physiology,
      stratumPref,
      sizeScale,
      bodyElongation,
      limbSpan,
      armorDensity,
      toxicity,
      metabolicEfficiency,
      speed,
      jumpPower,
      visionRange: clamp((pA.visionRange + pB.visionRange) * 0.5 * randRange(0.95, 1.06), 5.6, 13.0),
      maxHp,
      attackPower: clamp((pA.attackPower + pB.attackPower) * 0.5 * randRange(0.92, 1.08), 5, 30),
      maxAge: clamp((pA.maxAge + pB.maxAge) * 0.5 * randRange(0.93, 1.07), 120, 245),
      baseHex: cMix.getHex(),
      accentHex: accMix.getHex(),
      glowHex: gMix.getHex(),
      segments:
        bodyPlan === 'serpentine_slitherer'
          ? clamp(Math.round((pA.segments + pB.segments) * 0.5) + randInt(-1, 1), 7, 12)
          : bodyPlan === 'armored_crawler'
          ? clamp(Math.round((pA.segments + pB.segments) * 0.5), 5, 7)
          : 4,
      wingFreq: clamp((pA.wingFreq + pB.wingFreq) * 0.5 * randRange(0.95, 1.05), 2.2, 6.8),
      gaitFreq: clamp((pA.gaitFreq + pB.gaitFreq) * 0.5 * randRange(0.95, 1.05), 2.6, 5.8),
      slitherFreq: clamp((pA.slitherFreq + pB.slitherFreq) * 0.5 * randRange(0.95, 1.05), 2.4, 4.8),
      biolumIntensity: clamp(
        (pA.biolumIntensity + pB.biolumIntensity) * 0.5 * randRange(0.9, 1.12),
        0.4,
        1.38
      ),
    },
  };
}
