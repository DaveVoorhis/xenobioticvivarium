import * as THREE from 'three';
import { CAPS, TERRARIUM } from '../../core/config';
import {
  clamp,
  computeDaylightFactor,
  computePlantPlacementWeight,
  randRange,
  safeNormalize,
  safeRatio,
} from '../../core/math';
import { recombinePlantGenomes } from '../../genetics/PlantGenetics';
import { getPlantStageLabel } from '../lifecycle';
import type { AnimalEntity, PlantEntity } from '../types';
import type { SimulationContext } from '../SimulationEngine';

export class PlantEcologySystem {
  private readonly _qAnimals: AnimalEntity[] = [];
  private readonly _qPlants: PlantEntity[] = [];
  private readonly _pullDir = new THREE.Vector3();
  private readonly _trapPos = new THREE.Vector3();
  private readonly _scrapVel = new THREE.Vector3();

  update(ctx: SimulationContext, dt: number): void {
    const daylight = computeDaylightFactor(ctx.env.timeOfDay);

    for (let i = ctx.plants.length - 1; i >= 0; i--) {
      const p = ctx.plants[i];
      if (!p.alive) {
        ctx.plants.splice(i, 1);
        continue;
      }

      const g = p.genome;
      p.age += dt;
      const swayBoost = 1.0 + ctx.env.windStrength * 0.55;
      p.swayPhase = (p.swayPhase + dt * g.swayFreq * swayBoost) % (Math.PI * 200);
      p.snareAnim = Math.max(0, p.snareAnim - dt * 1.2);
      p.rustleAnim = Math.max(0, p.rustleAnim - dt * 2.0);
      p.sporePulseAnim = Math.max(0, p.sporePulseAnim - dt * 1.1);
      p.mycorrhizalBoost = Math.max(0, p.mycorrhizalBoost - dt * 0.35);

      if (p.wilting) {
        p.wiltAge += dt;
        p.stage = 'Wilting';
        p.state = 'Decomposing';
        const prog = clamp(p.wiltAge / Math.max(0.1, p.wiltDuration), 0, 1);
        p.wiltTilt = prog * 0.72;
        p.opacity = clamp(1.0 - prog, 0, 1);
        p.scale = Math.max(0.02, (1.0 - prog * 0.86) * p.growth * g.maxHeight * 0.58);

        if (Math.random() < dt * 1.5) {
          ctx.events.emit('fx:burst', {
            position: p.position.clone().add(new THREE.Vector3(0, 0.28, 0)),
            colorHex: g.kingdom === 'fungus' ? 0xc084fc : 0x42e8a8,
            count: 1,
            speed: 0.55,
          });
        }
        if (prog >= 1.0) {
          ctx.spawnNutrientPatch(p.position.x, p.position.z, g.kingdom === 'fungus' ? 1.05 : 0.9);
          ctx.disposeEntity(p);
          ctx.plants.splice(i, 1);
        }
        continue;
      }

      if (p.biomass <= 1.0 || p.age >= g.maxAge) {
        p.wilting = true;
        p.wiltAge = 0;
        continue;
      }

      const ageRatio = safeRatio(p.age, g.maxAge);
      const nutEff = g.nutrientEfficiency ?? 1.0;
      const lightMult =
        g.leafMorphology === 'broad_frond'
          ? 1.2
          : g.leafMorphology === 'crystalline_rosette'
          ? 0.94
          : 1.0;

      let gain = 0;
      let statusState = 'Growing';

      if (g.metabolism === 'Photosynthetic') {
        gain = (0.72 + 2.4 * daylight) * lightMult;
        statusState = daylight > 0.32 ? 'Photosynthesizing' : 'Nocturnal Rest';
        if (g.form === 'canopy_blossom' && p.growth > 0.65) {
          p.nectarReserve = Math.min(100, p.nectarReserve + dt * (2.6 + daylight * 3.0));
          if (p.nectarReserve > 35) statusState = 'Blooming (Nectar Rich)';
        }
      } else if (g.metabolism === 'Mycorrhizal_Fungi') {
        // Symbiotic fungus: forms cooperative nutrient networks with nearby photosynthetic plants!
        const nightBoost = 1.0 + (1.0 - daylight) * 0.45;
        gain = 1.35 * nutEff * nightBoost;
        statusState = 'Mycorrhizal Network';

        const nearFlora = ctx.plantGrid.query(
          p.position.x,
          p.position.y,
          p.position.z,
          5.2,
          this._qPlants
        );
        let partners = 0;
        for (let k = 0; k < nearFlora.length; k++) {
          const host = nearFlora[k];
          if (!host.alive || host === p || host.wilting) continue;
          if (host.genome.kingdom === 'plant') {
            partners++;
            host.mycorrhizalBoost = Math.min(1.0, host.mycorrhizalBoost + dt * 0.55);
            gain += 0.55 * nutEff;
            if (partners >= 3) break;
          }
        }
        if (partners > 0) {
          statusState = `Symbiosis (${partners} Flora)`;
        }
      } else if (g.metabolism === 'Saprotrophic_Fungi') {
        // Decomposer fungus: thrives on carcasses, fallen scraps, and soil nutrient patches!
        const nightBoost = 1.0 + (1.0 - daylight) * 0.35;
        gain = 1.25 * nutEff * nightBoost;
        statusState = 'Absorbing Humus';

        for (let c = 0; c < ctx.corpses.length; c++) {
          const co = ctx.corpses[c];
          if (!co.alive) continue;
          if (p.position.distanceToSquared(co.position) < 16.0) {
            gain += 2.6 * nutEff;
            co.nutrients = Math.max(0, co.nutrients - dt * 1.4);
            statusState = 'Digesting Carcass';
            break;
          }
        }
        for (let f = 0; f < ctx.foodPellets.length; f++) {
          const pel = ctx.foodPellets[f];
          if (!pel.alive || pel.phase === 'falling') continue;
          if (p.position.distanceToSquared(pel.position) < 10.5) {
            gain += (pel.phase === 'dissolving' ? 1.55 : 0.85) * nutEff;
            break;
          }
        }
      } else if (g.metabolism === 'Mixotrophic') {
        const cd = Math.hypot(p.position.x - TERRARIUM.cairnPos.x, p.position.z - TERRARIUM.cairnPos.z);
        gain = (0.9 + 1.5 * daylight) * lightMult + 1.5 * Math.exp(-(cd * cd) / 50.0) * nutEff;
        statusState = 'Mixotrophic';
      } else {
        // Carnivorous Flora (pitcher_trap): lures & snares small passing walkers, crawlers, bouncers, or low flyers!
        gain = 1.1;
        statusState = 'Luring Prey';
        p.snareCooldown = Math.max(0, p.snareCooldown - dt);
        if (p.snareCooldown <= 0 && p.growth > 0.45) {
          this._trapPos.set(p.position.x, p.position.y + 0.62 * p.scale, p.position.z);
          const snareRadius = 1.75 * clamp(g.canopySpread ?? 1.0, 0.8, 1.38);
          const near = ctx.animalGrid.query(
            this._trapPos.x,
            this._trapPos.y,
            this._trapPos.z,
            snareRadius,
            this._qAnimals
          );
          for (let j = 0; j < near.length; j++) {
            const v = near[j];
            if (!v.alive || v.scale > 0.64) continue;
            const preyResist =
              (v.genome.physiology === 'toxin_resistant' ? 0.65 : 1.0) *
              (1.0 - clamp((v.genome.armorDensity ?? 0) * 0.35, 0, 0.35));
            v.hp -= 17 * (0.85 + (g.toxicity ?? 0.3) * 0.45) * preyResist;
            v.hitFlash = 0.32;
            v.thrashAnim = 0.88;
            v.stunTimer = Math.max(v.stunTimer, 0.45);

            this._pullDir.subVectors(this._trapPos, v.position);
            if (safeNormalize(this._pullDir)) {
              v.velocity.multiplyScalar(0.25).addScaledVector(this._pullDir, 2.2);
            }

            p.biomass = Math.min(p.maxBiomass, p.biomass + 26);
            p.snareCooldown = 3.1;
            p.snareAnim = 1.0;
            p.rustleAnim = 0.85;
            statusState = 'Snaring Prey!';

            ctx.events.emit('fx:fragments', {
              position: v.position.clone(),
              colorHex: v.genome.baseHex,
              accentHex: v.genome.accentHex,
              kind: 'flesh',
              count: 5,
              speed: 1.45,
              suctionTarget: this._trapPos.clone(),
            });
            ctx.events.emit('fx:burst', {
              position: v.position.clone(),
              colorHex: 0xff52b4,
              count: 7,
              speed: 1.45,
            });
            ctx.events.emit('audio:cue', { type: 'strike' });

            const pieceCount = v.hp <= 0 ? 2 : 1;
            for (let s = 0; s < pieceCount; s++) {
              this._scrapVel.set(randRange(-1.0, 1.0), randRange(1.2, 2.2), randRange(-1.0, 1.0));
              ctx.spawnTornMorsel(
                v.position,
                this._scrapVel,
                s % 2 === 0 ? v.genome.baseHex : v.genome.accentHex,
                'flesh',
                randRange(10, 16),
                clamp(0.75 + v.genome.sizeScale * 0.4, 0.75, 1.2),
                v.genome.speciesName
              );
            }

            if (v.hp <= 0) {
              ctx.log(`${g.speciesName} ensnared ${v.genome.speciesName}`, 'predation', 'text-fuchsia-300');
              ctx.transitionAnimalToCorpse(v, `ensnared by ${g.speciesName}`);
            }
            break;
          }
        }
      }

      // Apply cooperative mycorrhizal boost to host plants
      if (p.mycorrhizalBoost > 0.05 && g.kingdom === 'plant') {
        gain += 1.15 * p.mycorrhizalBoost;
        if (statusState === 'Photosynthesizing' || statusState === 'Growing') {
          statusState = 'Mycorrhizal Boost';
        }
      }

      // Draw richness from nearby soil nutrient patches
      for (let n = 0; n < ctx.nutrientPatches.length; n++) {
        const np = ctx.nutrientPatches[n];
        if (!np.alive) continue;
        if (p.position.distanceToSquared(np.position) < 9.5) {
          gain += 1.35 * nutEff;
          np.nutrients = Math.max(0, np.nutrients - dt * 0.4);
          break;
        }
      }

      // Evolutionary maintenance cost for toxins / thorns
      const defenseTax =
        (g.toxicity ?? 0) * 0.22 + (g.defense === 'thorns' ? 0.14 : g.defense === 'alkaloid_toxin' ? 0.12 : 0);
      gain = Math.max(0.18, gain - defenseTax);

      // Old age senescence slows growth
      const senescenceMult = ageRatio > 0.82 ? 0.42 : 1.0;

      p.growth = clamp(p.growth + dt * 0.032 * gain * senescenceMult, 0.12, 1.0);
      p.biomass = clamp(p.biomass + dt * 1.12 * gain * senescenceMult, 0, p.maxBiomass);
      p.scale = Math.max(0.08, p.growth * g.maxHeight * 0.62);
      p.stage = getPlantStageLabel(g, p.growth, ageRatio, false);
      p.state = p.snareAnim > 0.15 ? 'Snaring Prey!' : ageRatio >= 0.82 ? 'Senescing' : statusState;

      // Reproduction: spores, heavy seeds, budding offshoots, mycelial runners, explosive pods!
      p.seedCooldown = Math.max(0, p.seedCooldown - dt);
      if (
        p.growth >= 0.72 &&
        p.biomass >= p.maxBiomass * 0.66 &&
        ageRatio < 0.84 &&
        p.seedCooldown <= 0
      ) {
        this.reproduceFlora(ctx, p, null);
      }
    }
  }

