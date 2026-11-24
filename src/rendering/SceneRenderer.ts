import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  clamp,
  clampXZToTerrariumRadius,
  computeDaylightFactor,
  disableFrustumCulling,
  getTerrainHeight,
  isFiniteVec3,
} from '../core/math';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { Entity } from '../simulation/types';
import {
  createAnimalRig,
  updateAnimalRig,
  updateCorpseRig,
  type ArticulatedAnimalRig,
} from './AnimalMeshBuilder';
import { CreatureEyeSystem } from './CreatureEyeSystem';
import { buildTerrariumEnvironment, type EnvironmentRig } from './EnvironmentBuilder';
import { getGeometryLibrary } from './GeometryLibrary';
import { InstancedFxRenderer } from './InstancedFxRenderer';
import { createPlantRig, updatePlantRig, type PlantRig } from './PlantMeshBuilder';
import { createSharedUniforms, type SharedShaderUniforms } from './Shaders';
import { VivariumPostFX } from './VivariumPostFX';

interface SimpleRig {
  group: THREE.Group;
  materials: THREE.Material[];
  embryoMesh?: THREE.Mesh;
}

/**
 * Procedural humid alien cloud-forest IBL environment cubemap via PMREMGenerator
 * for realistic iridescent wings, glistening chitin, damp moss, and fungal caps.
 */
function buildTerrariumEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const domeGeo = new THREE.SphereGeometry(20, 40, 24);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 soil = vec3(0.08, 0.14, 0.09);
        vec3 horizon = vec3(0.18, 0.42, 0.36);
        vec3 zenith = vec3(0.46, 0.82, 0.78);
        vec3 col = y < 0.0
          ? mix(horizon, soil, pow(-y, 0.6))
          : mix(horizon, zenith, pow(y, 0.58));

        vec3 sunDir = normalize(vec3(0.32, 0.88, 0.34));
        float sunDot = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(2.4, 2.2, 1.6) * pow(sunDot, 36.0);
        col += vec3(0.35, 0.85, 0.62) * pow(sunDot, 5.0) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  const rt = pmrem.fromScene(envScene, 0.04);
  domeGeo.dispose();
  domeMat.dispose();
  pmrem.dispose();
  return rt.texture;
}

