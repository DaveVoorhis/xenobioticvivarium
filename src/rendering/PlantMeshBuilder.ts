import * as THREE from 'three';
import { clamp, disableFrustumCulling, randRange } from '../core/math';
import type { PlantGenome } from '../genetics/types';
import type { PlantEntity } from '../simulation/types';
import { getGeometryLibrary } from './GeometryLibrary';
import { enhanceMaterialWithTerrariumLight, type SharedShaderUniforms } from './Shaders';
import { getProceduralTextures } from './TextureLibrary';

export interface PlantRig {
  group: THREE.Group;
  materials: THREE.Material[];
  stemMat: THREE.MeshPhysicalMaterial;
  accentMat: THREE.MeshPhysicalMaterial;
  tipMat: THREE.MeshStandardMaterial;
  fronds: Array<{ pivot: THREE.Group; phase: number; baseTilt: number; swayScale: number }>;
  capNode: THREE.Object3D | null;
  lidPivot: THREE.Group | null;
  baseGlow: number;
}

export function createPlantRig(
  genome: PlantGenome,
  sharedUniforms?: SharedShaderUniforms
): PlantRig {
  const geo = getGeometryLibrary();
  const tex = getProceduralTextures();
  const group = new THREE.Group();

  const isFungus = genome.kingdom === 'fungus';
  const isCrystal = genome.form === 'crystal_succulent' || genome.surfaceTexture === 'crystalline';
  const isSticky = genome.defense === 'sticky_resin';
  const spread = genome.canopySpread ?? 1.0;

  const primaryNormal =
    genome.surfaceTexture === 'gilled_cap' || isFungus
      ? tex.mushroomGillNormal
      : isCrystal
      ? tex.crystalFacetNormal
      : genome.surfaceTexture === 'spined_bark'
      ? tex.spinedBarkNormal
      : genome.surfaceTexture === 'velvet_mycelium'
      ? tex.velvetMossNormal
      : tex.floraVeinNormal;

  const stemMat = new THREE.MeshPhysicalMaterial({
    color: genome.baseHex,
    map: tex.floraAlbedo,
    vertexColors: true,
    roughness: isSticky ? 0.14 : isCrystal ? 0.18 : isFungus ? 0.42 : 0.36,
    metalness: isCrystal ? 0.2 : 0.04,
    clearcoat: isSticky ? 0.92 : isCrystal ? 0.85 : isFungus ? 0.34 : 0.48,
    iridescence: isCrystal ? 0.78 : isFungus ? 0.32 : 0.18,
    sheen: isFungus ? 0.62 : 0.42,
    sheenColor: new THREE.Color(genome.accentHex),
    normalMap: primaryNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    emissive: new THREE.Color(genome.baseHex),
    emissiveIntensity: isFungus ? 0.22 : 0.14,
    side: THREE.DoubleSide,
  });

  const accentMat = new THREE.MeshPhysicalMaterial({
    color: genome.accentHex,
    map: tex.floraAlbedo,
    vertexColors: true,
    roughness: isFungus ? 0.34 : 0.28,
    metalness: 0.04,
    clearcoat: 0.56,
    iridescence: 0.44,
    sheen: 0.55,
    sheenColor: new THREE.Color(genome.glowHex),
    normalMap: isFungus ? tex.mushroomGillNormal : tex.floraVeinNormal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    emissive: new THREE.Color(genome.accentHex),
    emissiveIntensity: isFungus ? 0.32 : 0.22,
    side: THREE.DoubleSide,
  });

  const baseGlow = (isFungus ? 0.95 : 0.64) * (genome.biolumIntensity ?? 0.85);
  const tipCol = new THREE.Color(genome.glowHex);
  if (genome.defense === 'alkaloid_toxin') {
    tipCol.lerp(new THREE.Color(0xb9ff4a), 0.35);
  }
  const tipMat = new THREE.MeshStandardMaterial({
    color: tipCol,
    roughness: 0.18,
    metalness: 0.05,
    emissive: tipCol,
    emissiveIntensity: baseGlow,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide,
  });

  if (sharedUniforms) {
    enhanceMaterialWithTerrariumLight(stemMat, sharedUniforms, {
      dappleStrength: 0.44,
      subsurfaceStrength: isFungus ? 0.56 : 0.48,
      subsurfaceColor: genome.accentHex,
      cairnBounceStrength: 0.36,
    });
    enhanceMaterialWithTerrariumLight(accentMat, sharedUniforms, {
      dappleStrength: 0.4,
      subsurfaceStrength: 0.62,
      subsurfaceColor: genome.glowHex,
      cairnBounceStrength: 0.36,
    });
  }

  const materials: THREE.Material[] = [stemMat, accentMat, tipMat];
  const fronds: PlantRig['fronds'] = [];
  let capNode: THREE.Object3D | null = null;
  let lidPivot: THREE.Group | null = null;

  // Root / Mycelial anchor cluster at soil surface
  const rootCount = genome.rootSystem === 'mycelial_web' ? 7 : 5;
  for (let r = 0; r < rootCount; r++) {
    const a = (r / rootCount) * Math.PI * 2 + randRange(-0.2, 0.2);
    const root = new THREE.Mesh(geo.rootTendril, genome.rootSystem === 'mycelial_web' ? tipMat : stemMat);
    root.rotation.y = a;
    root.rotation.x = 1.28;
    root.position.y = 0.06;
    root.scale.setScalar(genome.rootSystem === 'mycelial_web' ? 0.85 : 0.68);
    group.add(root);
  }

  // === BUILD DISTINCT PLANT & FUNGUS ARCHITECTURES ===
  if (genome.form === 'parasol_mushroom') {
    const stipe = new THREE.Mesh(geo.organicStipe, stemMat);
    stipe.castShadow = true;
    group.add(stipe);

    const capGroup = new THREE.Group();
    capGroup.position.set(0.02, 1.02, 0);
    const cap = new THREE.Mesh(geo.mushroomCapParasol, accentMat);
    cap.scale.set(spread * 1.15, 1.05, spread * 1.15);
    cap.castShadow = true;
    capGroup.add(cap);

    const gills = new THREE.Mesh(geo.mushroomGills, tipMat);
    gills.position.y = -0.02;
    gills.scale.set(spread * 1.12, 1.0, spread * 1.12);
    capGroup.add(gills);

    // Bioluminescent spots on mushroom cap
    for (let s = 0; s < 7; s++) {
      const a = (s / 7) * Math.PI * 2;
      const rad = 0.25 + (s % 2) * 0.18;
      const dot = new THREE.Mesh(geo.sporeOrb, tipMat);
      dot.position.set(Math.cos(a) * rad * spread, 0.26 - rad * 0.32, Math.sin(a) * rad * spread);
      dot.scale.setScalar(0.45);
      capGroup.add(dot);
    }

    // Companion baby button mushroom beside main stipe
    const baby = new THREE.Group();
    baby.position.set(0.32, 0, 0.2);
    baby.scale.setScalar(0.45);
    baby.rotation.z = -0.22;
    baby.add(new THREE.Mesh(geo.organicStipe, stemMat));
    const bCap = new THREE.Mesh(geo.mushroomCapParasol, accentMat);
    bCap.position.y = 1.02;
    baby.add(bCap);
    group.add(baby);

    group.add(capGroup);
    capNode = capGroup;
  } else if (genome.form === 'shelf_cluster') {
    const coreTrunk = new THREE.Mesh(geo.organicStipe, stemMat);
    coreTrunk.scale.set(1.3, 1.15, 1.3);
    coreTrunk.castShadow = true;
    group.add(coreTrunk);

    const tiers = clamp(genome.frondCount, 5, 9);
    for (let i = 0; i < tiers; i++) {
      const t = i / Math.max(1, tiers - 1);
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.24 + t * 0.85, 0);
      pivot.rotation.y = i * 2.15;
      const shelf = new THREE.Mesh(geo.shelfBracket, i % 2 === 0 ? accentMat : stemMat);
      const sc = (1.15 - t * 0.42) * spread;
      shelf.scale.set(sc, 1.0, sc);
      shelf.castShadow = true;
      pivot.add(shelf);

      const rimGlow = new THREE.Mesh(geo.sporeOrb, tipMat);
      rimGlow.position.set(0, 0.03, 0.45 * sc);
      rimGlow.scale.set(1.6 * sc, 0.22, 0.45);
      pivot.add(rimGlow);

      group.add(pivot);
      fronds.push({ pivot, phase: i * 0.8, baseTilt: 0.05, swayScale: 0.25 });
    }
    capNode = group;
  } else if (genome.form === 'puffball_mycelium') {
    const mainSac = new THREE.Mesh(geo.puffballSac, accentMat);
    mainSac.scale.set(spread * 1.08, 1.12, spread * 1.08);
    mainSac.castShadow = true;
    group.add(mainSac);

    const poreGlow = new THREE.Mesh(geo.sporeOrb, tipMat);
    poreGlow.position.set(0, 0.86, 0);
    poreGlow.scale.set(1.2, 0.45, 1.2);
    group.add(poreGlow);

    // Satellite puffballs clustered around the parent sac
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2 + 0.5;
      const sub = new THREE.Mesh(geo.puffballSac, stemMat);
      sub.position.set(Math.cos(ang) * 0.36 * spread, 0, Math.sin(ang) * 0.36 * spread);
      sub.scale.setScalar(0.54);
      sub.rotation.z = -Math.cos(ang) * 0.18;
      group.add(sub);
    }
    capNode = mainSac;
  } else if (genome.form === 'coral_fungus') {
    const branches = clamp(genome.frondCount, 5, 9);
    for (let i = 0; i < branches; i++) {
      const a = (i / branches) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.rotation.y = a;
      const tilt = 0.22 + (i % 3) * 0.16;
      pivot.rotation.x = tilt;

      const antler = new THREE.Mesh(geo.coralAntler, i % 2 === 0 ? accentMat : stemMat);
      antler.rotation.x = -Math.PI * 0.5;
      antler.scale.setScalar(0.95 + (i % 2) * 0.25);
      antler.castShadow = true;
      pivot.add(antler);

      const tip = new THREE.Mesh(geo.sporeOrb, tipMat);
      tip.position.set(0.22, 0.78, 0.05);
      tip.scale.setScalar(0.55);
      pivot.add(tip);

      group.add(pivot);
      fronds.push({ pivot, phase: i * 0.7, baseTilt: tilt, swayScale: 0.45 });
    }
  } else if (genome.form === 'canopy_blossom') {
    const stem = new THREE.Mesh(geo.organicStipe, stemMat);
    stem.scale.set(0.85, 1.22, 0.85);
    stem.castShadow = true;
    group.add(stem);

    const flowerHead = new THREE.Group();
    flowerHead.position.set(0.02, 1.24, 0);
    const petalCount = clamp(genome.frondCount, 5, 9);
    for (let i = 0; i < petalCount; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / petalCount) * Math.PI * 2;
      const baseTilt = 0.72;
      pivot.rotation.x = baseTilt;
      const petal = new THREE.Mesh(geo.blossomPetal, accentMat);
      petal.scale.set(spread * 0.92, 1.0, 1.0);
      petal.castShadow = true;
      pivot.add(petal);
      flowerHead.add(pivot);
      fronds.push({ pivot, phase: i * 0.55, baseTilt, swayScale: 0.55 });
    }

    const core = new THREE.Mesh(geo.blossomCore, tipMat);
    core.position.y = 0.08;
    flowerHead.add(core);
    group.add(flowerHead);
    capNode = flowerHead;
  } else if (genome.form === 'pitcher_trap') {
    const cup = new THREE.Mesh(geo.pitcherCup, stemMat);
    cup.scale.set(spread * 0.95, 1.15, spread * 0.95);
    cup.castShadow = true;
    group.add(cup);

    // Glowing nectar-lure peristome collar
    const rim = new THREE.Mesh(geo.eyeSocket, tipMat);
    rim.rotation.x = Math.PI * 0.5;
    rim.position.y = 1.18;
    rim.scale.setScalar(3.4 * spread);
    group.add(rim);

    // Articulated snapping hood lid!
    lidPivot = new THREE.Group();
    lidPivot.position.set(0, 1.18, -0.22 * spread);
    lidPivot.rotation.x = 0.52;
    const lid = new THREE.Mesh(geo.pitcherLid, accentMat);
    lid.scale.set(0.95 * spread, 0.72, 1.0);
    lidPivot.add(lid);
    group.add(lidPivot);

    // Surrounding trapping tendrils
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Group();
      p.rotation.y = (i / 4) * Math.PI * 2 + 0.4;
      p.rotation.x = 0.52;
      const t = new THREE.Mesh(geo.fernFrond, accentMat);
      t.scale.set(0.45, 0.72, 0.55);
      p.add(t);
      group.add(p);
      fronds.push({ pivot: p, phase: i * 1.1, baseTilt: 0.52, swayScale: 0.85 });
    }
  } else if (genome.form === 'crystal_succulent') {
    const count = clamp(genome.frondCount, 6, 10);
    for (let i = 0; i < count; i++) {
      const inner = i % 2 === 0;
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / count) * Math.PI * 2;
      const baseTilt = inner ? 0.34 : 0.78;
      pivot.rotation.x = baseTilt;
      const blade = new THREE.Mesh(geo.crystalLeaf, inner ? accentMat : stemMat);
      blade.scale.set(spread * (inner ? 0.88 : 1.08), inner ? 1.12 : 0.92, 1.0);
      blade.castShadow = true;
      pivot.add(blade);

      const tip = new THREE.Mesh(geo.sporeOrb, tipMat);
      tip.position.set(0, inner ? 0.96 : 0.78, 0.14);
      tip.scale.setScalar(0.32);
      pivot.add(tip);

      group.add(pivot);
      fronds.push({ pivot, phase: i * 0.6, baseTilt, swayScale: 0.18 });
    }
  } else {
    // spiral_fern or tendril_vine
    const isVine = genome.form === 'tendril_vine';
    if (isVine) {
      const stalk = new THREE.Mesh(geo.organicStipe, stemMat);
      stalk.scale.set(0.8, 1.38, 0.8);
      stalk.castShadow = true;
      group.add(stalk);
    }
    const count = clamp(genome.frondCount, 5, 10);
    for (let i = 0; i < count; i++) {
      const pivot = new THREE.Group();
      pivot.position.y = isVine ? 0.25 + (i / count) * 1.05 : 0.08;
      pivot.rotation.y = i * (isVine ? 2.3 : (Math.PI * 2) / count);
      const baseTilt = isVine ? 0.65 : 0.36 + (i % 2) * 0.22;
      pivot.rotation.x = baseTilt;
      const frond = new THREE.Mesh(geo.fernFrond, i % 2 === 0 ? stemMat : accentMat);
      frond.scale.set(spread * 0.9, isVine ? 0.78 : 1.08, spread * 0.9);
      frond.castShadow = true;
      pivot.add(frond);

      const glowTip = new THREE.Mesh(geo.sporeOrb, tipMat);
      glowTip.position.set(0, isVine ? 0.82 : 1.05, isVine ? 0.48 : 0.65);
      glowTip.scale.setScalar(0.35);
      pivot.add(glowTip);

      group.add(pivot);
      fronds.push({ pivot, phase: i * 0.75, baseTilt, swayScale: 1.0 });
    }
  }

  // Thorns defense spikes
  if (genome.defense === 'thorns') {
    for (let t = 0; t < 4; t++) {
      const sp = new THREE.Mesh(geo.thornSpike, tipMat);
      sp.position.y = 0.28 + t * 0.18;
      sp.rotation.y = t * 1.7;
      sp.rotation.x = 0.9;
      group.add(sp);
    }
  }

  disableFrustumCulling(group);

  return {
    group,
    materials,
    stemMat,
    accentMat,
    tipMat,
    fronds,
    capNode,
    lidPivot,
    baseGlow,
  };
}

