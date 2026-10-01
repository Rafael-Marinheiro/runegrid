import { Creature, DamageType } from '../../models/creature';
import { ActiveEffect, EffectMods } from '../../models/effect';
import { AdvMode } from '../dice';
import { traitModsOf } from '../monsters/registry';
import { abilityMod } from './stats';

export const effectsOf = (c: Pick<Creature, 'effects'>): ActiveEffect[] => c.effects ?? [];

/** Modificadores dos efeitos ativos e dos traços permanentes do monstro. */
export const allMods = (c: Pick<Creature, 'effects' | 'srdId'>): EffectMods[] => [
  ...effectsOf(c).map((e) => e.mods),
  ...traitModsOf(c),
];
const mods = allMods;

/** CA efetiva: base, ou a base sem armadura se maior, ou o mínimo, mais os bônus dos efeitos. */
export function effectiveAc(c: Creature): number {
  let ac = c.ac;
  for (const m of mods(c)) {
    if (m.acBase !== undefined) {
      const base = m.acBase + (m.acBaseDex ? abilityMod(c.abilities.dex) : 0);
      if (base > ac) ac = base;
    }
  }
  for (const m of mods(c)) if (m.acMin !== undefined && m.acMin > ac) ac = m.acMin;
  for (const m of mods(c)) ac += m.ac ?? 0;
  return ac;
}

/** Dados somados à jogada de ataque (Bênção) ou subtraídos (Perdição): `['1d4']` ou `['-1d4']`. */
export const attackDice = (c: Creature): string[] =>
  mods(c).flatMap((m) => (m.attackDie ? [m.attackDie] : []));

export const saveDice = (c: Creature): string[] =>
  mods(c).flatMap((m) => (m.saveDie ? [m.saveDie] : []));

export const saveFlat = (c: Creature): number => mods(c).reduce((n, m) => n + (m.save ?? 0), 0);

export const weaponBonus = (c: Creature): number =>
  mods(c).reduce((n, m) => n + (m.weaponBonus ?? 0), 0);

/** Vantagem/desvantagem que os efeitos dão aos ataques de `c`. */
export const ownAttackModes = (c: Creature): AdvMode[] =>
  mods(c).flatMap((m) => (m.attackMode ? [m.attackMode] : []));

/** Vantagem/desvantagem que os efeitos dão a quem ataca `c`. */
export const attackedModes = (c: Creature): AdvMode[] =>
  mods(c).flatMap((m) => (m.attackedMode ? [m.attackedMode] : []));

export const saveModes = (c: Creature, ability: string): AdvMode[] =>
  mods(c).flatMap((m) =>
    m.saveMode && (!m.saveMode.abilities || m.saveMode.abilities.includes(ability as never))
      ? [m.saveMode.mode]
      : [],
  );

export const hasNoReactions = (c: Creature): boolean => mods(c).some((m) => m.noReactions);
export const cannotHeal = (c: Creature): boolean => mods(c).some((m) => m.noHealing);

/** Deslocamento depois dos efeitos (soma, multiplicador e valor fixo). */
export function speedWithEffects(c: Creature, base: number): number {
  let speed = base;
  for (const m of mods(c)) {
    if (m.speedSet !== undefined) speed = m.speedSet;
  }
  for (const m of mods(c)) speed += m.speed ?? 0;
  for (const m of mods(c)) if (m.speedMult !== undefined) speed *= m.speedMult;
  return Math.max(0, Math.floor(speed));
}

export const extraResist = (
  c: Creature,
  type: DamageType,
): 'resist' | 'immune' | 'vulnerable' | null => {
  const ms = mods(c);
  if (ms.some((m) => m.immune?.includes(type))) return 'immune';
  if (ms.some((m) => m.resist?.includes(type))) return 'resist';
  if (ms.some((m) => m.vulnerable?.includes(type))) return 'vulnerable';
  return null;
};

/** Condição vetada por algum efeito (Heroísmo: amedrontado)? */
export const blocksCondition = (c: Creature, name: string): boolean =>
  mods(c).some((m) => m.immuneConditions?.includes(name as never));

