// SRD 5.2 (2024) — 4º nível. Lido a partir de public/data/spells-2024.json; o que não aparece é igual ao 2014.
import { auto, cond, creature, dmg, effect, ladder, opt, save, sphere, vfx } from './helpers.mjs';

const ELEMENTS = [
  ['acid', 'Ácido', 'acid'],
  ['cold', 'Gélido', 'frost'],
  ['fire', 'Fogo', 'fire'],
  ['lightning', 'Elétrico', 'lightning'],
];

export default {
  'aura-of-life': {
    target: sphere(30, { self: true }),
    resolution: auto,
    effect: effect(
      { resist: ['necrotic'], note: 'Seus PV máximos não podem ser reduzidos.' },
      { to: 'self' },
    ),
    zone: { aura: true, on: 'cast', color: 'life' },
    manual:
      'Você e seus aliados na aura têm resistência a necrótico e PV máximos imunes a redução; um aliado a 0 PV que começa o turno na aura recupera 1 PV.',
    vfx: vfx('burst', 'life'),
  },
  'black-tentacles': {
    // 2024: Força em vez de Destreza, e a salvaguarda também vale ao conjurar
    resolution: save('str'),
    noInitial: false,
  },
  'charm-monster': {
    target: creature(1, 1),
    resolution: save('wis'),
    condition: cond('charmed', 600, { endsOnDamage: true }),
    manual:
      'Vantagem na salvaguarda se você ou aliados o combatem; o alvo fica Amistoso e sabe que foi enfeitiçado ao fim da magia.',
    vfx: vfx('glow', 'psychic'),
  },
  compulsion: {
    condition: cond('charmed', 10, { repeatSave: true }),
  },
  'conjure-minor-elementals': {
    replace: true,
    // 2024: aura de 15 ft; seus ataques contra quem está nela causam 2d8 extras (tipo à escolha)
    target: sphere(15, { self: true }),
    resolution: auto,
    effect: effect(
      { weaponDamage: { dice: '2d8', type: 'acid' } },
      {
        to: 'self',
        scale: ladder(5, 9, (s) => ({ weaponDamage: { dice: `${s - 2}d8`, type: 'acid' } })),
      },
    ),
    options: ELEMENTS.map(([t, label, color]) =>
      opt(t, label, {
        effect: effect({ weaponDamage: { dice: '2d8', type: t } }, { to: 'self' }),
        vfx: vfx('burst', color),
      }),
    ),
    zone: { aura: true, on: 'cast', difficult: true, color: 'fire' },
    manual:
      'O dano extra vale ao acertar uma criatura dentro da aura; o chão da aura é terreno difícil para seus inimigos.',
    vfx: vfx('burst', 'fire'),
  },
  'conjure-woodland-beings': {
    replace: true,
    // 2024: aura de 10 ft; quem entra ou termina o turno nela faz a salvaguarda
    target: sphere(10, { self: true }),
    resolution: save('wis', 'half'),
    damage: dmg('5d8', 'force', { perLevel: '1d8' }),
    noInitial: true,
    zone: { aura: true, on: 'both', color: 'life' },
    manual: 'Você pode usar Desengajar como ação bônus enquanto durar.',
    vfx: vfx('burst', 'life'),
  },
  'faithful-hound': {
    manual:
      'No início de cada turno seu o cão morde um inimigo a até 5 ft (Destreza ou 4d8 de energia); com uma ação nos turnos seguintes você o move até 30 ft.',
  },
  'freedom-of-movement': { target: creature(1, 1) },
  'ice-storm': { damage: dmg('2d10', 'bludgeoning', { perLevel: '1d10' }) },
  'phantasmal-killer': {
    replace: true,
    resolution: save('wis', 'half'),
    damage: dmg('4d10', 'psychic', { perLevel: '1d10' }),
    // no fim de cada turno do alvo: salvaguarda de Sabedoria; se falhar leva o dano de novo, se passar a magia acaba
    effect: effect({
      attackMode: 'disadvantage',
      dotEnd: { dice: '4d10', type: 'psychic' },
      repeatSave: { ability: 'wis', dc: 0 },
      note: 'Desvantagem em ataques e testes de atributo.',
    }),
    manual: 'Se o alvo passar na salvaguarda inicial, sofre metade do dano e a magia acaba.',
    vfx: vfx('glow', 'psychic'),
  },
  polymorph: {
    manual:
      'Transformação: o alvo ganha como PV temporários os PV da fera (e mantém os seus PV); a magia acaba nele se os PV temporários acabarem.',
  },
  'vitriolic-sphere': {
    target: sphere(20),
    resolution: save('dex', 'half'),
    damage: dmg('10d4', 'acid', { perLevel: '2d4' }),
    effect: effect({ dotEnd: { dice: '5d4', type: 'acid' } }, { rounds: 1 }),
    vfx: vfx('burst', 'acid'),
  },
};