export function updatePlantRig(
  rig: PlantRig,
  p: PlantEntity,
  windStrength: number,
  daylight: number
): void {
  rig.group.position.copy(p.position);
  rig.group.quaternion.copy(p.quaternion);

  const puffPulse = 1.0 + p.sporePulseAnim * 0.22;
  rig.group.scale.set(p.scale * puffPulse, p.scale * (1.0 - p.sporePulseAnim * 0.08), p.scale * puffPulse);

  if (p.wiltTilt > 0.001) {
    rig.group.rotateX(p.wiltTilt);
  }

  const swayMag = (0.06 + windStrength * 0.1 + p.rustleAnim * 0.18) * (p.genome.kingdom === 'fungus' ? 0.55 : 1.0);
  for (let i = 0; i < rig.fronds.length; i++) {
    const f = rig.fronds[i];
    const wave = Math.sin(p.swayPhase + f.phase) * swayMag * f.swayScale;
    const bloomOpen = p.genome.form === 'canopy_blossom' ? (daylight - 0.5) * 0.24 : 0;
    const snareClose = p.snareAnim * 0.45;
    f.pivot.rotation.x = f.baseTilt + wave + bloomOpen - snareClose;
  }

  if (rig.lidPivot) {
    // Pitcher trap lid snaps down when snaring prey!
    rig.lidPivot.rotation.x = 0.52 + p.snareAnim * 0.95 + Math.sin(p.swayPhase) * 0.04;
  }

  if (rig.capNode && p.genome.form === 'puffball_mycelium') {
    const breathe = 1.0 + Math.sin(p.swayPhase * 1.4) * 0.05 + p.sporePulseAnim * 0.24;
    rig.capNode.scale.set(breathe, 1.0 + p.sporePulseAnim * 0.16, breathe);
  }

  const nightBoost = p.genome.kingdom === 'fungus' ? 1.0 + (1.0 - daylight) * 1.25 : 1.0 + (1.0 - daylight) * 0.65;
  const symbiosisGlow = p.mycorrhizalBoost * 0.55 + p.sporePulseAnim * 0.95 + p.snareAnim * 0.85;
  rig.tipMat.emissiveIntensity = (rig.baseGlow * nightBoost + symbiosisGlow) * p.opacity;

  if (p.wilting) {
    for (let i = 0; i < rig.materials.length; i++) {
      const m = rig.materials[i];
      if ('opacity' in m) {
        m.transparent = true;
        (m as THREE.MeshPhysicalMaterial).opacity = clamp(p.opacity, 0, 1);
      }
    }
  }
}
