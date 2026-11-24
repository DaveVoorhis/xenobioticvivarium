import * as THREE from 'three';
import { CAPS, TERRARIUM } from '../../core/config';
import {
  clamp,
  clampToTerrariumRadius,
  computeHorizontalBoundWeight,
  computePlantPlacementWeight,
  getTerrainHeight,
  getTerrainNormal,
  randRange,
  safeRatio,
  sampleWindField,
} from '../../core/math';
import { getIntermediateStage } from '../lifecycle';
import type { SimulationContext } from '../SimulationEngine';

export class LifecycleSystem {
  private readonly _wind = new THREE.Vector3();
  private readonly _rollQ = new THREE.Quaternion();
  private readonly _alignQ = new THREE.Quaternion();
  private readonly _targetQ = new THREE.Quaternion();
  private readonly _spinAxis = new THREE.Vector3();
  private readonly _groundNormal = new THREE.Vector3();
  private readonly _flatAxis = new THREE.Vector3();
  private readonly _axisZ = new THREE.Vector3(0, 0, 1);
  private readonly _axisX = new THREE.Vector3(1, 0, 0);

  update(ctx: SimulationContext, dt: number): void {
    this.updateEggs(ctx, dt);
    this.updatePropagules(ctx, dt);
    this.updateFoodPellets(ctx, dt);
    this.updateCorpses(ctx, dt);
    this.updateNutrientPatches(ctx, dt);
  }

  private updateEggs(ctx: SimulationContext, dt: number): void {
    for (let i = ctx.eggs.length - 1; i >= 0; i--) {
      const e = ctx.eggs[i];
      if (!e.alive) {
        ctx.eggs.splice(i, 1);
        continue;
      }
      e.age += dt;
      const prog = clamp(e.age / Math.max(1.0, e.incubateDuration), 0, 1);
      e.state = prog > 0.76 ? 'Hatching Soon' : 'Incubating';
      const fl = getTerrainHeight(e.position.x, e.position.z) + 0.12;
      if (e.position.y > fl) {
        // Eggs laid by flyers drift gently down to settle in the moss
        e.position.y = Math.max(fl, e.position.y - 2.4 * dt);
        clampToTerrariumRadius(e.position, 0.8);
      } else {
        e.position.y = fl;
      }

      const pulseFreq = 3.2 + prog * 5.2;
      const baseEggScale = 0.78 + prog * 0.36;
      e.scale = baseEggScale + Math.sin(ctx.simTime * pulseFreq + e.id) * (0.04 + prog * 0.06);
      ctx.enforceFiniteTransform(e);

      if (e.age >= e.incubateDuration) {
        if (ctx.animals.length < CAPS.maxAnimals) {
          const hatchStage = getIntermediateStage(e.genome);
          const hatchYOffset = e.genome.locomotion === 'flying' ? 0.65 : 0.24;
          const hatchling = ctx.spawnAnimal(
            e.genome,
            e.position.clone().add(new THREE.Vector3(0, hatchYOffset, 0)),
            hatchStage
          );
          if (hatchling) hatchling.moltAnim = 0.9;
          ctx.events.emit('fx:burst', {
            position: e.position.clone(),
            colorHex: e.genome.glowHex,
            count: 9,
            speed: 1.5,
          });
        }
        ctx.disposeEntity(e);
        ctx.eggs.splice(i, 1);
      }
    }
  }

