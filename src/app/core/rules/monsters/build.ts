import { EffectMods } from '../../models/effect';
import { Spell, SpellRule, AbilityMeta } from '../../models/spell';
import { SrdMonster } from '../../models/srd';
import { monsterNamePt } from '../srd/names-pt';
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
      concentration: rule.concentration ?? false,
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
    concentration: rule.concentration ?? false,
    target: rule.target ?? (range === 0 ? { kind: 'self' } : { kind: 'creature' }),
    resolution: rule.resolution ?? { kind: 'auto' },
    ability,
    description: desc,
  };
}

/** Monta as habilidades de um conjunto de regras. */
/** Uma opção por criatura do Bestiário que cabe em `formFrom` (Mudar de Forma dos dragões metálicos). */
function formOptions(sp: Spell, self: string, sheets: SrdMonster[]): Spell['options'] {
  const from = sp.formFrom!;
  const types = from.types.map((t) => t.toLowerCase());
  const list = sheets
    .filter((m) => types.includes(m.type.toLowerCase()) && m.cr <= from.maxCr)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => {
      const id = m.id.replace(/^srd-2024_/, '');
      const pt = monsterNamePt(m.name);
      const cr =
        m.cr >= 1
          ? String(m.cr)
          : ({ 0: '0', 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' } as Record<number, string>)[m.cr];
      const label = (n: string) => `${n} (ND ${cr})`;
      return {
        id,
        label: label(pt),
        ...(pt !== m.name ? { labelEn: label(m.name) } : {}),
        patch: {
          form: {
            id,
            label: pt,
            labelEn: m.name,
            srd: id,
            take: from.take,
            ...(from.keepAttacks ? { keepAttacks: from.keepAttacks } : {}),
          },
        },
      };
    })
    .filter((o) => o.id !== self);
  const back = sp.options?.filter((o) => o.patch.form?.revert) ?? [];
  return [...list, ...back];
}

export function buildMonsterAbilities(
  ruleset: MonsterRuleset,
  rules: MonsterRules,
  sheets?: SrdMonster[],
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
      if (spell.formFrom && sheets) spell.options = formOptions(spell, monster, sheets);
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
