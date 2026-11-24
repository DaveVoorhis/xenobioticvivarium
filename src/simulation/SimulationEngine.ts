import * as THREE from 'three';
import {
  CAPS,
  DEFAULT_ENV_PARAMS,
  ECOSYSTEM_PRESETS,
  TERRARIUM,
  type EcosystemPresetId,
  type EnvironmentParameters,
} from '../core/config';
import type { EventBus, FragmentKind, LogCategory } from '../core/EventBus';
import {
  clamp,
  clampToTerrariumRadius,
  clampXZToTerrariumRadius,
  getTerrainHeight,
  isFiniteVec3,
  randChoice,
  randRange,
  randomWeightedPointInTerrarium,
} from '../core/math';
import { SpatialHashGrid } from '../core/SpatialHashGrid';
import {
  createAnimalGenome,
  normalizeAnimalGenome,
  recombineAnimalGenomes,
} from '../genetics/AnimalGenetics';
import {
  createPlantGenome,
  mutatePlantGenome,
  normalizePlantGenome,
} from '../genetics/PlantGenetics';
import {
  SpeciesRegistry,
  resetSpeciesIdCounter,
  syncSpeciesIdCounter,
} from '../genetics/taxonomy';
import type {
  AnimalBodyPlan,
  AnimalDiet,
  AnimalGenome,
  FloraForm,
  FloraKingdom,
  FloraMetabolism,
  PlantGenome,
} from '../genetics/types';
import {
  computeStageMaxHp,
  computeStageScale,
  getInitialMaturityForStage,
  getInstarRank,
  getPlantStageLabel,
  getStageDisplayLabel,
} from './lifecycle';
import { AnimalBehaviorSystem } from './systems/AnimalBehaviorSystem';
import { LifecycleSystem } from './systems/LifecycleSystem';
import { PlantEcologySystem } from './systems/PlantEcologySystem';
import type {
  AnimalEntity,
  AnimalLifeStage,
  CorpseEntity,
  EggEntity,
  Entity,
  FoodPelletEntity,
  NutrientPatch,
  PlantEntity,
  PopulationSample,
  PropaguleEntity,
  SimulationSnapshot,
} from './types';

export interface SimulationContext {
  readonly events: EventBus;
  readonly env: EnvironmentParameters;
  readonly simTime: number;
  readonly animals: AnimalEntity[];
  readonly plants: PlantEntity[];
  readonly eggs: EggEntity[];
  readonly propagules: PropaguleEntity[];
  readonly corpses: CorpseEntity[];
  readonly foodPellets: FoodPelletEntity[];
  readonly nutrientPatches: NutrientPatch[];
  readonly animalGrid: SpatialHashGrid<AnimalEntity>;
  readonly plantGrid: SpatialHashGrid<PlantEntity>;
  readonly foodGrid: SpatialHashGrid<Entity>;
  readonly plantSystem: PlantEcologySystem;
  log(message: string, category: LogCategory, toneClass?: string): void;
  spawnAnimal(genome: AnimalGenome, pos: THREE.Vector3, initialStage?: AnimalLifeStage): AnimalEntity | null;
  spawnPlant(genome: PlantGenome, x: number, z: number, initialGrowth?: number): PlantEntity | null;
  spawnEgg(genome: AnimalGenome, pos: THREE.Vector3): EggEntity | null;
  spawnPropagule(
    genome: PlantGenome,
    pos: THREE.Vector3,
    isSeed: boolean,
    initialVel?: THREE.Vector3
  ): PropaguleEntity | null;
  spawnTornMorsel(
    pos: THREE.Vector3,
    initialVel: THREE.Vector3,
    colorHex: number,
    origin: FragmentKind,
    nutrients?: number,
    baseScale?: number,
    sourceSpecies?: string
  ): FoodPelletEntity | null;
  spawnNutrientPatch(x: number, z: number, radiusScale?: number): NutrientPatch | null;
  transitionAnimalToCorpse(animal: AnimalEntity, cause: string): CorpseEntity | null;
  disposeEntity(entity: Entity): void;
  enforceFiniteTransform(entity: Entity): void;
}

export class SimulationEngine implements SimulationContext {
  readonly events: EventBus;
  readonly env: EnvironmentParameters = { ...DEFAULT_ENV_PARAMS };
  readonly speciesRegistry = new SpeciesRegistry();

  readonly animals: AnimalEntity[] = [];
  readonly plants: PlantEntity[] = [];
  readonly eggs: EggEntity[] = [];
  readonly propagules: PropaguleEntity[] = [];
  readonly corpses: CorpseEntity[] = [];
  readonly foodPellets: FoodPelletEntity[] = [];
  readonly nutrientPatches: NutrientPatch[] = [];
  readonly history: PopulationSample[] = [];

