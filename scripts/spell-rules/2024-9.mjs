// SRD 5.2 (2024) — 9º nível. Lido a partir de public/data/spells-2024.json; o que não aparece é igual ao 2014.
import { auto, cond, dmg, effect, vfx } from './helpers.mjs';

export default {
  foresight: {
    effect: effect({
      attackMode: 'advantage',
      attackedMode: 'disadvantage',
      saveMode: { mode: 'advantage' },
      note: 'Vantagem em todos os Testes de d20; quem o ataca tem desvantagem.',
    }),
  },
  'power-word-heal': {
    resolution: auto,
    heal: { flat: 9999 },
    cure: { conditions: ['charmed', 'frightened', 'paralyzed', 'poisoned', 'stunned'], all: true },
    manual: 'Se o alvo está caído, ele pode usar a Reação para se levantar.',
    vfx: vfx('glow', 'life'),
  },
  'power-word-kill': {
    replace: true,
    resolution: auto,
    // 2024: até 100 PV morre; acima disso sofre 12d12 de dano psíquico
    table: {
      by: 'hp',
      rows: [
        { from: 0, to: 100, patch: { kill: true } },
        { from: 101, to: 99999, patch: { damage: dmg('12d12', 'psychic') } },
      ],
    },
    vfx: vfx('glow', 'shadow'),
  },
  weird: {
    // 2024: 10d10 ao falhar (metade ao passar); repete a salvaguarda no fim de cada turno, tomando 5d10 se falhar
    damage: dmg('10d10', 'psychic'),
    resolution: { kind: 'save', ability: 'wis', onSave: 'half' },
    condition: cond('frightened', 10, { repeatSave: true }),
    effect: effect({ dotEnd: { dice: '5d10', type: 'psychic' } }),
    manual: 'No fim de cada turno o alvo faz salvaguarda de Sabedoria: se falhar, sofre 5d10 psíquico; se passar, a magia acaba para ele.',
  },
};
