// SRD 5.2 (2024) — 5º nível. Lido a partir de public/data/spells-2024.json; o que não aparece é igual ao 2014.
import { cond, creature, dmg, narrative, opt, point, save, vfx } from './helpers.mjs';

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
  'summon-dragon': narrative(vfx('glow', 'fire'), {
    manual:
      'Invocação: o Mestre adiciona o espírito dracônico (bloco Draconic Spirit) ao combate; ele age logo depois de você.',
  }),
};