  readonly animalGrid = new SpatialHashGrid<AnimalEntity>(4.0);
  readonly plantGrid = new SpatialHashGrid<PlantEntity>(4.0);
  readonly foodGrid = new SpatialHashGrid<Entity>(4.0);

  readonly animalSystem = new AnimalBehaviorSystem();
  readonly plantSystem = new PlantEcologySystem();
  readonly lifecycleSystem = new LifecycleSystem();

  simTime = 0;
  simSpeed = 1;
  genesisTimer = 16.0;
  cairnPulseEnergy = 0;

  private nextEntityId = 1;
  private historyTimer = 0;
  private readonly _foodCombined: Entity[] = [];

  constructor(events: EventBus) {
    this.events = events;
  }

  log(message: string, category: LogCategory, toneClass = 'text-slate-200'): void {
    this.events.emit('log', { message, category, toneClass });
  }

  private allocateEntityId(): number {
    return this.nextEntityId++;
  }

  enforceFiniteTransform(e: Entity): void {
    if (!isFiniteVec3(e.position)) {
      e.position.copy(e.lastValidPos);
      if ('velocity' in e && e.velocity) e.velocity.set(0, 0, 0);
    } else {
      clampToTerrariumRadius(e.position, 0.5);
      const fl = getTerrainHeight(e.position.x, e.position.z);
      e.position.y = clamp(e.position.y, fl - 0.35, TERRARIUM.canopyY - 0.15);
      e.lastValidPos.copy(e.position);
    }
    if (!Number.isFinite(e.scale) || e.scale <= 0.005) {
      e.scale = 0.25;
    }
    if (!Number.isFinite(e.quaternion.x) || !Number.isFinite(e.quaternion.w)) {
      e.quaternion.identity();
    }
  }

  spawnAnimal(
    rawGenome: AnimalGenome,
    pos: THREE.Vector3,
    initialStage: AnimalLifeStage = 'adult'
  ): AnimalEntity | null {
    if (this.animals.length >= CAPS.maxAnimals) return null;
    const genome = normalizeAnimalGenome(rawGenome);
    const maturity = getInitialMaturityForStage(initialStage);
    const maxHp = computeStageMaxHp(genome, initialStage, maturity);
    const scale = computeStageScale(genome, initialStage, maturity);

    const safePos = pos.clone();
    clampToTerrariumRadius(safePos, 1.0);
    const floorY = getTerrainHeight(safePos.x, safePos.z);
    if (genome.locomotion === 'flying') {
      safePos.y = clamp(Math.max(safePos.y, floorY + 2.0), floorY + 1.2, TERRARIUM.canopyY - 1.4);
    } else {
      safePos.y = floorY + 0.25 * scale;
    }

    const ang = Math.random() * Math.PI * 2;
    const wanderDir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);

    const animal: AnimalEntity = {
      id: this.allocateEntityId(),
      kind: 'animal',
      alive: true,
      genome,
      position: safePos.clone(),
      lastValidPos: safePos.clone(),
      quaternion: quat,
      velocity: wanderDir.clone().multiplyScalar(genome.speed * 0.35),
      scale,
      age: initialStage === 'adult' ? randRange(8, 28) : initialStage === 'elder' ? genome.maxAge * 0.82 : 0,
      stage: getStageDisplayLabel(genome, initialStage, maturity),
      state: genome.locomotion === 'flying' ? 'Soaring' : 'Exploring',
      hp: maxHp,
      maxHp,
      energy: initialStage === 'adult' ? randRange(85, 112) : randRange(65, 88),
      maxEnergy: 120,
      maturity,
      lifeStage: initialStage,
      instarRank: getInstarRank(maturity),
      moltAnim: 0,
      elderRatio: initialStage === 'elder' ? 0.5 : 0,
      activeTarget: null,
      offspringCount: 0,
      reproCooldown: randRange(10, 22),
      attackCooldown: 0,
      biteCooldown: 0,
      alarmCooldown: 0,
      hitFlash: 0,
      stunTimer: 0,
      jawGape: 0,
      biteAnim: 0,
      thrashAnim: 0,
      lungeAnim: 0,
      chewPhase: 0,
      mouthMorselTimer: 0,
      mouthMorselMaxTimer: 1,
      mouthMorselColor: 0xffffff,
      mouthMorselKind: 'flesh',
      grounded: genome.locomotion !== 'flying',
      hopTimer: randRange(0.25, 1.1),
      hopCrouch: 0,
      hopSquash: 0,
      perchTimer: 0,
      courtshipAnim: 0,
      pollenTimer: 0,
      pollenSpeciesId: null,
      bankAngle: 0,
      wingPhase: randRange(0, Math.PI * 2),
      gaitPhase: randRange(0, Math.PI * 2),
      slitherPhase: randRange(0, Math.PI * 2),
      speedRatio: 0.5,
      wanderDir,
      wanderTimer: randRange(1.5, 4.5),
    };

