import * as THREE from 'three';
import { clamp, disableFrustumCulling, getTerrainHeight, getTerrainNormal, safeNormalize } from '../core/math';
import type { AnimalGenome } from '../genetics/types';
import type { AnimalEntity, CorpseEntity } from '../simulation/types';
import { getGeometryLibrary } from './GeometryLibrary';
import { enhanceMaterialWithTerrariumLight, type SharedShaderUniforms } from './Shaders';
import { getProceduralTextures } from './TextureLibrary';

export interface WingJoint {
  innerPivot: THREE.Group;
  outerPivot: THREE.Group;
  side: number;
  pairIndex: number;
}

export interface ArticulatedLeg {
  upperPivot: THREE.Group;
  lowerPivot: THREE.Group;
  side: number;
  row: number;
  phaseOffset: number;
}

export interface ArticulatedAnimalRig {
  group: THREE.Group;
  bodyRoot: THREE.Group;
  spineContainer: THREE.Group | null;
  isSerpentine: boolean;
  materials: THREE.Material[];
  bodyMat: THREE.MeshPhysicalMaterial;
  accentMat: THREE.MeshPhysicalMaterial;
  glowMat: THREE.MeshStandardMaterial;
  wingMat: THREE.MeshPhysicalMaterial;
  segments: Array<{ pivot: THREE.Group; index: number }>;
  wings: WingJoint[];
  legs: ArticulatedLeg[];
  springLegs: Array<{ thighPivot: THREE.Group; shinPivot: THREE.Group; side: number }>;
  antennae: Array<{ pivot: THREE.Group; side: number }>;
  mandibles: Array<{ pivot: THREE.Group; side: number; baseY: number }>;
  eyeStalks: Array<{ pivot: THREE.Group; side: number }>;
  lurePivot: THREE.Group | null;
  vocalSacMesh: THREE.Mesh | null;
  pollenMeshes: THREE.Mesh[];
  tailPivot: THREE.Group | null;
  morselGroup: THREE.Group;
  fleshMorselMesh: THREE.Mesh;
  floraMorselMesh: THREE.Mesh;
  morselMat: THREE.MeshPhysicalMaterial;
  baseEmissive: number;
  glowEmissive: number;
  baseBodyScale: THREE.Vector3;
  baseColor: THREE.Color;
}

function buildLayeredEye(
  geo: ReturnType<typeof getGeometryLibrary>,
  eyeMat: THREE.Material,
  corneaMat: THREE.Material,
  socketMat: THREE.Material,
  scale = 1.0
): THREE.Group {
  const eyeGroup = new THREE.Group();
  const socket = new THREE.Mesh(geo.eyeSocket, socketMat);
  socket.position.z = -0.012;
  eyeGroup.add(socket);

  const globe = new THREE.Mesh(geo.eyeGlobe, eyeMat);
  eyeGroup.add(globe);

  const cornea = new THREE.Mesh(geo.eyeCornea, corneaMat);
  cornea.position.z = 0.008;
  eyeGroup.add(cornea);

  eyeGroup.scale.setScalar(scale);
  return eyeGroup;
}

