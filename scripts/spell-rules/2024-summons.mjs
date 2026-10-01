// Invocações do SRD 2024 que mudam em relação ao 2014 (as demais herdam). As fichas vêm do Bestiário 2024.
import { creatureOptions, sheets } from './summon-helpers.mjs';
import { auto, point, vfx } from './helpers.mjs';

const RS = '2024';
const named = (ids) => (m) => ids.includes(m.id);

export default {
  'find-familiar': {
    replace: true,
    target: point,
    resolution: auto,
    options: creatureOptions(
      sheets(RS, (m) => m.type.toLowerCase() === 'beast' && m.cr === 0 && !/horse/i.test(m.id)),
      { permanent: true, unique: 'familiar' },
      () => 1,
      false,
    ),
    manual:
      'O familiar é celestial, feérico ou ínfero; some ao chegar a 0 PV; conjure a magia de novo para chamá-lo.',
    vfx: vfx('burst', 'arcane', { radius: 5 }),
  },
  'find-steed': {
    replace: true,
    target: point,
    resolution: auto,
    options: creatureOptions(
      sheets(RS, named(['warhorse', 'riding-horse', 'draft-horse'])),
      { permanent: true, unique: 'steed' },
      () => 1,
    ),
    manual:
      'O 2024 usa o bloco Otherworldly Steed (Celestial, Feérico ou Ínfero); aqui entra a ficha de um cavalo como aproximação. Substitui a montaria anterior.',
    vfx: vfx('burst', 'holy', { radius: 5 }),
  },
};
