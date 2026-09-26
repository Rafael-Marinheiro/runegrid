import { Pos, Terrain } from '../../models/grid';
import { Rng } from '../dice';
import { chance, int, pick } from './util';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  width: number;
  height: number;
  cells: Terrain[];
  /** Salas em ordem de esquerda para direita; a primeira é a entrada. */
  rooms: Rect[];
}

const idx = (l: { width: number }, x: number, y: number) => y * l.width + x;
const isOpen = (t: Terrain) => t !== 'wall' && t !== 'unknown';

export const center = (r: Rect): Pos => ({
  x: r.x + Math.floor(r.w / 2),
  y: r.y + Math.floor(r.h / 2),
});

const overlaps = (a: Rect, b: Rect, pad: number): boolean =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

function carveRect(l: Layout, r: Rect, terrain: Terrain = 'floor'): void {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) l.cells[idx(l, x, y)] = terrain;
}

/** Corredor em L de `a` a `b` (só abre paredes; não mexe no que já é piso). */
function carveCorridor(l: Layout, a: Pos, b: Pos, horizontalFirst: boolean): void {
  const step = (x: number, y: number) => {
    if (x > 0 && y > 0 && x < l.width - 1 && y < l.height - 1 && l.cells[idx(l, x, y)] === 'wall') {
      l.cells[idx(l, x, y)] = 'floor';
    }
  };
  const h = (y: number, x0: number, x1: number) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) step(x, y);
  };
  const v = (x: number, y0: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) step(x, y);
  };
  if (horizontalFirst) {
    h(a.y, a.x, b.x);
    v(b.x, a.y, b.y);
  } else {
    v(a.x, a.y, b.y);
    h(b.y, a.x, b.x);
  }
}

/** Todas as células alcançáveis a partir de `from` (portas contam como passagem). */
export function flood(l: Layout, from: Pos): Map<number, number> {
  const dist = new Map<number, number>();
  if (!isOpen(l.cells[idx(l, from.x, from.y)])) return dist;
  const q: Pos[] = [from];
  dist.set(idx(l, from.x, from.y), 0);
  // a fila cresce durante a iteração (busca em largura)
  for (const p of q) {
    const d = dist.get(idx(l, p.x, p.y))!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 0 || y < 0 || x >= l.width || y >= l.height) continue;
      const k = idx(l, x, y);
      if (dist.has(k) || !isOpen(l.cells[k])) continue;
      dist.set(k, d + 1);
      q.push({ x, y });
    }
  }
  return dist;
}

/** Garante que toda sala é alcançável da entrada; se não, abre um corredor até a mais próxima. */
export function ensureConnected(l: Layout, rng: Rng): void {
  for (let guard = 0; guard < l.rooms.length + 2; guard++) {
    const reach = flood(l, center(l.rooms[0]));
    const lost = l.rooms.filter((r) => !reach.has(idx(l, center(r).x, center(r).y)));
    if (!lost.length) return;
    const target = lost[0];
    const linked = l.rooms.filter((r) => reach.has(idx(l, center(r).x, center(r).y)));
    const c = center(target);
    const near = linked.reduce((best, r) =>
      Math.abs(center(r).x - c.x) + Math.abs(center(r).y - c.y) <
      Math.abs(center(best).x - c.x) + Math.abs(center(best).y - c.y)
        ? r
        : best,
    );
    carveCorridor(l, center(near), c, chance(rng, 0.5));
  }
}

/** Portas onde um corredor encontra a borda de uma sala. */
function placeDoors(l: Layout, rng: Rng): void {
  const inside = (x: number, y: number) =>
    l.rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const wall = (x: number, y: number) => l.cells[idx(l, x, y)] === 'wall';
  for (const r of l.rooms) {
    const ring: Pos[] = [];
    for (let x = r.x; x < r.x + r.w; x++) ring.push({ x, y: r.y - 1 }, { x, y: r.y + r.h });
    for (let y = r.y; y < r.y + r.h; y++) ring.push({ x: r.x - 1, y }, { x: r.x + r.w, y });
    for (const p of ring) {
      if (p.x < 1 || p.y < 1 || p.x >= l.width - 1 || p.y >= l.height - 1) continue;
      if (l.cells[idx(l, p.x, p.y)] !== 'floor' || inside(p.x, p.y)) continue;
      // porta só onde as células ao lado (ao longo da borda) são parede: é uma passagem estreita
      const horizontalEdge = p.y === r.y - 1 || p.y === r.y + r.h;
      const sides = horizontalEdge
        ? [wall(p.x - 1, p.y), wall(p.x + 1, p.y)]
        : [wall(p.x, p.y - 1), wall(p.x, p.y + 1)];
      if (sides[0] && sides[1])
        l.cells[idx(l, p.x, p.y)] = chance(rng, 0.6) ? 'door-closed' : 'door';
    }
  }
}

export interface DungeonStyle {
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
}

