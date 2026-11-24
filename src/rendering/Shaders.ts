import * as THREE from 'three';
import { TERRARIUM } from '../core/config';

export interface SharedShaderUniforms {
  uTime: { value: number };
  uDaylight: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uFogColor: { value: THREE.Color };
  uCairnPos: { value: THREE.Vector3 };
  uCairnPulse: { value: number };
  uWindStrength: { value: number };
}

export function createSharedUniforms(): SharedShaderUniforms {
  return {
    uTime: { value: 0 },
    uDaylight: { value: 0.85 },
    uSunDir: { value: new THREE.Vector3(0.32, 0.88, 0.34).normalize() },
    uFogColor: { value: new THREE.Color(0x0c2420) },
    uCairnPos: { value: TERRARIUM.cairnPos.clone() },
    uCairnPulse: { value: 0 },
    uWindStrength: { value: 0.65 },
  };
}

export interface TerrariumLightOptions {
  dappleStrength?: number;
  subsurfaceStrength?: number;
  subsurfaceColor?: number;
  cairnBounceStrength?: number;
}

/**
 * Injects dappled forest-canopy sunlight projection, organic subsurface translucency,
 * and warm bioluminescent Mycelial Cairn ground-bounce into any Three.js MeshStandard/PhysicalMaterial.
 */
export function enhanceMaterialWithTerrariumLight(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  shared: SharedShaderUniforms,
  opts: TerrariumLightOptions = {}
): void {
  const dappleStrength = opts.dappleStrength ?? 0.38;
  const sssStrength = opts.subsurfaceStrength ?? 0.34;
  const sssCol = new THREE.Color(opts.subsurfaceColor ?? 0x6ef5b8);
  const cairnStrength = opts.cairnBounceStrength ?? 0.32;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uDaylight = shared.uDaylight;
    shader.uniforms.uSunDir = shared.uSunDir;
    shader.uniforms.uCairnPos = shared.uCairnPos;
    shader.uniforms.uCairnPulse = shared.uCairnPulse;
    shader.uniforms.uWindStrength = shared.uWindStrength;
    shader.uniforms.uDappleStr = { value: dappleStrength };
    shader.uniforms.uSssStr = { value: sssStrength };
    shader.uniforms.uSssCol = { value: sssCol };
    shader.uniforms.uCairnStr = { value: cairnStrength };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTerrWorldPos;
        varying vec3 vTerrWorldNorm;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 terrWp = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          terrWp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        vTerrWorldPos = terrWp.xyz;
        vTerrWorldNorm = normalize(mat3(modelMatrix) * objectNormal);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uDaylight;
        uniform vec3 uSunDir;
        uniform vec3 uCairnPos;
        uniform float uCairnPulse;
        uniform float uWindStrength;
        uniform float uDappleStr;
        uniform float uSssStr;
        uniform vec3 uSssCol;
        uniform float uCairnStr;
        varying vec3 vTerrWorldPos;
        varying vec3 vTerrWorldNorm;`
      )
      .replace(
        '#include <dithering_fragment>',
        `
        // 1. Animated dappled canopy sunlight filtering through conservatory foliage
        vec2 swayP = vTerrWorldPos.xz * 0.42 + vec2(uTime * 0.14 * (0.5 + uWindStrength), uTime * 0.09);
        float d1 = sin(swayP.x * 2.1 + cos(swayP.y * 1.7)) * cos(swayP.y * 2.3 - sin(swayP.x * 1.4));
        float d2 = sin(swayP.x * 4.3 - swayP.y * 3.8 + uTime * 0.35);
        float dapple = smoothstep(0.18, 0.88, d1 * 0.65 + d2 * 0.35);
        float sunFacing = max(dot(normalize(vTerrWorldNorm), normalize(uSunDir)), 0.0);
        gl_FragColor.rgb += vec3(0.45, 0.52, 0.30) * dapple * sunFacing * uDappleStr * uDaylight;

        // 2. Organic subsurface backlighting (leaves, insect wings, translucent fungi)
        vec3 viewDirW = normalize(cameraPosition - vTerrWorldPos);
        float backLit = pow(clamp(dot(viewDirW, -normalize(uSunDir)), 0.0, 1.0), 2.4);
        float rim = pow(1.0 - abs(dot(normalize(vTerrWorldNorm), viewDirW)), 2.2);
        gl_FragColor.rgb += uSssCol * (backLit * 0.45 * uDaylight + rim * 0.22 * (0.35 + 0.65 * (1.0 - uDaylight))) * uSssStr;

        // 3. Bioluminescent Mycelial Genesis Cairn ambient bounce
        float cd = length(vTerrWorldPos - (uCairnPos + vec3(0.0, 1.2, 0.0)));
        float cairnGlow = exp(-cd * cd / 26.0) * (0.42 + uCairnPulse * 0.95) * (0.55 + 0.45 * (1.0 - uDaylight));
        gl_FragColor.rgb += vec3(0.24, 0.88, 0.68) * cairnGlow * uCairnStr;

        #include <dithering_fragment>`
      );
  };
}

