// SRD 5.1 — 7º nível. Lido a partir de public/data/spells.json.
import {
  attack,
  auto,
  cond,
  cone,
  creature,
  cube,
  dmg,
  effect,
  narrative,
  save,
  sphere,
  vfx,
} from './helpers.mjs';

const RAY = (t) => ({ damage: dmg('10d6', t) });

export default {
  'arcane-sword': {
    range: 60,
    target: creature(),
    resolution: attack,
    damage: dmg('3d10', 'force'),
    // ação bônus nos turnos seguintes: move a espada e ataca de novo
    sustain: { cost: 'bonus' },
    vfx: vfx('ray', 'force'),
  },
  'conjure-celestial': narrative(vfx('glow', 'holy'), {
    manual:
      'Invocação: o Mestre adiciona o celestial (ND 4 ou menor; 5 com espaço de 9º nível) ao combate.',
  }),
  'delayed-blast-fireball': {
    target: sphere(20),
    resolution: save('dex', 'half'),
    damage: dmg('12d6', 'fire', { perLevel: '1d6' }),
    noInitial: true,
    // quando você decide encerrar a magia: clique no ponto da esfera para detonar
    sustain: { cost: 'free' },
    manual:
      'A esfera também explode se a concentração quebrar; o dano base sobe 1d6 a cada fim de turno sem detonar (some à mão).',
    vfx: vfx('burst', 'fire'),
  },
  'divine-word': {
    target: creature(12),
    resolution: save('cha'),
    condition: cond('deafened', 10),
    // efeito conforme os PV atuais do alvo
    table: {
      by: 'hp',
      rows: [
        { from: 0, to: 20, patch: { kill: true } },
        {
          from: 21,
          to: 30,
          patch: {
            condition: [cond('blinded', 600), cond('deafened', 600), cond('incapacitated', 600)],
          },
        },
        { from: 31, to: 40, patch: { condition: [cond('blinded', 100), cond('deafened', 100)] } },
        { from: 41, to: 50, patch: { condition: cond('deafened', 10) } },
      ],
    },
    manual:
      'Celestiais, elementais, fadas e ínferos que falham são mandados de volta ao plano de origem (por 24 horas).',
    vfx: vfx('burst', 'holy'),
  },
  etherealness: narrative(vfx('glow', 'arcane')),
  'finger-of-death': {
    resolution: save('con', 'half'),
    damage: dmg('7d8+30', 'necrotic'),
    manual:
      'Um humanoide morto por esta magia se ergue como zumbi sob seu comando no início do seu próximo turno.',
    vfx: vfx('ray', 'shadow'),
  },
  'fire-storm': {
    // até dez cubos de 10 ft arranjados como quiser: aproximado por um cubo de 30 ft
    target: cube(30),
    resolution: save('dex', 'half'),
    damage: dmg('7d10', 'fire'),
    vfx: vfx('burst', 'fire'),
  },
  forcecage: {
    target: cube(20),
    resolution: auto,
    zone: { on: 'cast', color: 'force' },
    manual:
      'Uma prisão de energia (jaula de até 20 ft ou caixa de até 10 ft): quem está dentro não sai por meios não mágicos; ela resiste a Dissipar Magia.',
    vfx: vfx('burst', 'force'),
  },
  'magnificent-mansion': narrative(vfx('glow', 'arcane')),
  'mirage-arcane': narrative(vfx('glow', 'arcane')),
  'plane-shift': narrative(vfx('glow', 'arcane'), {
    manual:
      'Para banir uma criatura relutante: ataque corpo a corpo e, se acertar, salvaguarda de Carisma (aplique à mão).',
  }),
  'prismatic-spray': {
    target: cone(60),
    resolution: save('dex', 'half'),
    damage: dmg('10d6', 'fire'),
    // d8 por alvo: 1 vermelho, 2 laranja, 3 amarelo, 4 verde, 5 azul, 6 índigo, 7 violeta, 8 dois raios
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
              'Índigo: três falhas seguidas de salvaguarda de Constituição o petrificam; três sucessos encerram.',
          },
        },
        {
          from: 7,
          to: 7,
          patch: {
            damage: null,
            condition: cond('blinded', 10),
            manual:
              'Violeta: na próxima vez que você agir, o alvo faz salvaguarda de Sabedoria; se falhar é transportado a outro plano.',
          },
        },
        {
          from: 8,
          to: 8,
          patch: { damage: dmg('10d6', 'fire'), extraDamage: [dmg('10d6', 'acid')] },
        },
      ],
    },
    manual:
      'Raio 8: o alvo é atingido por dois raios (aqui, fogo e ácido); role de novo à mão para raios 6 e 7 se quiser.',
    vfx: vfx('cone', 'arcane'),
  },
  'project-image': narrative(vfx('glow', 'arcane')),
  regenerate: {
    resolution: auto,
    heal: { dice: '4d8+15' },
    effect: effect({ regen: 1 }),
    manual: 'Membros decepados voltam depois de 2 minutos.',
    vfx: vfx('glow', 'life'),
  },
  resurrection: {
    resolution: auto,
    revive: 'full',
    effect: effect({
      attackDie: '-4',
      saveDie: '-4',
      note: '−4 em ataques, salvaguardas e testes; cai 1 por descanso longo.',
    }),
    manual: 'Só vale se a criatura morreu há no máximo um século e não de velhice.',
    vfx: vfx('glow', 'holy'),
  },
  'reverse-gravity': {
    target: sphere(50),
    resolution: auto,
    zone: { on: 'cast', color: 'arcane' },
    manual:
      'Criaturas na área caem para cima (Destreza para se agarrar a algo fixo); ao fim da magia, caem de volta.',
    vfx: vfx('burst', 'arcane'),
  },
  sequester: narrative(vfx('glow', 'arcane')),
  simulacrum: narrative(vfx('glow', 'frost'), {
    manual:
      'Invocação: o Mestre cria o simulacro (metade dos PV do original) e o adiciona ao combate.',
  }),
  symbol: narrative(vfx('burst', 'arcane', { radius: 60 })),
  teleport: narrative(vfx('glow', 'arcane'), {
    manual:
      'O destino e a margem de erro seguem a tabela de familiaridade: o Mestre rola e move os tokens.',
  }),
};
