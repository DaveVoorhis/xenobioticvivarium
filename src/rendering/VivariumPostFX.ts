import * as THREE from 'three';
import type { SharedShaderUniforms } from './Shaders';

/**
 * Lightweight WebGL2 atmospheric terrarium depth-of-field & soft humid mist glow pass.
 * Falls back transparently to direct rendering if WebGL2 depth textures are unavailable.
 */
export class VivariumPostFX {
  readonly enabled: boolean;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly target: THREE.WebGLRenderTarget | null;
  private readonly postScene: THREE.Scene;
  private readonly postCamera: THREE.OrthographicCamera;
  private readonly postMat: THREE.ShaderMaterial;

  constructor(
    renderer: THREE.WebGLRenderer,
    sharedUniforms: SharedShaderUniforms,
    width: number,
    height: number
  ) {
    this.renderer = renderer;
    const isWebGL2 = renderer.capabilities.isWebGL2;
    this.enabled = isWebGL2;

    const pixelRatio = renderer.getPixelRatio();
    const rtW = Math.max(2, Math.floor(width * pixelRatio));
    const rtH = Math.max(2, Math.floor(height * pixelRatio));

    if (this.enabled) {
      const depthTex = new THREE.DepthTexture(rtW, rtH);
      depthTex.type = THREE.UnsignedIntType;
      this.target = new THREE.WebGLRenderTarget(rtW, rtH, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        depthTexture: depthTex,
      });
    } else {
      this.target = null;
    }

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target ? this.target.texture : null },
        tDepth: { value: this.target ? this.target.depthTexture : null },
        uResolution: { value: new THREE.Vector2(rtW, rtH) },
        uNear: { value: 0.12 },
        uFar: { value: 160.0 },
        uFocusDist: { value: 13.5 },
        uMaxBlurPx: { value: 3.4 * pixelRatio },
        uFogColor: sharedUniforms.uFogColor,
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 uResolution;
        uniform float uNear;
        uniform float uFar;
        uniform float uFocusDist;
        uniform float uMaxBlurPx;
        uniform vec3 uFogColor;
        varying vec2 vUv;

        float linearizeDepth(float d) {
          float z = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / max(0.0001, (uFar + uNear - z * (uFar - uNear)));
        }

        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          float depth = linearizeDepth(texture2D(tDepth, vUv).r);
          float blurFactor = smoothstep(uFocusDist + 4.0, uFocusDist + 26.0, depth);
          vec2 texel = (uMaxBlurPx * blurFactor) / uResolution;

          vec3 acc = base.rgb;
          if (blurFactor > 0.02) {
            acc += texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb;
            acc += texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
            acc += texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb;
            acc += texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
            acc += texture2D(tDiffuse, vUv + vec2(texel.x, texel.y) * 0.7).rgb;
            acc += texture2D(tDiffuse, vUv - vec2(texel.x, texel.y) * 0.7).rgb;
            acc += texture2D(tDiffuse, vUv + vec2(texel.x, -texel.y) * 0.7).rgb;
            acc += texture2D(tDiffuse, vUv + vec2(-texel.x, texel.y) * 0.7).rgb;
            acc /= 9.0;
          }

          // Subtle edge vignette for lush vivarium glass framing
          vec2 centered = vUv - 0.5;
          float vig = 1.0 - dot(centered, centered) * 0.24;
          gl_FragColor = vec4(acc * vig, 1.0);
        }
      `,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
  }

  resize(width: number, height: number): void {
    if (!this.target) return;
    const pr = this.renderer.getPixelRatio();
    const rtW = Math.max(2, Math.floor(width * pr));
    const rtH = Math.max(2, Math.floor(height * pr));
    this.target.setSize(rtW, rtH);
    (this.postMat.uniforms.uResolution.value as THREE.Vector2).set(rtW, rtH);
    this.postMat.uniforms.uMaxBlurPx.value = 3.4 * pr;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, focusDist: number): void {
    if (!this.enabled || !this.target) {
      this.renderer.render(scene, camera);
      return;
    }
    this.postMat.uniforms.uFocusDist.value = focusDist;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }
}
