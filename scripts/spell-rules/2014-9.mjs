// SRD 5.1 — 9º nível. Lido a partir de public/data/spells.json.
import {
  auto,
  cond,
  creature,
  dmg,
  effect,
  line,
  narrative,
  opt,
  save,
  sphere,
  vfx,
} from './helpers.mjs';

export default {
  'astral-projection': narrative(vfx('glow', 'arcane')),
  foresight: {
    resolution: auto,
    effect: effect({
      attackMode: 'advantage',
      attackedMode: 'disadvantage',
      saveMode: { mode: 'advantage' },
      note: 'Não pode ser surpreendido; vantagem em ataques, testes e salvaguardas.',
    }),
    vfx: vfx('glow', 'holy'),
  },
  gate: narrative(vfx('glow', 'arcane')),
  imprisonment: {
    resolution: save('wis'),
    condition: cond('restrained', 0),
    options: [
      opt('chaining', 'Correntes (contido)', { condition: cond('restrained', 0) }),
      opt('slumber', 'Sono (não acorda)', { condition: cond('unconscious', 0) }),
      opt('burial', 'Sepultamento', { condition: cond('incapacitated', 0) }),
      opt('hedged', 'Prisão cercada (semiplano)', { condition: cond('incapacitated', 0) }),
      opt('minimus', 'Contenção mínima (gema)', { condition: cond('incapacitated', 0) }),
    ],
    manual: 'Nas formas de sepultamento, prisão cercada e contenção mínima, retire o token do mapa. A magia dura até ser dissipada (Dissipar Magia de 9º nível).',
    vfx: vfx('glow', 'force'),
  },
  'mass-heal': {
    target: creature(12),
    resolution: auto,
    // reserva de 700 PV dividida entre os alvos, na ordem em que foram escolhidos
    heal: { flat: 700, pool: true },
    cure: { conditions: ['blinded', 'deafened'], all: true },
    manual: 'Também cura todas as doenças; sem efeito em constructos e mortos-vivos.',
    vfx: vfx('glow', 'life'),
  },
  'meteor-swarm': {
    target: sphere(40),
    resolution: save('dex', 'half'),
    damage: dmg('20d6', 'fire'),
    extraDamage: [dmg('20d6', 'bludgeoning')],
    manual: 'São quatro pontos: conjure este efeito uma vez por ponto (uma criatura em mais de uma explosão sofre só uma).',
    vfx: vfx('burst', 'fire'),
  },
  'power-word-kill': {
    resolution: auto,
    ifHpAtMost: 100,
    kill: true,
    vfx: vfx('glow', 'shadow'),
  },
  'prismatic-wall': {
    target: line(90, 5),
    resolution: auto,
    zone: { on: 'cast', color: 'arcane' },
    manual: 'Sete camadas (vermelha a violeta): quem atravessa faz Destreza em cada uma (10d6 de fogo, ácido, elétrico, veneno ou gelo; restrito; cego/transportado); quem vê a parede a até 20 ft faz Constituição ou fica cego.',
    vfx: vfx('ray', 'arcane'),
  },
  shapechange: narrative(vfx('glow', 'life'), {
    manual: 'Transformação: troque as suas estatísticas pelas da criatura escolhida (ND até o seu nível).',
  }),
  'storm-of-vengeance': {
    target: sphere(360),
    resolution: save('con'),
    damage: dmg('2d6', 'thunder'),
    condition: cond('deafened', 50),
    zone: { on: 'cast', obscures: true, difficult: true, color: 'thunder' },
    manual: 'A cada rodada em que você mantém a concentração: 2ª chuva ácida (1d6), 3ª seis raios (10d6), 4ª granizo (2d6), 5ª–10ª chuva gelada (1d6): aplique à mão.',
    vfx: vfx('burst', 'thunder'),
  },
  'time-stop': narrative(vfx('glow', 'arcane'), {
    manual: 'Você age 1d4 + 1 turnos seguidos; acaba se uma ação sua afetar outra criatura: conduza à mão.',
  }),
  'true-polymorph': narrative(vfx('glow', 'life'), {
    manual: 'Transformação: troque as estatísticas do alvo (criatura em criatura, objeto ou vice-versa) à mão.',
  }),
  'true-resurrection': {
    resolution: auto,
    revive: 'full',
    manual: 'Só vale se a criatura morreu há no máximo 200 anos e não de velhice; cura doenças, venenos e maldições.',
    vfx: vfx('glow', 'holy'),
  },
  weird: {
    target: sphere(30),
    resolution: save('wis'),
    condition: cond('frightened', 10, { repeatSave: true }),
    // no início de cada turno: 4d10 psíquico; passar na salvaguarda acaba com a magia para o alvo
    effect: effect({ dotStart: { dice: '4d10', type: 'psychic' } }),
    manual: 'No início de cada turno o alvo faz salvaguarda de Sabedoria (aqui, no fim): se passar, a magia acaba para ele.',
    vfx: vfx('burst', 'psychic'),
  },
  wish: narrative(vfx('glow', 'arcane'), {
    manual: 'O Desejo duplica magia de até 8º nível (conjure a magia em si) ou cria um efeito livre: o Mestre adjudica.',
  }),
};
