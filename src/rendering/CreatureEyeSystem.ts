import * as THREE from 'three';
import { TERRARIUM } from '../core/config';
import {
  clamp,
  clampToTerrariumRadius,
  getTerrainHeight,
  isFiniteVec3,
  safeNormalize,
} from '../core/math';
import type { AnimalGenome } from '../genetics/types';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { AnimalEntity, CorpseEntity, Entity, PlantEntity } from '../simulation/types';

export type EyeViewMode = 'off' | 'pip' | 'fullscreen';
export type EyeOpticsMode = 'biological' | 'natural';

export interface VisionProfile {
  label: string;
  fov: number;
  tint: string;
  vig: string;
  contrast: number;
  sat: number;
  bri: number;
  hex: boolean;
  brackets: boolean;
}

export interface PerceptionMarker {
  worldPos: THREE.Vector3;
  yOff: number;
  dist: number;
  category: 'threat' | 'prey' | 'mate' | 'kin' | 'flora';
  label: string;
  isPrimary: boolean;
}

export class CreatureEyeSystem {
  readonly camera: THREE.PerspectiveCamera;
  mode: EyeViewMode = 'off';
  opticsMode: EyeOpticsMode = 'biological';
  sensoryEnabled = true;

  private readonly camPos = new THREE.Vector3();
  private readonly camQuat = new THREE.Quaternion();
  private initialized = false;

  readonly perceptionCache: PerceptionMarker[] = [];

