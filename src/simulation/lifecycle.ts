import { clamp } from '../core/math';
import type { AnimalGenome, PlantGenome } from '../genetics/types';

/**
 * Full developmental lifecycle stages for alien terrarium fauna:
 * - Egg-layers: EggEntity -> Larva / Instar I-III -> Adult -> Elder -> Corpse
 * - Live-bearers & Budders: Neonate (spawn) -> Larva / Instar I-III -> Adult -> Elder -> Corpse
 */
export type AnimalLifeStage = 'spawn' | 'larva' | 'instar' | 'adult' | 'elder';

export const LIFECYCLE_THRESHOLDS = {
  intermediateStart: 0.28,
  instar2Start: 0.44,
  instar3Start: 0.60,
  adultStart: 0.75,
  /** Fraction of maxAge at which an adult enters visible old age (Elder). */
  elderAgeRatio: 0.78,
} as const;

export interface StageBehaviorModifiers {
  readonly speedMult: number;
  readonly attackMult: number;
  readonly visionMult: number;
  readonly windDragMult: number;
  readonly gaitFreqMult: number;
  readonly herdingMult: number;
  readonly metabolicMult: number;
  readonly canHunt: boolean;
  readonly maxPreyScaleRatio: number;
  readonly threatScaleRatio: number;
  readonly canTerritorial: boolean;
  readonly canBreed: boolean;
}

/**
 * Exoskeleton/arthropod-like terrarium lineages (hexapod walkers, armored crawlers,
 * and chitin-carapaced species) undergo stepped ecdysis molts through Instar I-III.
 * Soft-bodied, serpentine, aerial, and elastic bouncer lineages develop via a Larva stage.
 */
export function usesInstarStage(genome: AnimalGenome): boolean {
  return (
    genome.bodyPlan === 'hexapod_walker' ||
    genome.bodyPlan === 'armored_crawler' ||
    genome.integument === 'chitin_carapace'
  );
}

export function getIntermediateStage(genome: AnimalGenome): 'instar' | 'larva' {
  return usesInstarStage(genome) ? 'instar' : 'larva';
}

export function getLifeStageFromMaturity(
  genome: AnimalGenome,
  maturity: number,
  ageRatio = 0
): AnimalLifeStage {
  if (maturity >= LIFECYCLE_THRESHOLDS.adultStart) {
    return ageRatio >= LIFECYCLE_THRESHOLDS.elderAgeRatio ? 'elder' : 'adult';
  }
  if (maturity >= LIFECYCLE_THRESHOLDS.intermediateStart) return getIntermediateStage(genome);
  return 'spawn';
}

export function getInstarRank(maturity: number): 1 | 2 | 3 {
  if (maturity >= LIFECYCLE_THRESHOLDS.instar3Start) return 3;
  if (maturity >= LIFECYCLE_THRESHOLDS.instar2Start) return 2;
  return 1;
}

export function getInitialMaturityForStage(stage: AnimalLifeStage): number {
  if (stage === 'spawn') return 0.06;
  if (stage === 'larva' || stage === 'instar') return LIFECYCLE_THRESHOLDS.intermediateStart + 0.02;
  if (stage === 'elder') return 1.0;
  return 0.88;
}

export function getStageDisplayLabel(
  genome: AnimalGenome,
  lifeStage: AnimalLifeStage,
  maturity: number
): string {
  if (lifeStage === 'spawn') {
    return genome.reproduction === 'Budding_Fission' ? 'Budling' : 'Neonate';
  }
  if (lifeStage === 'elder') return 'Elder';
  if (lifeStage === 'adult') return 'Adult';
  if (lifeStage === 'instar' || usesInstarStage(genome)) {
    const rank = getInstarRank(maturity);
    return rank === 1 ? 'Nymph I' : rank === 2 ? 'Nymph II' : 'Nymph III';
  }
  return 'Larva';
}

