import { describe, expect, it } from 'vitest';
import { createAnimalGenome, normalizeAnimalGenome, recombineAnimalGenomes } from '../src/genetics/AnimalGenetics';
import { createPlantGenome, mutatePlantGenome, normalizePlantGenome, recombinePlantGenomes } from '../src/genetics/PlantGenetics';
import {
  ANIMAL_BODY_PLANS,
  FUNGUS_ONLY_FORMS,
  PLANT_ONLY_FORMS,
  SpeciesRegistry,
  kingdomForFloraForm,
  locomotionForBodyPlan,
  resetSpeciesIdCounter,
} from '../src/genetics/taxonomy';

describe('Genetics & Taxonomy', () => {
  it('constructs valid composable animal genomes across all 5 locomotion body plans', () => {
    resetSpeciesIdCounter();
    const seenLocomotions = new Set<string>();

    for (const plan of ANIMAL_BODY_PLANS) {
      const g = createAnimalGenome(null, plan);
      expect(g.bodyPlan).toBe(plan);
      expect(g.locomotion).toBe(locomotionForBodyPlan(plan));
      expect(g.speciesName.split(' ').length).toBe(2);
      expect(g.maxHp).toBeGreaterThan(20);
      expect(g.speed).toBeGreaterThan(0.5);
      expect(g.sizeScale).toBeGreaterThan(0.2);
      seenLocomotions.add(g.locomotion);
    }

    expect(seenLocomotions).toEqual(new Set(['flying', 'walking', 'crawling', 'slithering', 'bouncing']));
  });

  it('recombines animal genomes and supports forced speciation with parent lineage', () => {
    resetSpeciesIdCounter();
    const pA = createAnimalGenome('Herbivore', 'hexapod_walker');
    const pB = createAnimalGenome('Herbivore', 'hexapod_walker');
    const child = recombineAnimalGenomes(pA, pB, 1.8, true);

    expect(child.speciated).toBe(true);
    expect(child.genome.speciesId).not.toBe(pA.speciesId);
    expect(child.genome.parentSpeciesId).toBe(pA.speciesId);
    expect(child.genome.generation).toBeGreaterThanOrEqual(2);
    expect(child.genome.locomotion).toBe(locomotionForBodyPlan(child.genome.bodyPlan));
  });

  it('normalizes legacy or partial animal genomes safely', () => {
    const raw = createAnimalGenome('Carnivore', 'spring_bouncer');
    const normalized = normalizeAnimalGenome({
      ...raw,
      sizeScale: Number.NaN,
      armorDensity: 99,
    });
    expect(Number.isFinite(normalized.sizeScale)).toBe(true);
    expect(normalized.armorDensity).toBeLessThanOrEqual(1);
    expect(normalized.locomotion).toBe('bouncing');
  });

  it('constructs distinct Plant and Fungus genomes with matching kingdoms and forms', () => {
    resetSpeciesIdCounter();
    for (const form of PLANT_ONLY_FORMS) {
      const g = createPlantGenome(null, form);
      expect(g.kingdom).toBe('plant');
      expect(kingdomForFloraForm(form)).toBe('plant');
      expect(g.maxHeight).toBeGreaterThan(0.5);
    }

    for (const form of FUNGUS_ONLY_FORMS) {
      const g = createPlantGenome(null, form);
      expect(g.kingdom).toBe('fungus');
      expect(kingdomForFloraForm(form)).toBe('fungus');
      expect(g.rootSystem).toBe('mycelial_web');
    }

    const parent = createPlantGenome('Mycorrhizal_Fungi', 'parasol_mushroom');
    const mutated = mutatePlantGenome(parent, 2.0, true);
    expect(mutated.speciated).toBe(true);
    expect(mutated.genome.parentSpeciesId).toBe(parent.speciesId);
    expect(mutated.genome.generation).toBe(parent.generation + 1);

    const crossed = recombinePlantGenomes(parent, normalizePlantGenome(parent), 1.0, false);
    expect(crossed.genome.maxHeight).toBeGreaterThan(0.5);
  });

  it('tracks fauna, flora, and fungus lineages in SpeciesRegistry including extinction', () => {
    resetSpeciesIdCounter();
    const reg = new SpeciesRegistry();
    const animal = createAnimalGenome('Nectarivore', 'aerial_glider');
    const plant = createPlantGenome('Photosynthetic', 'canopy_blossom');
    const fungus = createPlantGenome('Saprotrophic_Fungi', 'shelf_cluster');

    reg.registerAnimalBirth(animal, 1.0);
    reg.registerAnimalBirth(animal, 2.0);
    reg.registerPlantBirth(plant, 1.5);
    reg.registerPlantBirth(fungus, 1.8);

    expect(reg.getExtantCount()).toBe(3);
    expect(reg.getExtantByKind('fauna').length).toBe(1);
    expect(reg.getExtantByKind('flora').length).toBe(1);
    expect(reg.getExtantByKind('fungus').length).toBe(1);
    expect(reg.get(animal.speciesId)?.peakPopulation).toBe(2);

    reg.registerDeath(fungus.speciesId, 10.0);
    expect(reg.get(fungus.speciesId)?.currentPopulation).toBe(0);
    expect(reg.get(fungus.speciesId)?.extinctAt).toBe(10.0);
    expect(reg.getExtantCount()).toBe(2);
  });
});
