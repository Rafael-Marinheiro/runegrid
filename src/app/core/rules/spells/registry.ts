import { Spell } from '../../models/spell';
import { SPELLS } from './builtin';
import { getMonsterAbility, isAbilityId } from '../monsters/registry';
import { spellNameEn } from '../srd/names-pt';

export type SpellRuleset = '2014' | '2024';

/** Ids do SRD 2024 vêm com prefixo (`srd-2024_fireball`); o motor usa o id sem ele. */
export const baseSpellId = (id: string): string => id.replace(/^srd-2024_/, '');

const BUILTIN = new Map(SPELLS.map((s) => [s.id, s]));
const tables: Record<SpellRuleset, Map<string, Spell>> = { '2014': new Map(), '2024': new Map() };

/** Registra as magias montadas a partir do SRD e das regras de `public/data` (ver `build.ts`). */
export function registerSpells(ruleset: SpellRuleset, spells: Spell[]): void {
  tables[ruleset] = new Map(spells.map((s) => [s.id, s]));
}

/** Magia pelo id; o 2024 cai no 2014 (mesma mecânica) e ambos caem nas magias embutidas e, por fim, nas só do 2024. */
export function getSpell(id: string, ruleset: SpellRuleset = '2014'): Spell | undefined {
  if (isAbilityId(id)) return materialize(getMonsterAbility(id));
  const base = baseSpellId(id);
  return (
    tables[ruleset].get(base) ??
    (ruleset === '2024' ? tables['2014'].get(base) : undefined) ??
    BUILTIN.get(base) ??
    // magia que só existe no outro conjunto (ex.: Sopro do Dragão, 2024) ainda é reconhecida
    tables['2024'].get(base)
  );
}

/** Habilidade que age como uma magia do SRD: a magia vale, com o nome, o custo e a CD da habilidade. */
function materialize(a: Spell | undefined): Spell | undefined {
  const via = a?.ability?.spell;
  if (!a || !via) return a;
  const ruleset: SpellRuleset = a.id.startsWith('mon24/') ? '2024' : '2014';
  const real = getSpell(via.id, ruleset);
  if (!real) return a;
  return {
    ...real,
    ...a,
    // conjuração inata (nome da habilidade = nome da magia em inglês): vale o nome da própria magia
    ...(a.name === a.nameEn ? { name: real.name, nameEn: spellNameEn(real.name) } : {}),
    // o que a habilidade não escreve vem da magia
    target: a.target ?? real.target,
    resolution: a.resolution ?? real.resolution,
    range: a.range ?? real.range,
    level: via.level ?? real.level,
    concentration: real.concentration,
    castTime: a.castTime ?? real.castTime,
    vfx: a.vfx ?? real.vfx,
    react: real.react,
    ability: a.ability,
    description: a.description,
  };
}

/** Todas as magias conhecidas do conjunto (as embutidas valem onde o conjunto não define a sua). */
export function allSpells(ruleset: SpellRuleset = '2014'): Spell[] {
  const out = new Map<string, Spell>(BUILTIN);
  if (ruleset === '2024') for (const [id, s] of tables['2014']) out.set(id, s);
  for (const [id, s] of tables[ruleset]) out.set(id, s);
  return [...out.values()];
}
