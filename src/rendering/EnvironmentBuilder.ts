import * as THREE from 'three';
import { TERRARIUM } from '../core/config';
import {
  getTerrainHeight,
  randRange,
  randomWeightedPointInTerrarium,
  sampleWindField,
} from '../core/math';
import {
  createCairnCoreMaterial,
  createGodRayMaterial,
  createMineralPoolMaterial,
  createSkyDomeMaterial,
  createSporePlumeMaterial,
  enhanceMaterialWithTerrariumLight,
  type SharedShaderUniforms,
} from './Shaders';
import { getProceduralTextures } from './TextureLibrary';

export interface EnvironmentRig {
  cairnLight: THREE.PointLight;
  cairnCore: THREE.Mesh;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  fillLight: THREE.DirectionalLight;
  update(realDt: number, windStrength: number, cairnPulse: number, daylight: number, timeOfDay: number): void;
}

function buildTerrariumGround(shared: SharedShaderUniforms): THREE.Mesh {
  const tex = getProceduralTextures();
  const size = TERRARIUM.worldRadius * 2;
  const segs = 128;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI * 0.5);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const colMoss = new THREE.Color(0x2e5838);
  const colRichMoss = new THREE.Color(0x457d46);
  const colHumus = new THREE.Color(0x3a2e22);
  const colMycelium = new THREE.Color(0x38c49a);
  const colPoolBed = new THREE.Color(0x183c44);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = getTerrainHeight(x, z);
    pos.setY(i, y);

    const n1 = Math.sin(x * 0.45 + z * 0.38) * 0.5 + 0.5;
    const n2 = Math.cos(x * 0.85 - z * 0.72) * 0.5 + 0.5;
    tmp.copy(colMoss).lerp(colRichMoss, n1 * 0.7).lerp(colHumus, n2 * 0.38);

    // Bioluminescent mycelial veins radiating around the Genesis Cairn
    const cd = Math.hypot(x - TERRARIUM.cairnPos.x, z - TERRARIUM.cairnPos.z);
    if (cd < 5.5) {
      const vein = Math.sin(Math.atan2(z - TERRARIUM.cairnPos.z, x - TERRARIUM.cairnPos.x) * 9 + cd * 2.5) * 0.5 + 0.5;
      const mask = Math.exp(-(cd * cd) / 14.0) * (0.3 + vein * 0.55);
      tmp.lerp(colMycelium, THREE.MathUtils.clamp(mask, 0, 0.78));
    }

    // Mineral pool muddy teal depression
    const pd = Math.hypot(x - TERRARIUM.poolPos.x, z - TERRARIUM.poolPos.z);
    if (pd < 4.5) {
      tmp.lerp(colPoolBed, Math.exp(-(pd * pd) / 6.5) * 0.85);
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: tex.mossTerrainAlbedo,
    normalMap: tex.mossTerrainNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.04,
  });
  enhanceMaterialWithTerrariumLight(mat, shared, {
    dappleStrength: 0.58,
    subsurfaceStrength: 0.14,
    subsurfaceColor: 0x4be096,
    cairnBounceStrength: 0.52,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildGenesisCairn(shared: SharedShaderUniforms): { group: THREE.Group; core: THREE.Mesh } {
  const tex = getProceduralTextures();
  const group = new THREE.Group();
  const baseY = getTerrainHeight(TERRARIUM.cairnPos.x, TERRARIUM.cairnPos.z);
  group.position.set(TERRARIUM.cairnPos.x, baseY - 0.15, TERRARIUM.cairnPos.z);

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x35443e,
    normalMap: tex.barkNormal,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughness: 0.78,
    metalness: 0.12,
  });
  enhanceMaterialWithTerrariumLight(stoneMat, shared, {
    dappleStrength: 0.35,
    subsurfaceStrength: 0.15,
    cairnBounceStrength: 0.65,
  });

  // Ring of craggy mossy basalt spires cradling the glowing mycelial Genesis Core
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.25;
    const h = randRange(1.15, 1.95);
    const spireGeo = new THREE.ConeGeometry(randRange(0.45, 0.7), h, 7, 3);
    const pos = spireGeo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      pos.setX(k, pos.getX(k) * (1.0 + Math.sin(y * 5 + i) * 0.16));
      pos.setZ(k, pos.getZ(k) * (1.0 + Math.cos(y * 4 - i) * 0.16));
    }
    spireGeo.computeVertexNormals();
    const spire = new THREE.Mesh(spireGeo, stoneMat);
    spire.position.set(Math.cos(ang) * 0.85, h * 0.42, Math.sin(ang) * 0.85);
    spire.rotation.z = -Math.cos(ang) * 0.24;
    spire.rotation.x = Math.sin(ang) * 0.24;
    spire.castShadow = true;
    spire.receiveShadow = true;
    group.add(spire);
  }

  // Luminous pulsing crystalline mycelial core inside the cairn
  const coreGeo = new THREE.IcosahedronGeometry(0.55, 2);
  const coreMat = createCairnCoreMaterial(shared);
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 1.05;
  group.add(core);

  // Rising volumetric spore plume from the cairn throat
  const plumeGeo = new THREE.CylinderGeometry(1.35, 0.42, 6.2, 24, 16, true);
  plumeGeo.translate(0, 3.1, 0);
  const plumeMat = createSporePlumeMaterial(shared);
  const plume = new THREE.Mesh(plumeGeo, plumeMat);
  plume.position.y = 0.85;
  group.add(plume);

  return { group, core };
}

