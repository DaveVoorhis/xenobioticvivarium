import * as THREE from 'three';
import { CAPS, TERRARIUM } from '../../core/config';
import {
  clamp,
  clampToTerrariumRadius,
  computeDaylightFactor,
  computeHorizontalBoundWeight,
  getTerrainHeight,
  getTerrainNormal,
  randRange,
  safeNormalize,
  safeOrientToward,
  sampleWindField,
} from '../../core/math';
import { recombineAnimalGenomes } from '../../genetics/AnimalGenetics';
import {
  LIFECYCLE_THRESHOLDS,
  computeStageMaxHp,
  computeStageScale,
  getInstarRank,
  getLifeStageFromMaturity,
  getStageBehaviorModifiers,
  getStageDisplayLabel,
} from '../lifecycle';
import type { AnimalGenome } from '../../genetics/types';
import type { AnimalEntity, Entity, FoodPelletEntity, PlantEntity } from '../types';
import type { SimulationContext } from '../SimulationEngine';

const GRAVITY = 14.5;

export class AnimalBehaviorSystem {
  private readonly _steer = new THREE.Vector3();
  private readonly _desired = new THREE.Vector3();
  private readonly _sep = new THREE.Vector3();
  private readonly _align = new THREE.Vector3();
  private readonly _coh = new THREE.Vector3();
  private readonly _wind = new THREE.Vector3();
  private readonly _prevFwd = new THREE.Vector3();
  private readonly _bitePos = new THREE.Vector3();
  private readonly _mouthPos = new THREE.Vector3();
  private readonly _ejectDir = new THREE.Vector3();
  private readonly _scrapVel = new THREE.Vector3();
  private readonly _groundNormal = new THREE.Vector3();
  private readonly _qAnimals: AnimalEntity[] = [];
  private readonly _qPlants: PlantEntity[] = [];
  private readonly _qFood: Entity[] = [];

  private computeMouthPos(a: AnimalEntity, out: THREE.Vector3): THREE.Vector3 {
    const snoutZ = 0.54 * a.scale * (a.genome.bodyElongation ?? 1.0);
    out.set(0, 0, snoutZ).applyQuaternion(a.quaternion).add(a.position);
    return out;
  }

  private getGroundClearance(a: AnimalEntity): number {
    switch (a.genome.locomotion) {
      case 'walking':
        return 0.34 * a.scale;
      case 'crawling':
        return 0.14 * a.scale;
      case 'slithering':
        return 0.11 * a.scale;
      case 'bouncing':
        return 0.28 * a.scale;
      case 'flying':
        return 0.24 * a.scale;
    }
  }

  private wantsFoodItem(g: AnimalGenome, a: AnimalEntity, item: Entity): boolean {
    if (!item.alive) return false;
    if (item.kind === 'pellet') {
      if (item.origin !== 'pellet' && item.age < 0.32) return false;
      if (item.nutrients < 1.5) return false;
      if (item.origin === 'pellet') return true;

      if (a.lifeStage === 'spawn' || a.lifeStage === 'instar') return true;
      if (item.origin === 'flesh') {
        if (g.diet === 'Scavenger') return true;
        if (g.diet === 'Omnivore') return a.energy < 114;
        if (g.diet === 'Carnivore') return a.energy < 104;
        return false;
      }
      if (item.origin === 'fungus') {
        return g.diet === 'Fungivore' || g.diet === 'Scavenger' || g.diet === 'Omnivore';
      }
      return (
        g.diet === 'Herbivore' ||
        g.diet === 'Omnivore' ||
        g.diet === 'Nectarivore' ||
        g.diet === 'Scavenger'
      );
    }

    if (a.lifeStage === 'spawn') {
      return item.kind === 'propagule' || (g.diet === 'Scavenger' && item.kind === 'corpse' && a.energy < 75);
    }

    return (
      (g.diet === 'Scavenger' && item.kind === 'corpse') ||
      (g.diet === 'Omnivore' &&
        (item.kind === 'corpse' || item.kind === 'egg' || item.kind === 'propagule')) ||
      ((g.diet === 'Herbivore' || g.diet === 'Fungivore' || g.diet === 'Nectarivore') &&
        item.kind === 'propagule') ||
      (g.diet === 'Carnivore' &&
        ((item.kind === 'corpse' && a.energy < 96) || (item.kind === 'egg' && a.energy < 68)))
    );
  }

  private wantsPlantOrFungus(g: AnimalGenome, p: PlantEntity): 'graze' | 'pollinate' | null {
    if (!p.alive || p.wilting) return null;
    const isFungus = p.genome.kingdom === 'fungus';

    // Nectarivores & Symbiotic Mutualists gently pollinate blossoms & disperse fungal spores!
    if (g.diet === 'Nectarivore' || g.social === 'Symbiotic_Mutualist') {
      if (!isFungus && (p.genome.form === 'canopy_blossom' || p.nectarReserve > 15) && p.growth > 0.45) {
        return 'pollinate';
      }
      if (isFungus && p.growth > 0.55 && (g.diet === 'Fungivore' || g.functionalPart === 'pollen_baskets')) {
        return 'pollinate';
      }
    }

    if (g.diet === 'Fungivore' && isFungus && p.biomass > 14) {
      return 'graze';
    }
    if ((g.diet === 'Herbivore' || g.diet === 'Omnivore') && !isFungus && p.biomass > 14) {
      if (p.genome.metabolism === 'Carnivorous_Flora' && Math.random() < 0.7) return null;
      return 'graze';
    }
    if (g.diet === 'Omnivore' && isFungus && p.biomass > 18) {
      return 'graze';
    }
    return null;
  }

  private emitKinAlarm(ctx: SimulationContext, caller: AnimalEntity, threat: AnimalEntity): void {
    if (caller.alarmCooldown > 0) return;
    caller.alarmCooldown = 6.5;

    ctx.events.emit('fx:shockwave', {
      position: caller.position.clone(),
      colorHex: caller.genome.glowHex,
      maxScale: 4.2,
    });
    if (caller.genome.functionalPart === 'vocal_sac') {
      ctx.events.emit('audio:cue', { type: 'spore' });
    }

    const near = ctx.animalGrid.query(
      caller.position.x,
      caller.position.y,
      caller.position.z,
      7.5,
      this._qAnimals
    );
    for (let i = 0; i < near.length; i++) {
      const kin = near[i];
      if (!kin.alive || kin === caller || kin.genome.speciesId !== caller.genome.speciesId) continue;
      kin.activeTarget = { entity: threat, role: 'threat' };
      this._ejectDir.subVectors(kin.position, threat.position);
      if (safeNormalize(this._ejectDir)) {
        kin.velocity.addScaledVector(this._ejectDir, 1.8);
        if (kin.genome.locomotion === 'bouncing' && kin.grounded) {
          kin.velocity.y = kin.genome.jumpPower * 0.85;
          kin.grounded = false;
        }
      }
    }
  }

