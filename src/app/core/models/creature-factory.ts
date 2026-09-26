import { fullCasterSlots } from '../rules/creature/rest';
import { Ability, Creature, CreatureKind } from './creature';

const uid = (): string => crypto.randomUUID();

export function newCreature(kind: CreatureKind, over: Partial<Creature> = {}): Creature {
  return {
    id: uid(),
    name: kind === 'monster' ? 'Novo monstro' : 'Novo personagem',
    kind,
    level: 1,
    cr: kind === 'monster' ? 1 : undefined,
    size: 'medium',
    speed: 30,
    ac: 10,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    skills: {},
    hp: { max: 10, current: 10, temp: 0 },
    status: 'alive',
    deathSaves: { successes: 0, failures: 0 },
    spellSlots: {},
    resources: [],
    attacks: [],
    attacksPerAction: 1,
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    conditions: [],
    ...over,
  };
}

const scores = (str: number, dex: number, con: number, int: number, wis: number, cha: number) =>
  ({ str, dex, con, int, wis, cha }) satisfies Record<Ability, number>;

/** Grupo de exemplo para a primeira abertura do app (mesmos personagens do design). */
export function sampleCreatures(): Creature[] {
  return [
    newCreature('pc', {
      name: 'Thordak',
      level: 5,
      ac: 18,
      abilities: scores(17, 12, 16, 8, 12, 10),
      saveProficiencies: ['str', 'con'],
      skills: { athletics: 'proficient', perception: 'proficient', intimidation: 'proficient' },
      hp: { max: 52, current: 38, temp: 0 },
      attacksPerAction: 2,
      attacks: [{ name: 'Espada longa', bonus: 6, damage: '1d8+3', type: 'slashing', range: 5 }],
      resources: [
        { name: 'Retomar o Fôlego', max: 1, used: 0, recharge: 'short' },
        { name: 'Surto de Ação', max: 1, used: 0, recharge: 'short' },
      ],
    }),
    newCreature('pc', {
      name: 'Lyra Valen',
      level: 5,
      ac: 12,
      abilities: scores(8, 14, 12, 18, 13, 10),
      saveProficiencies: ['int', 'wis'],
      skills: { arcana: 'proficient', history: 'proficient', investigation: 'proficient' },
      hp: { max: 29, current: 24, temp: 0 },
      attacks: [{ name: 'Bordão', bonus: 1, damage: '1d6-1', type: 'bludgeoning', range: 5 }],
      spellcasting: {
        ability: 'int',
        spells: [
          'fire-bolt',
          'ray-of-frost',
          'magic-missile',
          'burning-hands',
          'hold-person',
          'shatter',
          'fireball',
        ],
      },
      spellSlots: {
        ...fullCasterSlots(5),
        1: { max: 4, used: 1 },
        2: { max: 3, used: 1 },
        3: { max: 2, used: 1 },
      },
    }),
    newCreature('pc', {
      name: 'Brann',
      level: 5,
      ac: 16,
      abilities: scores(14, 10, 14, 10, 17, 12),
      saveProficiencies: ['wis', 'cha'],
      skills: { medicine: 'proficient', religion: 'proficient', insight: 'proficient' },
      hp: { max: 40, current: 36, temp: 0 },
      attacks: [{ name: 'Maça', bonus: 4, damage: '1d6+2', type: 'bludgeoning', range: 5 }],
      spellcasting: {
        ability: 'wis',
        spells: [
          'sacred-flame',
          'cure-wounds',
          'healing-word',
          'guiding-bolt',
          'inflict-wounds',
          'hold-person',
        ],
      },
      spellSlots: fullCasterSlots(5),
      resources: [{ name: 'Canalizar Divindade', max: 1, used: 0, recharge: 'short' }],
    }),
    newCreature('monster', {
      name: 'Esqueleto',
      cr: 0.25,
      ac: 13,
      abilities: scores(10, 14, 15, 6, 8, 5),
      hp: { max: 13, current: 13, temp: 0 },
      attacks: [{ name: 'Espada curta', bonus: 4, damage: '1d6+2', type: 'piercing', range: 5 }],
      immunities: ['poison'],
      vulnerabilities: ['bludgeoning'],
    }),
    newCreature('monster', {
      name: 'Ogro',
      cr: 2,
      size: 'large',
      ac: 11,
      abilities: scores(19, 8, 16, 5, 7, 7),
      hp: { max: 59, current: 59, temp: 0 },
      attacks: [{ name: 'Clava grande', bonus: 6, damage: '2d8+4', type: 'bludgeoning', range: 5 }],
    }),
  ];
}
