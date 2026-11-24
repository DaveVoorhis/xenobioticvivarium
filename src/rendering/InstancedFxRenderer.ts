import * as THREE from 'three';
import { CAPS } from '../core/config';
import type { FragmentKind } from '../core/EventBus';
import { clamp, randRange } from '../core/math';
import { getGeometryLibrary } from './GeometryLibrary';
import type { SharedShaderUniforms } from './Shaders';

interface BurstParticle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  size: number;
  color: THREE.Color;
}

interface FragmentParticle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  suctionTarget: THREE.Vector3 | null;
  age: number;
  maxAge: number;
  size: number;
  color: THREE.Color;
}

interface ShockwaveRing {
  alive: boolean;
  pos: THREE.Vector3;
  age: number;
  maxAge: number;
  maxScale: number;
  color: THREE.Color;
}

export class InstancedFxRenderer {
  private readonly bursts: BurstParticle[] = [];
  private readonly fragments: FragmentParticle[] = [];
  private readonly shockwaves: ShockwaveRing[] = [];

  private readonly burstMesh: THREE.InstancedMesh;
  private readonly fragMesh: THREE.InstancedMesh;
  private readonly shockMesh: THREE.InstancedMesh;

  private readonly _dummy = new THREE.Object3D();
  private readonly _dir = new THREE.Vector3();

