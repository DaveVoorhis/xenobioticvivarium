import { clamp, safeRatio } from '../core/math';
import { formatTraitLabel } from '../genetics/taxonomy';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import { getLifecyclePathSummary } from '../simulation/lifecycle';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { Entity } from '../simulation/types';

export class InspectorPanel {
  private readonly cardEl = document.getElementById('inspector-card')!;
  private readonly kindBadgeEl = document.getElementById('insp-kind-badge')!;
  private readonly genBadgeEl = document.getElementById('insp-gen-badge')!;
  private readonly nameEl = document.getElementById('insp-species-name')!;
  private readonly stageStateEl = document.getElementById('insp-stage-state')!;
  private readonly bar1LabelEl = document.getElementById('insp-bar1-label')!;
  private readonly bar1ValEl = document.getElementById('insp-bar1-val')!;
  private readonly bar1FillEl = document.getElementById('insp-bar1-fill')!;
  private readonly bar2LabelEl = document.getElementById('insp-bar2-label')!;
  private readonly bar2ValEl = document.getElementById('insp-bar2-val')!;
  private readonly bar2FillEl = document.getElementById('insp-bar2-fill')!;
  private readonly bar3ValEl = document.getElementById('insp-bar3-val')!;
  private readonly bar3FillEl = document.getElementById('insp-bar3-fill')!;
  private readonly traitsGridEl = document.getElementById('insp-traits-grid')!;
  private readonly offspringEl = document.getElementById('insp-offspring')!;
  private readonly opticsEl = document.getElementById('insp-optics')!;
  private readonly followBtn = document.getElementById('insp-follow-btn')!;
  private readonly followLabelEl = document.getElementById('insp-follow-label')!;
  private readonly eyeViewBtn = document.getElementById('insp-eyeview-btn') as HTMLButtonElement;
  private readonly pipBtn = document.getElementById('insp-pip-btn') as HTMLButtonElement;
  private readonly noOcularEl = document.getElementById('insp-no-ocular-note')!;
  private readonly nourishBtn = document.getElementById('insp-nourish-btn') as HTMLButtonElement;
  private readonly mutateBtn = document.getElementById('insp-mutate-btn') as HTMLButtonElement;

  private lastEntityId: number | null = null;
  private lastEntityKind: string | null = null;

  constructor(
    private readonly sim: SimulationEngine,
    private readonly renderer: SceneRenderer,
    private readonly onToggleEyeMode: (mode: 'fullscreen' | 'pip') => void
  ) {
    document.getElementById('insp-close-btn')?.addEventListener('click', () => {
      this.renderer.selectEntity(null);
    });
    this.followBtn.addEventListener('click', () => {
      this.renderer.followCam = !this.renderer.followCam;
      this.updateButtons();
    });
    this.eyeViewBtn.addEventListener('click', () => this.onToggleEyeMode('fullscreen'));
    this.pipBtn.addEventListener('click', () => this.onToggleEyeMode('pip'));
    this.nourishBtn.addEventListener('click', () => {
      if (this.renderer.selectedEntity && this.sim.nourishEntity(this.renderer.selectedEntity)) {
        this.sim.events.emit('toast', { message: 'Organism nourished' });
      }
    });
    this.mutateBtn.addEventListener('click', () => {
      if (!this.renderer.selectedEntity) return;
      const mutant = this.sim.induceMutation(this.renderer.selectedEntity);
      if (mutant) {
        this.renderer.selectEntity(mutant);
        this.renderer.focusOnEntity(mutant);
        this.sim.events.emit('toast', { message: 'Directed mutation triggered!' });
      }
    });
    document.getElementById('insp-next-btn')?.addEventListener('click', () => {
      this.cycleNextEntity();
    });
  }

  private cycleNextEntity(): void {
    const pool: Entity[] = [...this.sim.animals, ...this.sim.plants];
    if (pool.length === 0) return;
    const idx = this.renderer.selectedEntity ? pool.indexOf(this.renderer.selectedEntity) : -1;
    const next = pool[(idx + 1) % pool.length];
    this.renderer.selectEntity(next);
    this.renderer.focusOnEntity(next);
  }