function buildDecorRocksAndLogs(scene: THREE.Scene, shared: SharedShaderUniforms): void {
  const tex = getProceduralTextures();
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x3b4840,
    normalMap: tex.mossTerrainNormal,
    roughness: 0.82,
    metalness: 0.08,
  });
  const logMat = new THREE.MeshStandardMaterial({
    color: 0x4a3628,
    normalMap: tex.barkNormal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.88,
    metalness: 0.03,
  });
  enhanceMaterialWithTerrariumLight(rockMat, shared, { dappleStrength: 0.42, cairnBounceStrength: 0.4 });
  enhanceMaterialWithTerrariumLight(logMat, shared, { dappleStrength: 0.44, cairnBounceStrength: 0.38 });

  // Sculpted mossy boulders framing the terrarium habitat
  const rockPositions: Array<[number, number, number]> = [
    [-7.8, -5.2, 1.35],
    [7.4, -6.5, 1.5],
    [-9.2, 4.4, 1.25],
    [8.6, 5.2, 1.4],
    [1.8, -8.8, 1.6],
    [-2.5, 8.6, 1.2],
    [11.2, -0.8, 1.7],
    [-11.4, -1.2, 1.55],
    [5.8, 7.6, 1.1],
    [-6.2, -8.5, 1.3],
  ];

  for (let i = 0; i < rockPositions.length; i++) {
    const [rx, rz, sc] = rockPositions[i];
    const geo = new THREE.DodecahedronGeometry(0.85, 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const vx = pos.getX(k);
      const vy = pos.getY(k);
      const vz = pos.getZ(k);
      const n = 1.0 + Math.sin(vx * 3.8 + i) * 0.18 + Math.cos(vz * 4.2 - vy * 3.1) * 0.14;
      pos.setXYZ(k, vx * n * 1.22, vy * n * 0.72, vz * n * 1.15);
    }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, rockMat);
    rock.position.set(rx, getTerrainHeight(rx, rz) + 0.15 * sc, rz);
    rock.scale.setScalar(sc);
    rock.rotation.y = i * 1.3;
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  // Fallen mossy alien logs with glowing mycelial moss streaks
  const logSpecs: Array<[number, number, number, number]> = [
    [-6.4, 2.2, 0.55, 3.8],
    [5.2, -3.6, -0.85, 3.2],
    [0.8, 6.2, 1.15, 3.5],
  ];
  for (let i = 0; i < logSpecs.length; i++) {
    const [lx, lz, rotY, len] = logSpecs[i];
    const logGeo = new THREE.CylinderGeometry(0.28, 0.36, len, 12, 8);
    logGeo.rotateZ(Math.PI * 0.5);
    const lPos = logGeo.attributes.position;
    for (let k = 0; k < lPos.count; k++) {
      const x = lPos.getX(k);
      lPos.setY(k, lPos.getY(k) + Math.sin(x * 1.6 + i) * 0.08);
    }
    logGeo.computeVertexNormals();
    const log = new THREE.Mesh(logGeo, logMat);
    log.position.set(lx, getTerrainHeight(lx, lz) + 0.24, lz);
    log.rotation.y = rotY;
    log.castShadow = true;
    log.receiveShadow = true;
    scene.add(log);
  }
}