  private updatePropagules(ctx: SimulationContext, dt: number): void {
    for (let i = ctx.propagules.length - 1; i >= 0; i--) {
      const pr = ctx.propagules[i];
      if (!pr.alive) {
        ctx.propagules.splice(i, 1);
        continue;
      }
      pr.age += dt;

      sampleWindField(
        pr.position.x,
        pr.position.y,
        pr.position.z,
        ctx.simTime,
        ctx.env.windStrength,
        this._wind
      );

      if (!pr.isSeed) {
        // Wind-borne spores float gracefully on the terrarium breeze and thermals
        pr.velocity.x += (Math.sin(ctx.simTime * 0.9 + pr.id) * 0.25 + this._wind.x * 0.75) * dt;
        pr.velocity.z += (Math.cos(ctx.simTime * 0.8 + pr.id) * 0.25 + this._wind.z * 0.75) * dt;
        pr.velocity.y += (-0.18 + this._wind.y * 0.32) * dt;
      } else {
        // Heavy seeds & explosive pods arc ballistically under terrarium gravity
        pr.velocity.x += this._wind.x * 0.16 * dt;
        pr.velocity.z += this._wind.z * 0.16 * dt;
        pr.velocity.y -= 3.8 * dt;
      }

      const prR = Math.hypot(pr.position.x, pr.position.z);
      const prBoundW = computeHorizontalBoundWeight(pr.position.x, pr.position.z);
      if (prBoundW > 0 && prR > 1e-4) {
        pr.velocity.x -= (pr.position.x / prR) * prBoundW * 0.85 * dt;
        pr.velocity.z -= (pr.position.z / prR) * prBoundW * 0.85 * dt;
      }

      pr.velocity.multiplyScalar(pr.isSeed ? 0.992 : 0.975);
      pr.position.addScaledVector(pr.velocity, dt);
      clampToTerrariumRadius(pr.position, 0.9);
      pr.position.y = Math.min(TERRARIUM.canopyY - 0.5, pr.position.y);
      ctx.enforceFiniteTransform(pr);

      const fl = getTerrainHeight(pr.position.x, pr.position.z) + 0.08;
      if (pr.position.y <= fl) {
        if (
          ctx.plants.length < CAPS.maxPlants &&
          Math.random() <= computePlantPlacementWeight(pr.position.x, pr.position.z)
        ) {
          ctx.spawnPlant(pr.genome, pr.position.x, pr.position.z, 0.18);
          ctx.events.emit('fx:burst', {
            position: pr.position.clone(),
            colorHex: pr.genome.glowHex,
            count: 6,
            speed: 1.1,
          });
        }
        ctx.disposeEntity(pr);
        ctx.propagules.splice(i, 1);
      } else if (pr.age >= pr.maxAge) {
        ctx.disposeEntity(pr);
        ctx.propagules.splice(i, 1);
      }
    }
  }

  private settleFlatOnTerrain(
    q: THREE.Quaternion,
    x: number,
    z: number,
    isLeaf: boolean,
    alpha: number
  ): void {
    getTerrainNormal(x, z, this._groundNormal);
    if (isLeaf) this._flatAxis.set(0, 0, 1);
    else this._flatAxis.set(0, 1, 0);
    this._flatAxis.applyQuaternion(q).normalize();
    if (this._flatAxis.dot(this._groundNormal) < 0) {
      this._flatAxis.negate();
    }
    this._alignQ.setFromUnitVectors(this._flatAxis, this._groundNormal);
    this._targetQ.copy(this._alignQ).multiply(q);
    q.slerp(this._targetQ, clamp(alpha, 0, 1)).normalize();
  }