  private renderTraits(entity: Entity): void {
    const badges: Array<{ text: string; cls: string }> = [];
    if (entity.kind === 'animal' || entity.kind === 'corpse' || entity.kind === 'egg') {
      const g = entity.genome;
      badges.push({ text: `Move: ${formatTraitLabel(g.locomotion)}`, cls: 'trait-cyan' });
      badges.push({ text: formatTraitLabel(g.bodyPlan), cls: 'trait-cyan' });
      badges.push({ text: formatTraitLabel(g.diet), cls: 'trait-amber' });
      badges.push({ text: formatTraitLabel(g.social), cls: 'trait-emerald' });
      badges.push({ text: formatTraitLabel(g.combat), cls: 'trait-rose' });
      badges.push({ text: formatTraitLabel(g.reproduction), cls: 'trait-fuchsia' });
      badges.push({ text: formatTraitLabel(g.appendage), cls: 'trait-slate' });
      badges.push({ text: formatTraitLabel(g.functionalPart), cls: 'trait-slate' });
      badges.push({ text: formatTraitLabel(g.integument), cls: 'trait-slate' });
      badges.push({ text: getLifecyclePathSummary(g), cls: 'trait-emerald' });
    } else if (entity.kind === 'plant' || entity.kind === 'propagule') {
      const g = entity.genome;
      badges.push({ text: g.kingdom === 'fungus' ? 'Kingdom: Fungus' : 'Kingdom: Plant', cls: g.kingdom === 'fungus' ? 'trait-fuchsia' : 'trait-emerald' });
      badges.push({ text: formatTraitLabel(g.form), cls: 'trait-cyan' });
      badges.push({ text: formatTraitLabel(g.metabolism), cls: 'trait-amber' });
      badges.push({ text: formatTraitLabel(g.propagation), cls: 'trait-slate' });
      badges.push({ text: `Def: ${formatTraitLabel(g.defense)}`, cls: 'trait-rose' });
      badges.push({ text: formatTraitLabel(g.rootSystem), cls: 'trait-slate' });
    }
    this.traitsGridEl.innerHTML = badges
      .map((b) => `<span class="trait-pill ${b.cls}">${b.text}</span>`)
      .join('');
  }

  private updateButtons(): void {
    this.followLabelEl.textContent = `Follow Cam (F): ${this.renderer.followCam ? 'ON' : 'OFF'}`;
    this.followBtn.classList.toggle('active-btn', this.renderer.followCam);
    const canEye = this.renderer.eyeSystem.canUseEyeView(this.renderer.selectedEntity);
    this.eyeViewBtn.disabled = !canEye;
    this.pipBtn.disabled = !canEye;
    this.eyeViewBtn.classList.toggle('active-btn', this.renderer.eyeSystem.mode === 'fullscreen');
    this.pipBtn.classList.toggle('active-btn', this.renderer.eyeSystem.mode === 'pip');
    this.noOcularEl.classList.toggle('hidden', canEye);
  }