    this.animals.push(animal);
    this.speciesRegistry.registerAnimalBirth(genome, this.simTime);
    this.events.emit('entity:spawned', { entity: animal });
    return animal;
  }

  spawnPlant(
    rawGenome: PlantGenome,
    x: number,
    z: number,
    initialGrowth = 0.25
  ): PlantEntity | null {
    if (this.plants.length >= CAPS.maxPlants) return null;
    const genome = normalizePlantGenome(rawGenome);
    const [cx, cz] = clampXZToTerrariumRadius(x, z, 1.1);
    const y = getTerrainHeight(cx, cz);
    const growth = clamp(initialGrowth, 0.14, 1.0);
    const maxBiomass = 100;
    const pos = new THREE.Vector3(cx, y, cz);

    const plant: PlantEntity = {
      id: this.allocateEntityId(),
      kind: 'plant',
      alive: true,
      genome,
      position: pos.clone(),
      lastValidPos: pos.clone(),
      quaternion: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        Math.random() * Math.PI * 2
      ),
      scale: Math.max(0.08, growth * genome.maxHeight * 0.62),
      age: growth > 0.7 ? randRange(12, 36) : 0,
      stage: getPlantStageLabel(genome, growth, 0, false),
      state: genome.kingdom === 'fungus' ? 'Fruiting' : 'Growing',
      wilting: false,
      wiltAge: 0,
      wiltDuration: 6.5,
      growth,
      biomass: clamp(growth * maxBiomass * 0.85 + 15, 16, maxBiomass),
      maxBiomass,
      nectarReserve: genome.form === 'canopy_blossom' ? randRange(30, 75) : 0,
      mycorrhizalBoost: 0,
      offspringCount: 0,
      seedCooldown: randRange(12, 24),
      snareCooldown: 0,
      snareAnim: 0,
      rustleAnim: 0,
      sporePulseAnim: 0,
      swayPhase: randRange(0, Math.PI * 2),
      wiltTilt: 0,
      opacity: 1,
    };

    this.plants.push(plant);
    this.speciesRegistry.registerPlantBirth(genome, this.simTime);
    this.events.emit('entity:spawned', { entity: plant });
    return plant;
  }

  spawnEgg(genome: AnimalGenome, pos: THREE.Vector3): EggEntity | null {
    if (this.eggs.length >= CAPS.maxEggs) return null;
    const safePos = pos.clone();
    clampToTerrariumRadius(safePos, 0.9);
    const egg: EggEntity = {
      id: this.allocateEntityId(),
      kind: 'egg',
      alive: true,
      genome: normalizeAnimalGenome(genome),
      position: safePos.clone(),
      lastValidPos: safePos.clone(),
      quaternion: new THREE.Quaternion(),
      scale: 0.78,
      age: 0,
      stage: 'Egg',
      state: 'Incubating',
      incubateDuration: randRange(9.5, 14.5),
      nutrients: 24,
    };
    this.eggs.push(egg);
    this.events.emit('entity:spawned', { entity: egg });
    return egg;
  }

  spawnPropagule(
    genome: PlantGenome,
    pos: THREE.Vector3,
    isSeed: boolean,
    initialVel?: THREE.Vector3
  ): PropaguleEntity | null {
    if (this.propagules.length >= CAPS.maxPropagules) return null;
    const safePos = pos.clone();
    clampToTerrariumRadius(safePos, 0.9);
    const pr: PropaguleEntity = {
      id: this.allocateEntityId(),
      kind: 'propagule',
      alive: true,
      isSeed,
      genome: normalizePlantGenome(genome),
      position: safePos.clone(),
      lastValidPos: safePos.clone(),
      quaternion: new THREE.Quaternion(),
      scale: isSeed ? 0.24 : 0.16,
      age: 0,
      stage: isSeed ? 'Seed' : 'Spore',
      state: isSeed ? 'Arcing' : 'Drifting on Breeze',
      velocity: initialVel ? initialVel.clone() : new THREE.Vector3(randRange(-0.6, 0.6), 1.0, randRange(-0.6, 0.6)),
      maxAge: 22.0,
      nutrients: 14,
    };
    this.propagules.push(pr);
    this.events.emit('entity:spawned', { entity: pr });
    return pr;
  }

  spawnTornMorsel(
    pos: THREE.Vector3,
    initialVel: THREE.Vector3,
    colorHex: number,
    origin: FragmentKind,
    nutrients = 14,
    baseScale = 0.85,
    sourceSpecies?: string
  ): FoodPelletEntity | null {
    if (this.foodPellets.length >= CAPS.maxFoodPellets) return null;
    const safePos = pos.clone();
    clampToTerrariumRadius(safePos, 0.75);
    const pellet: FoodPelletEntity = {
      id: this.allocateEntityId(),
      kind: 'pellet',
      alive: true,
      origin,
      phase: 'falling',
      position: safePos.clone(),
      lastValidPos: safePos.clone(),
      quaternion: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(randRange(0, Math.PI), randRange(0, Math.PI), randRange(0, Math.PI))
      ),
      velocity: initialVel.clone(),
      angularVelocity: new THREE.Vector3(randRange(-4, 4), randRange(-4, 4), randRange(-4, 4)),
      scale: baseScale,
      baseScale,
      stretch: new THREE.Vector3(
        randRange(0.82, 1.24),
        origin === 'flora' ? randRange(0.28, 0.45) : randRange(0.76, 1.18),
        randRange(0.82, 1.26)
      ),
      age: 0,
      stage: origin === 'pellet' ? 'Nutrient Fruit' : origin === 'flesh' ? 'Morsel' : 'Shred',
      state: 'Falling',
      nutrients,
      maxNutrients: nutrients,
      maxAge: 38.0,
      restingAge: 0,
      restingDuration: 18.0,
      dissolveAge: 0,
      dissolveDuration: 9.0,
      opacity: 1,
      detritusTimer: 1.2,
      colorHex,
      sourceSpecies,
    };
    this.foodPellets.push(pellet);
    this.events.emit('entity:spawned', { entity: pellet });
    return pellet;
  }

  dropFoodPellet(worldPos: THREE.Vector3): FoodPelletEntity | null {
    const startPos = worldPos.clone();
    clampToTerrariumRadius(startPos, 1.0);
    const fl = getTerrainHeight(startPos.x, startPos.z);
    startPos.y = Math.max(fl + 2.8, Math.min(TERRARIUM.canopyY - 1.2, startPos.y));
    const p = this.spawnTornMorsel(
      startPos,
      new THREE.Vector3(randRange(-0.4, 0.4), randRange(-0.5, 0.2), randRange(-0.4, 0.4)),
      0xffb84d,
      'pellet',
      28,
      1.0
    );
    if (p) {
      this.events.emit('audio:cue', { type: 'feed' });
      this.events.emit('fx:burst', { position: startPos, colorHex: 0xffd275, count: 6, speed: 1.1 });
    }
    return p;
  }

  spawnNutrientPatch(x: number, z: number, radiusScale = 1.0): NutrientPatch | null {
    if (this.nutrientPatches.length >= CAPS.maxNutrientPatches) {
      this.nutrientPatches.shift();
    }
    const [cx, cz] = clampXZToTerrariumRadius(x, z, 1.0);
    const patch: NutrientPatch = {
      id: this.allocateEntityId(),
      alive: true,
      position: new THREE.Vector3(cx, getTerrainHeight(cx, cz) + 0.04, cz),
      radiusScale,
      nutrients: 42 * radiusScale,
      maxNutrients: 42 * radiusScale,
      age: 0,
      maxAge: 52.0,
    };
    this.nutrientPatches.push(patch);
    return patch;
  }

  transitionAnimalToCorpse(animal: AnimalEntity, cause: string): CorpseEntity | null {
    if (!animal.alive) return null;
    animal.alive = false;
    this.speciesRegistry.registerDeath(animal.genome.speciesId, this.simTime);

    const idx = this.animals.indexOf(animal);
    if (idx !== -1) this.animals.splice(idx, 1);

    const maxNutrients = Math.round(32 + animal.scale * 46);
    const corpse: CorpseEntity = {
      id: animal.id,
      kind: 'corpse',
      alive: true,
      phase: 'dying',
      genome: animal.genome,
      position: animal.position.clone(),
      lastValidPos: animal.position.clone(),
      quaternion: animal.quaternion.clone(),
      velocity: animal.velocity.clone().multiplyScalar(0.45),
      scale: animal.scale,
      initialScale: animal.scale,
      age: animal.age,
      stage: 'Dying',
      state: cause,
      corpseAge: 0,
      dyingAge: 0,
      dyingDuration: 1.4,
      decomposeAge: 0,
      decomposeDuration: 18.0,
      dissolveAge: 0,
      dissolveDuration: 6.5,
      nutrients: maxNutrients,
      maxNutrients,
      cause,
      rollSign: Math.random() < 0.5 ? 1 : -1,
      detritusTimer: 1.4,
      joltAnim: 0,
      opacity: 1,
    };

    this.corpses.push(corpse);
    this.events.emit('entity:morphed', { from: animal, to: corpse });
    return corpse;
  }

  disposeEntity(entity: Entity): void {
    if (!entity.alive) return;
    entity.alive = false;
    if (entity.kind === 'animal') {
      this.speciesRegistry.registerDeath(entity.genome.speciesId, this.simTime);
    } else if (entity.kind === 'plant') {
      this.speciesRegistry.registerDeath(entity.genome.speciesId, this.simTime);
    }
    this.events.emit('entity:disposed', { entity });
  }

  triggerBiogenesis(
    forcedDiet: AnimalDiet | null = null,
    forcedPlan: AnimalBodyPlan | null = null
  ): AnimalEntity | null {
    const genome = createAnimalGenome(forcedDiet, forcedPlan);
    const pos = TERRARIUM.cairnPos
      .clone()
      .add(new THREE.Vector3(randRange(-1.8, 1.8), 2.4, randRange(-1.8, 1.8)));
    const animal = this.spawnAnimal(genome, pos, 'adult');
    if (animal) {
      this.cairnPulseEnergy = 1.0;
      this.events.emit('fx:shockwave', {
        position: TERRARIUM.cairnPos.clone().add(new THREE.Vector3(0, 1.4, 0)),
        colorHex: genome.glowHex,
        maxScale: 4.4,
      });
      this.events.emit('fx:burst', {
        position: animal.position.clone(),
        colorHex: genome.glowHex,
        count: 14,
        speed: 2.0,
      });
      this.events.emit('audio:cue', { type: 'biogenesis' });
      this.log(
        `Biogenesis: ${genome.speciesName} (${genome.locomotion} ${genome.diet.toLowerCase()})`,
        'genesis',
        'text-cyan-300'
      );
    }
    return animal;
  }

  triggerPhytogenesis(
    forcedMetabolism: FloraMetabolism | null = null,
    forcedForm: FloraForm | null = null,
    forcedKingdom: FloraKingdom | null = 'plant'
  ): PlantEntity | null {
    const genome = createPlantGenome(forcedMetabolism, forcedForm, forcedKingdom);
    const pt = randomWeightedPointInTerrarium(TERRARIUM.coreRadius * 0.85, TERRARIUM.radius * 0.85);
    const plant = this.spawnPlant(genome, pt.x, pt.z, 0.34);
    if (plant) {
      this.cairnPulseEnergy = Math.max(this.cairnPulseEnergy, 0.85);
      this.events.emit('fx:burst', {
        position: plant.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
        colorHex: genome.glowHex,
        count: 12,
        speed: 1.6,
      });
      this.events.emit('audio:cue', {
        type: genome.kingdom === 'fungus' ? 'mycogenesis' : 'phytogenesis',
      });
      this.log(
        `${genome.kingdom === 'fungus' ? 'Mycogenesis' : 'Phytogenesis'}: ${genome.speciesName}`,
        'genesis',
        genome.kingdom === 'fungus' ? 'text-violet-300' : 'text-emerald-300'
      );
    }
    return plant;
  }

  nourishEntity(entity: Entity): boolean {
    if (!entity.alive) return false;
    if (entity.kind === 'animal') {
      entity.hp = entity.maxHp;
      entity.energy = entity.maxEnergy;
      this.events.emit('fx:burst', {
        position: entity.position.clone(),
        colorHex: 0x52ffad,
        count: 10,
        speed: 1.6,
      });
      return true;
    }
    if (entity.kind === 'plant') {
      entity.biomass = entity.maxBiomass;
      entity.growth = clamp(entity.growth + 0.22, 0.15, 1.0);
      entity.nectarReserve = 100;
      entity.wilting = false;
      this.events.emit('fx:burst', {
        position: entity.position.clone().add(new THREE.Vector3(0, 0.5, 0)),
        colorHex: 0x52ffad,
        count: 10,
        speed: 1.4,
      });
      return true;
    }
    return false;
  }

  induceMutation(entity: Entity): Entity | null {
    if (!entity.alive) return null;
    if (entity.kind === 'animal') {
      const res = recombineAnimalGenomes(entity.genome, null, 2.0, true);
      const child = this.spawnAnimal(
        res.genome,
        entity.position.clone().add(new THREE.Vector3(randRange(-0.8, 0.8), 0.35, randRange(-0.8, 0.8))),
        'adult'
      );
      if (child) {
        this.events.emit('fx:shockwave', {
          position: child.position.clone(),
          colorHex: res.genome.glowHex,
          maxScale: 3.6,
        });
        this.events.emit('audio:cue', { type: 'speciation' });
        this.log(`Directed mutation: ${res.genome.speciesName}`, 'speciation', 'text-fuchsia-300');
      }
      return child;
    }
    if (entity.kind === 'plant') {
      const res = mutatePlantGenome(entity.genome, 2.0, true);
      const child = this.spawnPlant(
        res.genome,
        entity.position.x + randRange(-1.8, 1.8),
        entity.position.z + randRange(-1.8, 1.8),
        0.48
      );
      if (child) {
        this.events.emit('fx:shockwave', {
          position: child.position.clone(),
          colorHex: res.genome.glowHex,
          maxScale: 3.2,
        });
        this.events.emit('audio:cue', { type: 'speciation' });
        this.log(`Mutated flora: ${res.genome.speciesName}`, 'speciation', 'text-emerald-300');
      }
      return child;
    }
    return null;
  }

  getPlantAndFungusCounts(): { plants: number; fungi: number } {
    let plants = 0;
    let fungi = 0;
    for (let i = 0; i < this.plants.length; i++) {
      const p = this.plants[i];
      if (!p.alive) continue;
      if (p.genome.kingdom === 'fungus') fungi++;
      else plants++;
    }
    return { plants, fungi };
  }

  clearAll(): void {
    const all: Entity[] = [
      ...this.animals,
      ...this.plants,
      ...this.eggs,
      ...this.propagules,
      ...this.corpses,
      ...this.foodPellets,
    ];
    for (const e of all) {
      if (e.alive) {
        e.alive = false;
        this.events.emit('entity:disposed', { entity: e });
      }
    }
    this.animals.length = 0;
    this.plants.length = 0;
    this.eggs.length = 0;
    this.propagules.length = 0;
    this.corpses.length = 0;
    this.foodPellets.length = 0;
    this.nutrientPatches.length = 0;
    this.history.length = 0;
    this.speciesRegistry.clear();
    resetSpeciesIdCounter();
    this.simTime = 0;
    this.historyTimer = 0;
    this.genesisTimer = this.env.genesisInterval;
    this.events.emit('ecosystem:reset', {});
  }

  seedPreset(presetId: EcosystemPresetId): void {
    this.clearAll();
    const meta = ECOSYSTEM_PRESETS.find((p) => p.id === presetId) ?? ECOSYSTEM_PRESETS[0];
    this.env.timeOfDay = meta.timeOfDay;
    this.env.windStrength = meta.windStrength;

    // Seed diverse Plants AND Fungi across the terrarium floor
    const plantSpecs: Array<{ form: FloraForm; met: FloraMetabolism; count: number }> =
      presetId === 'twilight_mycelium'
        ? [
            { form: 'parasol_mushroom', met: 'Mycorrhizal_Fungi', count: 7 },
            { form: 'shelf_cluster', met: 'Saprotrophic_Fungi', count: 5 },
            { form: 'puffball_mycelium', met: 'Saprotrophic_Fungi', count: 5 },
            { form: 'coral_fungus', met: 'Mycorrhizal_Fungi', count: 5 },
            { form: 'canopy_blossom', met: 'Photosynthetic', count: 4 },
            { form: 'spiral_fern', met: 'Photosynthetic', count: 4 },
            { form: 'pitcher_trap', met: 'Carnivorous_Flora', count: 3 },
          ]
        : presetId === 'apex_canopy'
        ? [
            { form: 'spiral_fern', met: 'Photosynthetic', count: 6 },
            { form: 'canopy_blossom', met: 'Photosynthetic', count: 5 },
            { form: 'pitcher_trap', met: 'Carnivorous_Flora', count: 5 },
            { form: 'tendril_vine', met: 'Mixotrophic', count: 4 },
            { form: 'crystal_succulent', met: 'Photosynthetic', count: 3 },
            { form: 'parasol_mushroom', met: 'Mycorrhizal_Fungi', count: 4 },
            { form: 'puffball_mycelium', met: 'Saprotrophic_Fungi', count: 4 },
          ]
        : [
            { form: 'spiral_fern', met: 'Photosynthetic', count: 6 },
            { form: 'canopy_blossom', met: 'Photosynthetic', count: 6 },
            { form: 'tendril_vine', met: 'Mixotrophic', count: 4 },
            { form: 'crystal_succulent', met: 'Photosynthetic', count: 3 },
            { form: 'pitcher_trap', met: 'Carnivorous_Flora', count: 3 },
            { form: 'parasol_mushroom', met: 'Mycorrhizal_Fungi', count: 5 },
            { form: 'shelf_cluster', met: 'Saprotrophic_Fungi', count: 4 },
            { form: 'puffball_mycelium', met: 'Saprotrophic_Fungi', count: 4 },
            { form: 'coral_fungus', met: 'Mycorrhizal_Fungi', count: 3 },
          ];

    for (const spec of plantSpecs) {
      const founder = createPlantGenome(spec.met, spec.form);
      for (let i = 0; i < spec.count; i++) {
        const pt = randomWeightedPointInTerrarium(TERRARIUM.coreRadius * 0.92, TERRARIUM.radius * 0.9);
        this.spawnPlant(founder, pt.x, pt.z, randRange(0.52, 0.95));
      }
    }

    // Seed all 5 locomotion classes so the terrarium is immediately teeming with flying, walking, crawling, slithering, and bouncing life!
    const faunaSpecs: Array<{ plan: AnimalBodyPlan; diet: AnimalDiet; count: number }> =
      presetId === 'apex_canopy'
        ? [
            { plan: 'aerial_glider', diet: 'Carnivore', count: 4 },
            { plan: 'aerial_glider', diet: 'Nectarivore', count: 4 },
            { plan: 'hexapod_walker', diet: 'Carnivore', count: 5 },
            { plan: 'hexapod_walker', diet: 'Herbivore', count: 4 },
            { plan: 'armored_crawler', diet: 'Scavenger', count: 4 },
            { plan: 'serpentine_slitherer', diet: 'Carnivore', count: 4 },
            { plan: 'spring_bouncer', diet: 'Herbivore', count: 5 },
          ]
        : presetId === 'twilight_mycelium'
        ? [
            { plan: 'aerial_glider', diet: 'Nectarivore', count: 5 },
            { plan: 'aerial_glider', diet: 'Omnivore', count: 3 },
            { plan: 'hexapod_walker', diet: 'Fungivore', count: 5 },
            { plan: 'armored_crawler', diet: 'Fungivore', count: 4 },
            { plan: 'armored_crawler', diet: 'Scavenger', count: 3 },
            { plan: 'serpentine_slitherer', diet: 'Carnivore', count: 4 },
            { plan: 'spring_bouncer', diet: 'Fungivore', count: 5 },
          ]
        : [
            { plan: 'aerial_glider', diet: 'Nectarivore', count: 5 },
            { plan: 'aerial_glider', diet: 'Carnivore', count: 3 },
            { plan: 'hexapod_walker', diet: 'Herbivore', count: 5 },
            { plan: 'hexapod_walker', diet: 'Carnivore', count: 3 },
            { plan: 'armored_crawler', diet: 'Scavenger', count: 4 },
            { plan: 'armored_crawler', diet: 'Fungivore', count: 3 },
            { plan: 'serpentine_slitherer', diet: 'Carnivore', count: 3 },
            { plan: 'serpentine_slitherer', diet: 'Omnivore', count: 2 },
            { plan: 'spring_bouncer', diet: 'Herbivore', count: 4 },
            { plan: 'spring_bouncer', diet: 'Fungivore', count: 3 },
          ];

    for (const spec of faunaSpecs) {
      const founder = createAnimalGenome(spec.diet, spec.plan);
      const clusterCenter = randomWeightedPointInTerrarium(TERRARIUM.coreRadius * 0.72, TERRARIUM.radius * 0.72);
      for (let i = 0; i < spec.count; i++) {
        const x = clusterCenter.x + randRange(-2.6, 2.6);
        const z = clusterCenter.z + randRange(-2.6, 2.6);
        const y =
          spec.plan === 'aerial_glider'
            ? getTerrainHeight(x, z) + randRange(2.8, 6.8)
            : getTerrainHeight(x, z) + 0.35;
        const stage: AnimalLifeStage = i === spec.count - 1 && spec.count >= 4 ? 'larva' : 'adult';
        this.spawnAnimal(founder, new THREE.Vector3(x, y, z), stage);
      }
    }

    // Seed a few incubating eggs & nutrient patches for immediate lifecycle variety
    for (let e = 0; e < 3 && e < this.animals.length; e++) {
      const donor = this.animals[e * 4 % this.animals.length];
      if (donor) {
        const pt = randomWeightedPointInTerrarium(TERRARIUM.coreRadius * 0.65, TERRARIUM.coreRadius * 0.8);
        this.spawnEgg(donor.genome, new THREE.Vector3(pt.x, getTerrainHeight(pt.x, pt.z) + 0.14, pt.z));
      }
    }
    for (let n = 0; n < 4; n++) {
      const pt = randomWeightedPointInTerrarium(TERRARIUM.coreRadius * 0.75, TERRARIUM.coreRadius * 0.9);
      this.spawnNutrientPatch(pt.x, pt.z, randRange(0.8, 1.3));
    }

    this.recordHistorySample();
    this.log(`Seeded ${meta.name}`, 'system', 'text-emerald-200');
  }

  step(dt: number): void {
    const safeDt = clamp(dt, 0.0001, 0.06);
    this.simTime += safeDt;
    this.cairnPulseEnergy = Math.max(0, this.cairnPulseEnergy - safeDt * 0.55);

    if (this.env.dayNightAutoCycle) {
      this.env.timeOfDay = (this.env.timeOfDay + safeDt / Math.max(20, this.env.dayCycleDuration)) % 1.0;
    }

    // Rebuild spatial hash grids
    this.animalGrid.rebuild(this.animals);
    this.plantGrid.rebuild(this.plants);
    this._foodCombined.length = 0;
    for (let i = 0; i < this.foodPellets.length; i++) this._foodCombined.push(this.foodPellets[i]);
    for (let i = 0; i < this.corpses.length; i++) this._foodCombined.push(this.corpses[i]);
    for (let i = 0; i < this.eggs.length; i++) this._foodCombined.push(this.eggs[i]);
    for (let i = 0; i < this.propagules.length; i++) this._foodCombined.push(this.propagules[i]);
    this.foodGrid.rebuild(this._foodCombined);

    // Step ecological systems
    this.plantSystem.update(this, safeDt);
    this.animalSystem.update(this, safeDt);
    this.lifecycleSystem.update(this, safeDt);

    // Automatic primordial genesis at the Mycelial Cairn
    if (this.env.autoGenesisEnabled) {
      this.genesisTimer -= safeDt;
      if (this.genesisTimer <= 0) {
        this.genesisTimer = Math.max(6, this.env.genesisInterval);
        const { plants, fungi } = this.getPlantAndFungusCounts();
        if (plants < 12) {
          this.triggerPhytogenesis(null, null, 'plant');
        } else if (fungi < 8) {
          this.triggerPhytogenesis(null, null, 'fungus');
        } else if (this.animals.length < CAPS.maxAnimals * 0.72) {
          this.triggerBiogenesis();
        } else {
          this.triggerPhytogenesis(null, null, Math.random() < 0.45 ? 'fungus' : 'plant');
        }
      }
    }

    // Periodic telemetry sampling
    this.historyTimer += safeDt;
    if (this.historyTimer >= 2.0) {
      this.historyTimer = 0;
      this.recordHistorySample();
    }
  }

  private recordHistorySample(): void {
    const { plants, fungi } = this.getPlantAndFungusCounts();
    let biomass = 0;
    for (let i = 0; i < this.plants.length; i++) biomass += this.plants[i].biomass;
    this.history.push({
      time: this.simTime,
      animals: this.animals.length,
      plants,
      fungi,
      species: this.speciesRegistry.getExtantCount(),
      detritus: this.corpses.length + this.nutrientPatches.length,
      biomass,
    });
    if (this.history.length > 120) this.history.shift();
  }

  exportSnapshot(): SimulationSnapshot {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      simTime: this.simTime,
      env: { ...this.env },
      speciesRecords: this.speciesRegistry.getAll(),
      animals: this.animals.map((a) => ({
        id: a.id,
        genome: { ...a.genome },
        pos: [a.position.x, a.position.y, a.position.z],
        vel: [a.velocity.x, a.velocity.y, a.velocity.z],
        hp: a.hp,
        energy: a.energy,
        age: a.age,
        maturity: a.maturity,
        lifeStage: a.lifeStage,
        offspringCount: a.offspringCount,
      })),
      plants: this.plants.map((p) => ({
        id: p.id,
        genome: { ...p.genome },
        pos: [p.position.x, p.position.y, p.position.z],
        growth: p.growth,
        biomass: p.biomass,
        age: p.age,
        offspringCount: p.offspringCount,
      })),
    };
  }

  importSnapshot(snap: SimulationSnapshot): void {
    this.clearAll();
    if (snap.env) {
      Object.assign(this.env, snap.env);
    }
    this.simTime = Number.isFinite(snap.simTime) ? snap.simTime : 0;
    if (Array.isArray(snap.speciesRecords)) {
      this.speciesRegistry.hydrateFromSnapshot(snap.speciesRecords);
    }

    let maxSpId = 0;
    for (const pa of snap.plants ?? []) {
      const g = normalizePlantGenome(pa.genome);
      if (g.speciesId > maxSpId) maxSpId = g.speciesId;
      const pl = this.spawnPlant(g, pa.pos[0], pa.pos[2], pa.growth);
      if (pl) {
        pl.biomass = clamp(pa.biomass, 5, pl.maxBiomass);
        pl.age = Math.max(0, pa.age);
        pl.offspringCount = pa.offspringCount ?? 0;
      }
    }
    for (const an of snap.animals ?? []) {
      const g = normalizeAnimalGenome(an.genome);
      if (g.speciesId > maxSpId) maxSpId = g.speciesId;
      const entity = this.spawnAnimal(
        g,
        new THREE.Vector3(an.pos[0], an.pos[1], an.pos[2]),
        an.lifeStage ?? 'adult'
      );
      if (entity) {
        entity.velocity.set(an.vel[0], an.vel[1], an.vel[2]);
        entity.hp = clamp(an.hp, 1, entity.maxHp);
        entity.energy = clamp(an.energy, 1, entity.maxEnergy);
        entity.age = Math.max(0, an.age);
        entity.maturity = clamp(an.maturity, 0.05, 1.0);
        entity.offspringCount = an.offspringCount ?? 0;
      }
    }
    syncSpeciesIdCounter(maxSpId);
    this.recordHistorySample();
    this.log(`Loaded snapshot (${this.animals.length} fauna, ${this.plants.length} flora/fungi)`, 'system', 'text-cyan-200');
  }
}
