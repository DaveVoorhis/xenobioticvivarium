import './styles/main.css';
import { AmbientAudioEngine } from './audio/AmbientAudioEngine';
import { EventBus } from './core/EventBus';
import { SceneRenderer } from './rendering/SceneRenderer';
import { SimulationEngine } from './simulation/SimulationEngine';
import { HudController } from './ui/HudController';

function reportRuntimeError(msg: string): void {
  const el = document.getElementById('error-banner');
  if (el) {
    el.textContent = `Vivarium notice: ${msg}`;
    el.classList.remove('hidden');
  }
}

class XenobioticVivariumApp {
  readonly events = new EventBus();
  readonly sim: SimulationEngine;
  readonly sceneRenderer: SceneRenderer;
  readonly audio: AmbientAudioEngine;
  readonly hud: HudController;

  private lastFrameTime = performance.now();
  private fpsFrames = 0;
  private fpsTimer = 0;
  private fps = 60;

  constructor() {
    const container = document.getElementById('canvas-container');
    if (!container) throw new Error('Missing #canvas-container element');

    this.sim = new SimulationEngine(this.events);
    this.sceneRenderer = new SceneRenderer(container, this.sim);
    this.audio = new AmbientAudioEngine(this.events);
    this.hud = new HudController(this.sim, this.sceneRenderer, this.audio);

    this.sim.seedPreset('lush_terrarium');

    const splash = document.getElementById('loading-overlay');
    if (splash) {
      splash.style.opacity = '0';
      window.setTimeout(() => splash.remove(), 650);
    }

    this.lastFrameTime = performance.now();
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    try {
      const now = performance.now();
      const rawDt = (now - this.lastFrameTime) * 0.001;
      this.lastFrameTime = now;

      const dt = Math.min(Math.max(Number.isFinite(rawDt) ? rawDt : 0.016, 0.0001), 0.05);

      this.fpsFrames++;
      this.fpsTimer += dt;
      if (this.fpsTimer >= 0.5) {
        this.fps = Math.round(this.fpsFrames / this.fpsTimer);
        this.fpsFrames = 0;
        this.fpsTimer = 0;
      }

      if (this.sim.simSpeed > 0) {
        const totalSimDt = dt * this.sim.simSpeed;
        const subSteps = Math.max(1, Math.ceil(totalSimDt / 0.04));
        const subDt = totalSimDt / subSteps;
        for (let s = 0; s < subSteps; s++) {
          this.sim.step(subDt);
        }
      }

      this.sceneRenderer.updateAndRender(
        dt,
        this.hud.pipViewportEl,
        this.hud.pipCanvasEl,
        this.hud.fullEyeCanvasEl
      );

      this.hud.refresh(now, this.fps);
    } catch (err) {
      reportRuntimeError(err instanceof Error ? err.message : String(err));
    }
  };
}

declare global {
  interface Window {
    __xenobioticVivariumApp?: XenobioticVivariumApp;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.__xenobioticVivariumApp = new XenobioticVivariumApp();
  } catch (err) {
    reportRuntimeError(err instanceof Error ? err.message : String(err));
  }
});
