import type { PopulationSample } from '../simulation/types';

export class PopulationGraph {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  render(history: readonly PopulationSample[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(130, 235, 195, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = Math.round((h / 4) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (history.length < 2) return;

    let maxVal = 12;
    for (let i = 0; i < history.length; i++) {
      const s = history[i];
      maxVal = Math.max(maxVal, s.animals, s.plants, s.fungi, s.species);
    }

    const drawSeries = (getter: (s: PopulationSample) => number, stroke: string, fill: string) => {
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const x = (i / (history.length - 1)) * w;
        const y = h - 4 - (getter(history[i]) / maxVal) * (h - 10);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };

    drawSeries((s) => s.plants, '#34d399', 'rgba(52, 211, 153, 0.12)');
    drawSeries((s) => s.fungi, '#c084fc', 'rgba(192, 132, 252, 0.12)');
    drawSeries((s) => s.animals, '#38e8ff', 'rgba(56, 232, 255, 0.14)');
    drawSeries((s) => s.species, '#fbbf24', 'rgba(251, 191, 36, 0.04)');
  }
}
