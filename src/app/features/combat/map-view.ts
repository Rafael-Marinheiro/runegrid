import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { GridMap, MapObject, MapObjectTexture, Pos, Room, Trap } from '@core/models/grid';
import { UiPrefs } from '@state/ui-prefs';
import { FxLayer, FxView } from './fx-layer';
import { MAP_OBJECT_ART, MAP_OBJECT_TEXTURE_LABEL } from './map-object-art';
import { ICON_PATH, IconId } from './token-icons';

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
  /** Ícone do token; sem ele, aparece a inicial. */
  icon: IconId | null;
  /** Retrato próprio; tem prioridade sobre o ícone. */
  image: string | null;
  /** Quantidade de condições ativas. */
  conditions: number;
  concentrating: boolean;
}

export type AreaPreview =
  | { kind: 'sphere'; center: Pos; radiusFt: number }
  | { kind: 'cone'; origin: Pos; originSize: number; toward: Pos; lengthFt: number };

interface Drag {
  id: string;
  kind: 'token' | 'object';
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

interface Pinch {
  distance: number;
  midpoint: Pos;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

@Component({
  selector: 'app-map-view',
  imports: [FxLayer],
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapView {
  protected readonly ui = inject(UiPrefs);
  readonly map = input.required<GridMap>();
  readonly tokens = input.required<TokenView[]>();
  /** Células alcançáveis pela criatura na vez. */
  readonly reach = input<Pos[]>([]);
  /** Área de magia em preparo, desenhada sobre o mapa. */
  readonly preview = input<AreaPreview | null>(null);
  /** Modo pincel (Estúdio): arrastar no fundo desenha em vez de mover o mapa (Shift ou botão do meio move). */
  readonly paintMode = input(false);
  /** Visão do Mestre: mostra a névoa e as armadilhas escondidas. */
  readonly dm = input(false);
  readonly fogCells = input<boolean[] | undefined>(undefined);
  readonly rooms = input<Room[]>([]);
  readonly traps = input<Trap[]>([]);
  readonly selectedRoom = input<string | null>(null);
  readonly selectedObject = input<string | null>(null);
  /** Retângulo sendo desenhado (sala). */
  readonly draft = input<{ a: Pos; b: Pos } | null>(null);
  /** Alto contraste: sem texturas e com anéis mais grossos. */
  readonly highContrast = input(false);
  /** Caminho em prévia (células, na ordem) e o custo. */
  readonly path = input<{ cells: Pos[]; label: string } | null>(null);
  /** Régua: dois pontos e o texto da distância. */
  readonly ruler = input<{ a: Pos; b: Pos; label: string } | null>(null);

  readonly cellClick = output<Pos>();
  /** Shift+clique: marcar a célula para todos. */
  readonly cellPing = output<Pos>();
  readonly pings = input<{ id: number; from: string; pos: Pos }[]>([]);
  readonly tokenClick = output<string>();
  readonly tokenMove = output<{ id: string; pos: Pos }>();
  readonly tokenNudge = output<{ id: string; dx: number; dy: number }>();
  readonly objectClick = output<string>();
  readonly objectMove = output<{ id: string; pos: Pos }>();
  readonly objectNudge = output<{ id: string; dx: number; dy: number }>();
  /** Célula sob o cursor (null ao sair do mapa). */
  readonly cellHover = output<Pos | null>();
  readonly strokeStart = output<Pos>();
  readonly strokeMove = output<Pos>();
  readonly strokeEnd = output<void>();

  /** Efeitos visuais de ações recentes (magias, golpes); só enfeite, nunca altera regra. */
  readonly effects = input<FxView[]>([]);

  protected readonly C = CELL;

  protected readonly iconPath = ICON_PATH;
  protected readonly objectArt = MAP_OBJECT_ART;
  protected readonly texture = computed(() =>
    this.highContrast() ? 'none' : (this.map().texture ?? 'none'),
  );

  protected readonly pathPoints = computed(() =>
    (this.path()?.cells ?? []).map((c) => `${(c.x + 0.5) * CELL},${(c.y + 0.5) * CELL}`).join(' '),
  );
  protected readonly pathEnd = computed(() => {
    const last = this.path()?.cells.at(-1);
    return last ? { x: (last.x + 0.5) * CELL, y: last.y * CELL - 6 } : null;
  });
  protected readonly rulerShape = computed(() => {
    const r = this.ruler();
    if (!r) return null;
    const x1 = (r.a.x + 0.5) * CELL;
    const y1 = (r.a.y + 0.5) * CELL;
    const x2 = (r.b.x + 0.5) * CELL;
    const y2 = (r.b.y + 0.5) * CELL;
    return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 - 10, label: r.label };
  });
  protected readonly zoom = signal(1);
  protected readonly pan = signal<Pos>({ x: 0, y: 0 });
  protected readonly drag = signal<Drag | null>(null);
  private panning: Pan | null = null;
  private pinch: Pinch | null = null;
  private readonly touches = new Map<number, Pos>();
  private lastHover = '';
  private stroking = false;
  private lastStroke = '';
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly cells = computed(() => {
    const m = this.map();
    return m.cells.map((t, i) => ({ i, x: i % m.width, y: Math.floor(i / m.width), t }));
  });
  protected readonly sphere = computed(() => {
    const p = this.preview();
    if (p?.kind !== 'sphere') return null;
    return {
      cx: (p.center.x + 0.5) * CELL,
      cy: (p.center.y + 0.5) * CELL,
      r: (p.radiusFt / 5) * CELL,
    };
  });

  protected readonly cone = computed(() => {
    const p = this.preview();
    if (p?.kind !== 'cone') return null;
    const ox = (p.origin.x + p.originSize / 2) * CELL;
    const oy = (p.origin.y + p.originSize / 2) * CELL;
    const ang = Math.atan2((p.toward.y + 0.5) * CELL - oy, (p.toward.x + 0.5) * CELL - ox);
    const len = (p.lengthFt / 5) * CELL;
    const half = Math.atan(0.5); // a largura do cone é igual ao comprimento
    const pt = (a: number) => `${ox + len * Math.cos(a)},${oy + len * Math.sin(a)}`;
    return `${ox},${oy} ${pt(ang - half)} ${pt(ang + half)}`;
  });

  /** Células sob névoa (só desenhadas na visão do Mestre). */
  protected readonly fogList = computed(() => {
    const fog = this.fogCells();
    const m = this.map();
    if (!this.dm() || !fog) return [];
    return fog.flatMap((f, i) => (f ? [{ i, x: i % m.width, y: Math.floor(i / m.width) }] : []));
  });

  protected readonly draftRect = computed(() => {
    const d = this.draft();
    if (!d) return null;
    const x = Math.min(d.a.x, d.b.x);
    const y = Math.min(d.a.y, d.b.y);
    return { x, y, w: Math.abs(d.a.x - d.b.x) + 1, h: Math.abs(d.a.y - d.b.y) + 1 };
  });

  protected readonly visibleTraps = computed(() =>
    this.traps().filter((t) => this.dm() || !t.hidden || t.triggered),
  );

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
    if (d?.kind === 'token' && d.id === t.id && d.moved)
      return { x: d.cx - (t.size * CELL) / 2, y: d.cy - (t.size * CELL) / 2 };
    return { x: t.pos.x * CELL, y: t.pos.y * CELL };
  }

  protected placeObject(object: MapObject): { x: number; y: number } {
    const d = this.drag();
    if (d?.kind === 'object' && d.id === object.id && d.moved)
      return { x: d.cx - CELL / 2, y: d.cy - CELL / 2 };
    return { x: object.pos.x * CELL, y: object.pos.y * CELL };
  }

  protected objectLabel(object: MapObject): string {
    const name = MAP_OBJECT_ART[object.kind].label;
    const material = MAP_OBJECT_TEXTURE_LABEL[this.objectTexture(object)];
    const rotation = this.objectRotation(object);
    return this.ui.text(
      `${name[0]}, ${material[0].toLowerCase()}, orientação ${rotation} graus, coluna ${object.pos.x + 1}, linha ${object.pos.y + 1}.`,
      `${name[1]}, ${material[1].toLowerCase()}, ${rotation} degree orientation, column ${object.pos.x + 1}, row ${object.pos.y + 1}.`,
    );
  }

  protected objectTexture(object: MapObject): MapObjectTexture {
    return object.texture ?? MAP_OBJECT_ART[object.kind].defaults.texture;
  }

  protected objectRotation(object: MapObject): number {
    return object.rotation ?? 0;
  }

  protected label(t: TokenView): string {
    const state = t.dead
      ? this.ui.text(', morto', ', dead')
      : t.hidden
        ? this.ui.text(', oculto', ', hidden')
        : '';
    return this.ui.text(
      `${t.name}${state}, coluna ${t.pos.x + 1}, linha ${t.pos.y + 1}. Setas movem, Enter seleciona.`,
      `${t.name}${state}, column ${t.pos.x + 1}, row ${t.pos.y + 1}. Arrow keys move, Enter selects.`,
    );
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
    if (e.button !== 0 && !(e.button === 1 && this.paintMode())) return;
    const p = this.toSvg(e);
    const tokenEl = (e.target as Element).closest<SVGGElement>('[data-token]');
    const objectEl = this.paintMode()
      ? (e.target as Element).closest<SVGGElement>('[data-object]')
      : null;
    this.svg().nativeElement.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        this.drag.set(null);
        this.panning = null;
        if (this.stroking) {
          this.stroking = false;
          this.strokeEnd.emit();
        }
        this.pinch = this.pinchState();
        return;
      }
    }
    if (tokenEl) {
      const t = this.tokens().find((x) => x.id === tokenEl.dataset['token']);
      if (!t) return;
      const cx = t.pos.x * CELL + (t.size * CELL) / 2;
      const cy = t.pos.y * CELL + (t.size * CELL) / 2;
      this.drag.set({
        id: t.id,
        kind: 'token',
        size: t.size,
        cx,
        cy,
        offX: p.x - cx,
        offY: p.y - cy,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      });
    } else if (objectEl) {
      const object = (this.map().objects ?? []).find(
        (item) => item.id === objectEl.dataset['object'],
      );
      if (!object) return;
      this.drag.set({
        id: object.id,
        kind: 'object',
        size: 1,
        cx: (object.pos.x + 0.5) * CELL,
        cy: (object.pos.y + 0.5) * CELL,
        offX: p.x - (object.pos.x + 0.5) * CELL,
        offY: p.y - (object.pos.y + 0.5) * CELL,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      });
    } else if (this.paintMode() && !e.shiftKey) {
      const c = this.cellAt(e);
      if (c) {
        this.stroking = true;
        this.lastStroke = `${c.x},${c.y}`;
        this.strokeStart.emit(c);
      }
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
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) return this.updatePinch();
    }
    const d = this.drag();
    if (d) {
      const p = this.toSvg(e);
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5;
      this.drag.set({ ...d, cx: p.x - d.offX, cy: p.y - d.offY, moved });
      return;
    }
    if (this.stroking) {
      const c = this.cellAt(e);
      const k = c ? `${c.x},${c.y}` : '';
      if (c && k !== this.lastStroke) {
        this.lastStroke = k;
        this.strokeMove.emit(c);
      }
      return this.hoverAt(e);
    }
    const pn = this.panning;
    if (!pn) return this.hoverAt(e);
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
    if (e.pointerType === 'touch') {
      const wasPinching = this.pinch !== null;
      this.touches.delete(e.pointerId);
      if (wasPinching) {
        this.pinch = null;
        const remaining = this.touches.values().next().value as Pos | undefined;
        this.panning = remaining
          ? {
              startX: remaining.x,
              startY: remaining.y,
              originX: this.pan().x,
              originY: this.pan().y,
              moved: true,
            }
          : null;
        return;
      }
    }
    const d = this.drag();
    if (d) {
      this.drag.set(null);
      if (!d.moved)
        return void (d.kind === 'token' ? this.tokenClick : this.objectClick).emit(d.id);
      const moved = {
        id: d.id,
        pos: {
          x: Math.round((d.cx - (d.size * CELL) / 2) / CELL),
          y: Math.round((d.cy - (d.size * CELL) / 2) / CELL),
        },
      };
      (d.kind === 'token' ? this.tokenMove : this.objectMove).emit(moved);
      return;
    }
    if (this.stroking) {
      this.stroking = false;
      this.strokeEnd.emit();
      return;
    }
    const pn = this.panning;
    this.panning = null;
    if (pn && !pn.moved) {
      const p = this.toSvg(e);
      const pos = { x: Math.floor(p.x / CELL), y: Math.floor(p.y / CELL) };
      const m = this.map();
      if (pos.x >= 0 && pos.y >= 0 && pos.x < m.width && pos.y < m.height)
        (e.shiftKey ? this.cellPing : this.cellClick).emit(pos);
    }
  }

  protected onPointerCancel(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    this.pinch = null;
    this.drag.set(null);
    this.panning = null;
    if (this.stroking) {
      this.stroking = false;
      this.strokeEnd.emit();
    }
  }

  private pinchState(): Pinch {
    const [a, b] = [...this.touches.values()];
    return {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  private updatePinch(): void {
    const next = this.pinchState();
    const previous = this.pinch;
    if (!previous) {
      this.pinch = next;
      return;
    }
    const scale = this.svg().nativeElement.getScreenCTM()?.a ?? 1;
    const pan = this.pan();
    this.pan.set({
      x: pan.x - (next.midpoint.x - previous.midpoint.x) / scale,
      y: pan.y - (next.midpoint.y - previous.midpoint.y) / scale,
    });
    this.zoomBy(
      next.distance / previous.distance,
      this.toSvg({ clientX: next.midpoint.x, clientY: next.midpoint.y }),
    );
    this.pinch = next;
  }

  private cellAt(e: PointerEvent): Pos | null {
    const p = this.toSvg(e);
    const m = this.map();
    const x = Math.floor(p.x / CELL);
    const y = Math.floor(p.y / CELL);
    return x >= 0 && y >= 0 && x < m.width && y < m.height ? { x, y } : null;
  }

  private hoverAt(e: PointerEvent): void {
    const p = this.toSvg(e);
    const m = this.map();
    const x = Math.floor(p.x / CELL);
    const y = Math.floor(p.y / CELL);
    const inside = x >= 0 && y >= 0 && x < m.width && y < m.height;
    const k = inside ? `${x},${y}` : '';
    if (k === this.lastHover) return;
    this.lastHover = k;
    this.cellHover.emit(inside ? { x, y } : null);
  }

  protected onLeave(): void {
    if (this.lastHover === '') return;
    this.lastHover = '';
    this.cellHover.emit(null);
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

  protected onObjectKey(e: KeyboardEvent, object: MapObject): void {
    const dir: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const d = dir[e.key];
    if (d) {
      e.preventDefault();
      this.objectNudge.emit({ id: object.id, dx: d[0], dy: d[1] });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.objectClick.emit(object.id);
    }
  }
}