export function getLifecyclePathSummary(genome: AnimalGenome): string {
  const birth =
    genome.reproduction === 'Egg_Layer'
      ? 'Egg'
      : genome.reproduction === 'Budding_Fission'
      ? 'Bud'
      : 'Neonate';
  const mid = usesInstarStage(genome) ? 'Nymph I–III' : 'Larva';
  return `${birth} → ${mid} → Adult → Elder`;
}

export function getPlantStageLabel(genome: PlantGenome, growth: number, ageRatio: number, wilting: boolean): string {
  if (wilting) return 'Wilting';
  if (ageRatio >= 0.82) return 'Senescent';
  if (genome.kingdom === 'fungus') {
    if (growth < 0.34) return 'Pinhead';
    if (growth < 0.66) return 'Button';
    if (growth < 0.9) return 'Mature Cap';
    return 'Fruiting';
  }
  if (growth < 0.34) return 'Sprout';
  if (growth < 0.66) return 'Sapling';
  if (growth < 0.9) return 'Mature';
  return 'Blooming';
}

export function computeStageScale(
  genome: AnimalGenome,
  lifeStage: AnimalLifeStage,
  maturity: number
): number {
  const m = clamp(maturity, 0.0, 1.0);
  let mult: number;

  if (lifeStage === 'spawn') {
    const t = clamp(m / LIFECYCLE_THRESHOLDS.intermediateStart, 0, 1);
    mult = 0.28 + t * 0.14;
  } else if (lifeStage === 'instar') {
    if (m < LIFECYCLE_THRESHOLDS.instar2Start) {
      const t = clamp(
        (m - LIFECYCLE_THRESHOLDS.intermediateStart) /
          (LIFECYCLE_THRESHOLDS.instar2Start - LIFECYCLE_THRESHOLDS.intermediateStart),
        0,
        1
      );
      mult = 0.46 + t * 0.05;
    } else if (m < LIFECYCLE_THRESHOLDS.instar3Start) {
      const t = clamp(
        (m - LIFECYCLE_THRESHOLDS.instar2Start) /
          (LIFECYCLE_THRESHOLDS.instar3Start - LIFECYCLE_THRESHOLDS.instar2Start),
        0,
        1
      );
      mult = 0.58 + t * 0.05;
    } else {
      const t = clamp(
        (m - LIFECYCLE_THRESHOLDS.instar3Start) /
          (LIFECYCLE_THRESHOLDS.adultStart - LIFECYCLE_THRESHOLDS.instar3Start),
        0,
        1
      );
      mult = 0.70 + t * 0.07;
    }
  } else if (lifeStage === 'larva') {
    const t = clamp(
      (m - LIFECYCLE_THRESHOLDS.intermediateStart) /
        (LIFECYCLE_THRESHOLDS.adultStart - LIFECYCLE_THRESHOLDS.intermediateStart),
      0,
      1
    );
    mult = 0.47 + t * 0.3;
  } else if (lifeStage === 'elder') {
    mult = 1.02;
  } else {
    const t = clamp(
      (m - LIFECYCLE_THRESHOLDS.adultStart) / (1.0 - LIFECYCLE_THRESHOLDS.adultStart),
      0,
      1
    );
    mult = 0.85 + t * 0.19;
  }

  return Math.max(0.09, genome.sizeScale * mult);
}

