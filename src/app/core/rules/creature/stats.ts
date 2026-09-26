import { Ability, Creature, Skill, SKILLS } from '../../models/creature';

export class RuleError extends Error {}

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

/** PJ/PNJ: pelo nível. Monstro: pelo nível de desafio (ND). */
export function proficiencyBonus(c: Pick<Creature, 'kind' | 'level' | 'cr'>): number {
  const tier = c.kind === 'monster' ? Math.max(1, Math.ceil(c.cr ?? 0)) : Math.max(1, c.level);
  return 2 + Math.floor((tier - 1) / 4);
}

export function saveBonus(c: Creature, ability: Ability): number {
  const prof = c.saveProficiencies.includes(ability) ? proficiencyBonus(c) : 0;
  return abilityMod(c.abilities[ability]) + prof;
}

export function skillBonus(c: Creature, skill: Skill): number {
  const level = c.skills[skill];
  const mult = level === 'expertise' ? 2 : level === 'proficient' ? 1 : 0;
  return abilityMod(c.abilities[SKILLS[skill].ability]) + mult * proficiencyBonus(c);
}

export const passivePerception = (c: Creature): number => 10 + skillBonus(c, 'perception');

/** Iniciativa = modificador de Destreza. */
export const initiativeBonus = (c: Creature): number => abilityMod(c.abilities.dex);

/** CD de magia = 8 + proficiência + modificador do atributo de conjuração. */
export const spellSaveDc = (c: Creature, casting: Ability): number =>
  8 + proficiencyBonus(c) + abilityMod(c.abilities[casting]);

export const fmtBonus = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