export function createCairnCoreMaterial(shared: SharedShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uCairnPulse: shared.uCairnPulse,
      uDaylight: shared.uDaylight,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uCairnPulse;
      uniform float uDaylight;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        float pulse = 0.72 + 0.28 * sin(uTime * 2.8 + vUv.y * 8.0) + uCairnPulse * 0.85;
        vec3 colA = vec3(0.18, 0.96, 0.74);
        vec3 colB = vec3(0.74, 0.42, 1.0);
        vec3 col = mix(colA, colB, 0.35 + 0.35 * sin(uTime * 1.4 + vUv.x * 6.28));
        float nightBoost = 1.0 + (1.0 - uDaylight) * 0.55;
        gl_FragColor = vec4(col * pulse * nightBoost, 0.82);
      }
    `,
  });
}

export function createSporePlumeMaterial(shared: SharedShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uCairnPulse: shared.uCairnPulse,
      uDaylight: shared.uDaylight,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float sway = sin(uTime * 1.4 + p.y * 1.2) * 0.16 * uv.y;
        p.x += sway;
        p.z += cos(uTime * 1.1 + p.y * 1.0) * 0.12 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uCairnPulse;
      uniform float uDaylight;
      varying vec2 vUv;
      void main() {
        float flow = sin(vUv.y * 12.0 - uTime * 2.6 + sin(vUv.x * 12.56) * 1.2) * 0.5 + 0.5;
        float wisps = smoothstep(0.28, 0.86, flow);
        float fade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        vec3 col = mix(vec3(0.22, 0.94, 0.72), vec3(0.66, 0.48, 1.0), vUv.y);
        float alpha = wisps * fade * (0.20 + uCairnPulse * 0.28) * (1.15 - uDaylight * 0.25);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

export function createMineralPoolMaterial(shared: SharedShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uDaylight: shared.uDaylight,
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.y += sin(p.x * 2.8 + uTime * 1.8) * 0.018 + cos(p.z * 3.1 - uTime * 1.5) * 0.016;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDaylight;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        float dist = length(vUv - 0.5) * 2.0;
        float edge = 1.0 - smoothstep(0.68, 1.0, dist);
        float r1 = sin(vWorldPos.x * 5.2 + uTime * 1.8) * cos(vWorldPos.z * 4.8 - uTime * 1.4);
        float r2 = sin((vWorldPos.x - vWorldPos.z) * 7.5 + uTime * 2.3);
        float shimmer = smoothstep(0.42, 0.96, r1 * 0.6 + r2 * 0.4);
        vec3 deepCol = mix(vec3(0.04, 0.22, 0.28), vec3(0.09, 0.44, 0.48), uDaylight);
        vec3 bioCol = vec3(0.24, 0.95, 0.84);
        vec3 col = mix(deepCol, bioCol, shimmer * (0.48 + (1.0 - uDaylight) * 0.35));
        gl_FragColor = vec4(col, edge * 0.78);
      }
    `,
  });
}

export function createGodRayMaterial(shared: SharedShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uDaylight: shared.uDaylight,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDaylight;
      varying vec2 vUv;
      void main() {
        float beam = sin(vUv.x * 3.14159);
        float shimmer = 0.72 + 0.28 * sin(uTime * 0.7 + vUv.x * 6.0);
        float vertFade = smoothstep(0.0, 0.28, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
        vec3 col = mix(vec3(0.45, 0.85, 0.72), vec3(1.0, 0.94, 0.72), uDaylight);
        float alpha = beam * beam * vertFade * shimmer * (0.04 + 0.08 * uDaylight);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

export function createSkyDomeMaterial(shared: SharedShaderUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uDaylight: shared.uDaylight,
      uSunDir: shared.uSunDir,
      uFogColor: shared.uFogColor,
    },
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDaylight;
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      varying vec3 vDir;
      void main() {
        float y = clamp(vDir.y, -0.2, 1.0);
        vec3 nightZenith = vec3(0.03, 0.06, 0.13);
        vec3 nightHorizon = vec3(0.05, 0.14, 0.16);
        vec3 dayZenith = vec3(0.16, 0.44, 0.56);
        vec3 dayHorizon = vec3(0.36, 0.62, 0.54);

        vec3 zenith = mix(nightZenith, dayZenith, uDaylight);
        vec3 horizon = mix(nightHorizon, dayHorizon, uDaylight);
        vec3 col = mix(horizon, zenith, pow(max(y, 0.0), 0.58));

        // Alien misty conservatory glass-dome ceiling glow & sun halo
        float sunDot = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += vec3(1.1, 0.96, 0.72) * pow(sunDot, 18.0) * uDaylight * 0.75;
        col += vec3(0.4, 0.75, 0.68) * pow(sunDot, 4.0) * uDaylight * 0.25;

        // Subtle nocturnal bioluminescent aurora mist in upper dome at night
        float aurora = sin(vDir.x * 6.0 + uTime * 0.22) * cos(vDir.z * 5.0 - uTime * 0.18);
        col += vec3(0.10, 0.42, 0.36) * smoothstep(0.2, 0.9, aurora) * (1.0 - uDaylight) * max(y, 0.0) * 0.45;

        // Smooth blend into terrarium horizon mist
        float mistBand = 1.0 - smoothstep(-0.05, 0.26, y);
        col = mix(col, uFogColor, mistBand * 0.92);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
