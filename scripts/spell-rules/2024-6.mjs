// SRD 5.2 (2024) — 6º nível. Lido a partir de public/data/spells-2024.json; o que não aparece é igual ao 2014.
import { attack, cond, creature, dmg, opt, vfx } from './helpers.mjs';

export default {
  'blade-barrier': {
    // 2024: dano de energia e a salvaguarda também vale ao conjurar
    damage: dmg('6d10', 'force'),
    noInitial: false,
  },
  'circle-of-death': { damage: dmg('8d8', 'necrotic', { perLevel: '2d8' }) },
  'conjure-fey': {
    replace: true,
    // 2024: um espírito feérico; ataque corpo a corpo de magia ao surgir e com ação bônus nos turnos seguintes
    range: 60,
    target: creature(),
    resolution: attack,
    damage: dmg('3d12', 'psychic', { perLevel: '1d12', addModifier: true }),
    condition: cond('frightened', 1),
    sustain: { cost: 'bonus' },
    manual:
      'O espírito aparece a até 60 ft e o alvo precisa estar a até 5 ft dele; nos turnos seguintes você o teletransporta até 30 ft e ataca de novo.',
    vfx: vfx('ray', 'psychic'),
  },
  eyebite: {
    options: [
      opt('asleep', 'Adormecido', { condition: cond('unconscious', 10, { endsOnDamage: true }) }),
      opt('panicked', 'Em pânico (amedrontado)', { condition: cond('frightened', 10) }),
      opt('sickened', 'Enjoado (envenenado)', { condition: cond('poisoned', 10) }),
    ],
  },
  heal: {
    cure: { conditions: ['blinded', 'deafened', 'poisoned'], all: true },
    manual: 'Sem efeito em constructos e mortos-vivos; 70 PV (+10 por nível acima do 6º).',
  },
  'irresistible-dance': { condition: cond('charmed', 10) },
  'mass-suggestion': { condition: cond('charmed', 14400, { endsOnDamage: true }) },
};
