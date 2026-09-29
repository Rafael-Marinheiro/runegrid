import { blocksSightAt, GridMap, Pos } from '../../models/grid';

export interface VisionSource {
  pos: Pos;
  /** Alcance em pés; `Infinity` representa um mapa iluminado. */
  rangeFt: number;
}

/** Células visíveis pelos centros indicados, bloqueadas por paredes e portas fechadas. */
export function visibleCells(map: GridMap, sources: VisionSource[]): Set<number> {
  // ponytail: varredura direta atende mapas de até 100×100; usar shadowcasting se o limite crescer.
  const visible = new Set<number>();
  for (const source of sources) {
    const range = source.rangeFt / 5;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (Math.hypot(x - source.pos.x, y - source.pos.y) > range) continue;
        const target = { x, y };
        if (hasLineOfSight(map, source.pos, target)) visible.add(y * map.width + x);
      }
    }
  }
  return visible;
}

/** O bloqueador é visível; somente células atrás dele ficam ocultas. */
export function hasLineOfSight(map: GridMap, from: Pos, to: Pos): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  for (let i = 1; i < steps; i++) {
    const pos = {
      x: Math.floor(from.x + 0.5 + (dx * i) / steps),
      y: Math.floor(from.y + 0.5 + (dy * i) / steps),
    };
    if (pos.x === to.x && pos.y === to.y) continue;
    if (blocksSightAt(map, pos)) return false;
  }
  return true;
}
