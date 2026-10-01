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
    // Corcel de Outro Mundo (SRD 5.2): a ficha é montada na hora conforme o espaço e o tipo escolhido
    options: [
      ['celestial', 'Celestial', 'Celestial'],
      ['fey', 'Feérico', 'Fey'],
      ['fiend', 'Corruptor', 'Fiend'],
    ].map(([id, pt, en]) => ({
      id,
      label: `Corcel ${pt}`,
      labelEn: `${en} steed`,
      patch: {
        summon: { custom: 'otherworldly-steed', srd: id, n: 1, permanent: true, unique: 'steed' },
      },
    })),
    manual:
      'Corcel de Outro Mundo: Grande, CA 10 + nível, PV 5 + 10 por nível, 60 ft (voo 60 ft com espaço de 4º nível ou mais), pancada com o seu ataque de magia. Vínculo Vital: ao recuperar PV de uma magia de 1º nível ou mais, o corcel recupera o mesmo valor se estiver a até 1,5 m (o Mestre aplica). Substitui o corcel anterior; some a 0 PV ou se você morrer.',
    vfx: vfx('burst', 'holy', { radius: 5 }),
  },
};
