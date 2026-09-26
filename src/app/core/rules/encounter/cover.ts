import { EncounterState } from '../../models/encounter';
import { IMPASSABLE, Pos, terrainAt } from '../../models/grid';
import { AdvMode } from '../dice';

/** Células entre `a` e `b` (exclusive), pela linha de Bresenham. */
function between(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = [];
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  let { x, y } = a;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x !== b.x || y !== b.y) out.push({ x, y });
  }
  return out;
}

/** Bônus de CA por cobertura: 1 obstáculo na linha = meia (+2); 2 ou mais = três quartos (+5). */
export function coverBonus(state: EncounterState, from: Pos, to: Pos): number {
  const blockers = between(from, to).filter((p) =>
    IMPASSABLE.includes(terrainAt(state.map, p)),
  ).length;
  return blockers === 0 ? 0 : blockers === 1 ? 2 : 5;
}

/** Vantagem por Ajuda contra `targetId` e o estado sem a Ajuda gasta. */
export function consumeHelp(
  state: EncounterState,
  targetId: string,
): { state: EncounterState; modes: AdvMode[] } {
  const helped = state.combat.helped ?? [];
  if (!helped.some((h) => h.targetId === targetId)) return { state, modes: [] };
  return {
    state: {
      ...state,
      combat: { ...state.combat, helped: helped.filter((h) => h.targetId !== targetId) },
    },
    modes: ['advantage'],
  };
}
