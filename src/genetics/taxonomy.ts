import { randChoice } from '../core/math';
import type {
  AnimalAppendage,
  AnimalBodyPlan,
  AnimalCombat,
  AnimalDiet,
  AnimalFunctionalPart,
  AnimalGenome,
  AnimalIntegument,
  AnimalLocomotion,
  AnimalPhysiology,
  AnimalReproduction,
  AnimalSensory,
  AnimalSocial,
  FloraDefense,
  FloraForm,
  FloraKingdom,
  FloraMetabolism,
  FloraMorphology,
  FloraPropagation,
  FloraRootSystem,
  FloraSurfaceTexture,
  PlantGenome,
  SkinPattern,
  SpeciesRecord,
} from './types';

export const ANIMAL_BODY_PLANS: readonly AnimalBodyPlan[] = [
  'aerial_glider',
  'hexapod_walker',
  'armored_crawler',
  'serpentine_slitherer',
  'spring_bouncer',
];

export const ANIMAL_APPENDAGES: readonly AnimalAppendage[] = [
  'membranous_wings',
  'dorsal_sail',
  'whip_antennae',
  'stalked_eyes',
  'spore_plumes',
  'prehension_claws',
  'tail_fronds',
];

export const ANIMAL_PARTS: readonly AnimalFunctionalPart[] = [
  'biolum_lure',
  'chitin_spines',
  'crushing_mandibles',
  'proboscis',
  'venom_stinger',
  'vocal_sac',
  'armored_plates',
  'pollen_baskets',
];

export const ANIMAL_DIETS: readonly AnimalDiet[] = [
  'Herbivore',
  'Carnivore',
  'Omnivore',
  'Scavenger',
  'Fungivore',
  'Nectarivore',
];

export const ANIMAL_SOCIALS: readonly AnimalSocial[] = [
  'Flocking_Herd',
  'Solitary',
  'Territorial',
  'Pack_Hunter',
  'Symbiotic_Mutualist',
];

export const ANIMAL_COMBATS: readonly AnimalCombat[] = [
  'Ambush_Pounce',
  'Melee_Strike',
  'Venom_Spines',
  'Evasive_Leap',
  'Bio_Flash',
  'Spore_Cloud',
  'Shell_Brace',
];

export const ANIMAL_REPROS: readonly AnimalReproduction[] = [
  'Egg_Layer',
  'Live_Birth',
  'Budding_Fission',
];

export const SKIN_PATTERNS: readonly SkinPattern[] = [
  'striped',
  'spotted',
  'iridescent',
  'photophore',
  'marbled',
  'chevron',
  'ocellated',
  'mycelial_veins',
];

export const ANIMAL_INTEGUMENTS: readonly AnimalIntegument[] = [
  'chitin_carapace',
  'velvet_moss',
  'iridescent_scales',
  'translucent_gel',
  'spined_hide',
];

export const ANIMAL_SENSORIES: readonly AnimalSensory[] = [
  'compound_optics',
  'binocular_eyes',
  'chemo_antennae',
  'vibration_hairs',
  'thermal_pits',
];

export const ANIMAL_PHYSIOLOGIES: readonly AnimalPhysiology[] = [
  'ectothermic',
  'photosymbiotic',
  'myco_symbiotic',
  'toxin_resistant',
  'hyper_metabolic',
];

export const PLANT_ONLY_FORMS: readonly FloraForm[] = [
  'spiral_fern',
  'canopy_blossom',
  'pitcher_trap',
  'tendril_vine',
  'crystal_succulent',
];

export const FUNGUS_ONLY_FORMS: readonly FloraForm[] = [
  'parasol_mushroom',
  'shelf_cluster',
  'puffball_mycelium',
  'coral_fungus',
];

export const FLORA_FORMS: readonly FloraForm[] = [...PLANT_ONLY_FORMS, ...FUNGUS_ONLY_FORMS];

export const FLORA_METABOLISMS: readonly FloraMetabolism[] = [
  'Photosynthetic',
  'Saprotrophic_Fungi',
  'Mycorrhizal_Fungi',
  'Carnivorous_Flora',
  'Mixotrophic',
];

