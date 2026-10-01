// SRD 5.2 (2024) — 8º nível. Lido a partir de public/data/spells-2024.json; o que não aparece é igual ao 2014.
import { auto, cond, creature, dmg, effect, line, save, vfx } from './helpers.mjs';

export default {
  befuddlement: {
    range: 150,
    target: creature(),
    resolution: save('int', 'half'),
    damage: dmg('10d12', 'psychic'),
    effect: effect({
      note: 'Não conjura nem usa a ação Magia; repete a salvaguarda a cada 30 dias (ou Restauração Maior, Cura ou Desejo).',
    }),
    vfx: vfx('glow', 'psychic'),
  },
  'dominate-monster': {
    manual:
      'Vantagem na salvaguarda se você ou aliados lutam contra o alvo; ao sofrer dano ele repete a salvaguarda; o comando telepático não gasta ação.',
  },
  'power-word-stun': {
    replace: true,
    resolution: auto,
    // 2024: até 150 PV fica atordoado (Constituição a cada fim de turno); acima disso, Deslocamento 0 até o seu próximo turno
    table: {
      by: 'hp',
      rows: [
        {
          from: 0,
          to: 150,
          patch: { condition: cond('stunned', 10, { repeatSave: true, repeatAbility: 'con' }) },
        },
        {
          from: 151,
          to: 99999,
          patch: { effect: effect({ speedSet: 0 }, { rounds: 1, ends: 'casterStart' }) },
        },
      ],
    },
    vfx: vfx('glow', 'psychic'),
  },
  tsunami: {
    range: 5280,
    // parede de 300 ft de comprimento e 50 ft de espessura: aproximada por uma linha
    target: line(300, 50),
    resolution: save('str', 'half'),
    damage: dmg('6d10', 'bludgeoning'),
    zone: { on: 'cast', difficult: true, color: 'frost' },
    manual:
      'A cada início de turno seu a parede avança 50 ft; Enormes ou menores dentro dela fazem Força ou sofrem 5d10 (−1d10 a cada rodada). Mova e aplique à mão.',
    vfx: vfx('burst', 'frost'),
  },
};