export function createAnimalRig(
  genome: AnimalGenome,
  sharedUniforms?: SharedShaderUniforms
): ArticulatedAnimalRig {
  const geo = getGeometryLibrary();
  const tex = getProceduralTextures();
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const patternTex = tex.skinPatterns[genome.skinPattern];
  const isChitin = genome.integument === 'chitin_carapace' || genome.bodyPlan === 'armored_crawler';
  const isTranslucent = genome.integument === 'translucent_gel';
  const isVelvet = genome.integument === 'velvet_moss';
  const isSpined = genome.integument === 'spined_hide';
  const baseEmissive = 0.24 * genome.biolumIntensity;
  const glowEmissive = 0.98 * genome.biolumIntensity;
  const baseColor = new THREE.Color(genome.baseHex);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: genome.baseHex,
    map: tex.skinAlbedo,
    vertexColors: true,
    roughness: isTranslucent ? 0.12 : isVelvet ? 0.68 : isChitin ? 0.24 : 0.3,
    metalness: isChitin ? 0.34 : isTranslucent ? 0.02 : 0.1,
    clearcoat: isTranslucent ? 1.0 : isChitin ? 0.85 : isVelvet ? 0.18 : 0.65,
    clearcoatRoughness: isTranslucent ? 0.06 : 0.16,
    iridescence: isTranslucent ? 0.88 : genome.integument === 'iridescent_scales' ? 0.92 : 0.42,
    iridescenceIOR: 1.38,
    sheen: isVelvet ? 0.85 : 0.32,
    sheenColor: new THREE.Color(genome.glowHex),
    normalMap: isChitin
      ? tex.chitinNormal
      : isVelvet
      ? tex.velvetMossNormal
      : isSpined
      ? tex.spinedBarkNormal
      : tex.scaleNormal,
    normalScale: new THREE.Vector2(isChitin || isSpined ? 1.05 : 0.82, isChitin || isSpined ? 1.05 : 0.82),
    emissive: new THREE.Color(genome.glowHex),
    emissiveMap: patternTex,
    emissiveIntensity: baseEmissive,
    transparent: isTranslucent,
    opacity: isTranslucent ? 0.78 : 1.0,
  });

  const accentMat = new THREE.MeshPhysicalMaterial({
    color: genome.accentHex,
    map: tex.skinAlbedo,
    vertexColors: true,
    roughness: isChitin ? 0.26 : 0.32,
    metalness: isChitin ? 0.24 : 0.08,
    clearcoat: 0.72,
    iridescence: 0.54,
    normalMap: isChitin ? tex.chitinNormal : tex.scaleNormal,
    emissive: new THREE.Color(genome.glowHex),
    emissiveIntensity: baseEmissive * 0.55,
  });

  const wingMat = new THREE.MeshPhysicalMaterial({
    color: genome.accentHex,
    vertexColors: true,
    roughness: 0.16,
    metalness: 0.04,
    clearcoat: 0.82,
    iridescence: 0.85,
    iridescenceIOR: 1.4,
    emissive: new THREE.Color(genome.glowHex),
    emissiveMap: patternTex,
    emissiveIntensity: baseEmissive * 0.85,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
  });

  const glowMat = new THREE.MeshStandardMaterial({
    color: genome.glowHex,
    roughness: 0.18,
    metalness: 0.05,
    emissive: new THREE.Color(genome.glowHex),
    emissiveIntensity: glowEmissive,
  });

  const socketMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(genome.baseHex).multiplyScalar(0.45),
    roughness: 0.35,
    clearcoat: 0.5,
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    map: tex.eyeIris,
    color: genome.sensoryOrgan === 'compound_optics' ? genome.glowHex : 0xffffff,
    roughness: 0.14,
    metalness: genome.sensoryOrgan === 'compound_optics' ? 0.45 : 0.08,
    emissive: new THREE.Color(genome.glowHex),
    emissiveIntensity: genome.sensoryOrgan === 'compound_optics' ? 0.42 : 0.18,
  });

  const corneaMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.42,
  });

  const morselMat = new THREE.MeshPhysicalMaterial({
    color: 0xff8866,
    roughness: 0.42,
    clearcoat: 0.45,
    side: THREE.DoubleSide,
  });

  if (sharedUniforms) {
    enhanceMaterialWithTerrariumLight(bodyMat, sharedUniforms, {
      dappleStrength: 0.35,
      subsurfaceStrength: isTranslucent ? 0.62 : 0.32,
      subsurfaceColor: genome.glowHex,
      cairnBounceStrength: 0.34,
    });
    enhanceMaterialWithTerrariumLight(wingMat, sharedUniforms, {
      dappleStrength: 0.28,
      subsurfaceStrength: 0.72,
      subsurfaceColor: genome.glowHex,
      cairnBounceStrength: 0.3,
    });
  }

  const materials: THREE.Material[] = [
    bodyMat,
    accentMat,
    wingMat,
    glowMat,
    socketMat,
    eyeMat,
    corneaMat,
    morselMat,
  ];

  const segments: ArticulatedAnimalRig['segments'] = [];
  let spineContainer: THREE.Group | null = null;
  const isSerpentine = genome.bodyPlan === 'serpentine_slitherer';
  const wings: WingJoint[] = [];
  const legs: ArticulatedLeg[] = [];
  const springLegs: ArticulatedAnimalRig['springLegs'] = [];
  const antennae: ArticulatedAnimalRig['antennae'] = [];
  const mandibles: ArticulatedAnimalRig['mandibles'] = [];
  const eyeStalks: ArticulatedAnimalRig['eyeStalks'] = [];
  const pollenMeshes: THREE.Mesh[] = [];
  let lurePivot: THREE.Group | null = null;
  let vocalSacMesh: THREE.Mesh | null = null;
  let tailPivot: THREE.Group | null = null;

  let headZ = 0.48;
  let headY = 0.05;
  let tailZ = -0.52;

  const addWingsPair = (zOffset: number, yOffset: number, spanScale: number, pairIndex: number) => {
    for (const side of [-1, 1]) {
      const innerPivot = new THREE.Group();
      innerPivot.position.set(side * 0.14, yOffset, zOffset);
      if (side === -1) innerPivot.scale.x = -1;
      const innerMesh = new THREE.Mesh(geo.flyerWingInner, wingMat);
      innerMesh.scale.set(spanScale, 1, spanScale * 0.92);
      innerMesh.castShadow = true;
      innerPivot.add(innerMesh);

      const outerPivot = new THREE.Group();
      outerPivot.position.set(0.58 * spanScale, 0.02, -0.04);
      const outerMesh = new THREE.Mesh(geo.flyerWingOuter, wingMat);
      outerMesh.scale.set(spanScale, 1, spanScale * 0.88);
      outerPivot.add(outerMesh);
      innerPivot.add(outerPivot);

      bodyRoot.add(innerPivot);
      wings.push({ innerPivot, outerPivot, side, pairIndex });
    }
  };

  const addArticulatedLegs = (pairs: number, zStart: number, zStep: number, spreadX: number, yAttach: number, legScale: number) => {
    for (let r = 0; r < pairs; r++) {
      const z = zStart - r * zStep;
      for (const side of [-1, 1]) {
        const upperPivot = new THREE.Group();
        upperPivot.position.set(side * spreadX, yAttach, z);
        upperPivot.rotation.z = side * 0.65;
        const femur = new THREE.Mesh(geo.legFemur, accentMat);
        femur.scale.setScalar(legScale);
        femur.castShadow = true;
        upperPivot.add(femur);

        const lowerPivot = new THREE.Group();
        lowerPivot.position.set(0, -0.34 * legScale, 0);
        lowerPivot.rotation.z = -side * 0.58;
        const tibia = new THREE.Mesh(geo.legTibia, bodyMat);
        tibia.scale.setScalar(legScale);
        lowerPivot.add(tibia);
        upperPivot.add(lowerPivot);

        bodyRoot.add(upperPivot);
        legs.push({
          upperPivot,
          lowerPivot,
          side,
          row: r,
          phaseOffset: (r % 2 === 0 ? 0 : Math.PI) + (side === 1 ? 0 : Math.PI),
        });
      }
    }
  };

  // === BUILD BODY PLAN SPECIFIC ARTICULATED ANATOMY ===
  if (genome.bodyPlan === 'aerial_glider') {
    const torso = new THREE.Mesh(geo.flyerTorso, bodyMat);
    torso.castShadow = true;
    bodyRoot.add(torso);

    // Primary + secondary alien moth/dragonfly membranous wings
    addWingsPair(0.12, 0.08, genome.limbSpan * 1.12, 0);
    addWingsPair(-0.16, 0.05, genome.limbSpan * 0.78, 1);

    // Articulated rudder tail
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.0, -0.52);
    const tailFin = new THREE.Mesh(geo.tailFrond, wingMat);
    tailFin.rotation.x = -Math.PI * 0.5;
    tailFin.scale.set(0.85, 0.85, 0.85);
    tailPivot.add(tailFin);
    bodyRoot.add(tailPivot);

    headZ = 0.54;
    headY = 0.04;
    tailZ = -0.54;
  } else if (genome.bodyPlan === 'hexapod_walker') {
    const thorax = new THREE.Mesh(geo.walkerThorax, bodyMat);
    thorax.position.set(0, 0.14, 0.12);
    thorax.castShadow = true;
    bodyRoot.add(thorax);

    const abdomen = new THREE.Mesh(geo.walkerAbdomen, accentMat);
    abdomen.position.set(0, 0.16, -0.2);
    abdomen.castShadow = true;
    bodyRoot.add(abdomen);

    const head = new THREE.Mesh(geo.slitherHead, bodyMat);
    head.position.set(0, 0.16, 0.5);
    head.scale.setScalar(0.85);
    bodyRoot.add(head);

    // 6 articulated stride legs (3 pairs)
    addArticulatedLegs(3, 0.34, 0.24, 0.2, 0.08, genome.limbSpan * 0.92);

    headZ = 0.64;
    headY = 0.18;
    tailZ = -0.82;
  } else if (genome.bodyPlan === 'armored_crawler') {
    const segCount = clamp(genome.segments, 5, 7);
    for (let i = 0; i < segCount; i++) {
      const t = i / Math.max(1, segCount - 1);
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.04, 0.38 - i * 0.24);
      const env = Math.sin(t * Math.PI * 0.82 + 0.25);
      const seg = new THREE.Mesh(geo.crawlerSegment, i % 2 === 0 ? bodyMat : accentMat);
      seg.scale.set(0.75 + env * 0.35, 0.72 + env * 0.28, 0.82);
      seg.castShadow = true;
      pivot.add(seg);
      bodyRoot.add(pivot);
      segments.push({ pivot, index: i });
    }

    // 8-10 scuttling legs hugging the mossy ground
    const pairs = Math.min(5, Math.max(4, segCount - 1));
    addArticulatedLegs(pairs, 0.32, 0.22, 0.26, 0.02, 0.56 * genome.limbSpan);

    headZ = 0.56;
    headY = 0.08;
    tailZ = 0.38 - (segCount - 1) * 0.24 - 0.18;
  } else if (isSerpentine) {
    const head = new THREE.Mesh(geo.slitherHead, bodyMat);
    head.position.set(0, 0.06, 0.2);
    head.castShadow = true;
    bodyRoot.add(head);

    // World-space path-following spine container (direct sibling of bodyRoot inside rig.group)
    spineContainer = new THREE.Group();
    group.add(spineContainer);

    const segCount = clamp(Math.round(genome.segments), 8, 12);
    const elong = genome.bodyElongation ?? 1.2;
    for (let i = 0; i < segCount; i++) {
      const t = i / Math.max(1, segCount - 1);
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.04, -(0.14 + i * 0.21) * elong);
      const taper = 1.0 - Math.pow(t, 1.35) * 0.72;
      const seg = new THREE.Mesh(geo.slitherSegment, i % 2 === 0 ? bodyMat : accentMat);
      seg.scale.set(taper * 0.94, taper * 0.86, 0.94 * elong);
      seg.castShadow = true;
      pivot.add(seg);

      // Luminous lateral dorsal stripe nodules along the serpent spine
      if (i % 2 === 0 && i < segCount - 2) {
        const node = new THREE.Mesh(geo.sporeOrb, glowMat);
        node.position.set(0, 0.15 * taper, 0);
        node.scale.setScalar(0.42 * taper);
        pivot.add(node);
      }

      spineContainer.add(pivot);
      segments.push({ pivot, index: i });
    }

    headZ = 0.44;
    headY = 0.08;
    tailZ = -0.14 * elong;
  } else {
    // spring_bouncer: bulbous elastic hopper torso + twin powerful coiled hind spring-legs!
    const torso = new THREE.Mesh(geo.bouncerBody, bodyMat);
    torso.position.set(0, 0.2, 0);
    torso.castShadow = true;
    bodyRoot.add(torso);

    // Twin powerful spring-hopper legs
    for (const side of [-1, 1]) {
      const thighPivot = new THREE.Group();
      thighPivot.position.set(side * 0.22, 0.12, -0.06);
      thighPivot.rotation.x = -0.65;
      thighPivot.rotation.z = side * 0.22;
      const thigh = new THREE.Mesh(geo.bouncerThigh, accentMat);
      thigh.scale.setScalar(genome.limbSpan * 0.95);
      thigh.castShadow = true;
      thighPivot.add(thigh);

      const shinPivot = new THREE.Group();
      shinPivot.position.set(0, -0.32 * genome.limbSpan * 0.95, 0);
      shinPivot.rotation.x = 1.15;
      const shin = new THREE.Mesh(geo.bouncerShin, bodyMat);
      shin.scale.setScalar(genome.limbSpan * 0.95);
      shinPivot.add(shin);

      const footPad = new THREE.Mesh(geo.crawlerSegment, glowMat);
      footPad.position.set(0, -0.4 * genome.limbSpan * 0.95, 0.06);
      footPad.scale.set(0.32, 0.22, 0.52);
      shinPivot.add(footPad);

      thighPivot.add(shinPivot);
      bodyRoot.add(thighPivot);
      springLegs.push({ thighPivot, shinPivot, side });
    }

    // Balancing counter-tail
    tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.14, -0.32);
    const tail = new THREE.Mesh(geo.tailFrond, accentMat);
    tail.rotation.x = -Math.PI * 0.36;
    tail.scale.set(0.75, 0.95, 0.75);
    tailPivot.add(tail);
    bodyRoot.add(tailPivot);

    headZ = 0.38;
    headY = 0.34;
    tailZ = -0.44;
  }

  // === COMPOSABLE EYES (layered or stalked) ===
  const hasStalkedEyes = genome.appendage === 'stalked_eyes';
  const eyeScale = genome.sensoryOrgan === 'binocular_eyes' ? 1.25 : 0.95;
  for (const side of [-1, 1]) {
    if (hasStalkedEyes) {
      const stalkPivot = new THREE.Group();
      stalkPivot.position.set(side * 0.12, headY + 0.08, headZ - 0.1);
      stalkPivot.rotation.z = -side * 0.32;
      stalkPivot.rotation.x = 0.25;
      const stalk = new THREE.Mesh(geo.eyeStalk, accentMat);
      stalk.rotation.x = Math.PI;
      stalkPivot.add(stalk);
      const eye = buildLayeredEye(geo, eyeMat, corneaMat, socketMat, eyeScale);
      eye.position.set(0, 0.22, 0.03);
      stalkPivot.add(eye);
      bodyRoot.add(stalkPivot);
      eyeStalks.push({ pivot: stalkPivot, side });
    } else {
      const eye = buildLayeredEye(geo, eyeMat, corneaMat, socketMat, eyeScale);
      eye.position.set(side * 0.13, headY + 0.05, headZ - 0.12);
      eye.rotation.y = side * 0.32;
      bodyRoot.add(eye);
    }
  }

  // === COMPOSABLE APPENDAGES ===
  if (genome.appendage === 'membranous_wings' && genome.bodyPlan !== 'aerial_glider') {
    // Wing-like decorative/gliding dorsal flaps on walkers/bouncers!
    addWingsPair(0.05, headY + 0.1, genome.limbSpan * 0.72, 0);
  } else if (genome.appendage === 'dorsal_sail') {
    const sail = new THREE.Mesh(geo.dorsalSail, wingMat);
    if (isSerpentine && segments.length > 2) {
      sail.position.set(0, 0.16, 0);
      sail.scale.set(0.85, 0.95, 0.95);
      segments[2].pivot.add(sail);
    } else {
      sail.position.set(0, headY + 0.22, -0.05);
      sail.scale.set(1.0, 1.1, 1.15);
      bodyRoot.add(sail);
    }
  } else if (genome.appendage === 'whip_antennae' || genome.sensoryOrgan === 'chemo_antennae') {
    for (const side of [-1, 1]) {
      const aPivot = new THREE.Group();
      aPivot.position.set(side * 0.09, headY + 0.06, headZ - 0.04);
      aPivot.rotation.y = side * 0.35;
      aPivot.rotation.x = -0.25;
      const ant = new THREE.Mesh(geo.whipAntenna, accentMat);
      if (side === -1) ant.scale.x = -1;
      aPivot.add(ant);
      const tip = new THREE.Mesh(geo.sporeOrb, glowMat);
      tip.position.set(side * 0.16, 0.01, 0.55);
      tip.scale.setScalar(0.32);
      aPivot.add(tip);
      bodyRoot.add(aPivot);
      antennae.push({ pivot: aPivot, side });
    }
  } else if (genome.appendage === 'spore_plumes') {
    const plumeHost = isSerpentine && segments.length > 1 ? segments[1].pivot : bodyRoot;
    for (const side of [-1, 1]) {
      const plume = new THREE.Mesh(geo.sporePlume, wingMat);
      if (isSerpentine) {
        plume.position.set(side * 0.11, 0.12, 0);
      } else {
        plume.position.set(side * 0.12, headY + 0.14, -0.15);
      }
      plume.rotation.z = -side * 0.55;
      plume.rotation.x = -0.4;
      plume.scale.setScalar(0.45);
      plumeHost.add(plume);
    }
  } else if (genome.appendage === 'prehension_claws') {
    for (const side of [-1, 1]) {
      const cPivot = new THREE.Group();
      cPivot.position.set(side * 0.18, headY - 0.05, headZ - 0.05);
      const claw = new THREE.Mesh(geo.prehensionClaw, accentMat);
      if (side === -1) claw.scale.x = -1;
      cPivot.add(claw);
      bodyRoot.add(cPivot);
      mandibles.push({ pivot: cPivot, side, baseY: side * 0.18 });
    }
  } else if (genome.appendage === 'tail_fronds' && !tailPivot) {
    tailPivot = new THREE.Group();
    const frond = new THREE.Mesh(geo.tailFrond, wingMat);
    frond.rotation.x = -Math.PI * 0.5;
    frond.scale.setScalar(0.75);
    tailPivot.add(frond);
    if (isSerpentine && segments.length > 0) {
      tailPivot.position.set(0, 0.0, tailZ);
      segments[segments.length - 1].pivot.add(tailPivot);
    } else {
      tailPivot.position.set(0, headY - 0.04, tailZ);
      bodyRoot.add(tailPivot);
    }
  }

  // === COMPOSABLE FUNCTIONAL PARTS ===
  if (genome.functionalPart === 'crushing_mandibles' || genome.diet === 'Carnivore') {
    for (const side of [-1, 1]) {
      const mPivot = new THREE.Group();
      mPivot.position.set(side * 0.09, headY - 0.04, headZ);
      const jaw = new THREE.Mesh(geo.mandible, accentMat);
      if (side === -1) jaw.scale.x = -1;
      mPivot.add(jaw);
      bodyRoot.add(mPivot);
      mandibles.push({ pivot: mPivot, side, baseY: side * 0.25 });
    }
  }
  if (genome.functionalPart === 'proboscis' || genome.diet === 'Nectarivore') {
    const prob = new THREE.Mesh(geo.proboscis, glowMat);
    prob.position.set(0, headY - 0.04, headZ);
    prob.rotation.x = 0.22;
    bodyRoot.add(prob);
  }
  if (genome.functionalPart === 'biolum_lure') {
    lurePivot = new THREE.Group();
    lurePivot.position.set(0, headY + 0.1, headZ - 0.14);
    const stem = new THREE.Mesh(geo.biolumLure, accentMat);
    stem.rotation.x = -0.5;
    lurePivot.add(stem);
    const orb = new THREE.Mesh(geo.sporeOrb, glowMat);
    orb.position.set(0.14, 0.2, 0.36);
    orb.scale.setScalar(0.75);
    lurePivot.add(orb);
    bodyRoot.add(lurePivot);
  }
  if (genome.functionalPart === 'chitin_spines' || isSpined) {
    if (isSerpentine && segments.length > 3) {
      for (let s = 0; s < 4 && s + 1 < segments.length - 1; s++) {
        const sp = new THREE.Mesh(geo.chitinSpine, accentMat);
        sp.position.set(0, 0.14, 0);
        sp.rotation.x = -0.85;
        sp.scale.setScalar(0.88 - s * 0.08);
        segments[s + 1].pivot.add(sp);
      }
    } else {
      for (let s = 0; s < 4; s++) {
        const sp = new THREE.Mesh(geo.chitinSpine, accentMat);
        sp.position.set(0, headY + 0.14, 0.22 - s * 0.18);
        sp.rotation.x = -0.85;
        bodyRoot.add(sp);
      }
    }
  }
  if (genome.functionalPart === 'venom_stinger') {
    const stinger = new THREE.Mesh(geo.venomStinger, glowMat);
    stinger.rotation.y = Math.PI;
    stinger.rotation.x = -0.55;
    if (isSerpentine && segments.length > 0) {
      stinger.position.set(0, 0.04, tailZ);
      segments[segments.length - 1].pivot.add(stinger);
    } else {
      stinger.position.set(0, headY + 0.06, tailZ);
      bodyRoot.add(stinger);
    }
  }
  if (genome.functionalPart === 'vocal_sac') {
    vocalSacMesh = new THREE.Mesh(geo.vocalSac, glowMat);
    vocalSacMesh.position.set(0, headY - 0.12, headZ - 0.12);
    bodyRoot.add(vocalSacMesh);
  }
  if (genome.functionalPart === 'armored_plates') {
    if (isSerpentine && segments.length > 3) {
      for (const idx of [1, 3]) {
        const plate = new THREE.Mesh(geo.armorPlate, accentMat);
        plate.position.set(0, 0.1, 0);
        plate.scale.set(0.72, 0.62, 0.85);
        segments[idx].pivot.add(plate);
      }
    } else {
      const plate = new THREE.Mesh(geo.armorPlate, accentMat);
      plate.position.set(0, headY + 0.12, 0.02);
      plate.scale.set(0.88, 0.72, 1.15);
      bodyRoot.add(plate);
    }
  }
  if (genome.functionalPart === 'pollen_baskets' || genome.diet === 'Nectarivore') {
    const polMat = new THREE.MeshStandardMaterial({
      color: 0xffe46b,
      emissive: 0xffc83b,
      emissiveIntensity: 0.75,
      roughness: 0.4,
    });
    materials.push(polMat);
    const pollenHost = isSerpentine && segments.length > 1 ? segments[1].pivot : bodyRoot;
    for (const side of [-1, 1]) {
      const pb = new THREE.Mesh(geo.pollenBasket, polMat);
      pb.position.set(side * 0.18, isSerpentine ? 0.0 : headY - 0.08, isSerpentine ? 0 : -0.14);
      pb.visible = false;
      pollenHost.add(pb);
      pollenMeshes.push(pb);
    }
  }

  // Mouth-held morsel when chewing
  const morselGroup = new THREE.Group();
  morselGroup.position.set(0, headY - 0.05, headZ + 0.1);
  morselGroup.visible = false;
  const fleshMorselMesh = new THREE.Mesh(geo.fleshMorsel, morselMat);
  const floraMorselMesh = new THREE.Mesh(geo.floraShred, morselMat);
  floraMorselMesh.scale.setScalar(0.32);
  morselGroup.add(fleshMorselMesh, floraMorselMesh);
  bodyRoot.add(morselGroup);

  const baseBodyScale = new THREE.Vector3(1.0, 1.0, isSerpentine ? 1.0 : genome.bodyElongation);
  bodyRoot.scale.copy(baseBodyScale);

  disableFrustumCulling(group);

  return {
    group,
    bodyRoot,
    spineContainer,
    isSerpentine,
    materials,
    bodyMat,
    accentMat,
    glowMat,
    wingMat,
    segments,
    wings,
    legs,
    springLegs,
    antennae,
    mandibles,
    eyeStalks,
    lurePivot,
    vocalSacMesh,
    pollenMeshes,
    tailPivot,
    morselGroup,
    fleshMorselMesh,
    floraMorselMesh,
    morselMat,
    baseEmissive,
    glowEmissive,
    baseBodyScale,
    baseColor,
  };
}

