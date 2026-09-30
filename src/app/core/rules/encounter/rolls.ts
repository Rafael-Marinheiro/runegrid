import { Ability, Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { attackDice, effectsOf, removeEffects, saveDice, saveFlat, saveModes } from '../creature';
import { AdvMode, roll, Rng } from '../dice';
import { addLog, creatureOf, withCreature } from './state';

/** Rola `+1d4` / `-1d4`; devolve o valor com sinal. */
function rollSigned(expr: string, rng: Rng): number {
  const neg = expr.startsWith('-');
  const total = roll(neg ? expr.slice(1) : expr, rng).total;
  return neg ? -total : total;
}

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

/** Gasta os efeitos de uso único (Orientação, Verdadeiro Golpe) que já cumpriram o papel. */
function spendOnce(
  state: EncounterState,
  c: Creature,
  used: (
    e: Creature['effects'] & object extends never
      ? never
      : NonNullable<Creature['effects']>[number],
  ) => boolean,
): EncounterState {
  const gone = effectsOf(c).filter((e) => e.mods.once && used(e));
  if (!gone.length) return state;
  return withCreature(
    state,
    removeEffects(c, (e) => gone.includes(e)),
  );
}

/** Dados de Bênção/Perdição somados a uma jogada de ataque. */
export function attackExtra(
  state: EncounterState,
  actorId: string,
  rng: Rng,
): { state: EncounterState; bonus: number; text: string } {
  const c = creatureOf(state, actorId);
  const dice = attackDice(c);
  const parts = dice.map((d) => rollSigned(d, rng));
  const bonus = parts.reduce((a, b) => a + b, 0);
  const s = spendOnce(state, c, (e) => !!e.mods.attackDie || !!e.mods.attackMode);
  return { state: s, bonus, text: parts.map(signed).join('') };
}

/** O alvo foi atacado: gasta o que valia só para o próximo ataque contra ele (Raio Guia). */
export function consumeAttacked(state: EncounterState, targetId: string): EncounterState {
  const t = creatureOf(state, targetId);
  const gone = effectsOf(t).filter((e) => e.mods.once && e.mods.attackedMode);
  return gone.length
    ? withCreature(
        state,
        removeEffects(t, (e) => gone.includes(e)),
      )
    : state;
}

/** Dados e bônus de efeitos (Bênção, Perdição, Vínculo Protetor) e modo (vantagem) numa salvaguarda. */
export function saveExtra(
  state: EncounterState,
  id: string,
  ability: Ability,
  rng: Rng,
): { state: EncounterState; bonus: number; text: string; mode: AdvMode } {
  const c = creatureOf(state, id);
  const parts = saveDice(c).map((d) => rollSigned(d, rng));
  const flat = saveFlat(c);
  const modes = saveModes(c, ability);
  const adv = modes.includes('advantage');
  const dis = modes.includes('disadvantage');
  const s = spendOnce(state, c, (e) => !!e.mods.saveDie || !!e.mods.saveMode);
  return {
    state: s,
    bonus: parts.reduce((a, b) => a + b, 0) + flat,
    text: parts.map(signed).join('') + (flat ? signed(flat) : ''),
    mode: adv && !dis ? 'advantage' : dis && !adv ? 'disadvantage' : 'normal',
  };
}

/** Invisibilidade e afins acabam quando quem os tem ataca ou conjura. */
export function dropOnAttack(state: EncounterState, actorId: string): EncounterState {
  const c = creatureOf(state, actorId);
  const gone = effectsOf(c).filter((e) => e.mods.endsOnAttack);
  if (!gone.length) return state;
  let s = withCreature(
    state,
    removeEffects(c, (e) => gone.includes(e)),
  );
  for (const e of gone) s = addLog(s, `${c.name}: ${e.name} termina.`, [c.id]);
  return s;
}