  constructor(scene: THREE.Scene, _sharedUniforms: SharedShaderUniforms) {
    const geo = getGeometryLibrary();

    const burstMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.burstMesh = new THREE.InstancedMesh(geo.sporeOrb, burstMat, CAPS.maxBurstParticles);
    this.burstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.burstMesh.frustumCulled = false;
    this.burstMesh.count = 0;
    scene.add(this.burstMesh);

    const fragMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.05,
    });
    this.fragMesh = new THREE.InstancedMesh(geo.fleshMorsel, fragMat, CAPS.maxTornFragments);
    this.fragMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragMesh.frustumCulled = false;
    this.fragMesh.count = 0;
    scene.add(this.fragMesh);

    const shockMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shockMesh = new THREE.InstancedMesh(geo.shockwaveRing, shockMat, CAPS.maxShockwaves);
    this.shockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shockMesh.frustumCulled = false;
    this.shockMesh.count = 0;
    scene.add(this.shockMesh);
  }

  clear(): void {
    this.bursts.length = 0;
    this.fragments.length = 0;
    this.shockwaves.length = 0;
    this.burstMesh.count = 0;
    this.fragMesh.count = 0;
    this.shockMesh.count = 0;
  }

  spawnBurst(position: THREE.Vector3, colorHex: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      if (this.bursts.length >= CAPS.maxBurstParticles) this.bursts.shift();
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(randRange(-1, 1));
      const spd = speed * randRange(0.45, 1.2);
      this.bursts.push({
        alive: true,
        pos: position.clone(),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * spd,
          Math.abs(Math.cos(phi)) * spd * 0.9 + 0.3,
          Math.sin(phi) * Math.sin(theta) * spd
        ),
        age: 0,
        maxAge: randRange(0.6, 1.35),
        size: randRange(0.42, 0.95),
        color: new THREE.Color(colorHex),
      });
    }
  }

  spawnFragments(
    position: THREE.Vector3,
    colorHex: number,
    _kind: FragmentKind,
    count: number,
    speed: number,
    accentHex?: number,
    suctionTarget?: THREE.Vector3,
    ejectDir?: THREE.Vector3
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.fragments.length >= CAPS.maxTornFragments) this.fragments.shift();
      const vel = new THREE.Vector3(randRange(-1, 1), randRange(0.3, 1.3), randRange(-1, 1))
        .normalize()
        .multiplyScalar(speed * randRange(0.5, 1.15));
      if (ejectDir) vel.addScaledVector(ejectDir, speed * 0.45);
      this.fragments.push({
        alive: true,
        pos: position.clone(),
        vel,
        rot: new THREE.Euler(randRange(0, 6), randRange(0, 6), randRange(0, 6)),
        rotVel: new THREE.Vector3(randRange(-6, 6), randRange(-6, 6), randRange(-6, 6)),
        suctionTarget: suctionTarget && i < 2 ? suctionTarget.clone() : null,
        age: 0,
        maxAge: randRange(0.45, 0.95),
        size: randRange(0.45, 0.95),
        color: new THREE.Color(i % 2 === 0 || accentHex === undefined ? colorHex : accentHex),
      });
    }
  }

  spawnShockwave(position: THREE.Vector3, colorHex: number, maxScale = 3.2): void {
    if (this.shockwaves.length >= CAPS.maxShockwaves) this.shockwaves.shift();
    this.shockwaves.push({
      alive: true,
      pos: position.clone(),
      age: 0,
      maxAge: 0.9,
      maxScale,
      color: new THREE.Color(colorHex),
    });
  }

  update(dt: number): void {
    // 1. Bursts
    let bCount = 0;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const p = this.bursts[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.bursts.splice(i, 1);
        continue;
      }
      const prog = p.age / p.maxAge;
      p.vel.multiplyScalar(Math.pow(0.28, dt));
      p.vel.y += 0.35 * dt;
      p.pos.addScaledVector(p.vel, dt);

      this._dummy.position.copy(p.pos);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.setScalar(p.size * (1.0 - prog * 0.88));
      this._dummy.updateMatrix();
      this.burstMesh.setMatrixAt(bCount, this._dummy.matrix);
      this.burstMesh.setColorAt(bCount, p.color);
      bCount++;
    }
    this.burstMesh.count = bCount;
    this.burstMesh.instanceMatrix.needsUpdate = true;
    if (this.burstMesh.instanceColor) this.burstMesh.instanceColor.needsUpdate = true;

    // 2. Fragments
    let fCount = 0;
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.age += dt;
      if (f.age >= f.maxAge) {
        this.fragments.splice(i, 1);
        continue;
      }
      const prog = f.age / f.maxAge;
      if (f.suctionTarget) {
        this._dir.subVectors(f.suctionTarget, f.pos);
        f.pos.addScaledVector(this._dir, clamp(dt * 8.0, 0, 1));
      } else {
        f.vel.y -= 6.5 * dt;
        f.pos.addScaledVector(f.vel, dt);
      }
      f.rot.x += f.rotVel.x * dt;
      f.rot.y += f.rotVel.y * dt;
      f.rot.z += f.rotVel.z * dt;

      this._dummy.position.copy(f.pos);
      this._dummy.rotation.copy(f.rot);
      this._dummy.scale.setScalar(f.size * (1.0 - prog * 0.78));
      this._dummy.updateMatrix();
      this.fragMesh.setMatrixAt(fCount, this._dummy.matrix);
      this.fragMesh.setColorAt(fCount, f.color);
      fCount++;
    }
    this.fragMesh.count = fCount;
    this.fragMesh.instanceMatrix.needsUpdate = true;
    if (this.fragMesh.instanceColor) this.fragMesh.instanceColor.needsUpdate = true;

    // 3. Shockwaves
    let sCount = 0;
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.age += dt;
      if (s.age >= s.maxAge) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const prog = s.age / s.maxAge;
      const sc = 0.25 + (1.0 - Math.pow(1.0 - prog, 2.2)) * s.maxScale;
      this._dummy.position.copy(s.pos);
      this._dummy.rotation.set(0, prog * 1.2, 0);
      this._dummy.scale.setScalar(sc);
      this._dummy.updateMatrix();
      this.shockMesh.setMatrixAt(sCount, this._dummy.matrix);
      this.shockMesh.setColorAt(sCount, s.color);
      sCount++;
    }
    this.shockMesh.count = sCount;
    this.shockMesh.instanceMatrix.needsUpdate = true;
    if (this.shockMesh.instanceColor) this.shockMesh.instanceColor.needsUpdate = true;
  }
}
