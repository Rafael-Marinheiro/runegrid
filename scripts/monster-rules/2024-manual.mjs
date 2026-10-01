// Habilidades de monstros do SRD 2024 que o leitor automático não entende (texto em public/data/monsters-2024.json).
import { man, T } from './helpers.mjs';

export default {
  'shrieker-fungus': {
    skip: ['shriek'],
    traits: {
      shriek: T('Grito', 'Shriek', { shriek: { ft: 30, minute: true } }, { from: 'Shriek' }),
    },
  },
  unicorn: {
    abilities: {
      'shimmering-shield': {
        replace: true,
        from: 'Shimmering Shield',
        pt: 'Escudo Cintilante',
        en: 'Shimmering Shield',
        ability: { cost: 'legendary' },
        range: 60,
        target: { kind: 'creature' },
        resolution: { kind: 'auto' },
        tempHp: { dice: '3d6' },
        effect: { rounds: 2, mods: { ac: 2 } },
        vfx: { kind: 'glow', color: 'holy' },
      },
    },
  },
  'frost-giant': {
    abilities: {
      'war-cry': {
        replace: true,
        from: 'War Cry',
        pt: 'Grito de Guerra',
        en: 'War Cry',
        ability: { cost: 'bonus', uses: { n: 1, per: 'rest' } },
        range: 60,
        target: { kind: 'creature' },
        resolution: { kind: 'auto' },
        tempHp: { dice: '2d10+5' },
        effect: { rounds: 2, mods: { attackMode: 'advantage' } },
        vfx: { kind: 'glow', color: 'steel' },
      },
    },
  },
  'will-o-wisp': {
    abilities: {
      vanish: {
        replace: true,
        from: 'Vanish',
        pt: 'Desaparecer',
        en: 'Vanish',
        ability: { cost: 'bonus' },
        range: 0,
        target: { kind: 'self' },
        resolution: { kind: 'auto' },
        condition: { name: 'invisible', rounds: 0, endsOnAttack: true },
        ...man(
          'A luz também fica invisível; acaba ao atacar, usar Consumir Vida ou perder a concentração.',
          'Its light also turns invisible; ends when it attacks, uses Consume Life or loses concentration.',
        ),
        vfx: { kind: 'glow', color: 'arcane' },
      },
    },
  },
};
