import { EffectMods } from '../../models/effect';
import { Spell, SpellRule, AbilityMeta } from '../../models/spell';
import { abilityId, MonsterEntry, MonsterRuleset } from './registry';

/** Uma habilidade em `public/data/monster-rules*.json`. */
export type AbilityRule = SpellRule & {
  /** Nome em pt-BR e em inglês (o do SRD, também a chave do ataque quando é `rider`). */
  pt: string;
  en: string;
  /** Texto do SRD (inglês). */
  desc: string;
  ability: AbilityMeta;
};

/** Traço passivo em `monster-rules*.json`. */
export interface TraitRule {
  pt: string;
  en: string;
  desc: string;
  mods: EffectMods;
  manual?: string;
  manualEn?: string;
}

export interface MonsterRule {
  legendary?: number;
  abilities: Record<string, AbilityRule>;
  traits?: Record<string, TraitRule>;
}

export type MonsterRules = Record<string, MonsterRule>;

const CAST_TIME = {
  action: 'action',
  bonus: 'bonus',
  reaction: 'reaction',
  legendary: 'action',
  free: 'action',
  death: 'action',
} as const;

function toSpell(ruleset: MonsterRuleset, monster: string, slug: string, r: AbilityRule): Spell {
  const { pt, en, desc, ability, ...rule } = r;
  const range = rule.range ?? 5;
  return {
    ...rule,
    id: abilityId(ruleset, monster, slug),
    name: pt,
    nameEn: en,
    level: 0,
    school: 'Habilidade',
    castTime: rule.castTime ?? CAST_TIME[ability.cost],
    range,
    concentration: false,
    target: rule.target ?? (range === 0 ? { kind: 'self' } : { kind: 'creature' }),
    resolution: rule.resolution ?? { kind: 'auto' },
    ability,
    description: desc,
  };
}

/** Monta as habilidades de um conjunto de regras. */
export function buildMonsterAbilities(
  ruleset: MonsterRuleset,
  rules: MonsterRules,
): Map<string, MonsterEntry> {
  const out = new Map<string, MonsterEntry>();
  for (const [monster, rule] of Object.entries(rules)) {
    const entry: MonsterEntry = {
      ...(rule.legendary ? { legendary: rule.legendary } : {}),
      abilities: [],
      riders: {},
      traits: Object.entries(rule.traits ?? {}).map(([id, t]) => ({
        id,
        name: t.pt,
        nameEn: t.en,
        mods: t.mods,
        ...(t.manual ? { manual: t.manual, manualEn: t.manualEn } : {}),
      })),
    };
    for (const [slug, r] of Object.entries(rule.abilities)) {
      const spell = toSpell(ruleset, monster, slug, r);
      if (r.ability.rider) entry.riders[r.ability.rider] = spell;
      else entry.abilities.push(spell);
    }
    out.set(monster, entry);
  }
  return out;
}
