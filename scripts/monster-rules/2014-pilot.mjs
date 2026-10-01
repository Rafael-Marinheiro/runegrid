// Piloto do motor de habilidades de monstros.
import { A, T, action, cone, creature, cond, dmg, line, man, point, recharge, rider, save, attack, vfx, free } from './helpers.mjs';

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
    traits: {
      'legendary-resistance': T('Resistência Lendária (3/dia)', 'Legendary Resistance', { legendaryResistance: 3 }),
    },
  },
  zombie: { abilities: {}, traits: { 'undead-fortitude': T('Fortitude de Morto-vivo', 'Undead Fortitude', { undeadFortitude: true }) } },
  troll: { abilities: {}, traits: { regeneration: T('Regeneração', 'Regeneration', { regen: 10, regenStops: ['acid', 'fire'] }) } },
  wolf: { abilities: {}, traits: { 'pack-tactics': T('Táticas de Matilha', 'Pack Tactics', { packTactics: true }) } },
  azer: {
    abilities: {},
    traits: { 'heated-body': T('Corpo Aquecido', 'Heated Body', { retaliate: { dice: '1d10', type: 'fire', melee: true } }) },
  },
  boar: {
    abilities: {
      charge: rider('Investida', 'Tusk', 11, {
        from: 'Charge',
        ability: { cost: 'free', rider: 'Tusk', dc: 11, moveFt: 20 },
        damage: dmg('1d6', 'slashing'),
        onHitSave: { ability: 'str', onSave: 'none', condition: cond('prone', 0) },
      }),
    },
    traits: { relentless: T('Implacável', 'Relentless', { relentless: 7 }) },
  },
  'giant-spider': {
    abilities: {
      'bite-poison': rider('Mordida venenosa', 'Bite', 11, {
        from: 'Bite',
        onHitSave: { ability: 'con', onSave: 'half', damage: dmg('2d8', 'poison') },
        ...man(
          'Se o veneno reduzir o alvo a 0 PV, ele fica estável e envenenado por 1 hora, paralisado enquanto envenenado.',
          'If the poison reduces the target to 0 HP, it is stable but poisoned for 1 hour, paralyzed while poisoned.',
        ),
      }),
      web: A('Teia', 'Web', recharge(5, { attackBonus: 5 }), {
        range: 60,
        target: creature(),
        resolution: attack,
        condition: cond('restrained', 0),
        ...man(
          'Preso: ação para teste de Força CD 12 e se soltar; a teia (CA 10, 5 PV) é vulnerável a fogo.',
          'Restrained: an action for a DC 12 Strength check to break free; the webbing (AC 10, 5 HP) is vulnerable to fire.',
        ),
        vfx: vfx('ray', 'steel'),
      }),
    },
  },
  hobgoblin: { abilities: {}, traits: { 'martial-advantage': T('Vantagem Marcial', 'Martial Advantage', { allyBonus: { dice: '2d6' } }) } },
  owl: { abilities: {}, traits: { flyby: T('Passagem Rápida', 'Flyby', { noOpportunity: true }) } },
  'flying-snake': { abilities: {}, traits: { flyby: T('Passagem Rápida', 'Flyby', { noOpportunity: true }) } },
  magmin: {
    abilities: {
      'death-burst': A('Explosão de Morte', 'Death Burst', { cost: 'death', dc: 11 }, {
        range: 0,
        target: { kind: 'sphere', radius: 10, self: true },
        resolution: save('dex', 'half'),
        damage: dmg('2d6', 'fire'),
        vfx: vfx('burst', 'fire'),
      }),
    },
  },
};