  private performCombatStrike(
    ctx: SimulationContext,
    attacker: AnimalEntity,
    defender: AnimalEntity,
    isTerritorialSpar = false
  ): void {
    const ag = attacker.genome;
    const dg = defender.genome;

    attacker.attackCooldown = ag.physiology === 'hyper_metabolic' ? 0.84 : 1.08;
    attacker.biteCooldown = Math.max(attacker.biteCooldown, 0.72);
    attacker.jawGape = 0;
    attacker.biteAnim = 1.0;
    attacker.lungeAnim = 1.0;
    attacker.thrashAnim = 1.0;

    const atkMods = getStageBehaviorModifiers(attacker.lifeStage, attacker.maturity);
    let dmg = ag.attackPower * atkMods.attackMult * randRange(0.85, 1.2) * (isTerritorialSpar ? 0.55 : 1.0);
    if (ag.combat === 'Ambush_Pounce') dmg *= 1.24;
    if (ag.functionalPart === 'crushing_mandibles') dmg *= 1.12;
    if (ag.functionalPart === 'venom_stinger' && dg.physiology !== 'toxin_resistant') {
      dmg *= 1.18;
    }

    let mitigation = dg.armorDensity * 0.3;
    if (dg.bodyPlan === 'armored_crawler') mitigation += 0.22;
    if (dg.integument === 'chitin_carapace') mitigation += 0.14;
    if (dg.functionalPart === 'armored_plates') mitigation += 0.12;
    if (dg.combat === 'Shell_Brace') mitigation += 0.18;
    dmg *= 1.0 - clamp(mitigation, 0, 0.62);

    defender.hp -= dmg;
    defender.hitFlash = 0.3;

    this._ejectDir.subVectors(defender.position, attacker.position);
    if (safeNormalize(this._ejectDir)) {
      const knock = dg.combat === 'Shell_Brace' ? 0.75 : 1.65;
      defender.velocity.addScaledVector(this._ejectDir, knock);
      attacker.velocity.addScaledVector(this._ejectDir, dg.combat === 'Shell_Brace' ? -0.95 : -0.38);
    }

    const mouthPos = this.computeMouthPos(attacker, this._mouthPos);
    const impactPos = this._bitePos.lerpVectors(mouthPos, defender.position, 0.45);

    // Defensive Bio_Flash dazzles & briefly stuns attacker
    if (dg.combat === 'Bio_Flash' && defender.hp > 0) {
      attacker.stunTimer = Math.max(attacker.stunTimer, 0.9);
      ctx.events.emit('fx:shockwave', {
        position: defender.position.clone(),
        colorHex: dg.glowHex,
        maxScale: 3.2,
      });
      ctx.events.emit('fx:burst', {
        position: defender.position.clone(),
        colorHex: 0xfff5a8,
        count: 10,
        speed: 2.2,
      });
    }

    // Defensive Spore_Cloud emits obscuring puff and triggers escape boost
    if (dg.combat === 'Spore_Cloud' && defender.hp > 0) {
      defender.velocity.addScaledVector(this._ejectDir, 1.9);
      ctx.events.emit('fx:burst', {
        position: defender.position.clone(),
        colorHex: 0xa855f7,
        count: 12,
        speed: 1.5,
      });
      ctx.events.emit('audio:cue', { type: 'spore' });
    }

    // Defensive Evasive_Leap springs defender skyward!
    if (dg.combat === 'Evasive_Leap' && defender.hp > 0 && defender.grounded) {
      defender.velocity.y = Math.max(defender.velocity.y, dg.jumpPower * 1.15);
      defender.velocity.addScaledVector(this._ejectDir, 2.4);
      defender.grounded = false;
      ctx.events.emit('audio:cue', { type: 'hop' });
    }

    // Cooperative herd/mutualist alarm call!
    if ((dg.social === 'Flocking_Herd' || dg.social === 'Symbiotic_Mutualist') && defender.hp > 0) {
      this.emitKinAlarm(ctx, defender, attacker);
    }

    // Retaliatory venom spines / dermal toxicity
    const hasSpines =
      dg.combat === 'Venom_Spines' ||
      dg.functionalPart === 'venom_stinger' ||
      dg.integument === 'spined_hide';
    const toxinPotency = dg.toxicity ?? 0;
    if (hasSpines || toxinPotency > 0.35) {
      const resist = ag.physiology === 'toxin_resistant' ? 0.25 : 1.0;
      const recoilDmg = ((hasSpines ? 6.0 : 0) + toxinPotency * 7.5) * resist;
      if (recoilDmg > 0.8) {
        attacker.hp -= recoilDmg;
        attacker.hitFlash = 0.24;
        ctx.events.emit('fx:burst', {
          position: defender.position.clone(),
          colorHex: 0xa8ff4d,
          count: 6,
          speed: 1.6,
        });
      }
    }

    ctx.events.emit('fx:fragments', {
      position: impactPos.clone(),
      colorHex: dg.baseHex,
      accentHex: dg.accentHex,
      kind: 'flesh',
      count: 5,
      speed: 1.9,
      suctionTarget: mouthPos.clone(),
      ejectDir: this._ejectDir.clone(),
    });
    ctx.events.emit('fx:burst', {
      position: impactPos.clone(),
      colorHex: 0xe6495c,
      count: 6,
      speed: 1.45,
    });
    ctx.events.emit('audio:cue', { type: 'strike' });

    attacker.mouthMorselTimer = 1.0;
    attacker.mouthMorselMaxTimer = 1.0;
    attacker.mouthMorselColor = dg.baseHex;
    attacker.mouthMorselKind = 'flesh';

    if (!isTerritorialSpar && dmg >= 4.0 && defender.hp > 0) {
      this._scrapVel.set(
        -this._ejectDir.x * 0.5 + randRange(-0.85, 0.85),
        randRange(1.4, 2.5),
        -this._ejectDir.z * 0.5 + randRange(-0.85, 0.85)
      );
      ctx.spawnTornMorsel(
        impactPos,
        this._scrapVel,
        dg.baseHex,
        'flesh',
        randRange(9, 15),
        clamp(0.75 + dg.sizeScale * 0.45, 0.72, 1.2),
        dg.speciesName
      );
    }

    if (defender.hp <= 0) {
      attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 38);
      if (isTerritorialSpar) {
        ctx.log(`${ag.speciesName} defeated rival ${dg.speciesName}`, 'predation', 'text-amber-300');
      } else {
        ctx.log(`${ag.speciesName} hunted ${dg.speciesName}`, 'predation', 'text-rose-300');
      }
      ctx.transitionAnimalToCorpse(
        defender,
        isTerritorialSpar ? `fell in territorial duel with ${ag.speciesName}` : `hunted by ${ag.speciesName}`
      );
    }
  }

  private performGrazeOrPollinate(
    ctx: SimulationContext,
    a: AnimalEntity,
    p: PlantEntity,
    mode: 'graze' | 'pollinate'
  ): void {
    const g = a.genome;
    a.biteCooldown = 0.82;
    a.biteAnim = 0.88;
    a.jawGape = 0;
    p.rustleAnim = 0.9;

    const mouthPos = this.computeMouthPos(a, this._mouthPos);
    const crownPos = this._bitePos.set(p.position.x, p.position.y + 0.58 * p.scale, p.position.z);

    if (mode === 'pollinate') {
      // Cooperative mutualism! Gentle nectar/spore sip without hurting the plant/fungus!
      const sip = Math.min(28, Math.max(12, p.nectarReserve * 0.55 + 14));
      p.nectarReserve = Math.max(0, p.nectarReserve - sip * 0.5);
      a.energy = Math.min(a.maxEnergy, a.energy + sip);
      a.hp = Math.min(a.maxHp, a.hp + 4);
      a.state = p.genome.kingdom === 'fungus' ? 'Spreading Spores' : 'Pollinating';

      ctx.events.emit('fx:burst', {
        position: crownPos.clone(),
        colorHex: 0xffe875,
        count: 7,
        speed: 1.1,
      });

      // If already carrying pollen/spores from another specimen of same kingdom, trigger cross-pollination!
      if (a.pollenTimer > 0 && a.pollenSpeciesId !== null && a.pollenSpeciesId !== p.id) {
        p.biomass = Math.min(p.maxBiomass, p.biomass + 18);
        p.growth = clamp(p.growth + 0.08, 0.12, 1.0);
        if (p.seedCooldown <= 12) {
          ctx.plantSystem.reproduceFlora(ctx, p, null);
        }
        ctx.events.emit('fx:shockwave', {
          position: crownPos.clone(),
          colorHex: p.genome.glowHex,
          maxScale: 2.2,
        });
        if (Math.random() < 0.28) {
          ctx.log(
            `${g.speciesName} pollinated ${p.genome.speciesName}`,
            'cooperation',
            'text-emerald-300'
          );
        }
      }
      a.pollenTimer = 26.0;
      a.pollenSpeciesId = p.id;
      return;
    }

    // Grazing on flora or fungi
    const biteAmount = randRange(12, 18);
    p.biomass = Math.max(0, p.biomass - biteAmount);
    a.energy = Math.min(a.maxEnergy, a.energy + biteAmount * 1.45);
    a.hp = Math.min(a.maxHp, a.hp + 3);
    a.mouthMorselTimer = 0.9;
    a.mouthMorselMaxTimer = 0.9;
    a.mouthMorselColor = p.genome.accentHex;
    a.mouthMorselKind = p.genome.kingdom === 'fungus' ? 'fungus' : 'flora';

    ctx.events.emit('fx:fragments', {
      position: crownPos.clone(),
      colorHex: p.genome.accentHex,
      accentHex: p.genome.baseHex,
      kind: p.genome.kingdom === 'fungus' ? 'fungus' : 'flora',
      count: 4,
      speed: 1.25,
      suctionTarget: mouthPos.clone(),
    });
    ctx.events.emit('audio:cue', { type: 'tear' });

    // Plant / fungal defenses!
    if (p.genome.defense === 'spore_burst') {
      p.sporePulseAnim = 1.0;
      ctx.events.emit('fx:burst', {
        position: crownPos.clone(),
        colorHex: p.genome.glowHex,
        count: 10,
        speed: 1.5,
      });
      ctx.events.emit('audio:cue', { type: 'spore' });
    }
    if (
      (p.genome.defense === 'alkaloid_toxin' || p.genome.defense === 'thorns') &&
      g.physiology !== 'toxin_resistant' &&
      !(p.genome.kingdom === 'fungus' && g.physiology === 'myco_symbiotic')
    ) {
      const defDmg = (p.genome.defense === 'thorns' ? 4.5 : 3.5) + (p.genome.toxicity ?? 0) * 5.0;
      a.hp -= defDmg;
      a.hitFlash = 0.2;
    }

    // Drop a tumbling torn frond or fungal cap shred for crawlers/scavengers
    if (Math.random() < 0.45) {
      this._scrapVel.set(randRange(-0.8, 0.8), randRange(1.1, 2.0), randRange(-0.8, 0.8));
      ctx.spawnTornMorsel(
        crownPos,
        this._scrapVel,
        p.genome.accentHex,
        p.genome.kingdom === 'fungus' ? 'fungus' : 'flora',
        randRange(7, 12),
        0.78,
        p.genome.speciesName
      );
    }
  }

  private performReproduce(ctx: SimulationContext, a: AnimalEntity, mate: AnimalEntity | null): void {
    const g = a.genome;
    a.reproCooldown = randRange(24, 38);
    a.energy = Math.max(25, a.energy - 42);
    a.offspringCount++;
    a.courtshipAnim = 1.0;
    if (mate) {
      mate.reproCooldown = randRange(22, 34);
      mate.energy = Math.max(25, mate.energy - 34);
      mate.offspringCount++;
      mate.courtshipAnim = 1.0;
    }

    const res = recombineAnimalGenomes(
      g,
      mate ? mate.genome : null,
      ctx.env.mutationRateMultiplier,
      false
    );
    const childGenome = res.genome;
    if (res.speciated) {
      ctx.log(`Speciation: ${childGenome.speciesName} (${childGenome.locomotion})`, 'speciation', 'text-fuchsia-300');
      ctx.events.emit('audio:cue', { type: 'speciation' });
      ctx.events.emit('fx:shockwave', {
        position: a.position.clone(),
        colorHex: childGenome.glowHex,
        maxScale: 3.4,
      });
    } else {
      ctx.events.emit('audio:cue', { type: 'mate' });
    }

    const spawnPos = a.position.clone().add(new THREE.Vector3(randRange(-0.4, 0.4), 0.15, randRange(-0.4, 0.4)));
    clampToTerrariumRadius(spawnPos, 1.0);

    if (g.reproduction === 'Egg_Layer') {
      if (ctx.eggs.length < CAPS.maxEggs) {
        const clutch = Math.random() < 0.35 ? 2 : 1;
        for (let c = 0; c < clutch; c++) {
          if (ctx.eggs.length >= CAPS.maxEggs) break;
          const ePos = spawnPos.clone().add(new THREE.Vector3(randRange(-0.25, 0.25), 0, randRange(-0.25, 0.25)));
          ctx.spawnEgg(childGenome, ePos);
        }
        ctx.events.emit('fx:burst', {
          position: spawnPos,
          colorHex: childGenome.glowHex,
          count: 8,
          speed: 1.1,
        });
      }
    } else {
      if (ctx.animals.length < CAPS.maxAnimals) {
        ctx.spawnAnimal(childGenome, spawnPos, 'spawn');
        ctx.events.emit('fx:burst', {
          position: spawnPos,
          colorHex: childGenome.glowHex,
          count: 10,
          speed: 1.4,
        });
      }
    }
  }

  update(ctx: SimulationContext, dt: number): void {
    const daylight = computeDaylightFactor(ctx.env.timeOfDay);

    for (let i = ctx.animals.length - 1; i >= 0; i--) {
      const a = ctx.animals[i];
      if (!a.alive) {
        ctx.animals.splice(i, 1);
        continue;
      }

      const g = a.genome;
      a.age += dt;
      a.reproCooldown = Math.max(0, a.reproCooldown - dt);
      a.attackCooldown = Math.max(0, a.attackCooldown - dt);
      a.biteCooldown = Math.max(0, a.biteCooldown - dt);
      a.alarmCooldown = Math.max(0, a.alarmCooldown - dt);
      a.hitFlash = Math.max(0, a.hitFlash - dt);
      a.stunTimer = Math.max(0, a.stunTimer - dt);
      a.biteAnim = Math.max(0, a.biteAnim - dt * 2.5);
      a.lungeAnim = Math.max(0, a.lungeAnim - dt * 2.2);
      a.thrashAnim = Math.max(0, a.thrashAnim - dt * 2.1);
      a.moltAnim = Math.max(0, a.moltAnim - dt * 1.1);
      a.courtshipAnim = Math.max(0, a.courtshipAnim - dt * 1.2);
      a.pollenTimer = Math.max(0, a.pollenTimer - dt);
      a.hopSquash = Math.max(0, a.hopSquash - dt * 3.8);
      if (a.mouthMorselTimer > 0) {
        a.mouthMorselTimer = Math.max(0, a.mouthMorselTimer - dt);
        a.chewPhase = (a.chewPhase + dt * 14.0) % (Math.PI * 200);
      }

      const ageRatio = clamp(a.age / Math.max(1, g.maxAge), 0, 1.5);
      a.elderRatio = clamp(
        (ageRatio - LIFECYCLE_THRESHOLDS.elderAgeRatio) / (1.0 - LIFECYCLE_THRESHOLDS.elderAgeRatio),
        0,
        1
      );

      // Developmental growth & stage transitions (Neonate -> Larva / Nymph I-III -> Adult -> Elder)
      const prevStage = a.lifeStage;
      const prevInstar = a.instarRank;
      const growthRate = a.energy > 55 ? 0.024 : 0.011;
      a.maturity = clamp(a.maturity + dt * growthRate, 0.05, 1.0);
      a.lifeStage = getLifeStageFromMaturity(g, a.maturity, ageRatio);
      a.instarRank = getInstarRank(a.maturity);

      if (a.lifeStage !== prevStage || (a.lifeStage === 'instar' && a.instarRank !== prevInstar)) {
        a.moltAnim = 1.0;
        const newMaxHp = computeStageMaxHp(g, a.lifeStage, a.maturity);
        if (newMaxHp > a.maxHp) {
          a.hp = Math.min(newMaxHp, a.hp + (newMaxHp - a.maxHp) * 0.75);
        }
        a.maxHp = newMaxHp;
        if (a.lifeStage === 'adult' && prevStage !== 'adult') {
          ctx.events.emit('fx:burst', {
            position: a.position.clone(),
            colorHex: g.glowHex,
            count: 8,
            speed: 1.35,
          });
        }
      }

      a.scale = computeStageScale(g, a.lifeStage, a.maturity);
      a.stage = getStageDisplayLabel(g, a.lifeStage, a.maturity);
      const mods = getStageBehaviorModifiers(a.lifeStage, a.maturity);

      // Metabolism & passive physiological bonuses
      const metaCost =
        (0.75 + g.sizeScale * 0.65) *
        (1.0 / Math.max(0.6, g.metabolicEfficiency)) *
        mods.metabolicMult;
      a.energy -= dt * metaCost;

      if (g.physiology === 'photosymbiotic') {
        a.energy = Math.min(a.maxEnergy, a.energy + dt * 1.15 * daylight);
      } else if (g.physiology === 'myco_symbiotic') {
        a.energy = Math.min(a.maxEnergy, a.energy + dt * 0.75 * (1.0 - daylight * 0.5));
      }

      if (a.energy > 75 && a.hp < a.maxHp) {
        a.hp = Math.min(a.maxHp, a.hp + dt * 1.8);
      } else if (a.energy <= 0) {
        a.energy = 0;
        a.hp -= dt * 3.8;
      }

      // Death from predation, starvation, or natural old age
      if (a.hp <= 0 || a.age >= g.maxAge) {
        const cause =
          a.age >= g.maxAge
            ? 'passed peacefully of old age'
            : a.energy <= 0.1
            ? 'starved'
            : 'succumbed to injuries';
        if (a.age >= g.maxAge) {
          ctx.log(`${g.speciesName} elder passed of old age`, 'ecology', 'text-slate-300');
        }
        ctx.transitionAnimalToCorpse(a, cause);
        continue;
      }

      // Sensory scan
      const vision = g.visionRange * mods.visionMult;
      const nearAnimals = ctx.animalGrid.query(
        a.position.x,
        a.position.y,
        a.position.z,
        vision,
        this._qAnimals
      );
      const nearPlants = ctx.plantGrid.query(
        a.position.x,
        a.position.y,
        a.position.z,
        vision,
        this._qPlants
      );
      const nearFood = ctx.foodGrid.query(
        a.position.x,
        a.position.y,
        a.position.z,
        vision,
        this._qFood
      );

      let nearestThreat: AnimalEntity | null = null;
      let threatDistSq = Infinity;
      let nearestPrey: AnimalEntity | null = null;
      let preyDistSq = Infinity;
      let nearestMate: AnimalEntity | null = null;
      let mateDistSq = Infinity;
      let nearestRival: AnimalEntity | null = null;
      let rivalDistSq = Infinity;
      let packTargetPrey: AnimalEntity | null = null;

      this._sep.set(0, 0, 0);
      this._align.set(0, 0, 0);
      this._coh.set(0, 0, 0);
      let herdCount = 0;

      for (let j = 0; j < nearAnimals.length; j++) {
        const o = nearAnimals[j];
        if (o === a || !o.alive) continue;
        const dx = o.position.x - a.position.x;
        const dy = o.position.y - a.position.y;
        const dz = o.position.z - a.position.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < 1e-5) continue;

        const sameSpecies = o.genome.speciesId === g.speciesId;

        // Separation from close bodies
        const sepR = (a.scale + o.scale) * 1.15;
        if (dSq < sepR * sepR) {
          const invD = 1.0 / Math.sqrt(dSq);
          this._sep.x -= dx * invD * (sepR - Math.sqrt(dSq));
          this._sep.y -= dy * invD * (sepR - Math.sqrt(dSq)) * (g.locomotion === 'flying' ? 1.0 : 0.15);
          this._sep.z -= dz * invD * (sepR - Math.sqrt(dSq));
        }

        if (sameSpecies) {
          // Cooperative Herding / Flocking / Pack cohesion
          if (g.social === 'Flocking_Herd' || g.social === 'Pack_Hunter' || g.social === 'Symbiotic_Mutualist') {
            this._align.add(o.velocity);
            this._coh.add(o.position);
            herdCount++;
          }

          // Pack Hunter cooperation: rally toward an ally's active prey!
          if (
            g.social === 'Pack_Hunter' &&
            mods.canHunt &&
            o.activeTarget?.role === 'prey' &&
            o.activeTarget.entity.alive &&
            o.activeTarget.entity.kind === 'animal'
          ) {
            packTargetPrey = o.activeTarget.entity;
          }

          // Mating partner search
          if (
            mods.canBreed &&
            a.reproCooldown <= 0 &&
            a.energy > 86 &&
            g.reproduction !== 'Budding_Fission' &&
            o.lifeStage === 'adult' &&
            o.reproCooldown <= 0 &&
            o.energy > 76 &&
            dSq < mateDistSq
          ) {
            mateDistSq = dSq;
            nearestMate = o;
          }

          // Territorial duel with rival same-species adult
          if (
            g.social === 'Territorial' &&
            mods.canTerritorial &&
            o.lifeStage === 'adult' &&
            a.reproCooldown > 0 &&
            dSq < 22.0 &&
            dSq < rivalDistSq
          ) {
            rivalDistSq = dSq;
            nearestRival = o;
          }
        } else {
          // Threat detection
          const isPredatorThreat =
            (o.genome.diet === 'Carnivore' || o.genome.diet === 'Omnivore') &&
            o.scale >= a.scale * mods.threatScaleRatio;
          if (isPredatorThreat && dSq < threatDistSq) {
            threatDistSq = dSq;
            nearestThreat = o;
          }

          // Prey detection
          const wantsHunt =
            mods.canHunt &&
            (g.diet === 'Carnivore' || (g.diet === 'Omnivore' && a.energy < 88)) &&
            o.scale <= a.scale * mods.maxPreyScaleRatio;
          if (wantsHunt && dSq < preyDistSq) {
            preyDistSq = dSq;
            nearestPrey = o;
          }
        }
      }

      // Pack Hunters join ally's hunt if no closer prey
      if (!nearestPrey && packTargetPrey && a.energy < 105) {
        nearestPrey = packTargetPrey;
        preyDistSq = a.position.distanceToSquared(packTargetPrey.position);
      }

      // Food morsel / carcass / egg / propagule search
      let nearestFood: Entity | null = null;
      let foodDistSq = Infinity;
      for (let j = 0; j < nearFood.length; j++) {
        const f = nearFood[j];
        if (!this.wantsFoodItem(g, a, f)) continue;
        const dSq = a.position.distanceToSquared(f.position);
        if (dSq < foodDistSq) {
          foodDistSq = dSq;
          nearestFood = f;
        }
      }

      // Plant / Fungus grazing or pollination search
      let nearestPlant: PlantEntity | null = null;
      let nearestPlantMode: 'graze' | 'pollinate' = 'graze';
      let plantDistSq = Infinity;
      for (let j = 0; j < nearPlants.length; j++) {
        const p = nearPlants[j];
        const mode = this.wantsPlantOrFungus(g, p);
        if (!mode) continue;
        // Prefer visiting a different plant when carrying pollen for true cross-pollination!
        const samePenalty = mode === 'pollinate' && a.pollenSpeciesId === p.id ? 9.0 : 1.0;
        const dSq = a.position.distanceToSquared(p.position) * samePenalty;
        if (dSq < plantDistSq) {
          plantDistSq = dSq;
          nearestPlant = p;
          nearestPlantMode = mode;
        }
      }

      // Asexual budding reproduction (when mature & energy-rich)
      if (
        mods.canBreed &&
        g.reproduction === 'Budding_Fission' &&
        a.reproCooldown <= 0 &&
        a.energy >= 98 &&
        ctx.animals.length < CAPS.maxAnimals
      ) {
        a.state = 'Budding Offspring';
        this.performReproduce(ctx, a, null);
      }

      // Priority decision steering
      this._steer.set(0, 0, 0);
      a.activeTarget = null;
      let targetSpeed = g.speed * mods.speedMult;
      let wantsAmbushCrouch = false;

      if (a.stunTimer > 0) {
        a.state = 'Dazzled';
        targetSpeed *= 0.28;
      } else if (nearestThreat && threatDistSq < (vision * 0.82) ** 2) {
        a.state = 'Fleeing';
        a.activeTarget = { entity: nearestThreat, role: 'threat' };
        this._desired.subVectors(a.position, nearestThreat.position);
        safeNormalize(this._desired);
        this._steer.addScaledVector(this._desired, 2.9);
        targetSpeed *= 1.32;
        if (g.locomotion === 'flying') this._steer.y += 0.85;
      } else if (nearestMate && a.energy > 86) {
        a.state = mateDistSq < 4.5 ? 'Courting' : 'Seeking Mate';
        a.activeTarget = { entity: nearestMate, role: 'mate' };
        this._desired.subVectors(nearestMate.position, a.position);
        const dist = this._desired.length();
        safeNormalize(this._desired);
        this._steer.addScaledVector(this._desired, 1.8);
        if (dist < (a.scale + nearestMate.scale) * 1.45 + 0.45) {
          a.courtshipAnim = 1.0;
          this.performReproduce(ctx, a, nearestMate);
        }
      } else if (nearestPrey && a.energy < 106) {
        const dist = Math.sqrt(preyDistSq);
        const isAmbush = g.combat === 'Ambush_Pounce' && dist > 2.4 && dist < 5.2;
        a.state = isAmbush
          ? 'Stalking Ambush'
          : packTargetPrey === nearestPrey
          ? 'Pack Hunting'
          : 'Hunting';
        a.activeTarget = { entity: nearestPrey, role: 'prey' };
        this._desired.subVectors(nearestPrey.position, a.position);
        safeNormalize(this._desired);
        this._steer.addScaledVector(this._desired, isAmbush ? 1.15 : 2.55);
        wantsAmbushCrouch = isAmbush;
        targetSpeed *= isAmbush ? 0.55 : 1.24;

        const strikeRange = (a.scale + nearestPrey.scale) * 0.92 + 0.42;
        a.jawGape = dist < strikeRange * 2.2 ? clamp(1.0 - dist / (strikeRange * 2.2), 0, 1) : 0;
        if (dist < strikeRange && a.attackCooldown <= 0) {
          this.performCombatStrike(ctx, a, nearestPrey, false);
        }
      } else if (nearestFood && a.energy < 108) {
        a.state = 'Foraging';
        a.activeTarget = { entity: nearestFood, role: 'food' };
        this._desired.subVectors(nearestFood.position, a.position);
        const dist = this._desired.length();
        safeNormalize(this._desired);
        this._steer.addScaledVector(this._desired, 2.1);

        const eatRange = a.scale * 0.95 + 0.45;
        a.jawGape = dist < eatRange * 2.0 ? 0.65 : 0;
        if (dist < eatRange && a.biteCooldown <= 0) {
          this.consumeFoodEntity(ctx, a, nearestFood);
        }
      } else if (nearestPlant && (a.energy < 104 || nearestPlantMode === 'pollinate')) {
        a.state = nearestPlantMode === 'pollinate' ? 'Seeking Blossom' : 'Grazing';
        a.activeTarget = {
          entity: nearestPlant,
          role: nearestPlantMode === 'pollinate' ? 'pollinate' : 'food',
        };
        const crownY = nearestPlant.position.y + 0.55 * nearestPlant.scale;
        this._desired.set(
          nearestPlant.position.x - a.position.x,
          g.locomotion === 'flying' ? crownY - a.position.y : 0,
          nearestPlant.position.z - a.position.z
        );
        const dist = this._desired.length();
        safeNormalize(this._desired);
        this._steer.addScaledVector(this._desired, 1.85);

        const reach = a.scale * 0.95 + nearestPlant.scale * 0.55 + 0.48;
        if (dist < reach && a.biteCooldown <= 0) {
          this.performGrazeOrPollinate(ctx, a, nearestPlant, nearestPlantMode);
        }
      } else if (nearestRival && rivalDistSq < 16.0) {
        a.state = 'Territorial Duel';
        a.activeTarget = { entity: nearestRival, role: 'rival' };
        this._desired.subVectors(nearestRival.position, a.position);
        const dist = this._desired.length();
        safeNormalize(this._desired);
        this._steer.addScaledVector(this._desired, 2.0);
        if (dist < (a.scale + nearestRival.scale) * 0.95 + 0.42 && a.attackCooldown <= 0) {
          this.performCombatStrike(ctx, a, nearestRival, true);
        }
      } else {
        // Exploratory wandering, soaring, perching, or herding
        a.jawGape = Math.max(0, a.jawGape - dt * 3.0);
        a.wanderTimer -= dt;
        if (a.wanderTimer <= 0) {
          a.wanderTimer = randRange(2.4, 5.2);
          const ang = Math.atan2(a.wanderDir.z, a.wanderDir.x) + randRange(-1.35, 1.35);
          a.wanderDir.set(
            Math.cos(ang),
            g.locomotion === 'flying' ? randRange(-0.28, 0.34) : 0,
            Math.sin(ang)
          );
          safeNormalize(a.wanderDir);
        }
        this._steer.addScaledVector(a.wanderDir, 1.05);
        a.state =
          a.lifeStage === 'elder'
            ? 'Elder Roaming'
            : g.locomotion === 'flying'
            ? a.perchTimer > 0
              ? 'Perching'
              : 'Soaring'
            : g.locomotion === 'bouncing'
            ? 'Foraging Hops'
            : g.locomotion === 'slithering'
            ? 'Prowling'
            : 'Exploring';
      }

      // Apply cooperative boids herding/flocking forces
      if (herdCount > 0) {
        const hm = mods.herdingMult * (g.social === 'Flocking_Herd' ? 1.0 : 0.55);
        this._align.divideScalar(herdCount);
        if (safeNormalize(this._align)) this._steer.addScaledVector(this._align, 0.55 * hm);
        this._coh.divideScalar(herdCount).sub(a.position);
        if (safeNormalize(this._coh)) this._steer.addScaledVector(this._coh, 0.42 * hm);
      }

      // Soft separation
      this._steer.addScaledVector(this._sep, 1.85);

      // Soft terrarium glass dome inward steering (no hard wall bounce!)
      const rHoriz = Math.hypot(a.position.x, a.position.z);
      const boundW = computeHorizontalBoundWeight(a.position.x, a.position.z);
      if (boundW > 0 && rHoriz > 1e-4) {
        this._steer.x -= (a.position.x / rHoriz) * boundW * 2.6;
        this._steer.z -= (a.position.z / rHoriz) * boundW * 2.6;
      }

      // Avoid wading deep into the mineral pool for non-flyers
      if (g.locomotion !== 'flying') {
        const pdx = a.position.x - TERRARIUM.poolPos.x;
        const pdz = a.position.z - TERRARIUM.poolPos.z;
        const pDistSq = pdx * pdx + pdz * pdz;
        if (pDistSq < 4.5 && pDistSq > 1e-4) {
          const invP = 1.0 / Math.sqrt(pDistSq);
          this._steer.x += pdx * invP * 1.85;
          this._steer.z += pdz * invP * 1.85;
        }
      }

      // === DISTINCT 5-MODE LOCOMOTION PHYSICS ===
      this.integrateLocomotion(ctx, a, dt, targetSpeed, wantsAmbushCrouch, mods.windDragMult, mods.gaitFreqMult);

      ctx.enforceFiniteTransform(a);
    }
  }

  private integrateLocomotion(
    ctx: SimulationContext,
    a: AnimalEntity,
    dt: number,
    targetSpeed: number,
    wantsAmbushCrouch: boolean,
    windDragMult: number,
    gaitFreqMult: number
  ): void {
    const g = a.genome;
    const clearance = this.getGroundClearance(a);
    const groundY = getTerrainHeight(a.position.x, a.position.z) + clearance;
    this._prevFwd.set(0, 0, 1).applyQuaternion(a.quaternion);

    if (g.locomotion === 'flying') {
      // === 1. FLYING: 3D aerial glide, banking, wind thermals & occasional resting perch ===
      sampleWindField(
        a.position.x,
        a.position.y,
        a.position.z,
        ctx.simTime,
        ctx.env.windStrength,
        this._wind
      );

      // Occasional perch on moss when tired and not fleeing/hunting
      if (a.perchTimer > 0) {
        a.perchTimer -= dt;
        if (a.activeTarget?.role === 'threat' || a.activeTarget?.role === 'prey') {
          a.perchTimer = 0;
        }
      } else if (
        a.energy < 42 &&
        !a.activeTarget &&
        a.position.y < groundY + 1.8 &&
        Math.random() < dt * 0.25
      ) {
        a.perchTimer = randRange(2.5, 5.0);
      }

      if (a.perchTimer > 0) {
        a.velocity.multiplyScalar(Math.pow(0.08, dt));
        a.position.y = THREE.MathUtils.lerp(a.position.y, groundY, clamp(dt * 4.5, 0, 1));
        a.grounded = a.position.y <= groundY + 0.12;
        a.wingPhase = (a.wingPhase + dt * 1.4) % (Math.PI * 200);
        a.speedRatio = 0.08;
        a.bankAngle = THREE.MathUtils.lerp(a.bankAngle, 0, clamp(dt * 5.0, 0, 1));
        return;
      }

      a.grounded = false;
      const prefY =
        g.stratumPref === 'canopy'
          ? groundY + randRange(4.2, 7.6)
          : groundY + randRange(1.8, 4.4);
      if (!a.activeTarget) {
        const yErr = prefY - a.position.y;
        this._steer.y += clamp(yErr * 0.28, -1.1, 1.1);
      }
      // Keep cleanly between canopy ceiling and terrain floor
      if (a.position.y < groundY + 0.85) this._steer.y += 2.6;
      if (a.position.y > TERRARIUM.canopyY - 1.2) this._steer.y -= 2.8;

      if (this._steer.lengthSq() > 1e-6) {
        this._steer.normalize().multiplyScalar(targetSpeed);
        a.velocity.lerp(this._steer, clamp(dt * 3.4, 0, 1));
      }
      a.velocity.addScaledVector(this._wind, 0.32 * windDragMult * dt);

      const spd = a.velocity.length();
      if (spd > targetSpeed * 1.42) a.velocity.multiplyScalar((targetSpeed * 1.42) / spd);
      a.position.addScaledVector(a.velocity, dt);
      clampToTerrariumRadius(a.position, 0.9);
      const minFlyY = getTerrainHeight(a.position.x, a.position.z) + clearance + 0.35;
      a.position.y = clamp(a.position.y, minFlyY, TERRARIUM.canopyY - 0.6);

      const crossY = this._prevFwd.x * a.velocity.z - this._prevFwd.z * a.velocity.x;
      a.bankAngle = THREE.MathUtils.lerp(a.bankAngle, clamp(crossY * 0.42, -0.58, 0.58), clamp(dt * 5.5, 0, 1));
      safeOrientToward(a.quaternion, a.velocity, clamp(dt * 5.8, 0, 1), a.bankAngle);

      a.speedRatio = clamp(a.velocity.length() / Math.max(0.5, g.speed), 0.25, 1.65);
      a.wingPhase = (a.wingPhase + dt * g.wingFreq * (0.85 + a.speedRatio * 0.55) * gaitFreqMult) % (Math.PI * 200);
      return;
    }

    if (g.locomotion === 'bouncing') {
      // === 2. BOUNCING: Real ballistic hop physics with crouch anticipation & squash-and-stretch! ===
      this._steer.y = 0;
      const hasDir = safeNormalize(this._steer);
      if (hasDir) {
        a.wanderDir.x = this._steer.x;
        a.wanderDir.z = this._steer.z;
      }

      if (a.grounded) {
        a.velocity.x *= Math.pow(0.05, dt);
        a.velocity.z *= Math.pow(0.05, dt);
        a.velocity.y = 0;
        a.position.y = groundY;

        a.hopTimer -= dt;
        const crouchWindow = 0.24;
        if (a.hopTimer <= crouchWindow && a.hopTimer > 0) {
          a.hopCrouch = clamp(1.0 - a.hopTimer / crouchWindow, 0, 1);
        } else if (a.hopTimer <= 0) {
          // Spring launch!
          const urgency =
            a.activeTarget?.role === 'threat' || a.activeTarget?.role === 'prey' ? 1.25 : 1.0;
          const dirX = hasDir ? this._steer.x : a.wanderDir.x;
          const dirZ = hasDir ? this._steer.z : a.wanderDir.z;
          const horizSpd = targetSpeed * 1.28 * urgency;
          a.velocity.set(dirX * horizSpd, g.jumpPower * randRange(0.84, 1.12) * urgency, dirZ * horizSpd);
          a.grounded = false;
          a.hopCrouch = 0;
          a.hopTimer = randRange(0.45, 1.15) / urgency;
          if (Math.random() < 0.35) {
            ctx.events.emit('audio:cue', { type: 'hop' });
          }
          ctx.events.emit('fx:burst', {
            position: new THREE.Vector3(a.position.x, groundY - clearance + 0.05, a.position.z),
            colorHex: g.accentHex,
            count: 3,
            speed: 0.85,
          });
        } else {
          a.hopCrouch = Math.max(0, a.hopCrouch - dt * 5.0);
        }

        // Orient toward intended hop direction while crouched
        if (hasDir) {
          this._desired.set(this._steer.x, 0, this._steer.z);
          safeOrientToward(a.quaternion, this._desired, clamp(dt * 7.0, 0, 1), 0);
        }
      } else {
        // Ballistic parabolic arc under gravity
        a.velocity.y -= GRAVITY * dt;
        a.position.addScaledVector(a.velocity, dt);
        clampToTerrariumRadius(a.position, 0.9);

        const newGroundY = getTerrainHeight(a.position.x, a.position.z) + clearance;
        if (a.position.y <= newGroundY) {
          a.position.y = newGroundY;
          a.velocity.set(0, 0, 0);
          a.grounded = true;
          a.hopSquash = 1.0;
        } else {
          // Slight pitch along ballistic trajectory
          this._desired.set(a.velocity.x, clamp(a.velocity.y * 0.25, -1.2, 1.2), a.velocity.z);
          safeOrientToward(a.quaternion, this._desired, clamp(dt * 6.5, 0, 1), 0);
        }
      }

      a.speedRatio = clamp(Math.hypot(a.velocity.x, a.velocity.z) / Math.max(0.5, g.speed), 0, 1.6);
      a.gaitPhase = (a.gaitPhase + dt * g.gaitFreq * gaitFreqMult) % (Math.PI * 200);
      return;
    }

    // === 3. WALKING / 4. CRAWLING / 5. SLITHERING: Terrain-conforming ground locomotion ===
    this._steer.y = 0;
    if (this._steer.lengthSq() > 1e-6) {
      this._steer.normalize().multiplyScalar(targetSpeed);
      const accel = g.locomotion === 'walking' ? 4.8 : g.locomotion === 'slithering' ? 3.8 : 4.2;
      a.velocity.x = THREE.MathUtils.lerp(a.velocity.x, this._steer.x, clamp(dt * accel, 0, 1));
      a.velocity.z = THREE.MathUtils.lerp(a.velocity.z, this._steer.z, clamp(dt * accel, 0, 1));
    }

    // Serpentine lateral micro-weave for slithering motion
    if (g.locomotion === 'slithering' && !wantsAmbushCrouch) {
      const weave = Math.sin(a.slitherPhase) * 0.35 * targetSpeed;
      const spdH = Math.hypot(a.velocity.x, a.velocity.z);
      if (spdH > 0.15) {
        const perpX = -a.velocity.z / spdH;
        const perpZ = a.velocity.x / spdH;
        a.position.x += perpX * weave * dt * 0.45;
        a.position.z += perpZ * weave * dt * 0.45;
      }
    }

    // Handle occasional airborne knockback or ambush pounce
    if (!a.grounded) {
      a.velocity.y -= GRAVITY * dt;
      a.position.addScaledVector(a.velocity, dt);
      const newFloor = getTerrainHeight(a.position.x, a.position.z) + clearance;
      if (a.position.y <= newFloor) {
        a.position.y = newFloor;
        a.velocity.y = 0;
        a.grounded = true;
      }
    } else {
      a.position.x += a.velocity.x * dt;
      a.position.z += a.velocity.z * dt;
      clampToTerrariumRadius(a.position, 0.9);
      a.position.y = getTerrainHeight(a.position.x, a.position.z) + clearance;
      a.velocity.y = 0;
    }

    clampToTerrariumRadius(a.position, 0.9);
    getTerrainNormal(a.position.x, a.position.z, this._groundNormal);

    // Project horizontal velocity onto terrain slope tangent for natural uphill/downhill pitch
    const horizSpd = Math.hypot(a.velocity.x, a.velocity.z);
    if (horizSpd > 0.08) {
      const aheadX = a.position.x + (a.velocity.x / horizSpd) * 0.35;
      const aheadZ = a.position.z + (a.velocity.z / horizSpd) * 0.35;
      const aheadY = getTerrainHeight(aheadX, aheadZ) + clearance;
      this._desired.set(aheadX - a.position.x, aheadY - a.position.y, aheadZ - a.position.z);
      const useNormal = g.locomotion === 'crawling' || g.locomotion === 'slithering' ? this._groundNormal : undefined;
      safeOrientToward(a.quaternion, this._desired, clamp(dt * 6.5, 0, 1), 0, useNormal);
    }

    a.speedRatio = clamp(horizSpd / Math.max(0.5, g.speed), 0.05, 1.65);
    a.gaitPhase = (a.gaitPhase + dt * g.gaitFreq * (0.3 + a.speedRatio * 1.15) * gaitFreqMult) % (Math.PI * 200);
    a.slitherPhase = (a.slitherPhase + dt * g.slitherFreq * (0.45 + a.speedRatio * 1.05) * gaitFreqMult) % (Math.PI * 200);
    a.wingPhase = (a.wingPhase + dt * g.wingFreq * 0.7) % (Math.PI * 200);
  }

  private consumeFoodEntity(ctx: SimulationContext, a: AnimalEntity, item: Entity): void {
    a.biteCooldown = 0.72;
    a.biteAnim = 0.95;
    a.jawGape = 0;

    if (item.kind === 'pellet') {
      const p = item as FoodPelletEntity;
      const eat = Math.min(p.nutrients, 24);
      p.nutrients -= eat;
      a.energy = Math.min(a.maxEnergy, a.energy + eat * 1.55);
      a.hp = Math.min(a.maxHp, a.hp + 4);
      a.mouthMorselTimer = 0.85;
      a.mouthMorselMaxTimer = 0.85;
      a.mouthMorselColor = p.colorHex;
      a.mouthMorselKind = p.origin;
      ctx.events.emit('audio:cue', { type: 'tear' });
      if (p.nutrients <= 0.5) {
        ctx.disposeEntity(p);
      }
    } else if (item.kind === 'corpse') {
      const eat = Math.min(item.nutrients, 22);
      item.nutrients -= eat;
      item.joltAnim = 1.0;
      a.energy = Math.min(a.maxEnergy, a.energy + eat * 1.45);
      a.hp = Math.min(a.maxHp, a.hp + 5);
      a.mouthMorselTimer = 1.0;
      a.mouthMorselMaxTimer = 1.0;
      a.mouthMorselColor = item.genome.baseHex;
      a.mouthMorselKind = 'flesh';
      ctx.events.emit('fx:burst', {
        position: item.position.clone(),
        colorHex: item.genome.baseHex,
        count: 4,
        speed: 1.0,
      });
      ctx.events.emit('audio:cue', { type: 'tear' });
    } else if (item.kind === 'egg' || item.kind === 'propagule') {
      a.energy = Math.min(a.maxEnergy, a.energy + item.nutrients * 1.35);
      a.hp = Math.min(a.maxHp, a.hp + 3);
      ctx.events.emit('audio:cue', { type: 'tear' });
      ctx.disposeEntity(item);
    }
  }
}
