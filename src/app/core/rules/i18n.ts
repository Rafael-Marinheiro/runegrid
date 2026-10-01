/**
 * Texto bilíngue (pt-BR/en) para as mensagens do motor.
 *
 * `T(pt, en)` devolve uma string com marcadores de controle que `expand` resolve para o idioma
 * pedido. Como é só uma string, ela compõe com template literals e pode ser aninhada
 * (`T(`${a} ganha ${nome}`, ...)` com `nome` já sendo outro `T`). O registro (`addLog`) e os erros
 * (`RuleError`) guardam as duas versões; quem mostra escolhe pelo idioma da interface.
 */
import {
  ABILITY_LABEL,
  Ability,
  CONDITION_LABEL,
  ConditionName,
  DAMAGE_LABEL,
  DamageType,
} from '../models/creature';
import { Spell } from '../models/spell';
import { spellNameEn } from './srd/names-pt';

const OPEN = '\u0001';
const MID = '\u0002';
const CLOSE = '\u0003';

export type Lang = 'pt' | 'en';

export const T = (pt: string, en: string): string => `${OPEN}${pt}${MID}${en}${CLOSE}`;

/** Resolve os marcadores de `T` para um idioma. Texto sem marcadores volta igual. */
export function expand(text: string, lang: Lang): string {
  if (!text.includes(OPEN)) return text;
  let i = 0;
  const seq = (stop: string | null): string => {
    let out = '';
    while (i < text.length) {
      const ch = text[i++];
      if (ch === OPEN) {
        const pt = seq(MID);
        const en = seq(CLOSE);
        out += lang === 'pt' ? pt : en;
      } else if (ch === stop) return out;
      else out += ch;
    }
    return out;
  };
  return seq(null);
}

export const isBilingual = (text: string): boolean => text.includes(OPEN);

export const ABILITY_EN: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export const DAMAGE_EN: Record<DamageType, string> = {
  acid: 'acid',
  bludgeoning: 'bludgeoning',
  cold: 'cold',
  fire: 'fire',
  force: 'force',
  lightning: 'lightning',
  necrotic: 'necrotic',
  piercing: 'piercing',
  poison: 'poison',
  psychic: 'psychic',
  radiant: 'radiant',
  slashing: 'slashing',
  thunder: 'thunder',
};

export const CONDITION_EN: Record<ConditionName, string> = {
  blinded: 'Blinded',
  charmed: 'Charmed',
  deafened: 'Deafened',
  frightened: 'Frightened',
  grappled: 'Grappled',
  incapacitated: 'Incapacitated',
  invisible: 'Invisible',
  paralyzed: 'Paralyzed',
  petrified: 'Petrified',
  poisoned: 'Poisoned',
  prone: 'Prone',
  restrained: 'Restrained',
  stunned: 'Stunned',
  unconscious: 'Unconscious',
};

/** Nome de magia guardado em pt-BR no estado, com a versão em inglês. */
export const spellT = (namePt: string): string => T(namePt, spellNameEn(namePt));

export const condT = (n: ConditionName): string => T(CONDITION_LABEL[n], CONDITION_EN[n]);
export const dmgT = (t: DamageType): string => T(DAMAGE_LABEL[t].toLowerCase(), DAMAGE_EN[t]);
export const abilityT = (a: Ability): string => T(ABILITY_LABEL[a], ABILITY_EN[a]);

/** Nome da magia nos dois idiomas. */
export const spellName = (s: Pick<Spell, 'name' | 'nameEn'>): string =>
  s.nameEn ? T(s.name, s.nameEn) : spellT(s.name);
/** Nota `manual` da magia nos dois idiomas. */
export const manualT = (s: Pick<Spell, 'manual' | 'manualEn'>): string =>
  T(s.manual ?? '', s.manualEn ?? s.manual ?? '');
