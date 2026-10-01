import { ActiveCondition, Ability, ConditionName, Creature } from '../../models/creature';
import { AdvMode, Rng, rollD20 } from '../dice';
import { attackedModes, blocksCondition, ownAttackModes, speedWithEffects } from './effects';
import { saveBonus } from './stats';

export const hasCondition = (c: Creature, name: ConditionName): boolean =>
  c.conditions.some((x) => x.name === name);

const CANT_ACT: ConditionName[] = [
  'incapacitated',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
];
const NO_SPEED: ConditionName[] = [
  'grappled',
  'restrained',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
];
const AUTO_FAIL_STR_DEX: ConditionName[] = ['paralyzed', 'petrified', 'stunned', 'unconscious'];
const ATTACK_DISADV: ConditionName[] = ['blinded', 'frightened', 'poisoned', 'prone', 'restrained'];
const ATTACKED_ADV: ConditionName[] = [
  'blinded',
  'paralyzed',
  'petrified',
  'restrained',
  'stunned',
  'unconscious',
];

/** A 0 PV (morrendo/estável) a criatura está inconsciente. */
export const isDown = (c: Creature): boolean => c.status === 'dying' || c.status === 'stable';

const any = (c: Creature, list: ConditionName[]): boolean => list.some((n) => hasCondition(c, n));

/** Pode usar ações e reações? */
export const canAct = (c: Creature): boolean => c.status === 'alive' && !any(c, CANT_ACT);

/** Deslocamento efetivo (0 se agarrado, contido, paralisado…). */
export const effectiveSpeed = (c: Creature): number => effectiveSpeedOf(c, c.speed);

/** O mesmo para outra velocidade da criatura (voo, natação…): condições e efeitos valem para todas. */
export const effectiveSpeedOf = (c: Creature, base: number): number =>
  any(c, NO_SPEED) || isDown(c) ? 0 : speedWithEffects(c, base);

export const autoFailsSave = (c: Creature, ability: Ability): boolean =>
  (ability === 'str' || ability === 'dex') && (any(c, AUTO_FAIL_STR_DEX) || isDown(c));

export interface AttackContext {
  modes: AdvMode[];
  /** Acerto contra alvo paralisado/inconsciente a até 5 ft é crítico. */
  autoCrit: boolean;
}

/** Vantagens e desvantagens que as condições dão a um ataque. */
export function attackModifiers(
  attacker: Creature,
  target: Creature,
  distanceFt: number,
  ranged: boolean,
): AttackContext {
  const modes: AdvMode[] = [...ownAttackModes(attacker), ...attackedModes(target)];
  if (any(attacker, ATTACK_DISADV)) modes.push('disadvantage');
  if (hasCondition(attacker, 'invisible')) modes.push('advantage');

  if (any(target, ATTACKED_ADV) || isDown(target)) modes.push('advantage');
  if (hasCondition(target, 'invisible')) modes.push('disadvantage');
  if (hasCondition(target, 'prone'))
    modes.push(distanceFt <= 5 && !ranged ? 'advantage' : 'disadvantage');

  const helpless =
    hasCondition(target, 'paralyzed') || hasCondition(target, 'unconscious') || isDown(target);
  return { modes, autoCrit: helpless && distanceFt <= 5 };
}

export function addCondition(
  c: Creature,
  name: ConditionName,
  rounds?: number,
  origin?: Pick<
    ActiveCondition,
    'spell' | 'by' | 'concentration' | 'repeatSave' | 'endsOnDamage' | 'endsOnAttack'
  >,
): Creature {
  if (blocksCondition(c, name)) return c;
  const existing = c.conditions.find((x) => x.name === name);
  const entry: ActiveCondition = {
    name,
    ...(rounds && rounds > 0 ? { rounds } : {}),
    ...(origin ?? {}),
  };
  if (!existing) return { ...c, conditions: [...c.conditions, entry] };
  // já tem: mantém a duração mais longa
  const keep =
    existing.rounds === undefined || (rounds !== undefined && existing.rounds >= rounds)
      ? existing
      : entry;
  return { ...c, conditions: c.conditions.map((x) => (x === existing ? keep : x)) };
}

export function removeCondition(c: Creature, name: ConditionName): Creature {
  return { ...c, conditions: c.conditions.filter((x) => x.name !== name) };
}

/** Fim do turno: desconta uma rodada das condições com duração; devolve as que expiraram. */
export function tickConditions(c: Creature): { creature: Creature; expired: ConditionName[] } {
  const expired: ConditionName[] = [];
  const conditions = c.conditions.flatMap((x) => {
    if (x.rounds === undefined) return [x];
    if (x.rounds <= 1) {
      expired.push(x.name);
      return [];
    }
    return [{ ...x, rounds: x.rounds - 1 }];
  });
  return { creature: { ...c, conditions }, expired };
}

export interface ConcentrationCheck {
  creature: Creature;
  dc: number;
  roll: number;
  total: number;
  broken: boolean;
}

/** Ao sofrer dano: salvaguarda de Constituição CD 10 ou metade do dano (o que for maior). */
export function checkConcentration(
  c: Creature,
  damage: number,
  rng: Rng,
): ConcentrationCheck | null {
  if (!c.concentration || damage <= 0) return null;
  const dc = Math.max(10, Math.floor(damage / 2));
  const bonus = saveBonus(c, 'con');
  const r = rollD20(bonus, 'normal', rng);
  const broken = r.roll.total < dc;
  return {
    creature: broken ? { ...c, concentration: undefined } : c,
    dc,
    roll: r.natural,
    total: r.roll.total,
    broken,
  };
}
