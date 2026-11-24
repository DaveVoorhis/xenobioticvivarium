import { ECOSYSTEM_PRESETS, type EcosystemPresetId } from '../core/config';
import type { AnimalBodyPlan, FloraForm } from '../genetics/types';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { SimulationSnapshot } from '../simulation/types';

export class EnvironmentControlPanel {
  private readonly drawerEl = document.getElementById('lab-drawer')!;
  private readonly timeSlider = document.getElementById('lab-time-slider') as HTMLInputElement;
  private readonly timeVal = document.getElementById('lab-time-val')!;
  private readonly autoCycleCb = document.getElementById('lab-autocycle-cb') as HTMLInputElement;
  private readonly windSlider = document.getElementById('lab-wind-slider') as HTMLInputElement;
  private readonly windVal = document.getElementById('lab-wind-val')!;
  private readonly mutSlider = document.getElementById('lab-mut-slider') as HTMLInputElement;
  private readonly mutVal = document.getElementById('lab-mut-val')!;
  private readonly autoGenCb = document.getElementById('lab-autogen-cb') as HTMLInputElement;
  private readonly fileInput = document.getElementById('lab-import-file') as HTMLInputElement;

  constructor(
    private readonly sim: SimulationEngine,
    private readonly renderer: SceneRenderer
  ) {
    document.getElementById('lab-close-btn')?.addEventListener('click', () => this.setOpen(false));

    this.timeSlider.addEventListener('input', () => {
      this.sim.env.timeOfDay = parseFloat(this.timeSlider.value);
      this.sim.env.dayNightAutoCycle = false;
      this.autoCycleCb.checked = false;
      this.syncUI();
    });
    this.autoCycleCb.addEventListener('change', () => {
      this.sim.env.dayNightAutoCycle = this.autoCycleCb.checked;
    });
    this.windSlider.addEventListener('input', () => {
      this.sim.env.windStrength = parseFloat(this.windSlider.value);
      this.syncUI();
    });
    this.mutSlider.addEventListener('input', () => {
      this.sim.env.mutationRateMultiplier = parseFloat(this.mutSlider.value);
      this.syncUI();
    });
    this.autoGenCb.addEventListener('change', () => {
      this.sim.env.autoGenesisEnabled = this.autoGenCb.checked;
    });

    // Presets
    const presetContainer = document.getElementById('lab-presets');
    if (presetContainer) {
      presetContainer.innerHTML = '';
      for (const p of ECOSYSTEM_PRESETS) {
        const btn = document.createElement('button');
        btn.className = 'hud-btn lab-preset-btn';
        btn.innerHTML = `<strong>${p.name}</strong><span>${p.description}</span>`;
        btn.addEventListener('click', () => {
          this.renderer.selectEntity(null);
          this.sim.seedPreset(p.id as EcosystemPresetId);
          this.syncUI();
          this.sim.events.emit('toast', { message: `Loaded ${p.name}` });
        });
        presetContainer.appendChild(btn);
      }
    }

    // Targeted locomotion spawners
    document.querySelectorAll<HTMLButtonElement>('[data-spawn-plan]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const plan = btn.dataset.spawnPlan as AnimalBodyPlan;
        const a = this.sim.triggerBiogenesis(null, plan);
        if (a) {
          this.renderer.selectEntity(a);
          this.renderer.focusOnEntity(a);
        }
      });
    });

    document.querySelectorAll<HTMLButtonElement>('[data-spawn-flora]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = btn.dataset.spawnFlora as FloraForm;
        const p = this.sim.triggerPhytogenesis(null, form, null);
        if (p) {
          this.renderer.selectEntity(p);
          this.renderer.focusOnEntity(p);
        }
      });
    });

    // Export / Import snapshot
    document.getElementById('lab-export-btn')?.addEventListener('click', () => {
      const snap = this.sim.exportSnapshot();
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xenobiotic-vivarium-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.sim.events.emit('toast', { message: 'Exported terrarium snapshot' });
    });

    document.getElementById('lab-import-btn')?.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.fileInput.addEventListener('change', async () => {
      const file = this.fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const snap = JSON.parse(text) as SimulationSnapshot;
        this.renderer.selectEntity(null);
        this.sim.importSnapshot(snap);
        this.syncUI();
        this.sim.events.emit('toast', { message: 'Loaded terrarium snapshot' });
      } catch {
        this.sim.events.emit('toast', { message: 'Invalid snapshot JSON' });
      } finally {
        this.fileInput.value = '';
      }
    });

    this.syncUI();
  }

  isOpen(): boolean {
    return !this.drawerEl.classList.contains('hidden');
  }

  setOpen(open: boolean): void {
    this.drawerEl.classList.toggle('hidden', !open);
    if (open) this.syncUI();
  }

  toggle(): void {
    this.setOpen(!this.isOpen());
  }

  syncUI(): void {
    const hrs = Math.floor(this.sim.env.timeOfDay * 24);
    const mins = Math.floor((this.sim.env.timeOfDay * 24 - hrs) * 60);
    this.timeSlider.value = this.sim.env.timeOfDay.toFixed(2);
    this.timeVal.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    this.autoCycleCb.checked = this.sim.env.dayNightAutoCycle;
    this.windSlider.value = this.sim.env.windStrength.toFixed(2);
    this.windVal.textContent = `${Math.round(this.sim.env.windStrength * 100)}%`;
    this.mutSlider.value = this.sim.env.mutationRateMultiplier.toFixed(2);
    this.mutVal.textContent = `${this.sim.env.mutationRateMultiplier.toFixed(1)}x`;
    this.autoGenCb.checked = this.sim.env.autoGenesisEnabled;
  }
}
