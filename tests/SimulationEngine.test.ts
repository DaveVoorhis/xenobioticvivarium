import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { getTerrainHeight, isFiniteVec3 } from '../src/core/math';
import { createAnimalGenome } from '../src/genetics/AnimalGenetics';
import { createPlantGenome } from '../src/genetics/PlantGenetics';
import { SimulationEngine } from '../src/simulation/SimulationEngine';

describe('SimulationEngine', () => {
  it('seeds all 5 locomotion classes plus both plants and fungi across all presets', () => {
    const events = new EventBus();
    const sim = new SimulationEngine(events);

    for (const preset of ['lush_terrarium', 'twilight_mycelium', 'apex_canopy'] as const) {
      sim.seedPreset(preset);
      const locomotions = new Set(sim.animals.map((a) => a.genome.locomotion));
      expect(locomotions).toEqual(new Set(['flying', 'walking', 'crawling', 'slithering', 'bouncing']));

      const { plants, fungi } = sim.getPlantAndFungusCounts();
      expect(plants).toBeGreaterThan(5);
      expect(fungi).toBeGreaterThan(5);
      expect(sim.speciesRegistry.getExtantCount()).toBeGreaterThan(6);
    }
  });

  it('executes distinct locomotion physics for flying, bouncing, walking, crawling, and slithering', () => {
    const sim = new SimulationEngine(new EventBus());
    sim.env.autoGenesisEnabled = false;

    const flyer = sim.spawnAnimal(createAnimalGenome('Nectarivore', 'aerial_glider'), new THREE.Vector3(2, 4.5, 2), 'adult')!;
    const bouncer = sim.spawnAnimal(createAnimalGenome('Herbivore', 'spring_bouncer'), new THREE.Vector3(-2, 0.5, 2), 'adult')!;
    const walker = sim.spawnAnimal(createAnimalGenome('Herbivore', 'hexapod_walker'), new THREE.Vector3(3, 0.5, -2), 'adult')!;
    const crawler = sim.spawnAnimal(createAnimalGenome('Scavenger', 'armored_crawler'), new THREE.Vector3(-3, 0.5, -2), 'adult')!;
    const slitherer = sim.spawnAnimal(createAnimalGenome('Omnivore', 'serpentine_slitherer'), new THREE.Vector3(0, 0.5, 4), 'adult')!;

    bouncer.hopTimer = 0.05;
    let bouncerWasAirborne = false;
    let maxFlyerClearance = 0;

    for (let i = 0; i < 120; i++) {
      sim.step(0.05);
      const flyGround = getTerrainHeight(flyer.position.x, flyer.position.z);
      maxFlyerClearance = Math.max(maxFlyerClearance, flyer.position.y - flyGround);

      const bounceGround = getTerrainHeight(bouncer.position.x, bouncer.position.z);
      if (bouncer.position.y - bounceGround > 0.7 && !bouncer.grounded) {
        bouncerWasAirborne = true;
      }
    }

    expect(maxFlyerClearance).toBeGreaterThan(1.0);
    expect(bouncerWasAirborne).toBe(true);

    // Grounded walkers, crawlers, and slitherers stay conformed near the terrain floor
    for (const groundMover of [walker, crawler, slitherer]) {
      const fl = getTerrainHeight(groundMover.position.x, groundMover.position.z);
      expect(Math.abs(groundMover.position.y - fl)).toBeLessThan(1.1);
      expect(isFiniteVec3(groundMover.position)).toBe(true);
    }
  });

  it('completes full animal lifecycle: egg hatch -> growth -> adult -> elder -> death -> corpse -> nutrient patch', () => {
    const sim = new SimulationEngine(new EventBus());
    sim.env.autoGenesisEnabled = false;

    // 1. Egg incubation & hatching
    const g = createAnimalGenome('Herbivore', 'hexapod_walker');
    const egg = sim.spawnEgg(g, new THREE.Vector3(1.5, 1.0, 1.5))!;
    egg.incubateDuration = 1.0;

    for (let i = 0; i < 30; i++) sim.step(0.05);
    expect(sim.eggs.length).toBe(0);
    expect(sim.animals.length).toBe(1);

    // 2. Growth through juvenile stages -> Adult -> Elder
    const creature = sim.animals[0];
    expect(creature.lifeStage === 'larva' || creature.lifeStage === 'instar').toBe(true);
    creature.energy = 115;
    creature.maturity = 0.99;
    for (let i = 0; i < 10; i++) sim.step(0.05);
    expect(creature.lifeStage).toBe('adult');

    creature.age = creature.genome.maxAge * 0.85;
    creature.energy = 100;
    sim.step(0.05);
    expect(creature.lifeStage).toBe('elder');
    expect(creature.stage).toBe('Elder');

    // 3. Old-age death -> Corpse -> NutrientPatch
    creature.age = creature.genome.maxAge + 1;
    sim.step(0.05);
    expect(sim.animals.length).toBe(0);
    expect(sim.corpses.length).toBe(1);

    const corpse = sim.corpses[0];
    corpse.dyingDuration = 0.2;
    corpse.decomposeDuration = 0.4;
    corpse.dissolveDuration = 0.3;

    for (let i = 0; i < 35; i++) sim.step(0.05);
    expect(sim.corpses.length).toBe(0);
    expect(sim.nutrientPatches.length).toBeGreaterThanOrEqual(1);
  });

  it('exhibits mycorrhizal fungus-plant symbiosis, carnivorous pitcher snaring, and budding/mating reproduction', () => {
    const sim = new SimulationEngine(new EventBus());
    sim.env.autoGenesisEnabled = false;

    // Mycorrhizal fungus boosts neighboring photosynthetic plant
    const fern = sim.spawnPlant(createPlantGenome('Photosynthetic', 'spiral_fern'), 2.0, 2.0, 0.7)!;
    const shroom = sim.spawnPlant(createPlantGenome('Mycorrhizal_Fungi', 'parasol_mushroom'), 3.2, 2.0, 0.8)!;
    expect(shroom.genome.kingdom).toBe('fungus');

    for (let i = 0; i < 20; i++) sim.step(0.05);
    expect(fern.mycorrhizalBoost).toBeGreaterThan(0.1);

    // Carnivorous pitcher trap snares nearby small creature
    const pitcher = sim.spawnPlant(createPlantGenome('Carnivorous_Flora', 'pitcher_trap'), -4.0, -4.0, 0.9)!;
    pitcher.snareCooldown = 0;
    const tinyGenome = createAnimalGenome('Herbivore', 'hexapod_walker');
    tinyGenome.sizeScale = 0.38;
    const victim = sim.spawnAnimal(tinyGenome, new THREE.Vector3(-4.0, 0.5, -4.0), 'instar')!;
    const hpBefore = victim.hp;

    sim.step(0.05);
    expect(victim.hp).toBeLessThan(hpBefore);
    expect(pitcher.snareAnim).toBeGreaterThan(0);

    // Budding asexual reproduction creates offspring
    const budGenome = createAnimalGenome('Herbivore', 'armored_crawler');
    budGenome.reproduction = 'Budding_Fission';
    const parent = sim.spawnAnimal(budGenome, new THREE.Vector3(5.0, 0.5, -3.0), 'adult')!;
    parent.energy = 115;
    parent.reproCooldown = 0;
    const beforeAnimals = sim.animals.length;

    for (let i = 0; i < 10; i++) sim.step(0.05);
    expect(sim.animals.length).toBeGreaterThan(beforeAnimals);
  });

  it('maintains finite transforms over 250 steps and roundtrips JSON snapshots', () => {
    const sim = new SimulationEngine(new EventBus());
    sim.seedPreset('lush_terrarium');

    for (let i = 0; i < 250; i++) {
      sim.step(0.05);
    }

    expect(sim.animals.length).toBeGreaterThan(0);
    expect(sim.plants.length).toBeGreaterThan(0);
    for (const a of sim.animals) {
      expect(isFiniteVec3(a.position)).toBe(true);
      expect(Number.isFinite(a.scale)).toBe(true);
    }
    for (const p of sim.plants) {
      expect(isFiniteVec3(p.position)).toBe(true);
      expect(Number.isFinite(p.scale)).toBe(true);
    }

    const snapshot = sim.exportSnapshot();
    const json = JSON.stringify(snapshot);
    const parsed = JSON.parse(json);

    const sim2 = new SimulationEngine(new EventBus());
    sim2.importSnapshot(parsed);
    expect(sim2.animals.length).toBe(sim.animals.length);
    expect(sim2.plants.length).toBe(sim.plants.length);
    expect(sim2.simTime).toBeCloseTo(sim.simTime, 4);
  });
});
