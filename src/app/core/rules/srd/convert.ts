import { Ability, Creature, Skill, SKILLS } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { SrdMonster } from '../../models/srd';

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
export function monsterToCreature(m: SrdMonster, name: string = m.name): Creature {
  const abilities = Object.fromEntries(ABILITY_ORDER.map((a, i) => [a, m.abilities[i]])) as Record<
    Ability,
    number
  >;
  const skills: Creature['skills'] = {};
  for (const key of Object.keys(m.skills)) {
    const skill = SKILL_KEY[key.toLowerCase()];
    if (skill) skills[skill] = 'proficient';
  }
  return newCreature('monster', {
    name,
    cr: m.cr,
    size: m.size,
    speed: m.speed,
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
  });
}

/** Rótulo do nível de desafio: 0.125 → "1/8". */
export function crLabel(cr: number): string {
  return cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr);
}
