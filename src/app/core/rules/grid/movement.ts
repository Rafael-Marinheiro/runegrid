import {
  blocksMovementAt,
  CELL_FT,
  DIFFICULT,
  DiagonalRule,
  GridMap,
  inBounds,
  Pos,
  terrainAt,
} from '../../models/grid';

export const key = (p: Pos): string => `${p.x},${p.y}`;

/** Células ocupadas por uma criatura de `size` células de lado, com a origem no canto superior esquerdo. */
export function footprint(p: Pos, size: number): Pos[] {
  const out: Pos[] = [];
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
}

/** Distância em pés entre duas células. */
export function cellDistanceFt(a: Pos, b: Pos, rule: DiagonalRule = 'simple'): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const extra = rule === 'alternate' ? Math.floor(Math.min(dx, dy) / 2) : 0;
  return (Math.max(dx, dy) + extra) * CELL_FT;
}

/** Menor distância entre duas criaturas (adjacentes = 5 ft). */
export function distanceFt(
  a: Pos,
  aSize: number,
  b: Pos,
  bSize: number,
  rule: DiagonalRule = 'simple',
): number {
  let best = Infinity;
  for (const ca of footprint(a, aSize)) {
    for (const cb of footprint(b, bSize)) best = Math.min(best, cellDistanceFt(ca, cb, rule));
  }
  return best;
}

export interface MoveQuery {
  map: GridMap;
  start: Pos;
  /** Lado da criatura em células. */
  size: number;
  budgetFt: number;
  /** Células ocupadas por outras criaturas (não podem ser atravessadas nem ocupadas). */
  blocked: ReadonlySet<string>;
  rule?: DiagonalRule;
  /**
   * Como a criatura se move: `walk` (terreno difícil custa o dobro), `fly` (ignora terreno difícil e água),
   * `swim` (a água custa o normal) ou `phase` (atravessa paredes e criaturas: etéreo, escavar).
   */
  mode?: MoveMode;
}

export type MoveMode = 'walk' | 'fly' | 'swim' | 'phase';

export interface Reachable {
  pos: Pos;
  costFt: number;
}

/** A criatura cabe em `p`: dentro do mapa, sem paredes e sem outras criaturas. */
export function canStand(
  map: GridMap,
  p: Pos,
  size: number,
  blocked: ReadonlySet<string>,
  phase = false,
): boolean {
  return footprint(p, size).every(
    (c) =>
      inBounds(map, c) && (phase || !blocksMovementAt(map, c)) && (phase || !blocked.has(key(c))),
  );
}

const noWalls = (map: GridMap, p: Pos, size: number, phase = false): boolean =>
  footprint(p, size).every((c) => inBounds(map, c) && (phase || !blocksMovementAt(map, c)));

const isDifficult = (map: GridMap, p: Pos, size: number, swim = false): boolean =>
  footprint(p, size).some((c) => {
    const t = terrainAt(map, c);
    return DIFFICULT.includes(t) && !(swim && t === 'water');
  });

interface Node {
  pos: Pos;
  /** Paridade de diagonais (regra 5-10-5): a próxima diagonal custa 10 se for 1. */
  parity: 0 | 1;
  cost: number;
  prev: string | null;
}

const skey = (p: Pos, parity: number): string => `${p.x},${p.y},${parity}`;

const DIRS: Pos[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/** Dijkstra por baldes (custos múltiplos de 5 ft): melhor custo e caminho até cada célula alcançável. */
function search(q: MoveQuery): Map<string, Node> {
  const rule = q.rule ?? 'simple';
  const phase = q.mode === 'phase';
  const nodes = new Map<string, Node>();
  const buckets: string[][] = [];
  const maxBucket = Math.floor(q.budgetFt / CELL_FT);

  const startNode: Node = { pos: q.start, parity: 0, cost: 0, prev: null };
  nodes.set(skey(q.start, 0), startNode);
  buckets[0] = [skey(q.start, 0)];

  for (let b = 0; b <= maxBucket; b++) {
    for (const k of buckets[b] ?? []) {
      const node = nodes.get(k)!;
      if (node.cost !== b * CELL_FT) continue; // entrada antiga: já achamos caminho melhor
      for (const d of DIRS) {
        const next: Pos = { x: node.pos.x + d.x, y: node.pos.y + d.y };
        if (!canStand(q.map, next, q.size, q.blocked, phase)) continue;
        const diagonal = d.x !== 0 && d.y !== 0;
        // não corta quina de parede
        if (diagonal) {
          const ox: Pos = { x: node.pos.x + d.x, y: node.pos.y };
          const oy: Pos = { x: node.pos.x, y: node.pos.y + d.y };
          if (!noWalls(q.map, ox, q.size, phase) || !noWalls(q.map, oy, q.size, phase)) continue;
        }
        let step = CELL_FT;
        let parity = node.parity;
        if (diagonal && rule === 'alternate') {
          step = node.parity === 1 ? 2 * CELL_FT : CELL_FT;
          parity = node.parity === 1 ? 0 : 1;
        }
        if (
          q.mode !== 'fly' &&
          q.mode !== 'phase' &&
          isDifficult(q.map, next, q.size, q.mode === 'swim')
        )
          step *= 2;
        const cost = node.cost + step;
        if (cost > q.budgetFt) continue;
        const nk = skey(next, parity);
        const old = nodes.get(nk);
        if (old && old.cost <= cost) continue;
        nodes.set(nk, { pos: next, parity: parity as 0 | 1, cost, prev: k });
        (buckets[cost / CELL_FT] ??= []).push(nk);
      }
    }
  }
  return nodes;
}

function bestPerCell(nodes: Map<string, Node>): Map<string, Node> {
  const best = new Map<string, Node>();
  for (const n of nodes.values()) {
    const k = key(n.pos);
    const cur = best.get(k);
    if (!cur || n.cost < cur.cost) best.set(k, n);
  }
  return best;
}

/** Todas as células alcançáveis dentro do orçamento (exclui a de partida). */
export function reachable(q: MoveQuery): Reachable[] {
  return [...bestPerCell(search(q)).values()]
    .filter((n) => n.prev !== null)
    .map((n) => ({ pos: n.pos, costFt: n.cost }));
}

/** Caminho mais barato até `to` (sem incluir a origem) e seu custo, ou `null` se não couber no orçamento. */
export function findPath(q: MoveQuery, to: Pos): { path: Pos[]; costFt: number } | null {
  const nodes = search(q);
  let best: Node | undefined;
  for (const parity of [0, 1]) {
    const n = nodes.get(skey(to, parity));
    if (n && (!best || n.cost < best.cost)) best = n;
  }
  if (!best || best.prev === null) return null;

  const path: Pos[] = [];
  for (let n: Node | undefined = best; n && n.prev !== null; n = nodes.get(n.prev))
    path.push(n.pos);
  return { path: path.reverse(), costFt: best.cost };
}
