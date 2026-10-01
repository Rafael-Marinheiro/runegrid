/**
 * Traços passivos dos monstros (F13) que o motor aplica sozinho: Resistência Lendária, Táticas de
 * Matilha, Regeneração que se suspende, Implacável, Fortitude de Morto-vivo. Os modificadores vêm
 * de `monster-rules*.json` (ver `monsters/registry`) e entram em `allMods`.
 */
import { Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { allMods, autoFailsSave, canAct, saveBonus } from '../creature';
import { rollD20, Rng } from '../dice';
import { T } from '../i18n';
import { distanceFt } from '../grid/movement';
import { addLog, creatureOf, sizeOf, teamOf, tokenOf, withCreature } from './state';

/** Chave em `abilityState` dos usos da Resistência Lendária. */
export const LEGENDARY_RESISTANCE = 'legendary-resistance';

/** Um aliado capaz de agir a até 5 ft do alvo (Táticas de Matilha, Vantagem Marcial, Ataque Furtivo). */
export function allyAdjacent(state: EncounterState, actor: Creature, target: Creature): boolean {
  const at = tokenOf(state, target.id);
  if (!at) return false;
  return state.tokens.some((t) => {
    if (t.creatureId === actor.id || t.creatureId === target.id) return false;
    const o = creatureOf(state, t.creatureId);
    return (
      teamOf(o) === teamOf(actor) &&
      canAct(o) &&
      distanceFt(t.pos, sizeOf(o), at.pos, sizeOf(target), state.rule) <= 5
    );
  });
}

/** Resistência Lendária: gasta um uso e devolve `true` se a criatura ainda tinha. */
export function useLegendaryResistance(
  state: EncounterState,
  id: string,
): { state: EncounterState; used: boolean; left?: number; max?: number } {
  const c = creatureOf(state, id);
  const max = allMods(c).reduce((n, m) => n + (m.legendaryResistance ?? 0), 0);
  const used = c.abilityState?.[LEGENDARY_RESISTANCE]?.used ?? 0;
  if (!max || used >= max) return { state, used: false };
  const next = withCreature(state, {
    ...c,
    abilityState: { ...c.abilityState, [LEGENDARY_RESISTANCE]: { used: used + 1 } },
  });
  return { state: next, used: true, left: max - used - 1, max };
}

/**
 * Fortitude de Morto-vivo: a 0 PV, salvaguarda de Constituição CD 5 + dano (exceto dano radiante ou
 * crítico); sucesso = fica com 1 PV.
 */
export function undeadFortitude(
  state: EncounterState,
  id: string,
  dealt: number,
  rng: Rng,
): EncounterState {
  const c = creatureOf(state, id);
  if (c.status !== 'dead' || dealt <= 0 || !allMods(c).some((m) => m.undeadFortitude)) return state;
  if (c.lastHit?.type === 'radiant' || c.lastHit?.crit) return state;
  const dc = 5 + dealt;
  const r = rollD20(saveBonus(c, 'con'), 'normal', rng);
  const ok = !autoFailsSave(c, 'con') && r.roll.total >= dc;
  const next = ok
    ? withCreature(state, { ...c, status: 'alive', hp: { ...c.hp, current: 1 } })
    : state;
  return addLog(
    next,
    T(
      `${c.name}: Fortitude de Morto-vivo — Constituição d20 ${r.natural} = ${r.roll.total} vs CD ${dc}: ${ok ? 'fica com 1 PV' : 'cai'}.`,
      `${c.name}: Undead Fortitude — Constitution d20 ${r.natural} = ${r.roll.total} vs DC ${dc}: ${ok ? 'drops to 1 HP instead' : 'falls'}.`,
    ),
    [id],
  );
}
