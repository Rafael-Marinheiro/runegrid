// SRD 5.2 (2024) — 5º nível. Lido a partir de public/data/spells-2024.json; o que não aparece é igual ao 2014.
import { auto, cond, creature, dmg, narrative, opt, point, save, vfx } from './helpers.mjs';

const SPIRIT = [
  ['lightning', 'Ar (elétrico)', 'lightning'],
  ['thunder', 'Terra (trovejante)', 'thunder'],
  ['fire', 'Fogo', 'fire'],
  ['cold', 'Água (gélido)', 'frost'],
];

export default {
  'arcane-hand': { damage: dmg('5d8', 'force', { perLevel: '2d8' }) },
  // 2024: a salvaguarda também vale ao conjurar
  cloudkill: { noInitial: false },
  'conjure-elemental': {
    replace: true,
    // 2024: um espírito elemental intangível; quem chega perto faz a salvaguarda e fica contido
    target: point,
    resolution: save('dex'),
    damage: dmg('8d8', 'lightning', { perLevel: '1d8' }),
    condition: cond('restrained', 10, { repeatSave: true }),
    noInitial: true,
    zone: { on: 'both', radius: 10, color: 'lightning' },
    options: SPIRIT.map(([t, label, color]) =>
      opt(t, label, { damage: dmg('8d8', t, { perLevel: '1d8' }), vfx: vfx('burst', color) }),
    ),
    manual:
      'Quem está contido repete a salvaguarda no início do turno (4d8 do mesmo tipo se falhar); só um alvo fica contido por vez.',
    vfx: vfx('burst', 'lightning'),
  },
  contagion: {
    replace: true,
    range: 5,
    target: creature(),
    resolution: save('con'),
    damage: dmg('11d8', 'necrotic'),
    condition: cond('poisoned', 100800),
    manual:
      'Escolha um atributo: o alvo envenenado tem desvantagem em salvaguardas dele. Ao fim de cada turno ele repete a salvaguarda de Constituição: três sucessos encerram a magia; três falhas a fixam por 7 dias.',
    vfx: vfx('ray', 'poison'),
  },
  'flame-strike': {
    damage: dmg('5d6', 'fire', { perLevel: '1d6' }),
    extraDamage: [dmg('5d6', 'radiant', { perLevel: '1d6' })],
  },
  'hold-monster': { manual: '' },
  'mass-cure-wounds': { heal: { dice: '5d8', perLevel: '1d8', addModifier: true } },
  'summon-dragon': {
    // Espírito Dracônico (SRD 5.2): a ficha é montada na hora; o tipo escolhido vira o sopro e a resistência de quem conjura
    target: point,
    resolution: auto,
    options: [
      ['acid', 'Ácido', 'Acid', 'acid'],
      ['cold', 'Gélido', 'Cold', 'frost'],
      ['fire', 'Fogo', 'Fire', 'fire'],
      ['lightning', 'Elétrico', 'Lightning', 'lightning'],
      ['poison', 'Veneno', 'Poison', 'poison'],
    ].map(([id, pt, en]) => ({
      id,
      label: `Espírito ${pt}`,
      labelEn: `${en} spirit`,
      patch: {
        summon: { custom: 'draconic-spirit', srd: id, n: 1 },
        effect: { to: 'self', mods: { resist: [id] } },
      },
    })),
    manual:
      'Espírito Dracônico: Grande, CA 14 + nível, PV 50 + 10 por nível acima de 5, imune a enfeitiçado, amedrontado e envenenado (o Mestre aplica), visão às cegas 9 m. Você tem resistência ao tipo escolhido enquanto a magia durar. Faz Rend (metade do nível, arredondada para baixo) e usa o Sopro no mesmo turno, logo depois do seu.',
    vfx: vfx('burst', 'fire', { radius: 5 }),
  },
};
