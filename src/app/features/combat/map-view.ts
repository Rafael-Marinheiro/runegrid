import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { GridMap, Pos } from '@core/models/grid';

export const CELL = 48;

export interface TokenView {
  id: string;
  name: string;
  letter: string;
  pos: Pos;
  /** Lado em células. */
  size: number;
  team: 'party' | 'foes';
  /** 0–100. */
  hpPct: number;
  hidden: boolean;
  dead: boolean;
  active: boolean;
  selected: boolean;
  /** Alvo válido do ataque em preparo. */
  targetable: boolean;
}

interface Drag {
  id: string;
  size: number;
  /** Centro do token, em unidades do SVG. */
  cx: number;
  cy: number;
  offX: number;
  offY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface Pan {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

@Component({
  selector: 'app-map-view',
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapView {
  readonly map = input.required<GridMap>();
  readonly tokens = input.required<TokenView[]>();
  /** Células alcançáveis pela criatura na vez. */
  readonly reach = input<Pos[]>([]);

  readonly cellClick = output<Pos>();
  readonly tokenClick = output<string>();
  readonly tokenMove = output<{ id: string; pos: Pos }>();
  readonly tokenNudge = output<{ id: string; dx: number; dy: number }>();

  protected readonly C = CELL;
  protected readonly zoom = signal(1);
  protected readonly pan = signal<Pos>({ x: 0, y: 0 });
  protected readonly drag = signal<Drag | null>(null);
  private panning: Pan | null = null;
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly cells = computed(() => {
    const m = this.map();
    return m.cells.map((t, i) => ({ i, x: i % m.width, y: Math.floor(i / m.width), t }));
  });
  protected readonly width = computed(() => this.map().width * CELL);
  protected readonly height = computed(() => this.map().height * CELL);
  protected readonly viewBox = computed(() => {
    const z = this.zoom();
    const { x, y } = this.pan();
    return `${x} ${y} ${this.width() / z} ${this.height() / z}`;
  });

  /** Posição de desenho do token (acompanha o dedo/mouse durante o arrasto). */
  protected place(t: TokenView): { x: number; y: number } {
    const d = this.drag();
    if (d?.id === t.id && d.moved)
      return { x: d.cx - (t.size * CELL) / 2, y: d.cy - (t.size * CELL) / 2 };
    return { x: t.pos.x * CELL, y: t.pos.y * CELL };
  }

  protected label(t: TokenView): string {
    const state = t.dead ? ', morto' : t.hidden ? ', oculto' : '';
    return `${t.name}${state}, coluna ${t.pos.x + 1}, linha ${t.pos.y + 1}. Setas movem, Enter seleciona.`;
  }

  // ---------- zoom / pan ----------

  private toSvg(e: { clientX: number; clientY: number }): Pos {
    const el = this.svg().nativeElement;
    const ctm = el.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  protected zoomBy(factor: number, at?: Pos): void {
    const z = this.zoom();
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
    if (next === z) return;
    const p = at ?? {
      x: this.pan().x + this.width() / z / 2,
      y: this.pan().y + this.height() / z / 2,
    };
    const pan = this.pan();
    // mantém o ponto sob o cursor no mesmo lugar da tela
    this.pan.set({ x: p.x - (p.x - pan.x) * (z / next), y: p.y - (p.y - pan.y) * (z / next) });
    this.zoom.set(next);
  }

  protected reset(): void {
    this.zoom.set(1);
    this.pan.set({ x: 0, y: 0 });
  }

  protected onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, this.toSvg(e));
  }

  // ---------- ponteiro: arrastar token ou mapa ----------

  protected onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const p = this.toSvg(e);
    const el = (e.target as Element).closest<SVGGElement>('[data-token]');
    this.svg().nativeElement.setPointerCapture(e.pointerId);
    if (el) {
      const t = this.tokens().find((x) => x.id === el.dataset['token']);
      if (!t) return;
      const cx = t.pos.x * CELL + (t.size * CELL) / 2;
      const cy = t.pos.y * CELL + (t.size * CELL) / 2;
      this.drag.set({
        id: t.id,
        size: t.size,
        cx,
        cy,
        offX: p.x - cx,
        offY: p.y - cy,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      });
    } else {
      this.panning = {
        startX: e.clientX,
        startY: e.clientY,
        originX: this.pan().x,
        originY: this.pan().y,
        moved: false,
      };
    }
  }

  protected onPointerMove(e: PointerEvent): void {
    const d = this.drag();
    if (d) {
      const p = this.toSvg(e);
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5;
      this.drag.set({ ...d, cx: p.x - d.offX, cy: p.y - d.offY, moved });
      return;
    }
    const pn = this.panning;
    if (pn) {
      const scale = this.svg().nativeElement.getScreenCTM()?.a ?? 1;
      const dx = e.clientX - pn.startX;
      const dy = e.clientY - pn.startY;
      if (!pn.moved && Math.hypot(dx, dy) < 4) return;
      pn.moved = true;
      this.pan.set({ x: pn.originX - dx / scale, y: pn.originY - dy / scale });
    }
  }

  protected onPointerUp(e: PointerEvent): void {
    const d = this.drag();
    if (d) {
      this.drag.set(null);
      if (!d.moved) return void this.tokenClick.emit(d.id);
      this.tokenMove.emit({
        id: d.id,
        pos: {
          x: Math.round((d.cx - (d.size * CELL) / 2) / CELL),
          y: Math.round((d.cy - (d.size * CELL) / 2) / CELL),
        },
      });
      return;
    }
    const pn = this.panning;
    this.panning = null;
    if (pn && !pn.moved) {
      const p = this.toSvg(e);
      const pos = { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
      const m = this.map();
      if (pos.x >= 0 && pos.y >= 0 && pos.x < m.width && pos.y < m.height) this.cellClick.emit(pos);
    }
  }

  // ---------- teclado ----------

  protected onKey(e: KeyboardEvent, t: TokenView): void {
    const dir: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const d = dir[e.key];
    if (d) {
      e.preventDefault();
      this.tokenNudge.emit({ id: t.id, dx: d[0], dy: d[1] });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.tokenClick.emit(t.id);
    }
  }
}