export const FLORA_PROPAGATIONS: readonly FloraPropagation[] = [
  'Wind_Spores',
  'Heavy_Seeds',
  'Budding_Offshoot',
  'Mycelial_Runners',
  'Explosive_Pods',
];

export const FLORA_MORPHOLOGIES: readonly FloraMorphology[] = [
  'broad_frond',
  'serrated_blade',
  'gilled_cap',
  'bell_petal',
  'crystalline_rosette',
  'porous_sponge',
];

export const FLORA_DEFENSES: readonly FloraDefense[] = [
  'none',
  'alkaloid_toxin',
  'thorns',
  'sticky_resin',
  'spore_burst',
];

export const FLORA_ROOT_SYSTEMS: readonly FloraRootSystem[] = [
  'fibrous_roots',
  'deep_taproot',
  'mycelial_web',
  'aerial_stilts',
];

export const FLORA_SURFACE_TEXTURES: readonly FloraSurfaceTexture[] = [
  'veined_leaf',
  'velvet_mycelium',
  'gilled_cap',
  'crystalline',
  'spined_bark',
];

export function locomotionForBodyPlan(plan: AnimalBodyPlan): AnimalLocomotion {
  switch (plan) {
    case 'aerial_glider':
      return 'flying';
    case 'hexapod_walker':
      return 'walking';
    case 'armored_crawler':
      return 'crawling';
    case 'serpentine_slitherer':
      return 'slithering';
    case 'spring_bouncer':
      return 'bouncing';
  }
}

export function kingdomForFloraForm(form: FloraForm): FloraKingdom {
  return (FUNGUS_ONLY_FORMS as readonly string[]).includes(form) ? 'fungus' : 'plant';
}

const GENUS_FAUNA_A = [
  'Xeno', 'Sylva', 'Myco', 'Aero', 'Salti', 'Chitin', 'Ophio',
  'Velo', 'Lumi', 'Phos', 'Pter', 'Arthro', 'Brio', 'Viri',
  'Glauc', 'Morpho', 'Tarsi', 'Spino', 'Nectar', 'Spiro',
];

const GENUS_FLORA_A = [
  'Phyllo', 'Mycel', 'Sporo', 'Bryo', 'Calyx', 'Agar', 'Flori',
  'Rhyzo', 'Ptero', 'Lichen', 'Ambro', 'Crysta', 'Neph', 'Bole',
  'Viri', 'Lumi', 'Clava', 'Thallo', 'Spora', 'Helio',
];

const GENUS_B = [
  'ptera', 'morph', 'ped', 'dris', 'soma', 'phore', 'gnath',
  'derma', 'phylla', 'cera', 'stoma', 'gaster', 'myces', 'luma',
  'saurus', 'pod', 'trix', 'vores', 'spore', 'clad',
];

const EPITHETS = [
  'lucens', 'silvestris', 'saltans', 'volans', 'serpens', 'mycelia',
  'viridis', 'aurata', 'noctis', 'ferox', 'spinosus', 'tenera',
  'velox', 'prismatica', 'symbiotica', 'nebulosa', 'umbrosa', 'radians',
  'scandens', 'crystallina', 'pollinis', 'fungosa',
];

let nextSpeciesId = 1;

export function allocateSpeciesId(): number {
  return nextSpeciesId++;
}

export function syncSpeciesIdCounter(maxExistingId: number): void {
  if (maxExistingId >= nextSpeciesId) {
    nextSpeciesId = maxExistingId + 1;
  }
}

export function resetSpeciesIdCounter(): void {
  nextSpeciesId = 1;
}

export function generateSpeciesName(kind: 'fauna' | 'flora' | 'fungus' = 'fauna'): string {
  const prefixes = kind === 'fauna' ? GENUS_FAUNA_A : GENUS_FLORA_A;
  return `${randChoice(prefixes)}${randChoice(GENUS_B)} ${randChoice(EPITHETS)}`;
}

