import type { AmbientAudioEngine } from '../audio/AmbientAudioEngine';
import { computeDaylightFactor } from '../core/math';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import { EnvironmentControlPanel } from './EnvironmentControlPanel';
import { InspectorPanel } from './InspectorPanel';
import { PopulationGraph } from './PopulationGraph';
import { SpeciesCodexPanel } from './SpeciesCodexPanel';

export class HudController {
  readonly inspector: InspectorPanel;
  readonly codex: SpeciesCodexPanel;
  readonly lab: EnvironmentControlPanel;
  readonly popGraph: PopulationGraph;

  readonly pipViewportEl = document.getElementById('pip-eye-viewport');
  readonly pipCanvasEl = document.getElementById('pip-eye-canvas') as HTMLCanvasElement | null;
  readonly fullEyeCanvasEl = document.getElementById('full-eye-canvas') as HTMLCanvasElement | null;

  private readonly hudRoot = document.getElementById('hud-root')!;
  private readonly showHudBtn = document.getElementById('show-hud-btn')!;
  private readonly toastEl = document.getElementById('toast-banner')!;
  private readonly feedLogEl = document.getElementById('biosphere-feed')!;
  private readonly pipBoxEl = document.getElementById('pip-eye-box')!;
  private readonly pipLabelEl = document.getElementById('pip-eye-label')!;
  private readonly fullEyeHudEl = document.getElementById('full-eye-hud')!;
  private readonly fullEyeTitleEl = document.getElementById('full-eye-title')!;
  private readonly fullEyeMetaEl = document.getElementById('full-eye-meta')!;

  private readonly statAnimalsEl = document.getElementById('stat-animals')!;
  private readonly statPlantsEl = document.getElementById('stat-plants')!;
  private readonly statFungiEl = document.getElementById('stat-fungi')!;
  private readonly statSpeciesEl = document.getElementById('stat-species')!;
  private readonly statCairnEl = document.getElementById('stat-cairn-timer')!;
  private readonly statSolarEl = document.getElementById('stat-solar')!;
  private readonly statFpsEl = document.getElementById('stat-fps')!;

  private readonly btnFeed = document.getElementById('btn-feed')!;
  private readonly btnAudio = document.getElementById('btn-audio')!;
  private readonly speedButtons = new Map<number, HTMLElement>();

  private toastTimer: number | null = null;
  private lastUiRefresh = 0;

