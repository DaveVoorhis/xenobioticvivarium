import * as THREE from 'three';
import { TERRARIUM } from './config';

export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

export function safeRatio(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) < 1e-6) return 0;
  return clamp(num / den, 0, 1);
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, maxInclusive: number): number {
  return Math.floor(min + Math.random() * (maxInclusive - min + 1));
}

export function randChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function clampToTerrariumRadius(pos: THREE.Vector3, margin = 0.6): void {
  if (!Number.isFinite(pos.x)) pos.x = 0;
  if (!Number.isFinite(pos.z)) pos.z = 0;
  const maxR = Math.max(0.5, TERRARIUM.maxRadius - margin);
  const rSq = pos.x * pos.x + pos.z * pos.z;
  if (rSq > maxR * maxR) {
    const inv = maxR / Math.sqrt(rSq);
    pos.x *= inv;
    pos.z *= inv;
  }
}

export function clampXZToTerrariumRadius(x: number, z: number, margin = 0.6): [number, number] {
  const sx = Number.isFinite(x) ? x : 0;
  const sz = Number.isFinite(z) ? z : 0;
  const maxR = Math.max(0.5, TERRARIUM.maxRadius - margin);
  const rSq = sx * sx + sz * sz;
  if (rSq > maxR * maxR) {
    const inv = maxR / Math.sqrt(rSq);
    return [sx * inv, sz * inv];
  }
  return [sx, sz];
}

export function randomPointInTerrariumDisk(margin = 1.0): { x: number; z: number } {
  const maxR = Math.max(0.5, TERRARIUM.radius - margin);
  const r = Math.sqrt(Math.random()) * maxR;
  const theta = Math.random() * Math.PI * 2;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
}

/**
 * Smooth ecological weighting (0 inside `coreRadius`, ramping smoothly past `radius`
 * toward the conservatory dome wall) so creatures & spores naturally curve back inside
 * without jarring wall collisions.
 */
export function computeHorizontalBoundWeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r <= TERRARIUM.coreRadius) return 0;
  const span = Math.max(1.0, TERRARIUM.radius - TERRARIUM.coreRadius);
  const t = (r - TERRARIUM.coreRadius) / span;
  return t <= 1.0 ? t * t : 1.0 + (t - 1.0) * (1.85 + (t - 1.0) * 1.45);
}

/**
 * Habitat suitability weight for flora & fungi (1.0 inside the lush terrarium floor,
 * tapering smoothly past the focal edge, and avoiding deep mineral pool center).
 */
export function computePlantPlacementWeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let w = 1.0;
  if (r > TERRARIUM.coreRadius * 0.86) {
    const excess = r - TERRARIUM.coreRadius * 0.86;
    const sigma = Math.max(2.4, (TERRARIUM.radius - TERRARIUM.coreRadius * 0.86) * 0.72);
    w = Math.exp(-(excess * excess) / (2.0 * sigma * sigma));
  }
  // Avoid germinating submerged directly in the deepest center of the mineral pool
  const pdx = x - TERRARIUM.poolPos.x;
  const pdz = z - TERRARIUM.poolPos.z;
  const poolDistSq = pdx * pdx + pdz * pdz;
  if (poolDistSq < 3.6) {
    w *= clamp((poolDistSq - 1.2) / 2.4, 0.08, 1.0);
  }
  return w;
}

export function randomWeightedPointInTerrarium(
  coreR = TERRARIUM.coreRadius,
  outerR = TERRARIUM.radius
): { x: number; z: number } {
  const u = Math.sqrt(Math.random());
  const v = Math.random();
  const r = Math.min(outerR, u * coreR * (0.68 + 0.52 * v));
  const theta = Math.random() * Math.PI * 2;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r };
}