function buildConservatoryDome(scene: THREE.Scene): void {
  // Elegant distant botanical-conservatory glass dome ribs & mist ring marking the vivarium horizon
  const archMat = new THREE.MeshStandardMaterial({
    color: 0x1d3436,
    roughness: 0.42,
    metalness: 0.68,
    transparent: true,
    opacity: 0.48,
  });
  const domeR = TERRARIUM.maxRadius + 3.2;
  const ribCount = 12;
  for (let i = 0; i < ribCount; i++) {
    const ang = (i / ribCount) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 14; s++) {
      const t = s / 14;
      const elev = t * Math.PI * 0.48;
      const r = Math.cos(elev) * domeR;
      const y = Math.sin(elev) * (TERRARIUM.canopyY + 4.8);
      pts.push(new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const rib = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.14, 6, false), archMat);
    scene.add(rib);
  }

  // Horizontal conservatory rings
  for (const frac of [0.18, 0.48]) {
    const r = Math.cos(frac * Math.PI * 0.48) * domeR;
    const y = Math.sin(frac * Math.PI * 0.48) * (TERRARIUM.canopyY + 4.8);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 6, 48), archMat);
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = y;
    scene.add(ring);
  }
}

export function buildTerrariumEnvironment(
  scene: THREE.Scene,
  shared: SharedShaderUniforms
): EnvironmentRig {
  // Sky dome
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(TERRARIUM.worldRadius * 1.15, 32, 20), createSkyDomeMaterial(shared));
  scene.add(skyDome);

  // Sculpted mossy terrarium floor
  scene.add(buildTerrariumGround(shared));

  // Shallow bioluminescent mineral pool
  const poolGeo = new THREE.CircleGeometry(3.4, 36);
  poolGeo.rotateX(-Math.PI * 0.5);
  const poolMesh = new THREE.Mesh(poolGeo, createMineralPoolMaterial(shared));
  poolMesh.position.set(TERRARIUM.poolPos.x, TERRARIUM.poolSurfaceY, TERRARIUM.poolPos.z);
  scene.add(poolMesh);

  // Central Mycelial Genesis Cairn
  const { group: cairnGroup, core: cairnCore } = buildGenesisCairn(shared);
  scene.add(cairnGroup);

  // Boulders, fallen mossy logs & conservatory dome arches
  buildDecorRocksAndLogs(scene, shared);
  buildConservatoryDome(scene);

  // Volumetric sunlit canopy god rays
  const rayMat = createGodRayMaterial(shared);
  for (let i = 0; i < 6; i++) {
    const pt = randomWeightedPointInTerrarium(TERRARIUM.coreRadius * 0.72, TERRARIUM.coreRadius * 0.9);
    const rayGeo = new THREE.PlaneGeometry(randRange(2.4, 4.2), 14.5);
    const ray = new THREE.Mesh(rayGeo, rayMat);
    ray.position.set(pt.x, 7.6, pt.z);
    ray.rotation.y = randRange(0, Math.PI);
    ray.rotation.z = -0.18;
    scene.add(ray);
  }

  // Drifting bioluminescent spores, pollen & firefly motes
  const moteCount = 260;
  const motePositions = new Float32Array(moteCount * 3);
  const moteColors = new Float32Array(moteCount * 3);
  const moteSeeds = new Float32Array(moteCount);
  const palette = [new THREE.Color(0x6effc8), new THREE.Color(0xffe57f), new THREE.Color(0xc084fc)];
  for (let i = 0; i < moteCount; i++) {
    const pt = randomWeightedPointInTerrarium(TERRARIUM.coreRadius * 1.1, TERRARIUM.radius * 1.1);
    const fl = getTerrainHeight(pt.x, pt.z);
    motePositions[i * 3] = pt.x;
    motePositions[i * 3 + 1] = fl + randRange(0.5, TERRARIUM.canopyY - 1.5);
    motePositions[i * 3 + 2] = pt.z;
    const c = palette[i % palette.length];
    moteColors[i * 3] = c.r;
    moteColors[i * 3 + 1] = c.g;
    moteColors[i * 3 + 2] = c.b;
    moteSeeds[i] = Math.random() * 100;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteColors, 3));
  const moteMat = new THREE.PointsMaterial({
    size: 0.14,
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const motePoints = new THREE.Points(moteGeo, moteMat);
  motePoints.frustumCulled = false;
  scene.add(motePoints);

  // Lighting rig
  const sunLight = new THREE.DirectionalLight(0xfff5dc, 2.2);
  sunLight.position.set(12, 22, 10);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 2;
  sunLight.shadow.camera.far = 58;
  sunLight.shadow.camera.left = -20;
  sunLight.shadow.camera.right = 20;
  sunLight.shadow.camera.top = 20;
  sunLight.shadow.camera.bottom = -20;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  const hemiLight = new THREE.HemisphereLight(0x9be6d4, 0x24382a, 0.85);
  scene.add(hemiLight);

  const fillLight = new THREE.DirectionalLight(0x68d4ff, 0.45);
  fillLight.position.set(-14, 10, -12);
  scene.add(fillLight);

  const cairnLight = new THREE.PointLight(0x45f5c2, 3.2, 18, 1.5);
  cairnLight.position.set(
    TERRARIUM.cairnPos.x,
    getTerrainHeight(TERRARIUM.cairnPos.x, TERRARIUM.cairnPos.z) + 1.5,
    TERRARIUM.cairnPos.z
  );
  scene.add(cairnLight);

  const _wind = new THREE.Vector3();
  const _dayFog = new THREE.Color(0x163630);
  const _duskFog = new THREE.Color(0x1a1e30);
  const _nightFog = new THREE.Color(0x061018);
  const _sunDay = new THREE.Color(0xfff4d6);
  const _sunDusk = new THREE.Color(0xff9c63);
  const _sunNight = new THREE.Color(0x4a78c8);

  return {
    cairnLight,
    cairnCore,
    sunLight,
    hemiLight,
    fillLight,
    update(realDt, windStrength, cairnPulse, daylight, timeOfDay) {
      shared.uTime.value += realDt;
      shared.uDaylight.value = daylight;
      shared.uCairnPulse.value = cairnPulse;
      shared.uWindStrength.value = windStrength;

      // Solar arc across conservatory glass ceiling
      const sunAngle = (timeOfDay - 0.25) * Math.PI * 2;
      const sx = Math.cos(sunAngle) * 18;
      const sy = Math.max(4.5, Math.sin(sunAngle) * 22 + 5);
      const sz = 9.0;
      sunLight.position.set(sx, sy, sz);
      shared.uSunDir.value.set(sx, sy, sz).normalize();

      const twilight = Math.sin(daylight * Math.PI);
      sunLight.color.copy(_sunNight).lerp(_sunDay, daylight).lerp(_sunDusk, twilight * 0.42);
      sunLight.intensity = 0.45 + daylight * 2.15;
      hemiLight.intensity = 0.36 + daylight * 0.68;
      fillLight.intensity = 0.35 + (1.0 - daylight) * 0.42;

      shared.uFogColor.value.copy(_nightFog).lerp(_dayFog, daylight).lerp(_duskFog, twilight * 0.35);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(shared.uFogColor.value);
      }
      if (scene.background instanceof THREE.Color) {
        scene.background.copy(shared.uFogColor.value);
      }

      // Cairn core pulse
      const t = shared.uTime.value;
      const coreScale = 1.0 + Math.sin(t * 2.8) * 0.08 + cairnPulse * 0.42;
      cairnCore.scale.setScalar(coreScale);
      cairnCore.rotation.y += realDt * 0.55;
      cairnLight.intensity = (2.6 + (1.0 - daylight) * 2.2) + cairnPulse * 4.5;

      // Update floating luminous spores/firefly motes
      const posAttr = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < moteCount; i++) {
        let mx = posAttr.getX(i);
        let my = posAttr.getY(i);
        let mz = posAttr.getZ(i);
        sampleWindField(mx, my, mz, t, windStrength, _wind);
        const seed = moteSeeds[i];
        mx += (_wind.x * 0.55 + Math.sin(t * 0.75 + seed) * 0.14) * realDt;
        my += (_wind.y * 0.42 + Math.cos(t * 0.9 + seed) * 0.12) * realDt;
        mz += (_wind.z * 0.55 + Math.cos(t * 0.7 - seed) * 0.14) * realDt;

        const r = Math.hypot(mx, mz);
        const fl = getTerrainHeight(mx, mz);
        if (r > TERRARIUM.radius * 1.18 || my < fl + 0.25 || my > TERRARIUM.canopyY - 0.5) {
          const pt = randomWeightedPointInTerrarium(TERRARIUM.coreRadius * 0.95, TERRARIUM.radius);
          mx = pt.x;
          mz = pt.z;
          my = getTerrainHeight(mx, mz) + randRange(0.6, TERRARIUM.canopyY - 2.2);
        }
        posAttr.setXYZ(i, mx, my, mz);
      }
      posAttr.needsUpdate = true;
      moteMat.opacity = 0.48 + (1.0 - daylight) * 0.45;
    },
  };
}
