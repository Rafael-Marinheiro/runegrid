// SRD 5.2 (2024) — 7º nível. Lido a partir de public/data/spells-2024.json; o que não aparece é igual ao 2014.
import { cond, cone, dmg, vfx } from './helpers.mjs';

const RAY = (t) => ({ damage: dmg('12d6', t) });

export default {
  'arcane-sword': {
    // 2024: 4d12 de energia mais o modificador de conjuração
    damage: dmg('4d12', 'force', { addModifier: true }),
  },
  'divine-word': {
    // 2024: ação bônus e alvos com até 50 PV; a faixa de 21 a 30 PV deixa atordoado
    table: {
      by: 'hp',
      rows: [
        { from: 0, to: 20, patch: { kill: true } },
        {
          from: 21,
          to: 30,
          patch: { condition: [cond('blinded', 600), cond('deafened', 600), cond('stunned', 600)] },
        },
        { from: 31, to: 40, patch: { condition: [cond('blinded', 100), cond('deafened', 100)] } },
        { from: 41, to: 50, patch: { condition: cond('deafened', 10) } },
      ],
    },
  },
  'prismatic-spray': {
    // 2024: 12d6 por raio
    target: cone(60),
    damage: dmg('12d6', 'fire'),
    table: {
      by: 'die',
      die: 8,
      rows: [
        { from: 1, to: 1, patch: RAY('fire') },
        { from: 2, to: 2, patch: RAY('acid') },
        { from: 3, to: 3, patch: RAY('lightning') },
        { from: 4, to: 4, patch: RAY('poison') },
        { from: 5, to: 5, patch: RAY('cold') },
        {
          from: 6,
          to: 6,
          patch: {
            damage: null,
            condition: cond('restrained', 10),
            manual:
              'Índigo: três falhas de salvaguarda de Constituição (no fim de cada turno) o petrificam; três sucessos encerram.',
          },
        },
        {
          from: 7,
          to: 7,
          patch: {
            damage: null,
            condition: cond('blinded', 10),
            manual:
              'Violeta: no início do seu próximo turno o alvo faz salvaguarda de Sabedoria; se falhar é transportado a outro plano.',
          },
        },
        {
          from: 8,
          to: 8,
          patch: { damage: dmg('12d6', 'fire'), extraDamage: [dmg('12d6', 'acid')] },
        },
      ],
    },
    vfx: vfx('cone', 'arcane'),
  },
};
