// Invocações do SRD 2014: criaturas que aparecem no mapa (ver `SummonSpec`). As fichas vêm do Bestiário.
import { byType, creatureOptions, groupSize, sheets } from './summon-helpers.mjs';
import { auto, point, vfx } from './helpers.mjs';

const RS = '2014';
const opts = (filter, spec, count) => creatureOptions(sheets(RS, filter), spec, count);

const summon = (color, options, extra = {}) => ({
  target: point,
  resolution: auto,
  options,
  vfx: vfx('burst', color, { radius: 5 }),
  ...extra,
});

const named = (ids) => (m) => ids.includes(m.id);

export default {
  'conjure-animals': summon(
    'life',
    opts(
      byType(['Beast'], 2),
      {
        countScale: [
          { from: 5, mult: 2 },
          { from: 7, mult: 3 },
          { from: 9, mult: 4 },
        ],
      },
      groupSize,
    ),
  ),
  'conjure-minor-elementals': summon(
    'fire',
    opts(
      byType(['Elemental'], 2),
      {
        countScale: [
          { from: 6, mult: 2 },
          { from: 8, mult: 3 },
        ],
      },
      groupSize,
    ),
  ),
  'conjure-woodland-beings': summon(
    'life',
    opts(
      byType(['Fey'], 2),
      {
        countScale: [
          { from: 6, mult: 2 },
          { from: 8, mult: 3 },
        ],
      },
      groupSize,
    ),
  ),
  'conjure-fey': summon(
    'life',
    opts(byType(['Fey', 'Beast'], 9), { maxCr: { base: 6, from: 6 }, onBreak: 'hostile' }),
    {
      manual:
        'Se a concentração quebrar, a criatura fica hostil e some 1 hora depois; se for uma fera, é uma fera feérica.',
    },
  ),
  'conjure-elemental': summon(
    'fire',
    opts(byType(['Elemental'], 9), { maxCr: { base: 5, from: 5 }, onBreak: 'hostile' }),
    {
      manual:
        'Se a concentração quebrar, o elemental fica hostil e some 1 hora depois. Escolha o elemental que combina com o ponto (fogo de uma fogueira, terra do chão…).',
    },
  ),
  'conjure-celestial': summon(
    'holy',
    opts(byType(['Celestial'], 5), { maxCr: { base: 4, from: 8 } }),
  ),
  'animate-dead': summon(
    'shadow',
    opts(
      named(['skeleton', 'zombie']),
      { permanent: true, corpse: true, extraPerLevel: { from: 3, add: 2 } },
      () => 1,
    ),
    {
      manual:
        'Esqueleto (ossos) ou zumbi (cadáver). Com espaço de 4º nível ou mais, mais dois por nível. Obedecem por 24 horas; como ação bônus você comanda os que estiverem a até 18 m.',
    },
  ),
  'create-undead': summon(
    'shadow',
    opts(named(['ghoul']), { permanent: true, corpse: true, extraPerLevel: { from: 6, add: 1 } }),
    {
      manual:
        'Só à noite. Obedecem por 24 horas. Com espaço de 8º nível ou mais, o Mestre pode trocar carniçais por aparições ou múmias.',
    },
  ),
  'find-familiar': summon(
    'arcane',
    opts(
      named([
        'bat',
        'cat',
        'crab',
        'frog',
        'hawk',
        'lizard',
        'octopus',
        'owl',
        'poisonous-snake',
        'quipper',
        'rat',
        'raven',
        'sea-horse',
        'spider',
        'weasel',
      ]),
      { permanent: true, unique: 'familiar' },
    ),
    {
      manual:
        'O familiar não ataca e some ao chegar a 0 PV; conjure a magia de novo para chamá-lo.',
    },
  ),
  'find-steed': summon(
    'holy',
    opts(named(['warhorse', 'pony', 'camel', 'elk', 'mastiff']), {
      permanent: true,
      unique: 'steed',
    }),
    {
      manual:
        'A montaria é um espírito celestial, feérico ou ínfero; some ao chegar a 0 PV e volta ao conjurar de novo.',
    },
  ),
};
