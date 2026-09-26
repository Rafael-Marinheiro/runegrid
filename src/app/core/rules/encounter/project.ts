import { Creature } from '../../models/creature';
import { EncounterState, Role } from '../../models/encounter';
import { footprint } from '../grid/movement';
import { sizeOf, teamOf } from './state';

/** Esconde de um inimigo o que o jogador não deve saber: PV exatos, ataques, magias. */
function mask(c: Creature): Creature {
  const pct = c.hp.max ? Math.round((c.hp.current / c.hp.max) * 100) : 0;
  return {
    ...c,
    hp: { max: 100, current: pct, temp: 0 },
    attacks: [],
    resources: [],
    spellSlots: {},
    deathSaves: { successes: 0, failures: 0 },
    ac: 0,
  };
}

/**
 * Visão do encontro para um papel. O Mestre vê tudo; o jogador não recebe tokens ocultos
 * nem os dados exatos dos inimigos (PV viram porcentagem). Só isso viaja pela rede.
 */
export function project(state: EncounterState, role: Role): EncounterState {
  if (role.kind === 'dm') return state;
  const { map } = state;
  const fog = map.fog;
  const fogged = (x: number, y: number) => !!fog && fog[y * map.width + x] === true;

  // criatura na névoa não é vista (a menos que seja do próprio jogador)
  const visible = new Set(
    state.tokens
      .filter((t) => {
        if (t.hidden) return false;
        const c = state.creatures.find((x) => x.id === t.creatureId);
        const size = c ? sizeOf(c) : 1;
        return !footprint(t.pos, size).some((p) => fogged(p.x, p.y));
      })
      .map((t) => t.creatureId),
  );
  const known = (id: string) => visible.has(id) || role.owns.includes(id);

  const creatures = state.creatures
    .filter((c) => known(c.id))
    .map((c) => (role.owns.includes(c.id) || teamOf(c) === 'party' ? c : mask(c)));
  const order = state.combat.order.filter(known);
  const initiative = Object.fromEntries(
    Object.entries(state.combat.initiative).filter(([id]) => known(id)),
  );

  const openRooms = (map.rooms ?? [])
    .filter((r) => {
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++) if (fogged(x, y)) return false;
      return true;
    })
    .map((r) => ({ ...r, notes: '' }));

  return {
    ...state,
    creatures,
    tokens: state.tokens.filter((t) => known(t.creatureId)),
    log: state.log.filter((e) => !e.secret),
    map: {
      ...map,
      cells: map.cells.map((t, i) => (fog?.[i] ? 'unknown' : t)),
      fog: undefined,
      rooms: openRooms,
      traps: (map.traps ?? []).filter((t) => !t.hidden || t.triggered),
    },
    combat: { ...state.combat, order, initiative },
  };
}