const _tmpCol = new THREE.Color();
const _invGroupQuat = new THREE.Quaternion();
const _segWorldQuat = new THREE.Quaternion();
const _segLocalPos = new THREE.Vector3();
const _segFwd = new THREE.Vector3();
const _segAhead = new THREE.Vector3();
const _segBehind = new THREE.Vector3();
const _segUp = new THREE.Vector3();
const _segRight = new THREE.Vector3();
const _segMat = new THREE.Matrix4();
const _wUp = new THREE.Vector3(0, 1, 0);
const _altUp = new THREE.Vector3(0, 0, 1);

export function updateAnimalRig(
  rig: ArticulatedAnimalRig,
  a: AnimalEntity,
  simTime: number,
  daylight: number
): void {
  rig.group.position.copy(a.position);
  rig.group.quaternion.copy(a.quaternion);
  const emergeScale = a.emergeAnim > 0.001 ? 1.0 - 0.82 * a.emergeAnim * a.emergeAnim : 1.0;
  rig.group.scale.setScalar(Math.max(0.01, a.scale * emergeScale));

  const g = a.genome;

  // Dynamic body squash-and-stretch (for bouncing hoppers & lunging predators)
  let sx = rig.baseBodyScale.x;
  let sy = rig.baseBodyScale.y;
  let sz = rig.baseBodyScale.z;

  if (g.locomotion === 'bouncing') {
    if (a.hopCrouch > 0.01) {
      sy *= 1.0 - a.hopCrouch * 0.34;
      sx *= 1.0 + a.hopCrouch * 0.22;
      sz *= 1.0 + a.hopCrouch * 0.16;
    } else if (a.hopSquash > 0.01) {
      sy *= 1.0 - a.hopSquash * 0.28;
      sx *= 1.0 + a.hopSquash * 0.22;
      sz *= 1.0 + a.hopSquash * 0.18;
    } else if (!a.grounded) {
      const stretch = clamp(Math.abs(a.velocity.y) * 0.045, 0, 0.26);
      sy *= 1.0 + stretch;
      sx *= 1.0 - stretch * 0.45;
    }
  }
  if (a.lungeAnim > 0.01) {
    sz *= 1.0 + a.lungeAnim * 0.24;
  }
  rig.bodyRoot.scale.set(sx, sy, sz);

  // 1. Flying wing articulation (primary + secondary pair with outer tip lag)
  if (rig.wings.length > 0) {
    const perched = a.perchTimer > 0;
    for (let i = 0; i < rig.wings.length; i++) {
      const w = rig.wings[i];
      const phase = a.wingPhase - w.pairIndex * 0.65;
      if (perched) {
        w.innerPivot.rotation.z = w.side * 0.95 + Math.sin(phase) * 0.08;
        w.outerPivot.rotation.z = w.side * 0.35;
      } else {
        const amp = g.locomotion === 'flying' ? 0.68 : 0.26;
        const flap = Math.sin(phase) * amp;
        const outerLag = Math.sin(phase - 0.72) * amp * 0.55;
        w.innerPivot.rotation.z = flap * w.side;
        w.outerPivot.rotation.z = outerLag * w.side;
      }
    }
  }

  // 2. Walking & Crawling articulated leg stride wave
  if (rig.legs.length > 0) {
    const moveAmp = clamp(a.speedRatio, 0.08, 1.35);
    const isCrawler = g.locomotion === 'crawling';
    for (let i = 0; i < rig.legs.length; i++) {
      const leg = rig.legs[i];
      const wave = a.gaitPhase + (isCrawler ? leg.row * 0.95 + (leg.side === 1 ? 0 : Math.PI) : leg.phaseOffset);
      const stride = Math.sin(wave) * (isCrawler ? 0.38 : 0.52) * moveAmp;
      const lift = Math.max(0, Math.cos(wave)) * (isCrawler ? 0.22 : 0.38) * moveAmp;
      leg.upperPivot.rotation.x = stride;
      leg.upperPivot.rotation.z = leg.side * (isCrawler ? 0.85 : 0.55) - leg.side * lift;
      leg.lowerPivot.rotation.z = -leg.side * (0.55 + lift * 0.5);
    }
  }

  // 3. Bouncing spring-legs extension & crouch compression
  if (rig.springLegs.length > 0) {
    for (let i = 0; i < rig.springLegs.length; i++) {
      const sl = rig.springLegs[i];
      if (!a.grounded) {
        // Extended legs mid-leap!
        sl.thighPivot.rotation.x = -0.18;
        sl.shinPivot.rotation.x = 0.28;
      } else {
        const crouch = a.hopCrouch * 0.55 + a.hopSquash * 0.35;
        sl.thighPivot.rotation.x = -0.68 - crouch;
        sl.shinPivot.rotation.x = 1.2 + crouch * 1.1;
      }
    }
  }

  // 4. Serpentine slithering & armored crawler segment undulation
  if (rig.segments.length > 0) {
    if (rig.isSerpentine && a.slitherSpine && a.slitherSpine.length >= rig.segments.length + 1) {
      // World-space zero-slip path-following serpentine spine transformed into rig.group local space
      _invGroupQuat.copy(a.quaternion).invert();
      const invScale = 1.0 / Math.max(0.01, a.scale);
      const spine = a.slitherSpine;

      for (let i = 0; i < rig.segments.length; i++) {
        const s = rig.segments[i];
        const prevPos = spine[i];
        const worldPos = spine[i + 1];
        const nextPos = i + 2 < spine.length ? spine[i + 2] : null;

        // Smooth centered spine tangent pointing toward the head
        if (nextPos) {
          _segFwd.subVectors(prevPos, nextPos);
        } else {
          _segFwd.subVectors(prevPos, worldPos);
        }
        if (!safeNormalize(_segFwd)) {
          _segFwd.set(0, 0, 1).applyQuaternion(a.quaternion);
        }

        // Subtle flank banking/roll driven by local horizontal S-curve bend
        let roll = 0;
        if (nextPos) {
          _segAhead.subVectors(prevPos, worldPos);
          _segBehind.subVectors(worldPos, nextPos);
          const lenA = Math.hypot(_segAhead.x, _segAhead.z);
          const lenB = Math.hypot(_segBehind.x, _segBehind.z);
          if (lenA > 1e-4 && lenB > 1e-4) {
            const crossY = (_segAhead.x * _segBehind.z - _segAhead.z * _segBehind.x) / (lenA * lenB);
            roll = clamp(crossY * 0.52, -0.26, 0.26);
          }
        }

        // Terrain-conforming surface normal (blending smoothly toward world up when airborne from cairn)
        const segFloor = getTerrainHeight(worldPos.x, worldPos.z);
        const airBlend = clamp((worldPos.y - segFloor - 0.28 * a.scale) / 0.85, 0, 1);
        getTerrainNormal(worldPos.x, worldPos.z, _segUp);
        if (airBlend > 0.001) {
          _segUp.lerp(_wUp, airBlend).normalize();
        }

        const upRef = Math.abs(_segFwd.dot(_segUp)) > 0.95 ? _altUp : _segUp;
        _segRight.crossVectors(upRef, _segFwd);
        if (!safeNormalize(_segRight)) _segRight.set(1, 0, 0);
        _segUp.crossVectors(_segFwd, _segRight);
        safeNormalize(_segUp);

        if (Math.abs(roll) > 1e-4) {
          const c = Math.cos(roll);
          const sn = Math.sin(roll);
          const rx = _segRight.x * c + _segUp.x * sn;
          const ry = _segRight.y * c + _segUp.y * sn;
          const rz = _segRight.z * c + _segUp.z * sn;
          const ux = _segUp.x * c - _segRight.x * sn;
          const uy = _segUp.y * c - _segRight.y * sn;
          const uz = _segUp.z * c - _segRight.z * sn;
          _segRight.set(rx, ry, rz);
          _segUp.set(ux, uy, uz);
        }

        _segMat.makeBasis(_segRight, _segUp, _segFwd);
        _segWorldQuat.setFromRotationMatrix(_segMat);

        _segLocalPos.subVectors(worldPos, a.position).applyQuaternion(_invGroupQuat).multiplyScalar(invScale);
        s.pivot.position.copy(_segLocalPos);
        s.pivot.quaternion.copy(_invGroupQuat).multiply(_segWorldQuat);
      }
    } else if (!rig.isSerpentine) {
      const amp = 0.08 * (0.35 + clamp(a.speedRatio, 0, 1.3) * 0.75);
      for (let i = 0; i < rig.segments.length; i++) {
        const s = rig.segments[i];
        const wave = Math.sin(a.slitherPhase - s.index * 0.68);
        s.pivot.position.x = wave * amp * 0.45;
      }
    }
  }

  // 5. Antennae, eye stalks, mandibles, tail, lure & vocal sac
  for (let i = 0; i < rig.antennae.length; i++) {
    const ant = rig.antennae[i];
    ant.pivot.rotation.x = -0.25 + Math.sin(simTime * 5.2 + a.id + ant.side) * 0.14;
    ant.pivot.rotation.y = ant.side * (0.35 + Math.cos(simTime * 3.8 + a.id) * 0.12);
  }
  for (let i = 0; i < rig.eyeStalks.length; i++) {
    const es = rig.eyeStalks[i];
    es.pivot.rotation.z = -es.side * (0.32 + Math.sin(simTime * 2.6 + a.id) * 0.08);
  }
  for (let i = 0; i < rig.mandibles.length; i++) {
    const m = rig.mandibles[i];
    const open = a.jawGape * 0.48 + (a.mouthMorselTimer > 0 ? Math.abs(Math.sin(a.chewPhase)) * 0.25 : 0);
    m.pivot.rotation.y = m.baseY + m.side * open;
  }
  if (rig.tailPivot) {
    rig.tailPivot.rotation.y = rig.isSerpentine
      ? Math.sin(a.slitherPhase - rig.segments.length * 0.55) * 0.22
      : Math.sin(a.wingPhase * 0.75 + a.gaitPhase * 0.5) * 0.26;
  }
  if (rig.lurePivot) {
    rig.lurePivot.rotation.z = Math.sin(simTime * 3.2 + a.id) * 0.16;
  }
  if (rig.vocalSacMesh) {
    const pulse = 1.0 + (a.courtshipAnim * 0.65 + (a.alarmCooldown > 4.5 ? 0.5 : 0) + Math.sin(simTime * 4 + a.id) * 0.12);
    rig.vocalSacMesh.scale.setScalar(pulse);
  }

  // Visible glowing pollen baskets when carrying pollen/spores!
  const hasPollen = a.pollenTimer > 0.1;
  for (let i = 0; i < rig.pollenMeshes.length; i++) {
    rig.pollenMeshes[i].visible = hasPollen;
    if (hasPollen) {
      rig.pollenMeshes[i].scale.setScalar(0.85 + Math.sin(simTime * 6 + i) * 0.15);
    }
  }

  // Mouth-held chewed morsel
  if (a.mouthMorselTimer > 0) {
    rig.morselGroup.visible = true;
    rig.morselMat.color.setHex(a.mouthMorselColor);
    const isFlora = a.mouthMorselKind === 'flora';
    rig.fleshMorselMesh.visible = !isFlora;
    rig.floraMorselMesh.visible = isFlora;
    const chewScale = clamp(a.mouthMorselTimer / Math.max(0.1, a.mouthMorselMaxTimer), 0.25, 1.0);
    rig.morselGroup.scale.setScalar(chewScale);
    rig.morselGroup.rotation.y = a.chewPhase * 0.5;
  } else {
    rig.morselGroup.visible = false;
  }

  // Bioluminescence, molt flash, courtship shimmer, hit flash & elder weathering
  const nightGlow = 1.0 + (1.0 - daylight) * 0.95;
  const specialFlash = a.hitFlash * 2.8 + a.moltAnim * 1.45 + a.courtshipAnim * 1.35 + a.emergeAnim * 1.75;
  const elderDim = 1.0 - a.elderRatio * 0.45;
  rig.bodyMat.emissiveIntensity = (rig.baseEmissive * nightGlow * elderDim) + specialFlash;
  rig.glowMat.emissiveIntensity = (rig.glowEmissive * nightGlow * elderDim) + specialFlash * 1.25;

  // Elder organisms subtly shift toward silvered/weathered tones in old age
  _tmpCol.copy(rig.baseColor);
  if (a.elderRatio > 0.01) {
    _tmpCol.lerp(new THREE.Color(0x9ca3af), a.elderRatio * 0.36);
  }
  if (a.hitFlash > 0.05) {
    _tmpCol.lerp(new THREE.Color(0xff5566), clamp(a.hitFlash * 2.2, 0, 0.7));
  }
  rig.bodyMat.color.copy(_tmpCol);
}

export function updateCorpseRig(rig: ArticulatedAnimalRig, c: CorpseEntity): void {
  rig.group.position.copy(c.position);
  rig.group.quaternion.copy(c.quaternion);
  const jolt = 1.0 + c.joltAnim * 0.08;
  rig.group.scale.set(c.scale * jolt, c.scale / jolt, c.scale * jolt);

  rig.morselGroup.visible = false;
  for (let i = 0; i < rig.pollenMeshes.length; i++) rig.pollenMeshes[i].visible = false;

  // Pale desaturated decaying tones as corpse decomposes
  const decay = c.phase === 'dying' ? 0.25 : c.phase === 'settling' ? 0.5 : 0.78;
  _tmpCol.copy(rig.baseColor).lerp(new THREE.Color(0x52584f), decay);
  rig.bodyMat.color.copy(_tmpCol);
  rig.bodyMat.emissiveIntensity = 0.03 * c.opacity;
  rig.glowMat.emissiveIntensity = 0.05 * c.opacity;

  for (let i = 0; i < rig.materials.length; i++) {
    const m = rig.materials[i];
    if ('opacity' in m) {
      m.transparent = true;
      (m as THREE.MeshPhysicalMaterial).opacity = c.opacity;
    }
  }
}
