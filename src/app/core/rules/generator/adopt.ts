import { GeneratedAdventure } from '../../models/adventure';
import { Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Pos } from '../../models/grid';
import { SrdMonster } from '../../models/srd';
import { mulberry32, seedFromString } from '../dice';
import { dispatch, newEncounter, occupiedCells, sizeOf } from '../encounter';
import { canStand } from '../grid/movement';
import { monsterToCreature } from '../srd/convert';
import { shuffle } from './util';

/**
 * Transforma a aventura gerada num encontro pronto para jogar: mapa com névoa, monstros ocultos
 * nas suas salas e o grupo na sala de entrada. O restante das salas continua sob névoa.
 */
export function adventureToEncounter(
  adv: GeneratedAdventure,
  party: Creature[],
  monsters: SrdMonster[],
  /** Miniatura do monstro (n-ésima cópia do mesmo id, começando em 0); ausente = sem arte. */
  pickArt?: (m: SrdMonster, variant: number) => string | undefined,
): EncounterState {
  const ctx = { rng: mulberry32(seedFromString(adv.params.seed)), role: { kind: 'dm' } as const };
  const byId = new Map(monsters.map((m) => [m.id, m]));
  let s = newEncounter(adv.map, adv.name);

  const free = (
    state: EncounterState,
    room: { x: number; y: number; w: number; h: number },
    size: number,
  ): Pos | null => {
    const occupied = occupiedCells(state);
    const cells: Pos[] = [];
    for (let y = room.y; y < room.y + room.h; y++)
      for (let x = room.x; x < room.x + room.w; x++) cells.push({ x, y });
    return shuffle(ctx.rng, cells).find((c) => canStand(state.map, c, size, occupied)) ?? null;
  };

  const entrance = adv.rooms[0];
  for (const c of party) {
    const pos = free(s, entrance, sizeOf(c));
    s = dispatch(s, { type: 'addCreature', creature: c, ...(pos ? { pos } : {}) }, ctx);
  }

  // numeração única por monstro em toda a aventura ("Ghoul 1" … "Ghoul 12")
  const totals = new Map<string, number>();
  for (const g of adv.encounters.flatMap((e) => e.groups))
    totals.set(g.monsterId, (totals.get(g.monsterId) ?? 0) + g.count);
  const seen = new Map<string, number>();

  for (const enc of adv.encounters) {
    const room = adv.rooms.find((r) => r.id === enc.roomId)!;
    for (const g of enc.groups) {
      const m = byId.get(g.monsterId);
      if (!m) continue;
      for (let i = 1; i <= g.count; i++) {
        const n = (seen.get(m.id) ?? 0) + 1;
        seen.set(m.id, n);
        const creature = monsterToCreature(
          m,
          (totals.get(m.id) ?? 1) > 1 ? `${m.name} ${n}` : m.name,
          pickArt?.(m, n - 1),
        );
        const pos = free(s, room, sizeOf(creature));
        s = dispatch(
          s,
          { type: 'addCreature', creature, ...(pos ? { pos, hidden: true } : {}) },
          ctx,
        );
      }
    }
  }
  return s;
}
