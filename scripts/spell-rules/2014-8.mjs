// SRD 5.1 — 8º nível. Lido a partir de public/data/spells.json.
import { auto, cond, dmg, effect, narrative, save, sphere, vfx } from './helpers.mjs';

export default {
  'animal-shapes': narrative(vfx('glow', 'life'), {
    manual:
      'Transformação: troque as estatísticas de cada alvo pelas da fera escolhida (ND 4 ou menor).',
  }),
  'antimagic-field': {
    target: sphere(10, { self: true }),
    resolution: auto,
    zone: { aura: true, on: 'cast', color: 'arcane' },
    manual:
      'Dentro da esfera magias não funcionam, criaturas invocadas somem e itens mágicos ficam comuns: suprima à mão os efeitos de quem estiver nela.',
    vfx: vfx('burst', 'arcane'),
  },
  antipathysympathy: narrative(vfx('glow', 'psychic')),
  clone: narrative(vfx('glow', 'shadow')),
  'control-weather': narrative(vfx('burst', 'thunder', { radius: 100 })),
  demiplane: narrative(vfx('glow', 'shadow')),
  'dominate-monster': {
    resolution: save('wis'),
    condition: cond('charmed', 600),
    manual:
      'Você tem vantagem de comando telepática; com uma ação controla totalmente o alvo até o fim do seu próximo turno; ao sofrer dano ele repete a salvaguarda.',
    vfx: vfx('glow', 'psychic'),
  },
  earthquake: {
    target: sphere(100),
    resolution: save('dex'),
    condition: cond('prone', 0),
    zone: { on: 'cast', difficult: true, color: 'steel' },
    manual:
      'A cada fim de turno seu, quem está no chão faz a salvaguarda de novo; quem se concentra na área faz Constituição ou perde a concentração; fissuras e estruturas ficam a cargo do Mestre.',
    vfx: vfx('burst', 'steel'),
  },
  feeblemind: {
    resolution: save('int'),
    damage: dmg('4d6', 'psychic'),
    effect: effect({
      note: 'Inteligência e Carisma caem a 1: não conjura, não entende linguagem nem se comunica; repete a salvaguarda a cada 30 dias.',
    }),
    vfx: vfx('glow', 'psychic'),
  },
  glibness: narrative(vfx('glow', 'arcane')),
  'holy-aura': {
    target: sphere(30, { self: true }),
    resolution: auto,
    effect: effect(
      {
        saveMode: { mode: 'advantage' },
        attackedMode: 'disadvantage',
        note: 'Quando um ínfero ou morto-vivo o acerta corpo a corpo, ele faz Constituição ou fica cego.',
      },
      { to: 'both' },
    ),
    vfx: vfx('burst', 'holy'),
  },
  'incendiary-cloud': {
    target: sphere(20),
    resolution: save('dex', 'half'),
    damage: dmg('10d8', 'fire'),
    zone: { on: 'both', obscures: true, color: 'fire' },
    // a nuvem anda 10 ft a cada turno seu: clique no novo ponto
    sustain: { cost: 'free' },
    vfx: vfx('burst', 'fire'),
  },
  maze: {
    resolution: auto,
    condition: cond('incapacitated', 100),
    manual:
      'O alvo está no labirinto: retire o token do mapa; com uma ação faz teste de Inteligência CD 20 para escapar (a magia acaba e ele volta ao espaço de onde saiu).',
    vfx: vfx('glow', 'arcane'),
  },
  'mind-blank': {
    resolution: auto,
    effect: effect({
      immune: ['psychic'],
      immuneConditions: ['charmed'],
      note: 'Imune a dano psíquico, a ler pensamentos e emoções e a adivinhação.',
    }),
    vfx: vfx('glow', 'psychic'),
  },
  'power-word-stun': {
    resolution: auto,
    ifHpAtMost: 150,
    condition: cond('stunned', 10, { repeatSave: true, repeatAbility: 'con' }),
    vfx: vfx('glow', 'psychic'),
  },
  sunburst: {
    target: sphere(60),
    resolution: save('con', 'half'),
    damage: dmg('12d6', 'radiant'),
    condition: cond('blinded', 10, { repeatSave: true }),
    manual:
      'Mortos-vivos e limos têm desvantagem na salvaguarda; a luz dissipa escuridão mágica na área.',
    vfx: vfx('burst', 'holy'),
  },
};
