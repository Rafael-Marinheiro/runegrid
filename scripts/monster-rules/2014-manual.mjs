// Habilidades de monstros do SRD 2014 que o leitor automático não entende (texto em public/data/monsters.json).
import { man } from './helpers.mjs';
import FORMS from './forms.mjs';

// o SRD 2014 traz "Shapechanger" como traço; aqui vira uma habilidade usável (ver `patterns.mjs`)
const TRAIT_ID = [
  'vampire',
  'werewolf',
  'wereboar',
  'wererat',
  'weretiger',
  'werebear',
  'doppelganger',
  'mimic',
  'imp',
  'quasit',
  'succubusincubus',
];
const shapechangers = () =>
  Object.fromEntries(
    TRAIT_ID.filter((id) => FORMS[2014][id]).map((id) => [
      id,
      {
        abilities: {
          shapechanger: {
            replace: true,
            from: 'Shapechanger',
            pt: 'Mudar de Forma',
            en: 'Shapechanger',
            ability: { cost: 'action' },
          },
        },
      },
    ]),
  );

const arcane = { kind: 'glow', color: 'arcane' };
const noteEffect = (rounds, note, noteEn, extra = {}) => ({
  rounds,
  mods: { note, noteEn, ...extra },
});

export default {
  ...shapechangers(),
  'stone-golem': {
    abilities: {
      slow: {
        replace: true,
        from: 'Slow (Recharge 5-6)',
        pt: 'Lentidão',
        en: 'Slow',
        ability: { cost: 'action', recharge: 5, dc: 17 },
        range: 0,
        target: { kind: 'sphere', radius: 10, self: true },
        resolution: { kind: 'save', ability: 'wis', onSave: 'none' },
        effect: {
          rounds: 10,
          mods: {
            noReactions: true,
            speedMult: 0.5,
            repeatSave: { ability: 'wis', dc: 17 },
            note: 'Velocidade pela metade, sem reações, um ataque por turno e ação ou ação bônus (não as duas).',
            noteEn:
              'Speed halved, no reactions, one attack per turn, and an action or a bonus action (not both).',
          },
        },
        vfx: { kind: 'glow', color: 'arcane' },
      },
    },
  },
  'clay-golem': {
    abilities: {
      haste: {
        replace: true,
        from: 'Haste (Recharge 5-6)',
        pt: 'Aceleração',
        en: 'Haste',
        ability: { cost: 'action', recharge: 5 },
        range: 0,
        target: { kind: 'self' },
        resolution: { kind: 'auto' },
        effect: {
          rounds: 2,
          to: 'self',
          mods: {
            ac: 2,
            note: '+2 de CA, vantagem em salvaguardas de Destreza e pode usar a pancada como ação bônus.',
            noteEn: '+2 AC, advantage on Dexterity saves, and can use its slam as a bonus action.',
          },
        },
        vfx: arcane,
      },
    },
  },
  'will-o-wisp': {
    abilities: {
      invisibility: {
        replace: true,
        from: 'Invisibility',
        pt: 'Invisibilidade',
        en: 'Invisibility',
        ability: { cost: 'action' },
        range: 0,
        target: { kind: 'self' },
        resolution: { kind: 'auto' },
        condition: { name: 'invisible', rounds: 0, endsOnAttack: true },
        ...man(
          'A luz também fica invisível; acaba ao atacar ou usar Consumir Vida.',
          'Its light also turns invisible; ends when it attacks or uses Consume Life.',
        ),
        vfx: arcane,
      },
    },
  },
  'sea-hag': {
    abilities: {
      'death-glare': {
        replace: true,
        from: 'Death Glare',
        pt: 'Olhar Mortal',
        en: 'Death Glare',
        ability: { cost: 'action', dc: 11 },
        range: 30,
        target: { kind: 'creature' },
        resolution: { kind: 'save', ability: 'wis', onSave: 'none' },
        kill: true,
        ...man(
          'Só vale contra criatura amedrontada que veja a bruxa; quem falha cai a 0 PV.',
          'Only works on a frightened creature that can see the hag; on a failed save it drops to 0 hit points.',
        ),
        vfx: { kind: 'ray', color: 'shadow' },
      },
    },
  },
  lamia: {
    abilities: {
      'intoxicating-touch': {
        replace: true,
        from: 'Intoxicating Touch',
        pt: 'Toque Inebriante',
        en: 'Intoxicating Touch',
        ability: { cost: 'action', attackBonus: 5 },
        range: 5,
        target: { kind: 'creature' },
        resolution: { kind: 'attack' },
        effect: {
          rounds: 600,
          mods: {
            note: 'Amaldiçoado por 1 hora: desvantagem em salvaguardas de Sabedoria e em todos os testes de atributo.',
            noteEn:
              'Cursed for 1 hour: disadvantage on Wisdom saving throws and all ability checks.',
          },
        },
        vfx: { kind: 'glow', color: 'violet' },
      },
    },
  },
  duergar: {
    abilities: {
      enlarge: {
        replace: true,
        from: 'Enlarge (Recharges after a Short or Long Rest)',
        pt: 'Aumentar',
        en: 'Enlarge',
        ability: { cost: 'action', uses: { n: 1, per: 'rest' } },
        range: 0,
        target: { kind: 'self' },
        resolution: { kind: 'auto' },
        effect: {
          rounds: 10,
          to: 'self',
          mods: {
            note: 'Fica Grande, dobra os dados de dano de armas baseadas em Força e tem vantagem em testes e salvaguardas de Força.',
            noteEn:
              'Becomes Large, doubles damage dice on Strength-based weapon attacks and has advantage on Strength checks and saves.',
          },
        },
        vfx: arcane,
      },
    },
  },
  unicorn: {
    abilities: {
      teleport: {
        replace: true,
        from: 'Teleport (1/Day)',
        pt: 'Teleporte',
        en: 'Teleport',
        ability: { cost: 'action', uses: { n: 1, per: 'day' } },
        range: 5280,
        target: { kind: 'point' },
        teleport: true,
        ...man(
          'Leva consigo até três criaturas dispostas a até 1,5 m, com o equipamento, a um lugar conhecido a até 1,6 km; o Mestre move os acompanhantes.',
          'Brings up to three willing creatures within 5 ft with their gear to a familiar place up to 1 mile away; the DM moves the companions.',
        ),
        vfx: arcane,
      },
    },
  },
};
