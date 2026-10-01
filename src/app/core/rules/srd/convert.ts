import { Ability, Creature, Skill, SKILLS } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { SrdMonster } from '../../models/srd';
import { FEATURE_BY_TRAIT } from '../creature/features';
import { parseSpellcasting } from './spellcasting';

const ABILITY_ORDER: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Nomes de perícia da API (snake_case ou com espaço) → chave interna. */
const SKILL_KEY: Record<string, Skill> = Object.fromEntries(
  (Object.keys(SKILLS) as Skill[]).flatMap((k) => {
    const snake = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    return [
      [k.toLowerCase(), k],
      [snake, k],
      [snake.replace(/_/g, ' '), k],
    ];
  }),
);

/** Cria uma criatura de combate a partir do bloco de estatísticas do SRD (PV médios). */
export function monsterToCreature(
  m: SrdMonster,
  name: string = m.name,
  tokenArt?: string,
): Creature {
  const abilities = Object.fromEntries(ABILITY_ORDER.map((a, i) => [a, m.abilities[i]])) as Record<
    Ability,
    number
  >;
  const skills: Creature['skills'] = {};
  for (const key of Object.keys(m.skills)) {
    const skill = SKILL_KEY[key.toLowerCase()];
    if (skill) skills[skill] = 'proficient';
  }
  // 2014 traz em traços, 2024 em ações
  const features = [
    ...new Set([...m.traits, ...m.actions].flatMap((t) => FEATURE_BY_TRAIT[t.name] ?? [])),
  ];
  return newCreature('monster', {
    name,
    cr: m.cr,
    size: m.size,
    speed: m.speed,
    ...speedsOf(m),
    darkvision: Number(/darkvision\s+(\d+)/i.exec(m.senses)?.[1] ?? 0),
    ac: m.ac,
    abilities,
    saveProficiencies: ABILITY_ORDER.filter((a) => m.saves[a] !== undefined),
    skills,
    hp: { max: m.hp, current: m.hp, temp: 0 },
    attacks: m.attacks.map((a) => ({ ...a })),
    attacksPerAction: m.attacksPerAction,
    resistances: [...m.resistances],
    immunities: [...m.immunities],
    vulnerabilities: [...m.vulnerabilities],
    srdId: m.id,
    ...casting(m),
    ...(features.length ? { features } : {}),
    ...(tokenArt ? { tokenArt } : {}),
  });
}

/** Rótulo do nível de desafio: 0.125 → "1/8". */
export function crLabel(cr: number): string {
  return cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr);
}

/** Conjuradores com espaços (Mago, Sacerdote, Lich): lista de magias e espaços lidos do texto do SRD 5.1. */
function casting(
  m: SrdMonster,
): Pick<Creature, 'spellcasting' | 'spellSlots'> | Record<string, never> {
  const c = parseSpellcasting(m);
  return c ? { spellcasting: { ability: c.ability, spells: c.spells }, spellSlots: c.slots } : {};
}

/** Voo, natação, escalada e escavar da ficha (a caminhada é `speed`). */
function speedsOf(m: SrdMonster): Pick<Creature, 'speeds'> {
  const sp = m.speeds;
  if (!sp) return {};
  const speeds: NonNullable<Creature['speeds']> = {
    ...(sp.fly ? { fly: sp.fly } : {}),
    ...(sp.swim ? { swim: sp.swim } : {}),
    ...(sp.climb ? { climb: sp.climb } : {}),
    ...(sp.burrow ? { burrow: sp.burrow } : {}),
    ...(sp.hover ? { hover: true } : {}),
  };
  return Object.keys(speeds).length ? { speeds } : {};
}
