// Piloto do motor de habilidades de monstros: Cão Teleportador e o sopro do Dragão Vermelho Adulto.
import { A, action, cone, creature, dmg, line, man, point, recharge, save, vfx } from './helpers.mjs';

export default {
  'blink-dog': {
    abilities: {
      teleport: A('Teleporte', 'Teleport', recharge(4), {
        range: 40,
        target: point,
        teleport: true,
        ...man(
          'O cão leva junto o que veste e carrega, e pode fazer uma mordida antes ou depois de teleportar.',
          'The dog takes what it wears and carries, and may make one bite attack before or after teleporting.',
        ),
        vfx: vfx('glow', 'arcane'),
      }),
    },
  },
  'adult-red-dragon': {
    legendary: 3,
    abilities: {
      'fire-breath': A('Sopro de Fogo', 'Fire Breath', recharge(5, { dc: 21 }), {
        range: 0,
        target: cone(60),
        resolution: save('dex', 'half'),
        damage: dmg('18d6', 'fire'),
        vfx: vfx('cone', 'fire'),
      }),
    },
  },
};