  /**
   * Triggers propagation for a plant or fungus — can also be invoked externally
   * when a pollinator/mutualist transfers pollen/spores!
   */
  reproduceFlora(ctx: SimulationContext, p: PlantEntity, pollenDonor: PlantEntity | null): void {
    const g = p.genome;
    p.seedCooldown = randRange(22, 34);
    p.biomass = Math.max(12, p.biomass - 18);
    p.sporePulseAnim = 1.0;

    // Look for a nearby same-kingdom partner for genetic recombination if no pollinator donor provided
    let partner: PlantEntity | null = pollenDonor;
    if (!partner) {
      const near = ctx.plantGrid.query(p.position.x, p.position.y, p.position.z, 5.5, this._qPlants);
      for (let j = 0; j < near.length; j++) {
        const cand = near[j];
        if (cand !== p && cand.alive && !cand.wilting && cand.genome.kingdom === g.kingdom && cand.growth > 0.55) {
          partner = cand;
          break;
        }
      }
    }

    const res = recombinePlantGenomes(
      g,
      partner ? partner.genome : null,
      ctx.env.mutationRateMultiplier,
      false
    );
    const childGenome = res.genome;
    if (res.speciated) {
      ctx.log(
        `New ${childGenome.kingdom === 'fungus' ? 'fungus' : 'flora'}: ${childGenome.speciesName}`,
        'speciation',
        childGenome.kingdom === 'fungus' ? 'text-violet-300' : 'text-emerald-300'
      );
      ctx.events.emit('audio:cue', { type: 'speciation' });
    }

    p.offspringCount++;

    if (g.propagation === 'Budding_Offshoot' || g.propagation === 'Mycelial_Runners') {
      if (ctx.plants.length < CAPS.maxPlants) {
        const dist = g.propagation === 'Mycelial_Runners' ? randRange(1.4, 3.2) : randRange(0.9, 1.9);
        const ang = Math.random() * Math.PI * 2;
        const nx = p.position.x + Math.cos(ang) * dist;
        const nz = p.position.z + Math.sin(ang) * dist;
        if (Math.random() <= computePlantPlacementWeight(nx, nz)) {
          ctx.spawnPlant(childGenome, nx, nz, 0.22);
          ctx.events.emit('fx:burst', {
            position: new THREE.Vector3(nx, p.position.y + 0.25, nz),
            colorHex: childGenome.glowHex,
            count: 6,
            speed: 1.0,
          });
        }
      }
    } else {
      const isSeed = g.propagation === 'Heavy_Seeds' || g.propagation === 'Explosive_Pods';
      const count = g.propagation === 'Wind_Spores' ? 2 : g.propagation === 'Explosive_Pods' ? 2 : 1;
      for (let k = 0; k < count; k++) {
        if (ctx.propagules.length >= CAPS.maxPropagules) break;
        const origin = p.position.clone().add(new THREE.Vector3(0, 0.55 * p.scale, 0));
        const launchSpeed = g.propagation === 'Explosive_Pods' ? randRange(2.4, 3.8) : randRange(0.6, 1.4);
        const ang = Math.random() * Math.PI * 2;
        const vel = new THREE.Vector3(
          Math.cos(ang) * launchSpeed,
          isSeed ? randRange(2.2, 3.6) : randRange(0.7, 1.5),
          Math.sin(ang) * launchSpeed
        );
        ctx.spawnPropagule(childGenome, origin, isSeed, vel);
      }
      ctx.events.emit('fx:burst', {
        position: p.position.clone().add(new THREE.Vector3(0, 0.55 * p.scale, 0)),
        colorHex: g.glowHex,
        count: g.kingdom === 'fungus' ? 10 : 6,
        speed: g.propagation === 'Explosive_Pods' ? 2.2 : 1.15,
      });
      if (g.kingdom === 'fungus' || g.propagation === 'Explosive_Pods') {
        ctx.events.emit('audio:cue', { type: 'spore' });
      }
    }
  }
}
