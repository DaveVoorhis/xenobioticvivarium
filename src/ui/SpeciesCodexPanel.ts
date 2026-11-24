import type { SpeciesRecord } from '../genetics/types';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { SimulationEngine } from '../simulation/SimulationEngine';

type CodexFilter = 'all' | 'fauna' | 'flora' | 'fungus';

export class SpeciesCodexPanel {
  private readonly drawerEl = document.getElementById('codex-drawer')!;
  private readonly listEl = document.getElementById('codex-list')!;
  private readonly countEl = document.getElementById('codex-count')!;
  private filter: CodexFilter = 'all';

  constructor(
    private readonly sim: SimulationEngine,
    private readonly renderer: SceneRenderer
  ) {
    document.getElementById('codex-close-btn')?.addEventListener('click', () => this.setOpen(false));
    document.querySelectorAll<HTMLButtonElement>('[data-codex-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = (btn.dataset.codexFilter as CodexFilter) || 'all';
        document.querySelectorAll('[data-codex-filter]').forEach((b) =>
          b.classList.toggle('active-btn', b === btn)
        );
        this.refresh();
      });
    });
  }

  isOpen(): boolean {
    return !this.drawerEl.classList.contains('hidden');
  }

  setOpen(open: boolean): void {
    this.drawerEl.classList.toggle('hidden', !open);
    if (open) this.refresh();
  }

  toggle(): void {
    this.setOpen(!this.isOpen());
  }

  refresh(): void {
    if (!this.isOpen()) return;
    const all = this.sim.speciesRegistry.getAll();
    const filtered = all.filter((r) => this.filter === 'all' || r.kind === this.filter);
    filtered.sort((a, b) => b.currentPopulation - a.currentPopulation || b.peakPopulation - a.peakPopulation);

    const extant = filtered.filter((r) => r.currentPopulation > 0).length;
    this.countEl.textContent = `${extant} extant / ${filtered.length} total`;

    this.listEl.innerHTML = '';
    for (const rec of filtered.slice(0, 48)) {
      this.listEl.appendChild(this.buildRow(rec));
    }
  }

  private buildRow(rec: SpeciesRecord): HTMLElement {
    const row = document.createElement('div');
    row.className = `codex-row ${rec.currentPopulation === 0 ? 'codex-extinct' : ''}`;
    const hex = `#${rec.baseHex.toString(16).padStart(6, '0')}`;
    const glow = `#${rec.glowHex.toString(16).padStart(6, '0')}`;
    const parent = rec.parentSpeciesId ? this.sim.speciesRegistry.get(rec.parentSpeciesId) : null;

    row.innerHTML = `
      <div class="codex-swatch" style="background: radial-gradient(circle at 35% 35%, ${glow}, ${hex});"></div>
      <div class="codex-info">
        <div class="codex-name">${rec.speciesName}</div>
        <div class="codex-sub font-mono-tech">
          ${rec.kind.toUpperCase()} · ${rec.primaryTrait} · ${rec.secondaryTrait} · Gen ${rec.maxGeneration}
          ${parent ? ` · from ${parent.speciesName.split(' ')[0]}` : ''}
        </div>
      </div>
      <div class="codex-pop font-mono-tech">
        <strong>${rec.currentPopulation}</strong>
        <span>pk ${rec.peakPopulation}</span>
      </div>
    `;

    row.addEventListener('click', () => {
      if (rec.currentPopulation === 0) return;
      if (rec.kind === 'fauna') {
        const found = this.sim.animals.find((a) => a.alive && a.genome.speciesId === rec.speciesId);
        if (found) {
          this.renderer.selectEntity(found);
          this.renderer.focusOnEntity(found);
        }
      } else {
        const found = this.sim.plants.find((p) => p.alive && p.genome.speciesId === rec.speciesId);
        if (found) {
          this.renderer.selectEntity(found);
          this.renderer.focusOnEntity(found);
        }
      }
    });
    return row;
  }
}