  constructor(
    private readonly sim: SimulationEngine,
    private readonly renderer: SceneRenderer,
    private readonly audio: AmbientAudioEngine
  ) {
    this.inspector = new InspectorPanel(sim, renderer, (mode) => this.toggleEyeMode(mode));
    this.codex = new SpeciesCodexPanel(sim, renderer);
    this.lab = new EnvironmentControlPanel(sim, renderer);
    this.popGraph = new PopulationGraph(document.getElementById('pop-graph-canvas') as HTMLCanvasElement);

    for (const spd of [0, 0.5, 1, 2, 4]) {
      const btn = document.getElementById(`speed-${spd}`);
      if (btn) {
        this.speedButtons.set(spd, btn);
        btn.addEventListener('click', () => this.setSpeed(spd));
      }
    }

    document.getElementById('btn-biogenesis')?.addEventListener('click', () => {
      const a = this.sim.triggerBiogenesis();
      if (a) this.showToast(`Spawned ${a.genome.speciesName} (${a.genome.locomotion})`);
    });
    document.getElementById('btn-phytogenesis')?.addEventListener('click', () => {
      const p = this.sim.triggerPhytogenesis(null, null, 'plant');
      if (p) this.showToast(`Sprouted ${p.genome.speciesName}`);
    });
    document.getElementById('btn-mycogenesis')?.addEventListener('click', () => {
      const f = this.sim.triggerPhytogenesis(null, null, 'fungus');
      if (f) this.showToast(`Fruited ${f.genome.speciesName}`);
    });
    this.btnFeed.addEventListener('click', () => this.toggleFeedMode());
    document.getElementById('btn-codex')?.addEventListener('click', () => {
      this.lab.setOpen(false);
      this.codex.toggle();
    });
    document.getElementById('btn-lab')?.addEventListener('click', () => {
      this.codex.setOpen(false);
      this.lab.toggle();
    });
    this.btnAudio.addEventListener('click', () => this.toggleAudio());
    document.getElementById('btn-hide-hud')?.addEventListener('click', () => this.toggleHudVisibility(false));
    this.showHudBtn.addEventListener('click', () => this.toggleHudVisibility(true));
    document.getElementById('pip-close-btn')?.addEventListener('click', () => this.setEyeMode('off'));
    document.getElementById('pip-expand-btn')?.addEventListener('click', () => this.setEyeMode('fullscreen'));
    document.getElementById('full-eye-exit-btn')?.addEventListener('click', () => this.setEyeMode('off'));
    document.getElementById('full-eye-optics-btn')?.addEventListener('click', () => {
      this.renderer.eyeSystem.opticsMode =
        this.renderer.eyeSystem.opticsMode === 'biological' ? 'natural' : 'biological';
      this.showToast(`Optics: ${this.renderer.eyeSystem.opticsMode}`);
    });

    this.sim.events.on('log', ({ message, toneClass }) => this.appendFeed(message, toneClass));
    this.sim.events.on('toast', ({ message }) => this.showToast(message));
    this.sim.events.on('selection:changed', () => {
      this.inspector.refresh();
      this.syncEyeOverlays();
    });

    this.bindKeyboard();
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        this.setSpeed(this.sim.simSpeed === 0 ? 1 : 0);
      } else if (k === 'g') {
        this.toggleFeedMode();
      } else if (k === 'c') {
        this.lab.setOpen(false);
        this.codex.toggle();
      } else if (k === 'e') {
        this.codex.setOpen(false);
        this.lab.toggle();
      } else if (k === 'v') {
        this.toggleEyeMode('fullscreen');
      } else if (k === 'p') {
        this.toggleEyeMode('pip');
      } else if (k === 'f') {
        this.renderer.followCam = !this.renderer.followCam;
        this.inspector.refresh();
      } else if (k === 'm') {
        this.toggleAudio();
      } else if (k === 'h') {
        this.toggleHudVisibility(this.hudRoot.classList.contains('hidden'));
      } else if (k === 'escape') {
        if (this.renderer.eyeSystem.mode !== 'off') this.setEyeMode('off');
        else if (this.renderer.feedMode) this.toggleFeedMode();
        else {
          this.codex.setOpen(false);
          this.lab.setOpen(false);
        }
      }
    });
  }

  private setSpeed(spd: number): void {
    this.sim.simSpeed = spd;
    for (const [val, btn] of this.speedButtons) {
      btn.classList.toggle('active-btn', val === spd);
    }
  }

  private toggleFeedMode(): void {
    this.renderer.feedMode = !this.renderer.feedMode;
    this.btnFeed.classList.toggle('active-btn', this.renderer.feedMode);
    document.body.style.cursor = this.renderer.feedMode ? 'crosshair' : 'default';
    this.showToast(this.renderer.feedMode ? 'Feed Mode ON — click terrarium to drop nutrient fruit' : 'Feed Mode OFF');
  }

  private toggleAudio(): void {
    const on = this.audio.toggle();
    this.btnAudio.classList.toggle('active-btn', on);
    this.showToast(on ? 'Terrarium Audio ON' : 'Terrarium Audio OFF');
  }

  private toggleHudVisibility(visible: boolean): void {
    this.hudRoot.classList.toggle('hidden', !visible);
    this.showHudBtn.classList.toggle('hidden', visible);
  }

  private toggleEyeMode(target: 'fullscreen' | 'pip'): void {
    if (!this.renderer.eyeSystem.canUseEyeView(this.renderer.selectedEntity)) {
      this.showToast('Select an animal to enter Creature-Eye View');
      return;
    }
    const next = this.renderer.eyeSystem.mode === target ? 'off' : target;
    this.setEyeMode(next);
  }

  private setEyeMode(mode: 'off' | 'pip' | 'fullscreen'): void {
    this.renderer.eyeSystem.mode = mode;
    this.renderer.eyeSystem.resetSmoothing();
    this.syncEyeOverlays();
    this.inspector.refresh();
  }

  private syncEyeOverlays(): void {
    const mode = this.renderer.eyeSystem.mode;
    const ent = this.renderer.selectedEntity;
    const valid = this.renderer.eyeSystem.canUseEyeView(ent);

    this.pipBoxEl.classList.toggle('hidden', !(mode === 'pip' && valid));
    this.fullEyeHudEl.classList.toggle('hidden', !(mode === 'fullscreen' && valid));
    if (mode === 'fullscreen' && valid && ent) {
      const prof = this.renderer.eyeSystem.getVisionProfile(ent.genome);
      this.fullEyeTitleEl.textContent = ent.genome.speciesName;
      this.fullEyeMetaEl.textContent = `${prof.label} · ${ent.stage} · ${ent.state}`;
    } else if (mode === 'pip' && valid && ent) {
      this.pipLabelEl.textContent = `${ent.genome.speciesName.split(' ')[0]} · Eye-Cam`;
    }
  }

  private appendFeed(message: string, toneClass: string): void {
    const item = document.createElement('div');
    item.className = `feed-item ${toneClass}`;
    item.textContent = message;
    this.feedLogEl.prepend(item);
    while (this.feedLogEl.children.length > 24) {
      this.feedLogEl.lastElementChild?.remove();
    }
  }

  showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('toast-visible');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('toast-visible');
    }, 2400);
  }

  refresh(nowMs: number, fps: number): void {
    if (nowMs - this.lastUiRefresh < 120) return;
    this.lastUiRefresh = nowMs;

    const { plants, fungi } = this.sim.getPlantAndFungusCounts();
    this.statAnimalsEl.textContent = String(this.sim.animals.length);
    this.statPlantsEl.textContent = String(plants);
    this.statFungiEl.textContent = String(fungi);
    this.statSpeciesEl.textContent = String(this.sim.speciesRegistry.getExtantCount());
    this.statCairnEl.textContent = `${Math.max(0, Math.ceil(this.sim.genesisTimer))}s`;
    this.statFpsEl.textContent = String(fps);

    const dl = computeDaylightFactor(this.sim.env.timeOfDay);
    this.statSolarEl.textContent = dl > 0.65 ? '☀' : dl > 0.25 ? '◐' : '☽';

    this.audio.updateWindAmbience(this.sim.env.windStrength);
    this.inspector.refresh();
    this.codex.refresh();
    if (this.lab.isOpen()) this.lab.syncUI();
    this.popGraph.render(this.sim.history);
    if (this.renderer.eyeSystem.mode !== 'off') this.syncEyeOverlays();
  }
}