export function computeStageMaxHp(
  genome: AnimalGenome,
  lifeStage: AnimalLifeStage,
  maturity: number
): number {
  const m = clamp(maturity, 0, 1);
  let hpMult: number;
  if (lifeStage === 'spawn') {
    const t = clamp(m / LIFECYCLE_THRESHOLDS.intermediateStart, 0, 1);
    hpMult = 0.35 + t * 0.12;
  } else if (lifeStage === 'larva' || lifeStage === 'instar') {
    const t = clamp(
      (m - LIFECYCLE_THRESHOLDS.intermediateStart) /
        (LIFECYCLE_THRESHOLDS.adultStart - LIFECYCLE_THRESHOLDS.intermediateStart),
      0,
      1
    );
    hpMult = (lifeStage === 'instar' ? 0.58 : 0.52) + t * 0.28;
  } else if (lifeStage === 'elder') {
    hpMult = 0.78;
  } else {
    const t = clamp(
      (m - LIFECYCLE_THRESHOLDS.adultStart) / (1.0 - LIFECYCLE_THRESHOLDS.adultStart),
      0,
      1
    );
    hpMult = 0.9 + t * 0.1;
  }
  return Math.max(16, Math.round(genome.maxHp * hpMult));
}

export function getStageBehaviorModifiers(
  lifeStage: AnimalLifeStage,
  maturity: number
): StageBehaviorModifiers {
  const m = clamp(maturity, 0, 1);

  if (lifeStage === 'spawn') {
    const t = clamp(m / LIFECYCLE_THRESHOLDS.intermediateStart, 0, 1);
    return {
      speedMult: 0.68 + t * 0.1,
      attackMult: 0.25,
      visionMult: 0.65,
      windDragMult: 1.55,
      gaitFreqMult: 1.4,
      herdingMult: 1.7,
      metabolicMult: 0.62,
      canHunt: false,
      maxPreyScaleRatio: 0,
      threatScaleRatio: 1.32,
      canTerritorial: false,
      canBreed: false,
    };
  }

  if (lifeStage === 'larva') {
    const t = clamp(
      (m - LIFECYCLE_THRESHOLDS.intermediateStart) /
        (LIFECYCLE_THRESHOLDS.adultStart - LIFECYCLE_THRESHOLDS.intermediateStart),
      0,
      1
    );
    return {
      speedMult: 0.85 + t * 0.11,
      attackMult: 0.5 + t * 0.22,
      visionMult: 0.85 + t * 0.08,
      windDragMult: 1.2,
      gaitFreqMult: 1.18,
      herdingMult: 1.48,
      metabolicMult: 0.8,
      canHunt: true,
      maxPreyScaleRatio: 0.88,
      threatScaleRatio: 1.42,
      canTerritorial: false,
      canBreed: false,
    };
  }

  if (lifeStage === 'instar') {
    const t = clamp(
      (m - LIFECYCLE_THRESHOLDS.intermediateStart) /
        (LIFECYCLE_THRESHOLDS.adultStart - LIFECYCLE_THRESHOLDS.intermediateStart),
      0,
      1
    );
    return {
      speedMult: 0.84 + t * 0.12,
      attackMult: 0.54 + t * 0.22,
      visionMult: 0.84 + t * 0.08,
      windDragMult: 0.92,
      gaitFreqMult: 1.22,
      herdingMult: 1.25,
      metabolicMult: 0.78,
      canHunt: true,
      maxPreyScaleRatio: 0.86,
      threatScaleRatio: 1.38,
      canTerritorial: false,
      canBreed: false,
    };
  }

  if (lifeStage === 'elder') {
    return {
      speedMult: 0.74,
      attackMult: 0.82,
      visionMult: 0.88,
      windDragMult: 0.95,
      gaitFreqMult: 0.78,
      herdingMult: 1.1,
      metabolicMult: 1.18,
      canHunt: true,
      maxPreyScaleRatio: 1.05,
      threatScaleRatio: 0.88,
      canTerritorial: false,
      canBreed: false,
    };
  }

  return {
    speedMult: 1.0,
    attackMult: 1.0,
    visionMult: 1.0,
    windDragMult: 1.0,
    gaitFreqMult: 1.0,
    herdingMult: 1.0,
    metabolicMult: 1.0,
    canHunt: true,
    maxPreyScaleRatio: 1.32,
    threatScaleRatio: 0.72,
    canTerritorial: true,
    canBreed: true,
  };
}
