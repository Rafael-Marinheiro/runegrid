import { Creature } from '../../models/creature';
import { EncounterState, Role } from '../../models/encounter';
import { teamOf } from './state';

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
  const visible = new Set(state.tokens.filter((t) => !t.hidden).map((t) => t.creatureId));
  const known = (id: string) => visible.has(id) || role.owns.includes(id);

  const creatures = state.creatures
    .filter((c) => known(c.id))
    .map((c) => (role.owns.includes(c.id) || teamOf(c) === 'party' ? c : mask(c)));
  const order = state.combat.order.filter(known);
  const initiative = Object.fromEntries(
    Object.entries(state.combat.initiative).filter(([id]) => known(id)),
  );
  return {
    ...state,
    creatures,
    tokens: state.tokens.filter((t) => !t.hidden),
    log: state.log.filter((e) => !e.secret),
    combat: { ...state.combat, order, initiative },
  };
}