export function isFiniteVec3(v: THREE.Vector3 | null | undefined): boolean {
  return !!(v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
}

export function safeNormalize(v: THREE.Vector3): boolean {
  if (!isFiniteVec3(v)) {
    v.set(0, 0, 1);
    return false;
  }
  const lenSq = v.lengthSq();
  if (lenSq < 1e-8) return false;
  v.divideScalar(Math.sqrt(lenSq));
  return true;
}

const _oMat = new THREE.Matrix4();
const _oRight = new THREE.Vector3();
const _oUp = new THREE.Vector3();
const _oFwd = new THREE.Vector3();
const _oQuat = new THREE.Quaternion();
const _wUp = new THREE.Vector3(0, 1, 0);
const _altUp = new THREE.Vector3(0, 0, 1);

/**
 * Singularity-safe smooth orientation aligning local +Z with `dir`,
 * with optional custom `upVec` (e.g. terrain surface normal for crawlers/slitherers)
 * and optional roll `bankAngle` for aerial banking turns.
 */
export function safeOrientToward(
  quat: THREE.Quaternion,
  dir: THREE.Vector3,
  alpha: number,
  bankAngle = 0,
  upVec?: THREE.Vector3
): void {
  if (!quat || !isFiniteVec3(dir)) return;
  _oFwd.copy(dir);
  if (!safeNormalize(_oFwd)) return;

  const preferredUp = upVec && isFiniteVec3(upVec) && upVec.lengthSq() > 0.01 ? upVec : _wUp;
  const upRef = Math.abs(_oFwd.dot(preferredUp)) > 0.96 ? _altUp : preferredUp;
  _oRight.crossVectors(upRef, _oFwd);
  if (!safeNormalize(_oRight)) return;
  _oUp.crossVectors(_oFwd, _oRight);
  safeNormalize(_oUp);

  if (Math.abs(bankAngle) > 1e-4) {
    const c = Math.cos(bankAngle);
    const s = Math.sin(bankAngle);
    const rx = _oRight.x * c + _oUp.x * s;
    const ry = _oRight.y * c + _oUp.y * s;
    const rz = _oRight.z * c + _oUp.z * s;
    const ux = _oUp.x * c - _oRight.x * s;
    const uy = _oUp.y * c - _oRight.y * s;
    const uz = _oUp.z * c - _oRight.z * s;
    _oRight.set(rx, ry, rz);
    _oUp.set(ux, uy, uz);
  }

  _oMat.makeBasis(_oRight, _oUp, _oFwd);
  _oQuat.setFromRotationMatrix(_oMat);
  if (Number.isFinite(_oQuat.x) && Number.isFinite(_oQuat.w)) {
    quat.slerp(_oQuat, clamp(alpha, 0, 1));
  }
}

/**
 * Deterministic sculpted xenobiotic terrarium floor heightfield:
 * - Raised mossy genesis cairn mound at `TERRARIUM.cairnPos`
 * - Shallow iridescent mineral pool basin at `TERRARIUM.poolPos`
 * - Rolling moss hummocks, terraced hillocks, and outer conservatory rim rise
 */
export function getTerrainHeight(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0.72;

  const cdx = x - TERRARIUM.cairnPos.x;
  const cdz = z - TERRARIUM.cairnPos.z;
  const cairnMound = 1.25 * Math.exp(-(cdx * cdx + cdz * cdz) / 11.5);

  const pdx = x - TERRARIUM.poolPos.x;
  const pdz = z - TERRARIUM.poolPos.z;
  const poolBasin = -0.68 * Math.exp(-(pdx * pdx + pdz * pdz) / 8.5);

  const hummocks =
    0.42 * Math.sin(x * 0.24 + 0.6) * Math.cos(z * 0.29 - 0.35) +
    0.22 * Math.sin(x * 0.51 - z * 0.44 + 0.9) +
    0.11 * Math.cos((x + z) * 0.76) +
    0.05 * Math.sin(x * 1.42 + z * 0.88);

  // Subtle terrarium bowl embankment rising gently outside the lush core
  const r = Math.hypot(x, z);
  const rimT = clamp((r - TERRARIUM.coreRadius * 0.95) / 10.5, 0, 1.8);
  const rimRise = rimT * rimT * 1.35;

  const distantHills =
    0.65 * Math.sin(x * 0.08 + 0.7) * Math.cos(z * 0.088 - 0.4) +
    0.32 * Math.cos((x - z) * 0.052);

  return 0.78 + hummocks + distantHills * 0.45 + cairnMound + poolBasin + rimRise;
}

/**
 * Finite-difference surface normal of the terrarium floor at (x, z).
 */
export function getTerrainNormal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const eps = 0.22;
  const hL = getTerrainHeight(x - eps, z);
  const hR = getTerrainHeight(x + eps, z);
  const hD = getTerrainHeight(x, z - eps);
  const hU = getTerrainHeight(x, z + eps);
  return out.set(hL - hR, eps * 2.0, hD - hU).normalize();
}

/**
 * Smooth 3D atmospheric conservatory breeze + warm spore-cairn thermal updraft.
 * Drives flying creature drift, spore/pollen dispersal, and canopy foliage sway.
 */
export function sampleWindField(
  x: number,
  y: number,
  z: number,
  time: number,
  strength: number,
  out: THREE.Vector3
): THREE.Vector3 {
  if (strength <= 1e-4) {
    return out.set(0, 0, 0);
  }
  const t = time * 0.32;
  const rSqHoriz = x * x + z * z;
  const swirlDamp = 1.0 / (1.0 + rSqHoriz / 340.0);
  const heightBoost = clamp(0.35 + y / TERRARIUM.canopyY, 0.35, 1.35);
  const windX = (-z * 0.048 * swirlDamp + Math.sin(y * 0.32 + t) * 0.36) * heightBoost;
  const windZ = (x * 0.048 * swirlDamp + Math.cos(x * 0.24 - t * 0.88) * 0.32) * heightBoost;
  const windY = Math.sin(x * 0.26 + z * 0.22 + t * 0.75) * 0.09;

  // Warm spore thermal rising above the Mycelial Genesis Cairn
  const dx = x - TERRARIUM.cairnPos.x;
  const dz = z - TERRARIUM.cairnPos.z;
  const rSq = dx * dx + dz * dz;
  const thermalUp =
    Math.exp(-rSq / 5.0) * clamp((TERRARIUM.canopyY - y) / TERRARIUM.canopyY, 0.08, 1.0) * 1.18;

  return out.set(windX * strength, (windY + thermalUp) * strength, windZ * strength);
}

/**
 * Solar daylight factor (0 = midnight bioluminescence, 1 = high noon)
 * from normalized timeOfDay (0..1, 0.5 = noon).
 */
export function computeDaylightFactor(timeOfDay: number): number {
  const angle = (timeOfDay - 0.25) * Math.PI * 2;
  const raw = Math.sin(angle);
  return clamp((raw + 0.25) / 1.25, 0, 1);
}

export function disableFrustumCulling(root: THREE.Object3D): void {
  root.frustumCulled = false;
  root.traverse((c) => {
    c.frustumCulled = false;
  });
}
