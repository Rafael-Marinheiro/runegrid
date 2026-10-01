import { Ability, CONDITION_LABEL, Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { attackDice, effectsOf, removeEffects, saveDice, saveFlat, saveModes } from '../creature';
import { AdvMode, roll, Rng } from '../dice';
import { addLog, creatureOf, withCreature } from './state';
import { T, condT, spellT } from '../i18n';

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
  const conds = c.conditions.filter((k) => k.endsOnAttack);
  if (!gone.length && !conds.length) return state;
  let s = withCreature(
    state,
    removeEffects({ ...c, conditions: c.conditions.filter((k) => !k.endsOnAttack) }, (e) =>
      gone.includes(e),
    ),
  );
  for (const e of gone)
    s = addLog(s, T(`${c.name}: ${e.name} termina.`, `${c.name}: ${spellT(e.name)} ends.`), [c.id]);
  for (const k of conds)
    s = addLog(
      s,
      T(
        `${c.name}: ${k.spell ?? CONDITION_LABEL[k.name]} termina.`,
        `${c.name}: ${k.spell ? spellT(k.spell) : condT(k.name)} ends.`,
      ),
      [c.id],
    );
  return s;
}

/**
 * Imagem Espelhada: um ataque contra quem tem imagens pode mirar uma delas (d20: 6+ com três,
 * 8+ com duas, 11+ com uma). Acertar CA 10 + Des destrói uma imagem. Devolve o estado se o ataque
 * foi desviado para uma imagem, ou `null` se mirou a criatura de verdade.
 */
export function decoy(
  state: EncounterState,
  targetId: string,
  attackTotal: number,
  rng: Rng,
  hit = true,
): EncounterState | null {
  const t = creatureOf(state, targetId);
  const eff = effectsOf(t).find((e) => (e.mods.images ?? 0) > 0);
  if (!eff) return null;
  const n = eff.mods.images!;
  let text: string;
  if (eff.mods.imagesD6) {
    // 2024: só se o golpe acertou; um d6 por imagem, 3 ou mais desvia o golpe para uma delas
    if (!hit) return null;
    const dice = Array.from({ length: n }, () => roll('1d6', rng).total);
    text = ` (d6: ${dice.join(', ')})`;
    if (!dice.some((d) => d >= 3)) return null;
  } else {
    const r = roll('1d20', rng).total;
    text = ` (d20 ${r})`;
    if (r < (n >= 3 ? 6 : n === 2 ? 8 : 11)) return null;
    const ac = 10 + Math.floor((t.abilities.dex - 10) / 2);
    if (attackTotal < ac)
      return addLog(
        state,
        T(
          `O ataque erra: mirou uma imagem de ${t.name}${text}.`,
          `The attack misses: it hit an image of ${t.name}${text}.`,
        ),
        [t.id],
      );
  }
  const left = n - 1;
  const others = effectsOf(t).filter((e) => e !== eff);
  const next = left > 0 ? [...others, { ...eff, mods: { ...eff.mods, images: left } }] : others;
  return addLog(
    withCreature(state, { ...t, effects: next.length ? next : undefined }),
    T(
      `O ataque atinge uma imagem de ${t.name}${text}: ela se desfaz (restam ${left}).`,
      `The attack hits an image of ${t.name}${text}: it vanishes (${left} left).`,
    ),
    [t.id],
  );
}

/** Dados somados ou subtraídos a cada dano de quem carrega o efeito (Raio do Enfraquecimento, 2024). */
export function damageDieTotal(c: Creature, rng: Rng): { total: number; text: string } {
  const parts = effectsOf(c).flatMap((e) =>
    e.mods.damageDie ? [rollSigned(e.mods.damageDie, rng)] : [],
  );
  return { total: parts.reduce((a, b) => a + b, 0), text: parts.map(signed).join('') };
}

/** O dano extra de uso único (Golpe Marcante) foi gasto no acerto; a magia acaba. */
export function consumeWeaponRiders(state: EncounterState, actorId: string): EncounterState {
  const c = creatureOf(state, actorId);
  const gone = effectsOf(c).filter((e) => e.mods.once && (e.mods.weaponDamage || e.mods.onHit));
  if (!gone.length) return state;
  const names = gone.filter((e) => !e.mods.onHit).map((e) => e.name);
  const left = removeEffects(c, (e) => gone.includes(e));
  return withCreature(state, {
    ...left,
    concentration:
      left.concentration && names.includes(left.concentration) ? undefined : left.concentration,
  });
}
