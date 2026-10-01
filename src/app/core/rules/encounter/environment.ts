import { Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { footprint } from '../grid/movement';
import { terrainAt } from '../../models/grid';
import { allMods } from '../creature';
import { sizeOf, tokenOf } from './state';

/** Dentro de uma sala não há luz do sol; ao ar livre (fora de todas as salas) há, se o Mestre a ligou. */
export function isSunlit(state: EncounterState, c: Creature): boolean {
  if (!state.map.sunlight || c.plane === 'ethereal') return false;
  const t = tokenOf(state, c.id);
  if (!t) return false;
  const rooms = state.map.rooms ?? [];
  return !footprint(t.pos, sizeOf(c)).some((p) =>
    rooms.some((r) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h),
  );
}

/** Está em água corrente: o mapa tem rio e alguma célula sua é de água. */
export function inRunningWater(state: EncounterState, c: Creature): boolean {
  if (!state.map.runningWater || c.plane === 'ethereal') return false;
  const t = tokenOf(state, c.id);
  return !!t && footprint(t.pos, sizeOf(c)).some((p) => terrainAt(state.map, p) === 'water');
}

/** A criatura sofre desvantagem nos ataques por estar à luz do sol. */
export const sunPenalty = (state: EncounterState, c: Creature): boolean =>
  allMods(c).some((m) => m.sunDisadvantage) && isSunlit(state, c);
