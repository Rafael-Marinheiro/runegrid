import { CELL_FT, Pos } from '../../models/grid';
import { footprint } from './movement';

const center = (p: Pos): { x: number; y: number } => ({ x: p.x + 0.5, y: p.y + 0.5 });

/** Centro de uma criatura de `size` células com o canto em `p`, em unidades de célula. */
const bodyCenter = (p: Pos, size: number) => ({ x: p.x + size / 2, y: p.y + size / 2 });

/** A esfera de `radiusFt` centrada na célula `point` atinge alguma célula da criatura? */
export function inSphere(point: Pos, radiusFt: number, pos: Pos, size: number): boolean {
  const c = center(point);
  return footprint(pos, size).some((cell) => {
    const q = center(cell);
    return Math.hypot(q.x - c.x, q.y - c.y) * CELL_FT <= radiusFt;
  });
}

/**
 * O cone que nasce em `origin` (criatura de `originSize`), aponta para `toward` e mede `lengthFt`
 * atinge alguma célula da criatura? Em D&D a largura do cone é igual ao comprimento.
 */
export function inCone(
  origin: Pos,
  originSize: number,
  toward: Pos,
  lengthFt: number,
  pos: Pos,
  size: number,
): boolean {
  const o = bodyCenter(origin, originSize);
  const t = center(toward);
  const dir = { x: t.x - o.x, y: t.y - o.y };
  const dirLen = Math.hypot(dir.x, dir.y);
  if (dirLen === 0) return false;
  const own = new Set(footprint(origin, originSize).map((c) => `${c.x},${c.y}`));

  return footprint(pos, size).some((cell) => {
    if (own.has(`${cell.x},${cell.y}`)) return false;
    const q = center(cell);
    const v = { x: q.x - o.x, y: q.y - o.y };
    const dist = Math.hypot(v.x, v.y);
    if (dist * CELL_FT > lengthFt + CELL_FT / 2) return false;
    // meio-ângulo do cone (largura = comprimento) ≈ 26,6°; 30° compensa a grade
    const cos = (v.x * dir.x + v.y * dir.y) / (dist * dirLen);
    return cos >= Math.cos((30 * Math.PI) / 180);
  });
}
