import * as THREE from 'three';

export interface TerrariumConfig {
  /** Lush focal terrarium floor radius where organisms roam freely with zero boundary pull */
  readonly coreRadius: number;
  /** Soft ecological terrarium glass/mist perimeter where return-weighting smoothly increases */
  readonly radius: number;
  /** Hard safety enclosure ceiling at the outer conservatory glass wall */
  readonly maxRadius: number;
  /** Visual ground & atmospheric expanse extending past the conservatory rim */
  readonly worldRadius: number;
  /** Upper dome canopy flight ceiling */
  readonly canopyY: number;
  /** Central primordial spore cairn / mycelial genesis mound position */
  readonly cairnPos: THREE.Vector3;
  /** Shallow bioluminescent mineral pool center */
  readonly poolPos: THREE.Vector3;
  /** Mineral pool water surface elevation */
  readonly poolSurfaceY: number;
}

export const TERRARIUM: TerrariumConfig = {
  coreRadius: 12.0,
  radius: 15.8,
  maxRadius: 21.0,
  worldRadius: 88.0,
  canopyY: 13.4,
  cairnPos: new THREE.Vector3(-3.2, 0.0, -2.0),
  poolPos: new THREE.Vector3(4.2, 0.0, 2.4),
  poolSurfaceY: 0.48,
};

export interface SimulationCaps {
  readonly maxAnimals: number;
  readonly maxPlants: number;
  readonly maxEggs: number;
  readonly maxPropagules: number;
  readonly maxNutrientPatches: number;
  readonly maxFoodPellets: number;
  readonly maxBurstParticles: number;
  readonly maxTornFragments: number;
  readonly maxShockwaves: number;
}

export const CAPS: SimulationCaps = {
  maxAnimals: 82,
  maxPlants: 76,
  maxEggs: 38,
  maxPropagules: 42,
  maxNutrientPatches: 36,
  maxFoodPellets: 160,
  maxBurstParticles: 400,
  maxTornFragments: 180,
  maxShockwaves: 20,
};

export interface EnvironmentParameters {
  /** 0..1 where 0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk */
  timeOfDay: number;
  dayNightAutoCycle: boolean;
  /** Real-time seconds for a full 24h solar cycle */
  dayCycleDuration: number;
  /** 0..2 multiplier on the 3D atmospheric breeze & thermal updraft field */
  windStrength: number;
  /** 0.2..3.0 multiplier on genetic mutation chance */
  mutationRateMultiplier: number;
  /** Seconds between automatic primordial genesis pulses at the Mycelial Cairn */
  genesisInterval: number;
  autoGenesisEnabled: boolean;
}

export const DEFAULT_ENV_PARAMS: EnvironmentParameters = {
  timeOfDay: 0.42, // Bright dappled sunlit morning conservatory at launch
  dayNightAutoCycle: true,
  dayCycleDuration: 155.0,
  windStrength: 0.65,
  mutationRateMultiplier: 1.0,
  genesisInterval: 20.0,
  autoGenesisEnabled: true,
};

export type EcosystemPresetId = 'lush_terrarium' | 'twilight_mycelium' | 'apex_canopy';

export interface EcosystemPresetMeta {
  readonly id: EcosystemPresetId;
  readonly name: string;
  readonly description: string;
  readonly timeOfDay: number;
  readonly windStrength: number;
}

export const ECOSYSTEM_PRESETS: readonly EcosystemPresetMeta[] = [
  {
    id: 'lush_terrarium',
    name: 'Lush Cloud-Forest Terrarium',
    description: 'Sunlit alien vivarium bursting with flyers, walkers, crawlers, slitherers, bouncers, flora, and glowing fungi.',
    timeOfDay: 0.42,
    windStrength: 0.65,
  },
  {
    id: 'twilight_mycelium',
    name: 'Bioluminescent Fungal Twilight',
    description: 'Nocturnal spore-mist conservatory alive with giant luminous mushrooms, fungivores, and ambush slitherers.',
    timeOfDay: 0.04,
    windStrength: 0.45,
  },
  {
    id: 'apex_canopy',
    name: 'Predator Canopy Hunt',
    description: 'Golden-hour mist with pack-hunting walkers, swooping aerial hunters, armored crawlers, and pitcher traps.',
    timeOfDay: 0.74,
    windStrength: 0.9,
  },
];