export function formatTraitLabel(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export class SpeciesRegistry {
  private readonly records = new Map<number, SpeciesRecord>();

  clear(): void {
    this.records.clear();
  }

  registerAnimalBirth(genome: AnimalGenome, simTime: number): SpeciesRecord {
    let rec = this.records.get(genome.speciesId);
    if (!rec) {
      rec = {
        speciesId: genome.speciesId,
        parentSpeciesId: genome.parentSpeciesId,
        kind: 'fauna',
        speciesName: genome.speciesName,
        foundedAt: simTime,
        extinctAt: null,
        peakPopulation: 0,
        currentPopulation: 0,
        totalBirths: 0,
        maxGeneration: genome.generation,
        baseHex: genome.baseHex,
        glowHex: genome.glowHex,
        primaryTrait: formatTraitLabel(genome.locomotion),
        secondaryTrait: formatTraitLabel(genome.diet),
        summaryTraits: [
          formatTraitLabel(genome.bodyPlan),
          formatTraitLabel(genome.diet),
          formatTraitLabel(genome.social),
          formatTraitLabel(genome.integument),
          formatTraitLabel(genome.reproduction),
        ],
      };
      this.records.set(genome.speciesId, rec);
    }
    rec.currentPopulation++;
    rec.totalBirths++;
    rec.extinctAt = null;
    if (rec.currentPopulation > rec.peakPopulation) {
      rec.peakPopulation = rec.currentPopulation;
    }
    if (genome.generation > rec.maxGeneration) {
      rec.maxGeneration = genome.generation;
    }
    return rec;
  }

  registerPlantBirth(genome: PlantGenome, simTime: number): SpeciesRecord {
    let rec = this.records.get(genome.speciesId);
    const kind: 'flora' | 'fungus' = genome.kingdom === 'fungus' ? 'fungus' : 'flora';
    if (!rec) {
      rec = {
        speciesId: genome.speciesId,
        parentSpeciesId: genome.parentSpeciesId,
        kind,
        speciesName: genome.speciesName,
        foundedAt: simTime,
        extinctAt: null,
        peakPopulation: 0,
        currentPopulation: 0,
        totalBirths: 0,
        maxGeneration: genome.generation,
        baseHex: genome.baseHex,
        glowHex: genome.glowHex,
        primaryTrait: formatTraitLabel(genome.form),
        secondaryTrait: formatTraitLabel(genome.metabolism),
        summaryTraits: [
          formatTraitLabel(genome.form),
          formatTraitLabel(genome.metabolism),
          formatTraitLabel(genome.propagation),
          formatTraitLabel(genome.defense),
        ],
      };
      this.records.set(genome.speciesId, rec);
    }
    rec.currentPopulation++;
    rec.totalBirths++;
    rec.extinctAt = null;
    if (rec.currentPopulation > rec.peakPopulation) {
      rec.peakPopulation = rec.currentPopulation;
    }
    if (genome.generation > rec.maxGeneration) {
      rec.maxGeneration = genome.generation;
    }
    return rec;
  }

  registerDeath(speciesId: number, simTime: number): void {
    const rec = this.records.get(speciesId);
    if (!rec) return;
    rec.currentPopulation = Math.max(0, rec.currentPopulation - 1);
    if (rec.currentPopulation === 0 && rec.extinctAt === null) {
      rec.extinctAt = simTime;
    }
  }

  hydrateFromSnapshot(records: readonly SpeciesRecord[]): void {
    this.records.clear();
    let maxId = 0;
    for (const r of records) {
      this.records.set(r.speciesId, { ...r, summaryTraits: [...r.summaryTraits], currentPopulation: 0 });
      if (r.speciesId > maxId) maxId = r.speciesId;
    }
    syncSpeciesIdCounter(maxId);
  }

  get(speciesId: number): SpeciesRecord | undefined {
    return this.records.get(speciesId);
  }

  getAll(): SpeciesRecord[] {
    return Array.from(this.records.values());
  }

  getExtantCount(): number {
    let n = 0;
    for (const r of this.records.values()) {
      if (r.currentPopulation > 0) n++;
    }
    return n;
  }

  getExtantByKind(kind: 'fauna' | 'flora' | 'fungus'): SpeciesRecord[] {
    const out: SpeciesRecord[] = [];
    for (const r of this.records.values()) {
      if (r.kind === kind && r.currentPopulation > 0) out.push(r);
    }
    out.sort((a, b) => b.currentPopulation - a.currentPopulation);
    return out;
  }
}