  private readonly _eyeLocal = new THREE.Vector3();
  private readonly _eyeWorld = new THREE.Vector3();
  private readonly _eyeFwd = new THREE.Vector3();
  private readonly _eyeUp = new THREE.Vector3();
  private readonly _eyeDir = new THREE.Vector3();
  private readonly _eyeQuat = new THREE.Quaternion();
  private readonly _camMat = new THREE.Matrix4();
  private readonly _proj = new THREE.Vector3();
  private readonly _qAni: AnimalEntity[] = [];
  private readonly _qPl: PlantEntity[] = [];

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(90, aspect, 0.04, 85);
  }

  resetSmoothing(): void {
    this.initialized = false;
  }

  canUseEyeView(entity: Entity | null): entity is AnimalEntity | CorpseEntity {
    return !!(
      entity &&
      entity.alive &&
      (entity.kind === 'animal' || entity.kind === 'corpse') &&
      isFiniteVec3(entity.position)
    );
  }

  getVisionProfile(genome: AnimalGenome | null | undefined): VisionProfile {
    if (!genome) {
      return {
        label: 'Terrarium Optics',
        fov: 90,
        tint: 'rgba(60,220,170,0.04)',
        vig: 'rgba(6,18,14,0.52)',
        contrast: 1.05,
        sat: 1.08,
        bri: 1.02,
        hex: false,
        brackets: false,
      };
    }
    if (genome.sensoryOrgan === 'compound_optics' || genome.bodyPlan === 'armored_crawler') {
      return {
        label: 'Compound Ommatidia',
        fov: 108,
        tint: 'rgba(218,188,82,0.06)',
        vig: 'rgba(8,18,12,0.66)',
        contrast: 1.12,
        sat: 1.22,
        bri: 1.06,
        hex: true,
        brackets: true,
      };
    }
    if (genome.sensoryOrgan === 'thermal_pits' || genome.bodyPlan === 'serpentine_slitherer') {
      return {
        label: 'Infrared Thermal Pits',
        fov: 86,
        tint: 'rgba(245,86,62,0.08)',
        vig: 'rgba(26,6,18,0.68)',
        contrast: 1.24,
        sat: 1.35,
        bri: 1.04,
        hex: false,
        brackets: true,
      };
    }
    if (genome.bodyPlan === 'aerial_glider') {
      return {
        label: 'Aerial Horizon Vision',
        fov: 112,
        tint: 'rgba(80,235,205,0.05)',
        vig: 'rgba(4,20,24,0.48)',
        contrast: 1.08,
        sat: 1.16,
        bri: 1.08,
        hex: false,
        brackets: true,
      };
    }
    if (genome.bodyPlan === 'spring_bouncer') {
      return {
        label: 'Wide-Angle Hopper',
        fov: 106,
        tint: 'rgba(165,245,110,0.05)',
        vig: 'rgba(10,22,12,0.56)',
        contrast: 1.06,
        sat: 1.18,
        bri: 1.05,
        hex: false,
        brackets: true,
      };
    }
    return {
      label: 'Binocular Optics',
      fov: 84,
      tint: 'rgba(95,215,175,0.04)',
      vig: 'rgba(6,16,14,0.52)',
      contrast: 1.1,
      sat: 1.12,
      bri: 1.04,
      hex: false,
      brackets: true,
    };
  }

  updateCamera(entity: AnimalEntity | CorpseEntity, sim: SimulationEngine, dt: number): void {
    const g = entity.genome;
    const prof = this.getVisionProfile(g);
    this.camera.fov = this.opticsMode === 'biological' ? prof.fov : 82;
    this.camera.updateProjectionMatrix();

    this._eyeLocal.set(0, 0.22 * entity.scale, 0.56 * entity.scale * (g.bodyElongation ?? 1.0));
    this._eyeWorld.copy(this._eyeLocal).applyQuaternion(entity.quaternion).add(entity.position);
    clampToTerrariumRadius(this._eyeWorld, 0.4);
    this._eyeWorld.y = clamp(
      this._eyeWorld.y,
      getTerrainHeight(this._eyeWorld.x, this._eyeWorld.z) + 0.08,
      TERRARIUM.canopyY - 0.2
    );

    this._eyeFwd.set(0, 0, 1).applyQuaternion(entity.quaternion);
    this._eyeUp.set(0, 1, 0).applyQuaternion(entity.quaternion);
    if (!safeNormalize(this._eyeFwd)) this._eyeFwd.set(0, 0, 1);
    if (!safeNormalize(this._eyeUp)) this._eyeUp.set(0, 1, 0);

    // Subtle gaze tracking toward active target
    if (entity.kind === 'animal' && entity.activeTarget && entity.activeTarget.entity.alive) {
      this._eyeDir.subVectors(entity.activeTarget.entity.position, this._eyeWorld);
      if (safeNormalize(this._eyeDir) && this._eyeDir.dot(this._eyeFwd) > 0.25) {
        this._eyeFwd.lerp(this._eyeDir, 0.28).normalize();
      }
    }

    const lookTarget = this._eyeDir.copy(this._eyeWorld).add(this._eyeFwd);
    this._camMat.lookAt(this._eyeWorld, lookTarget, this._eyeUp);
    this._eyeQuat.setFromRotationMatrix(this._camMat);

    if (!this.initialized) {
      this.camPos.copy(this._eyeWorld);
      this.camQuat.copy(this._eyeQuat);
      this.initialized = true;
    } else {
      const a = clamp(dt * 12.0, 0, 1);
      this.camPos.lerp(this._eyeWorld, a);
      this.camQuat.slerp(this._eyeQuat, a);
    }

    this.camera.position.copy(this.camPos);
    this.camera.quaternion.copy(this.camQuat);
    this.camera.updateMatrixWorld();

    this.refreshPerception(entity, sim);
  }

  private refreshPerception(entity: AnimalEntity | CorpseEntity, sim: SimulationEngine): void {
    this.perceptionCache.length = 0;
    if (!this.sensoryEnabled || entity.kind !== 'animal') return;

    const g = entity.genome;
    const nearA = sim.animalGrid.query(
      entity.position.x,
      entity.position.y,
      entity.position.z,
      g.visionRange,
      this._qAni
    );
    for (let i = 0; i < nearA.length && this.perceptionCache.length < 10; i++) {
      const o = nearA[i];
      if (!o.alive || o === entity) continue;
      const dist = entity.position.distanceTo(o.position);
      const isPrimary = entity.activeTarget?.entity === o;
      let category: PerceptionMarker['category'] = 'kin';
      if (o.genome.speciesId === g.speciesId) {
        category = entity.activeTarget?.role === 'mate' && isPrimary ? 'mate' : 'kin';
      } else if (o.genome.diet === 'Carnivore' && o.scale >= entity.scale * 0.75) {
        category = 'threat';
      } else if (g.diet === 'Carnivore' || g.diet === 'Omnivore') {
        category = 'prey';
      }
      this.perceptionCache.push({
        worldPos: o.position.clone(),
        yOff: o.scale * 0.45,
        dist,
        category,
        label: o.genome.speciesName.split(' ')[0],
        isPrimary,
      });
    }

    const nearP = sim.plantGrid.query(
      entity.position.x,
      entity.position.y,
      entity.position.z,
      g.visionRange * 0.75,
      this._qPl
    );
    for (let i = 0; i < nearP.length && this.perceptionCache.length < 14; i++) {
      const p = nearP[i];
      if (!p.alive || p.wilting) continue;
      this.perceptionCache.push({
        worldPos: p.position.clone(),
        yOff: p.scale * 0.65,
        dist: entity.position.distanceTo(p.position),
        category: 'flora',
        label: p.genome.kingdom === 'fungus' ? 'Fungus' : 'Flora',
        isPrimary: entity.activeTarget?.entity === p,
      });
    }
  }

  drawSensoryOverlay(
    canvas: HTMLCanvasElement,
    entity: AnimalEntity | CorpseEntity
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 4 || h < 4) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    const prof = this.getVisionProfile(entity.genome);
    if (this.opticsMode === 'biological') {
      // Subtle tint & vignette
      ctx.fillStyle = prof.tint;
      ctx.fillRect(0, 0, w, h);

      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.68);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, prof.vig);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle compound-eye hex mosaic for ommatidia lineages
      if (prof.hex) {
        ctx.strokeStyle = 'rgba(255,235,160,0.08)';
        ctx.lineWidth = 1;
        const step = 28;
        for (let y = 0; y < h + step; y += step * 0.86) {
          for (let x = 0; x < w + step; x += step) {
            const ox = (Math.floor(y / (step * 0.86)) % 2) * (step * 0.5);
            ctx.beginPath();
            ctx.arc(x + ox, y, step * 0.42, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    }

    if (!this.sensoryEnabled) return;

    const colors: Record<PerceptionMarker['category'], string> = {
      threat: '#ff526c',
      prey: '#ffb347',
      mate: '#f472b6',
      kin: '#38f9d7',
      flora: '#6ee7b7',
    };

    ctx.font = '10px "JetBrains Mono", monospace';
    for (let i = 0; i < this.perceptionCache.length; i++) {
      const m = this.perceptionCache[i];
      this._proj.set(m.worldPos.x, m.worldPos.y + m.yOff, m.worldPos.z).project(this.camera);
      if (this._proj.z > 1 || this._proj.z < -1) continue;
      const sx = (this._proj.x * 0.5 + 0.5) * w;
      const sy = (-this._proj.y * 0.5 + 0.5) * h;
      if (sx < 8 || sx > w - 8 || sy < 8 || sy > h - 8) continue;

      const col = colors[m.category];
      const box = m.isPrimary ? 16 : 10;
      ctx.strokeStyle = col;
      ctx.lineWidth = m.isPrimary ? 1.8 : 1.1;
      ctx.strokeRect(sx - box, sy - box, box * 2, box * 2);
      ctx.fillStyle = col;
      ctx.fillText(`${m.category.toUpperCase()} ${m.dist.toFixed(1)}m`, sx - box, sy - box - 4);
    }
  }
}