  refresh(): void {
    const e = this.renderer.selectedEntity;
    if (!e || !e.alive) {
      this.cardEl.classList.add('hidden');
      this.lastEntityId = null;
      return;
    }

    this.cardEl.classList.remove('hidden');

    if (this.lastEntityId !== e.id || this.lastEntityKind !== e.kind) {
      this.lastEntityId = e.id;
      this.lastEntityKind = e.kind;
      this.renderTraits(e);
    }

    if (e.kind === 'animal') {
      const g = e.genome;
      this.kindBadgeEl.textContent = `FAUNA · ${g.locomotion.toUpperCase()}`;
      this.genBadgeEl.textContent = `Gen ${g.generation}`;
      this.nameEl.textContent = g.speciesName;
      this.stageStateEl.textContent = `${e.stage} · ${e.state}`;

      this.bar1LabelEl.textContent = 'HEALTH';
      this.bar1ValEl.textContent = `${Math.round(e.hp)} / ${e.maxHp}`;
      this.bar1FillEl.style.width = `${safeRatio(e.hp, e.maxHp) * 100}%`;

      this.bar2LabelEl.textContent = 'ENERGY';
      this.bar2ValEl.textContent = `${Math.round(e.energy)} / ${e.maxEnergy}`;
      this.bar2FillEl.style.width = `${safeRatio(e.energy, e.maxEnergy) * 100}%`;

      this.bar3ValEl.textContent = `${Math.round(e.age)}s / ${Math.round(g.maxAge)}s`;
      this.bar3FillEl.style.width = `${safeRatio(e.age, g.maxAge) * 100}%`;

      this.offspringEl.textContent = String(e.offspringCount);
      this.opticsEl.textContent = this.renderer.eyeSystem.getVisionProfile(g).label;
      this.nourishBtn.disabled = false;
      this.mutateBtn.disabled = false;
    } else if (e.kind === 'plant') {
      const g = e.genome;
      this.kindBadgeEl.textContent = g.kingdom === 'fungus' ? 'FUNGUS' : 'FLORA';
      this.genBadgeEl.textContent = `Gen ${g.generation}`;
      this.nameEl.textContent = g.speciesName;
      this.stageStateEl.textContent = `${e.stage} · ${e.state}`;

      this.bar1LabelEl.textContent = 'BIOMASS';
      this.bar1ValEl.textContent = `${Math.round(e.biomass)} / ${e.maxBiomass}`;
      this.bar1FillEl.style.width = `${safeRatio(e.biomass, e.maxBiomass) * 100}%`;

      this.bar2LabelEl.textContent = 'GROWTH';
      this.bar2ValEl.textContent = `${Math.round(e.growth * 100)}%`;
      this.bar2FillEl.style.width = `${clamp(e.growth, 0, 1) * 100}%`;

      this.bar3ValEl.textContent = `${Math.round(e.age)}s / ${Math.round(g.maxAge)}s`;
      this.bar3FillEl.style.width = `${safeRatio(e.age, g.maxAge) * 100}%`;

      this.offspringEl.textContent = String(e.offspringCount);
      this.opticsEl.textContent = g.kingdom === 'fungus' ? 'Mycelial' : 'Phototropic';
      this.nourishBtn.disabled = false;
      this.mutateBtn.disabled = false;
    } else if (e.kind === 'corpse') {
      this.kindBadgeEl.textContent = 'CARCASS';
      this.genBadgeEl.textContent = `Gen ${e.genome.generation}`;
      this.nameEl.textContent = e.genome.speciesName;
      this.stageStateEl.textContent = `${e.stage} · ${e.state}`;
      this.bar1LabelEl.textContent = 'NUTRIENTS';
      this.bar1ValEl.textContent = `${Math.round(e.nutrients)} / ${e.maxNutrients}`;
      this.bar1FillEl.style.width = `${safeRatio(e.nutrients, e.maxNutrients) * 100}%`;
      this.bar2LabelEl.textContent = 'DECAY';
      this.bar2ValEl.textContent = `${Math.round(safeRatio(e.decomposeAge, e.decomposeDuration) * 100)}%`;
      this.bar2FillEl.style.width = `${safeRatio(e.decomposeAge, e.decomposeDuration) * 100}%`;
      this.bar3ValEl.textContent = `${Math.round(e.corpseAge)}s`;
      this.bar3FillEl.style.width = '100%';
      this.offspringEl.textContent = '—';
      this.opticsEl.textContent = 'Inactive';
      this.nourishBtn.disabled = true;
      this.mutateBtn.disabled = true;
    } else if (e.kind === 'egg') {
      this.kindBadgeEl.textContent = 'EGG';
      this.genBadgeEl.textContent = `Gen ${e.genome.generation}`;
      this.nameEl.textContent = e.genome.speciesName;
      this.stageStateEl.textContent = `Egg · ${e.state}`;
      const prog = safeRatio(e.age, e.incubateDuration);
      this.bar1LabelEl.textContent = 'INCUBATION';
      this.bar1ValEl.textContent = `${Math.round(prog * 100)}%`;
      this.bar1FillEl.style.width = `${prog * 100}%`;
      this.bar2LabelEl.textContent = 'YOLK';
      this.bar2ValEl.textContent = `${Math.round(e.nutrients)}`;
      this.bar2FillEl.style.width = '100%';
      this.bar3ValEl.textContent = `${e.age.toFixed(1)}s / ${e.incubateDuration.toFixed(1)}s`;
      this.bar3FillEl.style.width = `${prog * 100}%`;
      this.offspringEl.textContent = '0';
      this.opticsEl.textContent = 'Embryonic';
      this.nourishBtn.disabled = true;
      this.mutateBtn.disabled = true;
    } else {
      this.kindBadgeEl.textContent = e.kind.toUpperCase();
      this.genBadgeEl.textContent = '';
      this.nameEl.textContent = e.stage;
      this.stageStateEl.textContent = e.state;
      this.nourishBtn.disabled = true;
      this.mutateBtn.disabled = true;
    }

    this.updateButtons();
  }
}