/** Dano extra que uma arma ganha ao acertar `targetId` (Favor Divino, Marca do Caçador). */
export const weaponRiders = (
  c: Creature,
  targetId: string,
): NonNullable<EffectMods['weaponDamage']>[] =>
  mods(c).flatMap((m) =>
    m.weaponDamage && (!m.weaponDamage.onlyAgainst || m.weaponDamage.onlyAgainst === targetId)
      ? [m.weaponDamage]
      : [],
  );

/** Coloca o efeito (troca um de mesmo id); Ajuda e afins alteram os PV máximos. */
export function addEffect(c: Creature, effect: ActiveEffect): Creature {
  const rest = effectsOf(c).filter((e) => e.id !== effect.id);
  let next = c;
  const old = effectsOf(c).find((e) => e.id === effect.id);
  if (old?.mods.maxHp) next = shiftMaxHp(next, -old.mods.maxHp);
  if (effect.mods.maxHp) next = shiftMaxHp(next, effect.mods.maxHp, effect.mods.maxHp > 0);
  return { ...next, effects: [...rest, effect] };
}

function shiftMaxHp(c: Creature, by: number, raiseCurrent = false): Creature {
  const max = Math.max(1, c.hp.max + by);
  const current =
    raiseCurrent && c.hp.current > 0 ? c.hp.current + by : Math.min(c.hp.current, max);
  return { ...c, hp: { ...c.hp, max, current: Math.max(0, Math.min(max, current)) } };
}

export function removeEffects(c: Creature, drop: (e: ActiveEffect) => boolean): Creature {
  const gone = effectsOf(c).filter(drop);
  if (!gone.length) return c;
  let next = c;
  for (const e of gone) if (e.mods.maxHp) next = shiftMaxHp(next, -e.mods.maxHp);
  const effects = effectsOf(next).filter((e) => !drop(e));
  return { ...next, effects: effects.length ? effects : undefined };
}

/** Fim do turno de quem carrega: desconta uma rodada; devolve os efeitos que acabaram. */
export function tickEffects(c: Creature): { creature: Creature; expired: ActiveEffect[] } {
  const expired: ActiveEffect[] = [];
  const keep = effectsOf(c).flatMap((e) => {
    if (e.rounds === undefined || (e.ends ?? 'end') !== 'end') return [e];
    if (e.rounds <= 1) {
      expired.push(e);
      return [];
    }
    return [{ ...e, rounds: e.rounds - 1 }];
  });
  if (!expired.length) return { creature: c, expired };
  const out = removeEffects(c, (e) => expired.includes(e));
  return { creature: { ...out, effects: keep.length ? keep : undefined }, expired };
}

/** Início do turno de quem carrega: acabam os de `ends: 'start'` e os de `casterStart` de `c`. */
export function startTurnExpiry(
  all: Creature[],
  actorId: string,
): { creatures: Creature[]; expired: { holder: Creature; effect: ActiveEffect }[] } {
  const expired: { holder: Creature; effect: ActiveEffect }[] = [];
  const creatures = all.map((c) => {
    const drop = (e: ActiveEffect) =>
      (e.ends === 'start' && c.id === actorId) || (e.ends === 'casterStart' && e.by === actorId);
    const gone = effectsOf(c).filter(drop);
    if (!gone.length) return c;
    for (const effect of gone) expired.push({ holder: c, effect });
    return removeEffects(c, drop);
  });
  return { creatures, expired };
}

/** Fim do turno de `actorId`: acabam os de `casterEnd` dele. */
export function endCasterExpiry(
  all: Creature[],
  actorId: string,
): { creatures: Creature[]; expired: { holder: Creature; effect: ActiveEffect }[] } {
  const expired: { holder: Creature; effect: ActiveEffect }[] = [];
  const creatures = all.map((c) => {
    const drop = (e: ActiveEffect) => e.ends === 'casterEnd' && e.by === actorId;
    const gone = effectsOf(c).filter(drop);
    if (!gone.length) return c;
    for (const effect of gone) expired.push({ holder: c, effect });
    return removeEffects(c, drop);
  });
  return { creatures, expired };
}
