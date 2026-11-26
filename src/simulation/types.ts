import * as THREE from 'three';
import type { AnimalGenome, PlantGenome, SpeciesRecord } from '../genetics/types';
import type { EnvironmentParameters } from '../core/config';
import type { FragmentKind } from '../core/EventBus';
import type { AnimalLifeStage } from './lifecycle';

export type { AnimalLifeStage } from './lifecycle';

export type EntityKind = 'animal' | 'plant' | 'egg' | 'propagule' | 'corpse' | 'pellet';

export interface BaseEntity {
  id: number;
  kind: EntityKind;
  alive: boolean;
  position: THREE.Vector3;
  lastValidPos: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: number;
  age: number;
  stage: string;
  state: string;
}

export type ActiveTargetRole = 'threat' | 'prey' | 'mate' | 'food' | 'pollinate' | 'rival';

export interface ActiveTarget {
  entity: Entity;
  role: ActiveTargetRole;
}

export interface AnimalEntity extends BaseEntity {
  kind: 'animal';
  genome: AnimalGenome;
  velocity: THREE.Vector3;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  maturity: number;
  lifeStage: AnimalLifeStage;
  instarRank: number;
  moltAnim: number;
  emergeAnim: number;
  elderRatio: number;
  activeTarget: ActiveTarget | null;
  offspringCount: number;
  reproCooldown: number;
  attackCooldown: number;
  biteCooldown: number;
  alarmCooldown: number;
  hitFlash: number;
  stunTimer: number;
  jawGape: number;
  biteAnim: number;
  thrashAnim: number;
  lungeAnim: number;
  chewPhase: number;
  mouthMorselTimer: number;
  mouthMorselMaxTimer: number;
  mouthMorselColor: number;
  mouthMorselKind: FragmentKind;
  // Locomotion-specific dynamic kinematic state
  grounded: boolean;
  hopTimer: number;
  hopCrouch: number;
  hopSquash: number;
  perchTimer: number;
  courtshipAnim: number;
  pollenTimer: number;
  pollenSpeciesId: number | null;
  bankAngle: number;
  wingPhase: number;
  gaitPhase: number;
  slitherPhase: number;
  slitherHeading: number;
  slitherTrail?: THREE.Vector3[];
  slitherSpine?: THREE.Vector3[];
  speedRatio: number;
  wanderDir: THREE.Vector3;
  wanderTimer: number;
}

export interface PlantEntity extends BaseEntity {
  kind: 'plant';
  genome: PlantGenome;
  wilting: boolean;
  wiltAge: number;
  wiltDuration: number;
  growth: number;
  biomass: number;
  maxBiomass: number;
  nectarReserve: number;
  mycorrhizalBoost: number;
  offspringCount: number;
  seedCooldown: number;
  snareCooldown: number;
  snareAnim: number;
  rustleAnim: number;
  sporePulseAnim: number;
  swayPhase: number;
  wiltTilt: number;
  opacity: number;
}

export interface EggEntity extends BaseEntity {
  kind: 'egg';
  genome: AnimalGenome;
  incubateDuration: number;
  nutrients: number;
}

export interface PropaguleEntity extends BaseEntity {
  kind: 'propagule';
  isSeed: boolean;
  genome: PlantGenome;
  velocity: THREE.Vector3;
  maxAge: number;
  nutrients: number;
}

export type CorpsePhase = 'dying' | 'settling' | 'decomposing' | 'dissolving';

export interface CorpseEntity extends BaseEntity {
  kind: 'corpse';
  phase: CorpsePhase;
  genome: AnimalGenome;
  velocity: THREE.Vector3;
  corpseAge: number;
  dyingAge: number;
  dyingDuration: number;
  decomposeAge: number;
  decomposeDuration: number;
  dissolveAge: number;
  dissolveDuration: number;
  initialScale: number;
  nutrients: number;
  maxNutrients: number;
  cause: string;
  rollSign: number;
  detritusTimer: number;
  joltAnim: number;
  opacity: number;
}

export type FoodPelletPhase = 'falling' | 'resting' | 'dissolving';

export interface FoodPelletEntity extends BaseEntity {
  kind: 'pellet';
  origin: FragmentKind;
  phase: FoodPelletPhase;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  baseScale: number;
  stretch: THREE.Vector3;
  nutrients: number;
  maxNutrients: number;
  maxAge: number;
  restingAge: number;
  restingDuration: number;
  dissolveAge: number;
  dissolveDuration: number;
  opacity: number;
  detritusTimer: number;
  colorHex: number;
  sourceSpecies?: string;
}

export interface NutrientPatch {
  id: number;
  alive: boolean;
  position: THREE.Vector3;
  radiusScale: number;
  nutrients: number;
  maxNutrients: number;
  age: number;
  maxAge: number;
}

export type Entity =
  | AnimalEntity
  | PlantEntity
  | EggEntity
  | PropaguleEntity
  | CorpseEntity
  | FoodPelletEntity;

export type InspectableEntity =
  | AnimalEntity
  | PlantEntity
  | EggEntity
  | PropaguleEntity
  | CorpseEntity;

export interface PopulationSample {
  time: number;
  animals: number;
  plants: number;
  fungi: number;
  species: number;
  detritus: number;
  biomass: number;
}

export interface SimulationSnapshot {
  version: 1;
  savedAt: string;
  simTime: number;
  env: EnvironmentParameters;
  speciesRecords: SpeciesRecord[];
  animals: Array<{
    id: number;
    genome: AnimalGenome;
    pos: [number, number, number];
    vel: [number, number, number];
    hp: number;
    energy: number;
    age: number;
    maturity: number;
    lifeStage?: AnimalLifeStage;
    offspringCount: number;
  }>;
  plants: Array<{
    id: number;
    genome: PlantGenome;
    pos: [number, number, number];
    growth: number;
    biomass: number;
    age: number;
    offspringCount: number;
  }>;
}
