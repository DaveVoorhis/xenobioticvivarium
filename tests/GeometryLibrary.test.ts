import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { createAnimalGenome } from '../src/genetics/AnimalGenetics';
import { createPlantGenome } from '../src/genetics/PlantGenetics';
import { ANIMAL_BODY_PLANS, FLORA_FORMS } from '../src/genetics/taxonomy';
import { createAnimalRig, updateAnimalRig } from '../src/rendering/AnimalMeshBuilder';
import { getGeometryLibrary } from '../src/rendering/GeometryLibrary';
import { createPlantRig, updatePlantRig } from '../src/rendering/PlantMeshBuilder';
import { createSharedUniforms } from '../src/rendering/Shaders';
import { SimulationEngine } from '../src/simulation/SimulationEngine';

describe('GeometryLibrary & Procedural Rigs', () => {
  it('builds valid non-empty finite BufferGeometries for all procedural fauna, flora, fungi, and FX primitives', () => {
    const lib = getGeometryLibrary();
    const entries = Object.entries(lib);
    expect(entries.length).toBeGreaterThan(20);

    for (const [name, geo] of entries) {
      expect(geo, `${name} should be a BufferGeometry`).toBeInstanceOf(THREE.BufferGeometry);
      const pos = geo.attributes.position;
      expect(pos, `${name} should have position attribute`).toBeDefined();
      expect(pos.count, `${name} should have vertices`).toBeGreaterThan(2);

      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i)), `${name} pos.x[${i}] finite`).toBe(true);
        expect(Number.isFinite(pos.getY(i)), `${name} pos.y[${i}] finite`).toBe(true);
        expect(Number.isFinite(pos.getZ(i)), `${name} pos.z[${i}] finite`).toBe(true);
      }

      const norm = geo.attributes.normal;
      if (norm) {
        for (let i = 0; i < norm.count; i++) {
          expect(Number.isFinite(norm.getX(i)), `${name} norm.x[${i}] finite`).toBe(true);
          expect(Number.isFinite(norm.getY(i)), `${name} norm.y[${i}] finite`).toBe(true);
          expect(Number.isFinite(norm.getZ(i)), `${name} norm.z[${i}] finite`).toBe(true);
        }
      }
    }
  });

  it('constructs and animates articulated rigs for all 5 animal body plans and all 9 plant/fungus forms', () => {
    const shared = createSharedUniforms();
    const sim = new SimulationEngine(new EventBus());

    for (const plan of ANIMAL_BODY_PLANS) {
      const genome = createAnimalGenome(null, plan);
      const animal = sim.spawnAnimal(genome, new THREE.Vector3(0, 2, 0), 'adult')!;
      const rig = createAnimalRig(genome, shared);
      expect(rig.group.children.length).toBeGreaterThan(0);
      expect(rig.materials.length).toBeGreaterThan(0);
      updateAnimalRig(rig, animal, 1.25, 0.85);
      expect(Number.isFinite(rig.group.position.x)).toBe(true);
      expect(Number.isFinite(rig.group.scale.x)).toBe(true);
    }

    for (const form of FLORA_FORMS) {
      const genome = createPlantGenome(null, form);
      const plant = sim.spawnPlant(genome, 2.0, -2.0, 0.78)!;
      const rig = createPlantRig(genome, shared);
      expect(rig.group.children.length).toBeGreaterThan(0);
      expect(rig.materials.length).toBeGreaterThan(0);
      updatePlantRig(rig, plant, 0.7, 0.6);
      expect(Number.isFinite(rig.group.position.y)).toBe(true);
      expect(Number.isFinite(rig.group.scale.y)).toBe(true);
    }
  });
});