  private updateFoodPellets(ctx: SimulationContext, dt: number): void {
    for (let i = ctx.foodPellets.length - 1; i >= 0; i--) {
      const p = ctx.foodPellets[i];
      if (!p.alive) {
        ctx.foodPellets.splice(i, 1);
        continue;
      }
      p.age += dt;
      const isFlora = p.origin === 'flora';
      const isFlesh = p.origin === 'flesh';
      const restClearance = isFlora ? 0.045 : isFlesh ? 0.075 : 0.085;
      const fl = getTerrainHeight(p.position.x, p.position.z) + restClearance;
      const nutRatio = clamp(safeRatio(p.nutrients, Math.max(1, p.maxNutrients)), 0.18, 1.0);
      const massScale = p.baseScale * (0.48 + 0.52 * Math.pow(nutRatio, 0.65));

      if (p.phase !== 'falling' && (p.position.y > fl + 0.07 || p.velocity.y > 0.25)) {
        p.phase = 'falling';
        p.state = 'Falling';
      }

      if (p.phase === 'falling') {
        p.state = 'Falling';
        p.opacity = 1.0;
        const grav = isFlora ? 4.2 : 9.2;
        p.velocity.y -= grav * dt;

        if (isFlora) {
          sampleWindField(
            p.position.x,
            p.position.y,
            p.position.z,
            ctx.simTime,
            ctx.env.windStrength,
            this._wind
          );
          p.velocity.x += (this._wind.x * 0.35 + Math.sin(ctx.simTime * 2.2 + p.id) * 0.16) * dt;
          p.velocity.z += (this._wind.z * 0.35 + Math.cos(ctx.simTime * 1.9 + p.id) * 0.16) * dt;
        }

        const drag = Math.pow(isFlora ? 0.52 : 0.78, dt);
        p.velocity.x *= drag;
        p.velocity.z *= drag;
        p.position.addScaledVector(p.velocity, dt);
        clampToTerrariumRadius(p.position, 0.7);
        p.position.y = Math.min(TERRARIUM.canopyY - 0.3, p.position.y);

        const spinMag = p.angularVelocity.length();
        if (spinMag > 1e-4) {
          this._spinAxis.copy(p.angularVelocity).divideScalar(spinMag);
          this._rollQ.setFromAxisAngle(this._spinAxis, spinMag * dt);
          p.quaternion.premultiply(this._rollQ).normalize();
          p.angularVelocity.multiplyScalar(Math.pow(0.65, dt));
        }
        p.scale = massScale;

        const floorNow = getTerrainHeight(p.position.x, p.position.z) + restClearance;
        if (p.position.y <= floorNow) {
          p.position.y = floorNow;
          if (Math.abs(p.velocity.y) > 1.4 && !isFlora) {
            p.velocity.y = -p.velocity.y * 0.28;
            p.velocity.x *= 0.5;
            p.velocity.z *= 0.5;
          } else {
            p.velocity.set(0, 0, 0);
            p.angularVelocity.set(0, 0, 0);
            p.phase = 'resting';
            p.state = 'On Moss';
          }
        }
      } else if (p.phase === 'resting') {
        p.restingAge += dt;
        p.state = 'On Moss';
        p.opacity = 1.0;
        p.position.y = fl;
        p.velocity.multiplyScalar(Math.pow(0.15, dt));
        this.settleFlatOnTerrain(p.quaternion, p.position.x, p.position.z, isFlora, Math.min(1, dt * 6.0));
        p.scale = massScale;
        if (p.restingAge >= p.restingDuration || p.age >= p.maxAge * 0.78) {
          p.phase = 'dissolving';
          p.dissolveAge = 0;
          p.state = 'Composting';
        }
      } else {
        p.dissolveAge += dt;
        p.state = 'Composting';
        const dProg = clamp(p.dissolveAge / Math.max(0.5, p.dissolveDuration), 0, 1);
        p.position.y = fl - dProg * 0.03;
        p.opacity = clamp(1.0 - dProg, 0, 1);
        p.scale = Math.max(0.03, massScale * (1.0 - dProg * 0.65));
        p.nutrients = Math.max(0, p.nutrients - dt * 1.15);
        p.detritusTimer -= dt;
        if (p.detritusTimer <= 0 && dProg < 0.85) {
          p.detritusTimer = randRange(0.9, 1.8);
          ctx.events.emit('fx:burst', {
            position: p.position.clone().add(new THREE.Vector3(0, 0.05, 0)),
            colorHex: isFlesh ? 0x9b72cf : 0x58e096,
            count: 2,
            speed: 0.35,
          });
        }
        if (dProg >= 1.0 || p.nutrients <= 0.1) {
          if (Math.random() < 0.38) {
            ctx.spawnNutrientPatch(p.position.x, p.position.z, 0.62);
          }
          ctx.disposeEntity(p);
          ctx.foodPellets.splice(i, 1);
          continue;
        }
      }

      if (p.nutrients <= 0.1 || p.age >= p.maxAge) {
        ctx.disposeEntity(p);
        ctx.foodPellets.splice(i, 1);
        continue;
      }
      ctx.enforceFiniteTransform(p);
    }
  }