export class SceneRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly sharedUniforms: SharedShaderUniforms;
  readonly envRig: EnvironmentRig;
  readonly fx: InstancedFxRenderer;
  readonly eyeSystem: CreatureEyeSystem;
  private readonly postFx: VivariumPostFX;

  selectedEntity: Entity | null = null;
  followCam = false;
  feedMode = false;

  private camLerpPos: THREE.Vector3 | null = null;
  private camLerpTarget: THREE.Vector3 | null = null;

  private readonly sim: SimulationEngine;
  private readonly animalRigs = new Map<number, ArticulatedAnimalRig>();
  private readonly plantRigs = new Map<number, PlantRig>();
  private readonly simpleRigs = new Map<number, SimpleRig>();
  private readonly nutrientMeshes = new Map<number, THREE.Mesh>();
  private readonly selectionRing: THREE.Mesh;

  private readonly pointerDownPos = new THREE.Vector2();
  private readonly _ray = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private readonly _v1 = new THREE.Vector3();
  private readonly _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
  private readonly _planeHit = new THREE.Vector3();

  constructor(container: HTMLElement, sim: SimulationEngine) {
    this.sim = sim;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c2420);
    this.scene.fog = new THREE.FogExp2(0x0f2a24, 0.026);

    this.camera = new THREE.PerspectiveCamera(54, w / h, 0.12, 160);
    this.camera.position.set(0, 7.2, 15.8);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.scene.environment = buildTerrariumEnvMap(this.renderer);
    this.scene.environmentIntensity = 0.92;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.target.set(0, 2.2, -0.8);
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 25.0;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minPolarAngle = 0.14;

    this.sharedUniforms = createSharedUniforms();
    this.envRig = buildTerrariumEnvironment(this.scene, this.sharedUniforms);
    this.fx = new InstancedFxRenderer(this.scene, this.sharedUniforms);
    this.eyeSystem = new CreatureEyeSystem(w / h);
    this.postFx = new VivariumPostFX(this.renderer, this.sharedUniforms, w, h);

    const rGeo = new THREE.RingGeometry(0.46, 0.56, 40);
    rGeo.rotateX(-Math.PI * 0.5);
    this.selectionRing = new THREE.Mesh(
      rGeo,
      new THREE.MeshBasicMaterial({
        color: 0x5ef7b8,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.selectionRing.visible = false;
    this.selectionRing.frustumCulled = false;
    this.scene.add(this.selectionRing);

    this.bindEvents();
    this.bindPointer();
    window.addEventListener('resize', () => this.onResize());
  }

  private bindEvents(): void {
    const ev = this.sim.events;

    ev.on('fx:burst', ({ position, colorHex, count, speed }) => {
      this.fx.spawnBurst(position, colorHex, count, speed);
    });

    ev.on('fx:fragments', ({ position, colorHex, accentHex, kind, count, speed, suctionTarget, ejectDir }) => {
      this.fx.spawnFragments(position, colorHex, kind, count, speed, accentHex, suctionTarget, ejectDir);
    });

    ev.on('fx:shockwave', ({ position, colorHex, maxScale }) => {
      this.fx.spawnShockwave(position, colorHex, maxScale);
    });

    ev.on('ecosystem:reset', () => {
      this.fx.clear();
      for (const m of this.nutrientMeshes.values()) {
        this.scene.remove(m);
        (m.material as THREE.Material).dispose();
      }
      this.nutrientMeshes.clear();
    });

    ev.on('entity:spawned', ({ entity }) => {
      this.createRigForEntity(entity);
    });

    ev.on('entity:morphed', ({ from, to }) => {
      const rig = this.animalRigs.get(from.id);
      if (rig) {
        this.attachEntityRef(rig.group, to);
        for (const m of rig.materials) m.transparent = true;
      }
      if (this.selectedEntity === from) {
        this.selectedEntity = to;
        this.sim.events.emit('selection:changed', { entity: to });
      }
    });

    ev.on('entity:disposed', ({ entity }) => {
      this.disposeRigForEntity(entity);
      if (this.selectedEntity === entity) {
        const wasEye = this.eyeSystem.mode !== 'off';
        this.selectEntity(null);
        if (wasEye) {
          this.sim.events.emit('toast', { message: 'Organism returned to soil — restored terrarium view' });
        }
      }
    });
  }

  private bindPointer(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.pointerDownPos.set(e.clientX, e.clientY);
    });

    el.addEventListener('pointerup', (e) => {
      const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (dist > 6) return;

      const rect = el.getBoundingClientRect();
      this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this._ray.setFromCamera(this._ndc, this.camera);

      if (this.feedMode) {
        if (this._ray.ray.intersectPlane(this._groundPlane, this._planeHit)) {
          const [cx, cz] = clampXZToTerrariumRadius(this._planeHit.x, this._planeHit.z, 1.0);
          const y = getTerrainHeight(cx, cz) + 4.5;
          this.sim.dropFoodPellet(new THREE.Vector3(cx, y, cz));
        }
        return;
      }

      const pickRoots: THREE.Object3D[] = [];
      for (const r of this.animalRigs.values()) pickRoots.push(r.group);
      for (const r of this.plantRigs.values()) pickRoots.push(r.group);
      for (const r of this.simpleRigs.values()) pickRoots.push(r.group);

      const hits = this._ray.intersectObjects(pickRoots, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.entityRef) {
          obj = obj.parent;
        }
        if (obj?.userData.entityRef) {
          this.selectEntity(obj.userData.entityRef as Entity);
          return;
        }
      }
    });
  }

  private attachEntityRef(root: THREE.Object3D, entity: Entity): void {
    root.userData.entityRef = entity;
    root.traverse((c) => {
      c.userData.entityRef = entity;
    });
  }

  private createRigForEntity(entity: Entity): void {
    if (entity.kind === 'animal') {
      const rig = createAnimalRig(entity.genome, this.sharedUniforms);
      this.attachEntityRef(rig.group, entity);
      rig.group.position.copy(entity.position);
      rig.group.quaternion.copy(entity.quaternion);
      rig.group.scale.setScalar(entity.scale);
      this.scene.add(rig.group);
      this.animalRigs.set(entity.id, rig);
    } else if (entity.kind === 'plant') {
      const rig = createPlantRig(entity.genome, this.sharedUniforms);
      this.attachEntityRef(rig.group, entity);
      rig.group.position.copy(entity.position);
      rig.group.quaternion.copy(entity.quaternion);
      rig.group.scale.setScalar(entity.scale);
      this.scene.add(rig.group);
      this.plantRigs.set(entity.id, rig);
    } else {
      const geo = getGeometryLibrary();
      const group = new THREE.Group();
      const materials: THREE.Material[] = [];
      let embryoMesh: THREE.Mesh | undefined;

      if (entity.kind === 'egg') {
        const shellMat = new THREE.MeshPhysicalMaterial({
          color: entity.genome.accentHex,
          roughness: 0.14,
          clearcoat: 1.0,
          transparent: true,
          opacity: 0.62,
          emissive: new THREE.Color(entity.genome.glowHex),
          emissiveIntensity: 0.35,
        });
        const embMat = new THREE.MeshStandardMaterial({
          color: entity.genome.glowHex,
          emissive: new THREE.Color(entity.genome.glowHex),
          emissiveIntensity: 0.9,
        });
        materials.push(shellMat, embMat);
        group.add(new THREE.Mesh(geo.eggShell, shellMat));
        embryoMesh = new THREE.Mesh(geo.eggEmbryo, embMat);
        group.add(embryoMesh);
      } else if (entity.kind === 'propagule') {
        const pMat = new THREE.MeshStandardMaterial({
          color: entity.genome.glowHex,
          emissive: new THREE.Color(entity.genome.glowHex),
          emissiveIntensity: 0.95,
          roughness: 0.3,
        });
        materials.push(pMat);
        group.add(new THREE.Mesh(entity.isSeed ? geo.seedPod : geo.sporeOrb, pMat));
      } else if (entity.kind === 'pellet') {
        const mat = new THREE.MeshStandardMaterial({
          color: entity.colorHex,
          emissive: new THREE.Color(entity.colorHex),
          emissiveIntensity: entity.origin === 'pellet' ? 0.45 : 0.15,
          roughness: 0.45,
          transparent: true,
          opacity: 1.0,
        });
        materials.push(mat);
        const meshGeo =
          entity.origin === 'flora'
            ? geo.floraShred
            : entity.origin === 'fungus'
            ? geo.fungusChunk
            : geo.fleshMorsel;
        const m = new THREE.Mesh(meshGeo, mat);
        if (entity.origin === 'flora') m.scale.setScalar(0.32);
        m.scale.multiply(entity.stretch);
        group.add(m);
      }

      disableFrustumCulling(group);
      this.attachEntityRef(group, entity);
      group.position.copy(entity.position);
      group.scale.setScalar(entity.scale);
      this.scene.add(group);
      this.simpleRigs.set(entity.id, { group, materials, embryoMesh });
    }
  }

  private disposeRigForEntity(entity: Entity): void {
    const aRig = this.animalRigs.get(entity.id);
    if (aRig) {
      this.scene.remove(aRig.group);
      for (const m of aRig.materials) m.dispose();
      this.animalRigs.delete(entity.id);
      return;
    }
    const pRig = this.plantRigs.get(entity.id);
    if (pRig) {
      this.scene.remove(pRig.group);
      for (const m of pRig.materials) m.dispose();
      this.plantRigs.delete(entity.id);
      return;
    }
    const sRig = this.simpleRigs.get(entity.id);
    if (sRig) {
      this.scene.remove(sRig.group);
      for (const m of sRig.materials) m.dispose();
      this.simpleRigs.delete(entity.id);
    }
  }

  selectEntity(entity: Entity | null): void {
    this.selectedEntity = entity;
    this.eyeSystem.resetSmoothing();
    if (!entity || !this.eyeSystem.canUseEyeView(entity)) {
      if (this.eyeSystem.mode !== 'off') this.eyeSystem.mode = 'off';
    }
    this.sim.events.emit('selection:changed', { entity });
  }

  focusOnEntity(entity: Entity): void {
    if (!entity.alive || !isFiniteVec3(entity.position)) return;
    this.camLerpTarget = entity.position.clone().add(new THREE.Vector3(0, 0.35, 0));
    this.camLerpPos = entity.position.clone().add(new THREE.Vector3(3.6, 2.5, 4.2));
  }

  private syncNutrientPatches(): void {
    const activeIds = new Set<number>();
    const geo = getGeometryLibrary();
    for (let i = 0; i < this.sim.nutrientPatches.length; i++) {
      const np = this.sim.nutrientPatches[i];
      if (!np.alive) continue;
      activeIds.add(np.id);
      let mesh = this.nutrientMeshes.get(np.id);
      if (!mesh) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x45f5b0,
          transparent: true,
          opacity: 0.28,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        mesh = new THREE.Mesh(geo.shockwaveRing, mat);
        mesh.position.copy(np.position);
        this.scene.add(mesh);
        this.nutrientMeshes.set(np.id, mesh);
      }
      const ratio = clamp(np.nutrients / Math.max(1, np.maxNutrients), 0, 1);
      mesh.scale.setScalar(np.radiusScale * (0.65 + ratio * 0.65));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.08 + ratio * 0.24;
    }

    for (const [id, mesh] of this.nutrientMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        this.nutrientMeshes.delete(id);
      }
    }
  }

  private onResize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.postFx.resize(w, h);
  }

  updateAndRender(
    realDt: number,
    pipViewportEl: HTMLElement | null,
    pipCanvasEl: HTMLCanvasElement | null,
    fullEyeCanvasEl: HTMLCanvasElement | null
  ): void {
    const daylight = computeDaylightFactor(this.sim.env.timeOfDay);
    this.envRig.update(
      realDt,
      this.sim.env.windStrength,
      this.sim.cairnPulseEnergy,
      daylight,
      this.sim.env.timeOfDay
    );
    this.fx.update(realDt);
    this.syncNutrientPatches();

    // Update animal, plant, corpse, and simple rigs
    for (let i = 0; i < this.sim.animals.length; i++) {
      const a = this.sim.animals[i];
      const rig = this.animalRigs.get(a.id);
      if (rig) updateAnimalRig(rig, a, this.sim.simTime, daylight);
    }
    for (let i = 0; i < this.sim.corpses.length; i++) {
      const c = this.sim.corpses[i];
      const rig = this.animalRigs.get(c.id);
      if (rig) updateCorpseRig(rig, c);
    }
    for (let i = 0; i < this.sim.plants.length; i++) {
      const p = this.sim.plants[i];
      const rig = this.plantRigs.get(p.id);
      if (rig) updatePlantRig(rig, p, this.sim.env.windStrength, daylight);
    }
    for (let i = 0; i < this.sim.eggs.length; i++) {
      const e = this.sim.eggs[i];
      const rig = this.simpleRigs.get(e.id);
      if (rig) {
        rig.group.position.copy(e.position);
        rig.group.scale.setScalar(e.scale);
        if (rig.embryoMesh) {
          rig.embryoMesh.rotation.y += realDt * 1.4;
        }
      }
    }
    for (let i = 0; i < this.sim.propagules.length; i++) {
      const pr = this.sim.propagules[i];
      const rig = this.simpleRigs.get(pr.id);
      if (rig) {
        rig.group.position.copy(pr.position);
        rig.group.scale.setScalar(pr.scale);
      }
    }
    for (let i = 0; i < this.sim.foodPellets.length; i++) {
      const fp = this.sim.foodPellets[i];
      const rig = this.simpleRigs.get(fp.id);
      if (rig) {
        rig.group.position.copy(fp.position);
        rig.group.quaternion.copy(fp.quaternion);
        rig.group.scale.setScalar(fp.scale);
        const mat = rig.materials[0] as THREE.MeshStandardMaterial | undefined;
        if (mat) mat.opacity = fp.opacity;
      }
    }

    // Selection halo ring
    if (this.selectedEntity && this.selectedEntity.alive) {
      this.selectionRing.visible = true;
      const p = this.selectedEntity.position;
      this.selectionRing.position.set(p.x, Math.max(getTerrainHeight(p.x, p.z) + 0.08, p.y - 0.12), p.z);
      const pulse = 1.0 + Math.sin(this.sim.simTime * 5.0) * 0.08;
      this.selectionRing.scale.setScalar(Math.max(0.6, this.selectedEntity.scale * 1.55) * pulse);
    } else {
      this.selectionRing.visible = false;
    }

    // Camera follow / smooth focus lerp
    if (this.followCam && this.selectedEntity && this.selectedEntity.alive) {
      this._v1.copy(this.selectedEntity.position).add(new THREE.Vector3(0, 0.35, 0));
      this.controls.target.lerp(this._v1, clamp(realDt * 5.0, 0, 1));
    } else if (this.camLerpPos && this.camLerpTarget) {
      const a = clamp(realDt * 4.5, 0, 1);
      this.camera.position.lerp(this.camLerpPos, a);
      this.controls.target.lerp(this.camLerpTarget, a);
      if (this.camera.position.distanceTo(this.camLerpPos) < 0.15) {
        this.camLerpPos = null;
        this.camLerpTarget = null;
      }
    }
    this.controls.update();

    // Render Fullscreen Creature Eye View OR Main Vivarium Scene + optional PiP Eye-Cam
    const eyeTarget = this.eyeSystem.canUseEyeView(this.selectedEntity) ? this.selectedEntity : null;
    if (this.eyeSystem.mode === 'fullscreen' && eyeTarget) {
      const rig = this.animalRigs.get(eyeTarget.id);
      if (rig) rig.group.visible = false;
      this.selectionRing.visible = false;

      this.eyeSystem.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      this.eyeSystem.updateCamera(eyeTarget, this.sim, realDt);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      this.renderer.render(this.scene, this.eyeSystem.camera);

      if (rig) rig.group.visible = true;
      if (fullEyeCanvasEl) {
        this.eyeSystem.drawSensoryOverlay(fullEyeCanvasEl, eyeTarget);
      }
      return;
    }

    const focusDist = this.camera.position.distanceTo(this.controls.target);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.postFx.render(this.scene, this.camera, focusDist);

    // Optional Picture-in-Picture Creature Eye-Cam
    if (this.eyeSystem.mode === 'pip' && eyeTarget && pipViewportEl) {
      const rect = pipViewportEl.getBoundingClientRect();
      if (rect.width > 12 && rect.height > 12) {
        const rig = this.animalRigs.get(eyeTarget.id);
        if (rig) rig.group.visible = false;
        this.selectionRing.visible = false;

        this.eyeSystem.camera.aspect = rect.width / rect.height;
        this.eyeSystem.updateCamera(eyeTarget, this.sim, realDt);

        const bottom = window.innerHeight - rect.bottom;
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(rect.left, bottom, rect.width, rect.height);
        this.renderer.setViewport(rect.left, bottom, rect.width, rect.height);
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.eyeSystem.camera);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);

        if (rig) rig.group.visible = true;
        if (pipCanvasEl) {
          this.eyeSystem.drawSensoryOverlay(pipCanvasEl, eyeTarget);
        }
      }
    }
  }
}
