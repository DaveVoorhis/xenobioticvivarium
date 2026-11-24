import * as THREE from 'three';
import type { SkinPattern } from '../genetics/types';

export function hasCanvasSupport(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (!hasCanvasSupport()) return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  return [c, ctx];
}

function makeTexture(canvas: HTMLCanvasElement, repeat = 1, srgb = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildNormalFromHeight(size: number, heightFn: (u: number, v: number) => number, strength = 2.6): THREE.Texture {
  const pair = createCanvas(size);
  if (!pair) return new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  const [canvas, ctx] = pair;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const eps = 1 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const hL = heightFn((u - eps + 1) % 1, v);
      const hR = heightFn((u + eps) % 1, v);
      const hD = heightFn(u, (v - eps + 1) % 1);
      const hU = heightFn(u, (v + eps) % 1);
      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      let nz = 1.0;
      const inv = 1.0 / Math.hypot(nx, ny, nz);
      nx *= inv;
      ny *= inv;
      nz *= inv;
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return makeTexture(canvas, 1, false);
}

function buildSkinPatternTexture(pattern: SkinPattern): THREE.Texture {
  const size = 256;
  const pair = createCanvas(size);
  if (!pair) return new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const [canvas, ctx] = pair;

  ctx.fillStyle = '#08080c';
  ctx.fillRect(0, 0, size, size);

  if (pattern === 'striped') {
    for (let i = 0; i < 8; i++) {
      const y = (i + 0.5) * (size / 8);
      const grad = ctx.createLinearGradient(0, y - 12, 0, y + 12);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.92)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y - 12, size, 24);
    }
  } else if (pattern === 'spotted' || pattern === 'photophore') {
    const count = pattern === 'photophore' ? 38 : 26;
    for (let i = 0; i < count; i++) {
      const cx = ((i * 73.1) % 1) * size;
      const cy = ((i * 41.7) % 1) * size;
      const r = pattern === 'photophore' ? 4 + (i % 5) * 1.4 : 8 + (i % 4) * 3.5;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, 'rgba(235,255,255,0.65)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === 'ocellated') {
    for (let i = 0; i < 12; i++) {
      const cx = ((i * 67.3 + 13) % size);
      const cy = ((i * 89.1 + 29) % size);
      const r = 16 + (i % 3) * 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === 'chevron') {
    ctx.strokeStyle = 'rgba(255,255,255,0.86)';
    ctx.lineWidth = 7;
    for (let y = -size; y < size * 2; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size * 0.5, y + 36);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  } else if (pattern === 'mycelial_veins') {
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    for (let i = 0; i < 18; i++) {
      ctx.lineWidth = 1.6 + (i % 3) * 0.9;
      ctx.beginPath();
      let x = ((i * 53) % size);
      let y = ((i * 97) % size);
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += Math.cos(i * 1.3 + s * 0.9) * 28;
        y += Math.sin(i * 1.7 - s * 0.8) * 28;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (pattern === 'marbled') {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;
        const w = Math.sin(u * 3 + Math.sin(v * 2) * 1.8) * Math.cos(v * 3 - Math.cos(u * 2) * 1.4);
        const val = Math.max(0, Math.min(255, Math.round((w * 0.5 + 0.5) ** 2.2 * 255)));
        const idx = (y * size + x) * 4;
        img.data[idx] = val;
        img.data[idx + 1] = val;
        img.data[idx + 2] = val;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  } else {
    // iridescent shimmer bands
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#303030');
    grad.addColorStop(0.28, '#e8e8e8');
    grad.addColorStop(0.55, '#555555');
    grad.addColorStop(0.82, '#ffffff');
    grad.addColorStop(1, '#303030');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  return makeTexture(canvas, 1, false);
}

function buildOrganicAlbedoTexture(baseHex: string, speckleA: string, speckleB: string, repeat = 1): THREE.Texture {
  const size = 256;
  const pair = createCanvas(size);
  if (!pair) return new THREE.DataTexture(new Uint8Array([220, 220, 220, 255]), 1, 1);
  const [canvas, ctx] = pair;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const x = ((i * 71.37) % 1) * size;
    const y = ((i * 113.91) % 1) * size;
    const r = 1.5 + (i % 7) * 1.6;
    ctx.fillStyle = i % 2 === 0 ? speckleA : speckleB;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return makeTexture(canvas, repeat, true);
}

function buildEyeIrisTexture(): THREE.Texture {
  const size = 128;
  const pair = createCanvas(size);
  if (!pair) return new THREE.DataTexture(new Uint8Array([255, 220, 120, 255]), 1, 1);
  const [canvas, ctx] = pair;
  const c = size * 0.5;
  const grad = ctx.createRadialGradient(c, c, 4, c, c, c);
  grad.addColorStop(0.0, '#040608');
  grad.addColorStop(0.26, '#05080b');
  grad.addColorStop(0.32, '#ffd966');
  grad.addColorStop(0.68, '#d97706');
  grad.addColorStop(0.92, '#1f2937');
  grad.addColorStop(1.0, '#090d14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255,250,210,0.28)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 18, c + Math.sin(a) * 18);
    ctx.lineTo(c + Math.cos(a) * 56, c + Math.sin(a) * 56);
    ctx.stroke();
  }
  return makeTexture(canvas, 1, true);
}

export interface ProceduralTextures {
  skinAlbedo: THREE.Texture;
  floraAlbedo: THREE.Texture;
  mossTerrainAlbedo: THREE.Texture;
  mossTerrainNormal: THREE.Texture;
  barkNormal: THREE.Texture;
  scaleNormal: THREE.Texture;
  chitinNormal: THREE.Texture;
  velvetMossNormal: THREE.Texture;
  floraVeinNormal: THREE.Texture;
  mushroomGillNormal: THREE.Texture;
  crystalFacetNormal: THREE.Texture;
  spinedBarkNormal: THREE.Texture;
  eyeIris: THREE.Texture;
  skinPatterns: Record<SkinPattern, THREE.Texture>;
}

let cachedTextures: ProceduralTextures | null = null;

export function getProceduralTextures(): ProceduralTextures {
  if (cachedTextures) return cachedTextures;

  const patterns: SkinPattern[] = [
    'striped',
    'spotted',
    'iridescent',
    'photophore',
    'marbled',
    'chevron',
    'ocellated',
    'mycelial_veins',
  ];
  const skinPatterns = {} as Record<SkinPattern, THREE.Texture>;
  for (const p of patterns) {
    skinPatterns[p] = buildSkinPatternTexture(p);
  }

  cachedTextures = {
    skinAlbedo: buildOrganicAlbedoTexture('#e6ece8', 'rgba(255,255,255,0.12)', 'rgba(20,30,25,0.1)', 1),
    floraAlbedo: buildOrganicAlbedoTexture('#e8f0e8', 'rgba(255,255,255,0.14)', 'rgba(15,40,25,0.12)', 1),
    mossTerrainAlbedo: buildOrganicAlbedoTexture('#6a7c5a', 'rgba(120,165,92,0.22)', 'rgba(42,34,26,0.22)', 14),
    mossTerrainNormal: buildNormalFromHeight(
      128,
      (u, v) =>
        Math.sin(u * Math.PI * 16) * Math.cos(v * Math.PI * 16) * 0.45 +
        Math.sin((u + v) * Math.PI * 28) * 0.25 +
        Math.cos((u * 2 - v) * Math.PI * 36) * 0.15,
      2.4
    ),
    barkNormal: buildNormalFromHeight(
      128,
      (u, v) => Math.sin(u * Math.PI * 24 + Math.sin(v * Math.PI * 6) * 1.2) * 0.65 + Math.cos(v * Math.PI * 14) * 0.2,
      3.0
    ),
    scaleNormal: buildNormalFromHeight(
      128,
      (u, v) => {
        const sx = (u * 12) % 1;
        const sy = (v * 12 + Math.floor(u * 12) * 0.5) % 1;
        return Math.sqrt(Math.max(0, 0.25 - (sx - 0.5) ** 2 - (sy - 0.5) ** 2));
      },
      2.8
    ),
    chitinNormal: buildNormalFromHeight(
      128,
      (u, v) => Math.sin(v * Math.PI * 12) * 0.55 + Math.cos(u * Math.PI * 8) * 0.2,
      2.8
    ),
    velvetMossNormal: buildNormalFromHeight(
      128,
      (u, v) =>
        Math.sin(u * Math.PI * 34) * Math.sin(v * Math.PI * 34) * 0.35 +
        Math.cos((u + v) * Math.PI * 46) * 0.22,
      2.2
    ),
    floraVeinNormal: buildNormalFromHeight(
      128,
      (u, v) => Math.abs(Math.sin((u - 0.5) * Math.PI * 10 - v * Math.PI * 6)) * 0.55 + Math.cos(u * Math.PI * 2) * 0.35,
      2.6
    ),
    mushroomGillNormal: buildNormalFromHeight(
      128,
      (u, v) => Math.sin(u * Math.PI * 44) * 0.65 + Math.sin(v * Math.PI * 8) * 0.12,
      3.2
    ),
    crystalFacetNormal: buildNormalFromHeight(
      128,
      (u, v) => Math.abs(((u * 6 + v * 3) % 1) - 0.5) + Math.abs(((v * 6 - u * 2 + 4) % 1) - 0.5),
      3.4
    ),
    spinedBarkNormal: buildNormalFromHeight(
      128,
      (u, v) => Math.sin(u * Math.PI * 18) * Math.cos(v * Math.PI * 22) * 0.7,
      3.4
    ),
    eyeIris: buildEyeIrisTexture(),
    skinPatterns,
  };

  return cachedTextures;
}
