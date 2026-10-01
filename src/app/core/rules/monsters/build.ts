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
  if (ability.spell) {
    // age como a magia do SRD (ver `spells/registry`): só o que a regra escreve de próprio fica aqui
    return {
      ...rule,
      id: abilityId(ruleset, monster, slug),
      name: pt,
      nameEn: en,
      level: ability.spell.level ?? 0,
      school: 'Habilidade',
      castTime: rule.castTime ?? CAST_TIME[ability.cost],
      concentration: false,
      ability,
      description: desc,
    } as Spell;
  }
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
    const bySlug = new Map<string, Spell>();
    for (const [slug, r] of Object.entries(rule.abilities)) {
      const spell = toSpell(ruleset, monster, slug, r);
      bySlug.set(slug, spell);
      if (r.ability.rider) entry.riders[r.ability.rider] = spell;
      else entry.abilities.push(spell);
    }
    // "usa X": a ação lendária tem o efeito de outra habilidade, pagando o próprio custo
    entry.abilities = entry.abilities.map((sp) => {
      const target = sp.ability?.invoke ? bySlug.get(sp.ability.invoke) : undefined;
      if (!target) return sp;
      const rest = { ...target.ability! };
      delete rest.recharge;
      delete rest.uses;
      delete rest.invoke;
      return {
        ...target,
        id: sp.id,
        name: sp.name,
        nameEn: sp.nameEn,
        description: sp.description,
        ability: {
          ...rest,
          cost: sp.ability!.cost,
          ...(sp.ability!.legendary ? { legendary: sp.ability!.legendary } : {}),
        },
      };
    });
    out.set(monster, entry);
  }
  return out;
}
