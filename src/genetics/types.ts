export type AnimalBodyPlan =
  | 'aerial_glider'
  | 'hexapod_walker'
  | 'armored_crawler'
  | 'serpentine_slitherer'
  | 'spring_bouncer';

export type AnimalLocomotion =
  | 'flying'
  | 'walking'
  | 'crawling'
  | 'slithering'
  | 'bouncing';

export type AnimalAppendage =
  | 'membranous_wings'
  | 'dorsal_sail'
  | 'whip_antennae'
  | 'stalked_eyes'
  | 'spore_plumes'
  | 'prehension_claws'
  | 'tail_fronds';

export type AnimalFunctionalPart =
  | 'biolum_lure'
  | 'chitin_spines'
  | 'crushing_mandibles'
  | 'proboscis'
  | 'venom_stinger'
  | 'vocal_sac'
  | 'armored_plates'
  | 'pollen_baskets';

export type AnimalDiet =
  | 'Herbivore'
  | 'Carnivore'
  | 'Omnivore'
  | 'Scavenger'
  | 'Fungivore'
  | 'Nectarivore';

export type AnimalSocial =
  | 'Flocking_Herd'
  | 'Solitary'
  | 'Territorial'
  | 'Pack_Hunter'
  | 'Symbiotic_Mutualist';

export type AnimalCombat =
  | 'Ambush_Pounce'
  | 'Melee_Strike'
  | 'Venom_Spines'
  | 'Evasive_Leap'
  | 'Bio_Flash'
  | 'Spore_Cloud'
  | 'Shell_Brace';

export type AnimalReproduction =
  | 'Egg_Layer'
  | 'Live_Birth'
  | 'Budding_Fission';

export type SkinPattern =
  | 'striped'
  | 'spotted'
  | 'iridescent'
  | 'photophore'
  | 'marbled'
  | 'chevron'
  | 'ocellated'
  | 'mycelial_veins';

export type AnimalIntegument =
  | 'chitin_carapace'
  | 'velvet_moss'
  | 'iridescent_scales'
  | 'translucent_gel'
  | 'spined_hide';

export type AnimalSensory =
  | 'compound_optics'
  | 'binocular_eyes'
  | 'chemo_antennae'
  | 'vibration_hairs'
  | 'thermal_pits';

export type AnimalPhysiology =
  | 'ectothermic'
  | 'photosymbiotic'
  | 'myco_symbiotic'
  | 'toxin_resistant'
  | 'hyper_metabolic';

export type StratumPreference = 'canopy' | 'understory' | 'ground';

export interface AnimalGenome {
  speciesId: number;
  parentSpeciesId: number | null;
  speciesName: string;
  generation: number;
  bodyPlan: AnimalBodyPlan;
  locomotion: AnimalLocomotion;
  appendage: AnimalAppendage;
  functionalPart: AnimalFunctionalPart;
  diet: AnimalDiet;
  social: AnimalSocial;
  combat: AnimalCombat;
  reproduction: AnimalReproduction;
  skinPattern: SkinPattern;
  integument: AnimalIntegument;
  sensoryOrgan: AnimalSensory;
  physiology: AnimalPhysiology;
  stratumPref: StratumPreference;
  sizeScale: number;
  bodyElongation: number;
  limbSpan: number;
  armorDensity: number;
  toxicity: number;
  metabolicEfficiency: number;
  speed: number;
  jumpPower: number;
  visionRange: number;
  maxHp: number;
  attackPower: number;
  maxAge: number;
  baseHex: number;
  accentHex: number;
  glowHex: number;
  segments: number;
  wingFreq: number;
  gaitFreq: number;
  slitherFreq: number;
  biolumIntensity: number;
}

export type FloraKingdom = 'plant' | 'fungus';

export type FloraForm =
  | 'spiral_fern'
  | 'canopy_blossom'
  | 'pitcher_trap'
  | 'tendril_vine'
  | 'crystal_succulent'
  | 'parasol_mushroom'
  | 'shelf_cluster'
  | 'puffball_mycelium'
  | 'coral_fungus';

export type FloraMetabolism =
  | 'Photosynthetic'
  | 'Saprotrophic_Fungi'
  | 'Mycorrhizal_Fungi'
  | 'Carnivorous_Flora'
  | 'Mixotrophic';

export type FloraPropagation =
  | 'Wind_Spores'
  | 'Heavy_Seeds'
  | 'Budding_Offshoot'
  | 'Mycelial_Runners'
  | 'Explosive_Pods';

export type FloraMorphology =
  | 'broad_frond'
  | 'serrated_blade'
  | 'gilled_cap'
  | 'bell_petal'
  | 'crystalline_rosette'
  | 'porous_sponge';

export type FloraDefense =
  | 'none'
  | 'alkaloid_toxin'
  | 'thorns'
  | 'sticky_resin'
  | 'spore_burst';

export type FloraRootSystem =
  | 'fibrous_roots'
  | 'deep_taproot'
  | 'mycelial_web'
  | 'aerial_stilts';

export type FloraSurfaceTexture =
  | 'veined_leaf'
  | 'velvet_mycelium'
  | 'gilled_cap'
  | 'crystalline'
  | 'spined_bark';

export interface PlantGenome {
  speciesId: number;
  parentSpeciesId: number | null;
  speciesName: string;
  generation: number;
  kingdom: FloraKingdom;
  form: FloraForm;
  metabolism: FloraMetabolism;
  propagation: FloraPropagation;
  leafMorphology: FloraMorphology;
  defense: FloraDefense;
  rootSystem: FloraRootSystem;
  surfaceTexture: FloraSurfaceTexture;
  maxHeight: number;
  frondCount: number;
  canopySpread: number;
  toxicity: number;
  nutrientEfficiency: number;
  biolumIntensity: number;
  maxAge: number;
  baseHex: number;
  accentHex: number;
  glowHex: number;
  swayFreq: number;
}

export interface SpeciesRecord {
  speciesId: number;
  parentSpeciesId: number | null;
  kind: 'fauna' | 'flora' | 'fungus';
  speciesName: string;
  foundedAt: number;
  extinctAt: number | null;
  peakPopulation: number;
  currentPopulation: number;
  totalBirths: number;
  maxGeneration: number;
  baseHex: number;
  glowHex: number;
  primaryTrait: string;
  secondaryTrait: string;
  summaryTraits: string[];
}