/** Salas retangulares ligadas por corredores, com portas. */
export function dungeonLayout(
  width: number,
  height: number,
  count: number,
  style: DungeonStyle,
  rng: Rng,
): Layout {
  const l: Layout = {
    width,
    height,
    cells: Array<Terrain>(width * height).fill('wall'),
    rooms: [],
  };
  for (let tries = 0; tries < count * 120 && l.rooms.length < count; tries++) {
    const w = int(rng, style.minW, style.maxW);
    const h = int(rng, style.minH, style.maxH);
    const r: Rect = { x: int(rng, 1, width - w - 2), y: int(rng, 1, height - h - 2), w, h };
    if (l.rooms.some((o) => overlaps(r, o, 2))) continue;
    l.rooms.push(r);
    carveRect(l, r);
  }
  l.rooms.sort((a, b) => a.x - b.x || a.y - b.y);
  for (let i = 0; i + 1 < l.rooms.length; i++) {
    carveCorridor(l, center(l.rooms[i]), center(l.rooms[i + 1]), chance(rng, 0.5));
  }
  // alguns atalhos para não ficar linear
  for (let i = 0; i + 2 < l.rooms.length; i++) {
    if (chance(rng, 0.25))
      carveCorridor(l, center(l.rooms[i]), center(l.rooms[i + 2]), chance(rng, 0.5));
  }
  ensureConnected(l, rng);
  placeDoors(l, rng);
  return l;
}

/** Cavernas por autômato celular; as "salas" são câmaras espaçadas dentro da maior região aberta. */
export function caveLayout(width: number, height: number, count: number, rng: Rng): Layout {
  let cells: Terrain[] = Array.from({ length: width * height }, (_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    return x === 0 || y === 0 || x === width - 1 || y === height - 1 || chance(rng, 0.44)
      ? 'wall'
      : 'floor';
  });
  for (let it = 0; it < 5; it++) {
    const next = [...cells];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if (cells[(y + dy) * width + x + dx] === 'wall') walls++;
        next[y * width + x] = walls >= 5 ? 'wall' : 'floor';
      }
    }
    cells = next;
  }
  const l: Layout = { width, height, cells, rooms: [] };
  keepLargestRegion(l);
  return placeChambers(l, count, rng, 6, 5);
}

/** Terreno aberto (floresta, pântano): obstáculos espalhados e clareiras. */
export function openLayout(
  width: number,
  height: number,
  count: number,
  rng: Rng,
  swamp: boolean,
): Layout {
  const cells: Terrain[] = Array.from({ length: width * height }, (_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    return x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'wall' : 'floor';
  });
  const l: Layout = { width, height, cells, rooms: [] };
  const blobs = Math.round((width * height) / 60);
  for (let b = 0; b < blobs; b++) {
    const cx = int(rng, 2, width - 3);
    const cy = int(rng, 2, height - 3);
    const kind: Terrain = swamp
      ? pick(rng, ['water', 'water', 'difficult', 'wall'] as const)
      : pick(rng, ['wall', 'wall', 'difficult'] as const);
    const rx = int(rng, 1, 3);
    const ry = int(rng, 1, 2);
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (x > 0 && y > 0 && x < width - 1 && y < height - 1) cells[y * width + x] = kind;
      }
    }
  }
  keepLargestRegion(l);
  return placeChambers(l, count, rng, 7, 5);
}

/** Espalha `count` clareiras/câmaras bem separadas, abrindo o piso onde for preciso. */
function placeChambers(l: Layout, count: number, rng: Rng, w: number, h: number): Layout {
  const open: Pos[] = [];
  for (let y = 2; y < l.height - 2; y++)
    for (let x = 2; x < l.width - 2; x++) if (isOpen(l.cells[idx(l, x, y)])) open.push({ x, y });
  const spacing = Math.max(w, h) + 3;
  for (let tries = 0; tries < 4000 && l.rooms.length < count && open.length; tries++) {
    const c = pick(rng, open);
    const r: Rect = {
      x: Math.max(1, Math.min(l.width - w - 1, c.x - Math.floor(w / 2))),
      y: Math.max(1, Math.min(l.height - h - 1, c.y - Math.floor(h / 2))),
      w,
      h,
    };
    if (l.rooms.some((o) => overlaps(r, o, spacing - Math.max(w, h)))) continue;
    l.rooms.push(r);
    carveRect(l, r);
  }
  l.rooms.sort((a, b) => a.x - b.x || a.y - b.y);
  ensureConnected(l, rng);
  return l;
}

/** Mantém só a maior região aberta (o resto vira parede). */
function keepLargestRegion(l: Layout): void {
  const seen = new Set<number>();
  let best: number[] = [];
  for (let i = 0; i < l.cells.length; i++) {
    if (seen.has(i) || !isOpen(l.cells[i])) continue;
    const region = [...flood(l, { x: i % l.width, y: Math.floor(i / l.width) }).keys()];
    region.forEach((k) => seen.add(k));
    if (region.length > best.length) best = region;
  }
  const keep = new Set(best);
  for (let i = 0; i < l.cells.length; i++) if (!keep.has(i)) l.cells[i] = 'wall';
}
