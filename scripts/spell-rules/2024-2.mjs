// SRD 5.2 (2024) — 2º nível. Lido a partir de public/data/spells-2024.json; o que não aparece é igual ao 2014.
import {
  auto,
  cond,
  cone,
  creature,
  dmg,
  effect,
  ladder,
  opt,
  save,
  vfx,
} from './helpers.mjs';

const BREATH = [
  ['fire', 'Fogo', 'fire'],
  ['acid', 'Ácido', 'acid'],
  ['cold', 'Gélido', 'frost'],
  ['lightning', 'Elétrico', 'lightning'],
  ['poison', 'Veneno', 'poison'],
];

export default {
  barkskin: { effect: effect({ acMin: 17 }) },
  blindnessdeafness: {
    replace: true,
    target: creature(1, 1),
    resolution: save('con'),
    condition: cond('blinded', 10, { repeatSave: true }),
    options: [
      opt('blinded', 'Cego', { condition: cond('blinded', 10, { repeatSave: true }) }),
      opt('deafened', 'Surdo', { condition: cond('deafened', 10, { repeatSave: true }) }),
    ],
    vfx: vfx('glow', 'shadow'),
  },
  'calm-emotions': {
    effect: effect({
      immuneConditions: ['charmed', 'frightened'],
      note: 'Imune a enfeitiçado e amedrontado (os atuais ficam suspensos), ou indiferente a quem você escolher.',
    }),
  },
  darkvision: { effect: effect({ note: 'Visão no escuro de 150 ft.' }) },
  'dragons-breath': {
    // a magia dá ao alvo um sopro (ação) em cone de 15 ft; a CD é do conjurador
    resolution: auto,
    grantSustain: true,
    noInitial: true,
    sustain: {
      cost: 'action',
      use: {
        target: cone(15),
        resolution: save('dex', 'half'),
        damage: dmg('3d6', 'fire', { perLevel: '1d6' }),
        vfx: vfx('cone', 'fire'),
      },
    },
    options: BREATH.map(([t, label, color]) =>
      opt(t, label, {
        damage: dmg('3d6', t, { perLevel: '1d6' }),
        vfx: vfx('cone', color),
      }),
    ),
    vfx: vfx('glow', 'fire'),
  },
  enthrall: {
    effect: effect({ note: '−10 em Sabedoria (Percepção) e na Percepção passiva.' }),
  },
  'flame-blade': {
    sustain: {
      cost: 'action',
      use: {
        target: creature(),
        range: 5,
        resolution: { kind: 'attack' },
        damage: dmg('3d6', 'fire', { perLevel: '1d6', addModifier: true }),
        vfx: vfx('ray', 'fire'),
      },
    },
  },
  'gust-of-wind': {
    // 2024: a rajada já empurra quem está na linha ao ser conjurada
    noInitial: false,
  },
  'magic-weapon': {
    effect: effect(
      { weaponBonus: 1 },
      { scale: [{ from: 3, mods: { weaponBonus: 2 } }, { from: 6, mods: { weaponBonus: 3 } }] },
    ),
  },
  'mind-spike': {
    target: creature(),
    resolution: save('wis', 'half'),
    damage: dmg('3d8', 'psychic', { perLevel: '1d8' }),
    effect: effect({ note: 'Você sabe onde o alvo está; ele não se esconde nem se beneficia de Invisível contra você.' }),
    vfx: vfx('glow', 'psychic'),
  },
  'mirror-image': { effect: effect({ images: 3, imagesD6: true }) },
  moonbeam: {
    noInitial: false,
    zone: { on: 'both', color: 'holy', onMove: true },
  },
  'phantasmal-force': {
    target: creature(),
    resolution: save('int'),
    effect: effect({
      dotStart: { dice: '2d8', type: 'psychic' },
      note: 'Só o alvo percebe o fantasma; se passar num teste de Investigação contra a sua CD, a magia acaba.',
    }),
    manual: 'O dano de 2d8 psíquico acontece enquanto o alvo estiver na área do fantasma ou a até 5 ft dele.',
    vfx: vfx('glow', 'psychic'),
  },
  'prayer-of-healing': {
    replace: true,
    target: creature(5),
    resolution: auto,
    heal: { dice: '2d8', perLevel: '1d8' },
    manual: 'Os afetados também ganham os benefícios de um descanso curto (uma vez por descanso longo).',
    vfx: vfx('glow', 'life'),
  },
  'ray-of-enfeeblement': {
    replace: true,
    resolution: save('con'),
    effect: effect({
      damageDie: '-1d8',
      repeatSave: { ability: 'con', dc: 0 },
      note: 'Desvantagem em testes de d20 de Força e −1d8 em cada dano.',
    }),
    manual: 'Se passar na salvaguarda, o alvo só tem desvantagem no próximo ataque até o início do seu próximo turno.',
    vfx: vfx('ray', 'shadow'),
  },
  'shining-smite': {
    target: { kind: 'self' },
    resolution: auto,
    effect: effect(
      {
        weaponDamage: { dice: '2d6', type: 'radiant' },
        once: true,
        onHit: { mods: { attackedMode: 'advantage', note: 'Brilha: luz plena em 5 ft e não se beneficia de Invisível.' }, rounds: 10 },
      },
      { scale: ladder(3, 9, (s) => ({ weaponDamage: { dice: `${s}d6`, type: 'radiant' } })) },
    ),
    vfx: vfx('glow', 'holy'),
  },
  suggestion: {
    replace: true,
    resolution: save('wis'),
    condition: cond('charmed', 4800, { endsOnDamage: true }),
    effect: effect({ note: 'Cumpre a sugestão (até 25 palavras) da melhor forma possível.' }),
    vfx: vfx('glow', 'psychic'),
  },
};
