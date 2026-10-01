import { Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Pos } from '../../models/grid';
import { allMods } from '../creature';
import { distanceFt } from '../grid/movement';
import { T } from '../i18n';
import { Context } from './helpers';
import { roll } from '../dice';
import { addLog, creatureOf, sizeOf, teamOf, tokenOf, withCreature } from './state';

const dist = (state: EncounterState, a: Creature, pa: Pos, b: Creature, pb: Pos): number =>
  distanceFt(pa, sizeOf(a), pb, sizeOf(b), state.rule);

/**
 * Efeitos de proximidade depois de um movimento: o Cão Fiel late quando um inimigo Pequeno ou maior chega
 * a 9 m, e o Fungo Gritador grita quando alguém chega a 9 m dele.
 */
export function alertsAfterMove(
  state: EncounterState,
  moverId: string,
  from: Pos,
  to: Pos,
): EncounterState {
  let s = state;
  const mover = creatureOf(s, moverId);
  for (const t of state.tokens) {
    const c = creatureOf(s, t.creatureId);
    if (c.id === moverId || c.status === 'dead') continue;
    // Cão Fiel: late uma vez ao entrar nos 9 m (sem a senha: só quem não é aliado de quem o conjurou)
    if (c.summon?.guard) {
      const owner = state.creatures.find((x) => x.id === c.summon!.by);
      if (!owner || teamOf(mover) === teamOf(owner) || mover.size === 'tiny') continue;
      if (dist(s, c, t.pos, mover, from) > 30 && dist(s, c, t.pos, mover, to) <= 30)
        s = addLog(
          s,
          T(
            `${c.name} late alto: ${mover.name} chegou perto.`,
            `${c.name} barks loudly: ${mover.name} came close.`,
          ),
        );
      continue;
    }
    const sh = allMods(c).find((m) => m.shriek)?.shriek;
    if (!sh || c.shrieking !== undefined) continue;
    if (dist(s, c, t.pos, mover, to) <= sh.ft) {
      s = withCreature(s, { ...c, shrieking: -1 });
      s = addLog(
        s,
        T(
          `${c.name} grita (audível a 90 m): ${mover.name} chegou perto.`,
          `${c.name} shrieks (audible within 300 ft): ${mover.name} came close.`,
        ),
      );
    }
  }
  return s;
}

/** No turno do Fungo Gritador: o grito dura enquanto há alguém perto e depois por 1d4 turnos (ou 1 minuto, no 2024). */
export function shriekTurn(
  state: EncounterState,
  id: string,
  ctx: Pick<Context, 'rng'>,
): EncounterState {
  const c = creatureOf(state, id);
  const sh = allMods(c).find((m) => m.shriek)?.shriek;
  const at = tokenOf(state, id);
  if (!sh || c.shrieking === undefined || !at) return state;
  if (sh.minute) {
    const left = c.shrieking === -1 ? 10 : c.shrieking - 1;
    return left > 0
      ? withCreature(state, { ...c, shrieking: left })
      : addLog(
          withCreature(state, { ...c, shrieking: undefined }),
          T(`${c.name} para de gritar.`, `${c.name} stops shrieking.`),
        );
  }
  const near = state.tokens.some((t) => {
    const o = creatureOf(state, t.creatureId);
    return o.id !== id && o.status !== 'dead' && dist(state, c, at.pos, o, t.pos) <= sh.ft;
  });
  if (near) return withCreature(state, { ...c, shrieking: -1 });
  const left = c.shrieking === -1 ? roll('1d4', ctx.rng).total : c.shrieking - 1;
  return left > 0
    ? withCreature(state, { ...c, shrieking: left })
    : addLog(
        withCreature(state, { ...c, shrieking: undefined }),
        T(`${c.name} para de gritar.`, `${c.name} stops shrieking.`),
      );
}