  private updateCorpses(ctx: SimulationContext, dt: number): void {
    for (let i = ctx.corpses.length - 1; i >= 0; i--) {
      const c = ctx.corpses[i];
      if (!c.alive) {
        ctx.corpses.splice(i, 1);
        continue;
      }
      c.corpseAge += dt;
      c.joltAnim = Math.max(0, c.joltAnim - dt * 2.8);
      const fl = getTerrainHeight(c.position.x, c.position.z) + 0.16 * c.initialScale;

      if (c.phase === 'dying') {
        c.dyingAge += dt;
        c.stage = 'Dying';
        c.state = c.cause;
        c.velocity.y -= 8.8 * dt;
        c.velocity.multiplyScalar(Math.pow(0.45, dt));
        c.position.addScaledVector(c.velocity, dt);
        clampToTerrariumRadius(c.position, 0.85);
        if (c.position.y < fl) {
          c.position.y = fl;
          c.velocity.y = 0;
        }

        // Dramatic lifeless side-roll onto the mossy ground
        this._rollQ.setFromAxisAngle(this._axisZ, c.rollSign * dt * 1.45);
        c.quaternion.multiply(this._rollQ).normalize();

        if (c.dyingAge >= c.dyingDuration) {
          c.phase = c.position.y > fl + 0.08 ? 'settling' : 'decomposing';
        }
      } else if (c.phase === 'settling') {
        c.stage = 'Carcass';
        c.state = 'Settling to Soil';
        c.velocity.y -= 9.5 * dt;
        c.position.addScaledVector(c.velocity, dt);
        clampToTerrariumRadius(c.position, 0.85);
        this._rollQ.setFromAxisAngle(this._axisX, dt * 0.45);
        c.quaternion.multiply(this._rollQ).normalize();
        if (c.position.y <= fl) {
          c.position.y = fl;
          c.velocity.set(0, 0, 0);
          c.phase = 'decomposing';
        }
      } else if (c.phase === 'decomposing') {
        c.decomposeAge += dt;
        c.stage = 'Carcass';
        c.state = 'Decomposing (Mycelial Decay)';
        c.position.y = fl;
        const nutRatio = clamp(safeRatio(c.nutrients, Math.max(1, c.maxNutrients)), 0.18, 1.0);
        c.scale = c.initialScale * (0.58 + 0.42 * nutRatio);
        c.detritusTimer -= dt;
        if (c.detritusTimer <= 0) {
          c.detritusTimer = randRange(1.2, 2.2);
          ctx.events.emit('fx:burst', {
            position: c.position.clone().add(new THREE.Vector3(0, 0.12, 0)),
            colorHex: 0x72f5a8,
            count: 2,
            speed: 0.45,
          });
        }
        if (c.decomposeAge >= c.decomposeDuration || c.nutrients <= 2.5) {
          c.phase = 'dissolving';
          c.dissolveAge = 0;
        }
      } else {
        c.dissolveAge += dt;
        c.stage = 'Detritus';
        c.state = 'Returning to Soil';
        const dProg = clamp(c.dissolveAge / Math.max(1.0, c.dissolveDuration), 0, 1);
        c.opacity = clamp(1.0 - dProg, 0, 1);
        c.scale = Math.max(0.04, c.initialScale * 0.65 * (1.0 - dProg * 0.72));
        c.position.y = fl - dProg * 0.12;
        if (dProg >= 1.0) {
          ctx.spawnNutrientPatch(c.position.x, c.position.z, 1.25);
          ctx.disposeEntity(c);
          ctx.corpses.splice(i, 1);
          continue;
        }
      }

      ctx.enforceFiniteTransform(c);
    }
  }

  private updateNutrientPatches(ctx: SimulationContext, dt: number): void {
    for (let i = ctx.nutrientPatches.length - 1; i >= 0; i--) {
      const np = ctx.nutrientPatches[i];
      if (!np.alive) {
        ctx.nutrientPatches.splice(i, 1);
        continue;
      }
      np.age += dt;
      np.nutrients = Math.max(0, np.nutrients - dt * 0.25);
      if (np.age >= np.maxAge || np.nutrients <= 0.1) {
        np.alive = false;
        ctx.nutrientPatches.splice(i, 1);
      }
    }
  }
}
