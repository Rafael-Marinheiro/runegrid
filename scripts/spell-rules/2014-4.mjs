// SRD 5.1 — 4º nível. Lido a partir de public/data/spells.json.
// Invocações, polimorfia e magias de exploração ficam narrativas (com nota quando há parte de combate a cargo do Mestre).
import {
  ALL_DAMAGE,
  auto,
  cond,
  creature,
  cube,
  dmg,
  effect,
  line,
  narrative,
  opt,
  point,
  save,
  self,
  sphere,
  vfx,
} from './helpers.mjs';

export default {
  'arcane-eye': narrative(vfx('glow', 'arcane')),
  banishment: {
    target: creature(1, 1),
    resolution: save('cha'),
    condition: cond('incapacitated', 10),
    manual:
      'Banido: retire o token do mapa enquanto durar; ao fim da magia (ou se durar 1 minuto fora do plano de origem) o alvo volta ao espaço de onde saiu.',
    vfx: vfx('glow', 'arcane'),
  },
  'black-tentacles': {
    target: cube(20),
    resolution: save('dex'),
    damage: dmg('3d6', 'bludgeoning'),
    condition: cond('restrained', 10),
    noInitial: true,
    zone: { on: 'both', difficult: true, color: 'shadow' },
    manual:
      'Preso, o alvo pode usar a ação para um teste de Força ou Destreza contra a sua CD e se libertar; quem já está preso sofre o dano de novo no início do turno.',
    vfx: vfx('burst', 'shadow'),
  },
  blight: {
    resolution: save('con', 'half'),
    damage: dmg('8d8', 'necrotic', { perLevel: '1d8' }),
    manual:
      'Sem efeito em mortos-vivos e constructos; plantas têm desvantagem e sofrem o dano máximo.',
    vfx: vfx('ray', 'shadow'),
  },
  compulsion: {
    target: creature(12),
    resolution: save('wis'),
    effect: effect({
      note: 'Deve se mover o máximo que puder na direção indicada (ação bônus do conjurador); refaz a salvaguarda depois de se mover.',
    }),
    vfx: vfx('glow', 'psychic'),
  },
  confusion: {
    target: sphere(10),
    resolution: save('wis'),
    effect: effect({
      noReactions: true,
      repeatSave: { ability: 'wis', dc: 0 },
      note: 'No início de cada turno role d10: 1 move-se ao acaso; 2–6 não age; 7–8 ataca alguém ao alcance; 9–10 age normalmente.',
    }),
    vfx: vfx('burst', 'psychic'),
  },
  'control-water': narrative(vfx('burst', 'frost', { radius: 50 })),
  'death-ward': {
    resolution: auto,
    effect: effect({ deathWard: true, note: 'A primeira queda a 0 PV vira 1 PV e a magia acaba.' }),
    vfx: vfx('glow', 'holy'),
  },
  'dimension-door': {
    target: point,
    resolution: auto,
    teleport: true,
    manual:
      'Você pode levar um aliado voluntário a até 5 ft (mova o token dele à mão). Chegar num espaço ocupado causa 4d6 de energia a você e falha o teleporte.',
    vfx: vfx('glow', 'arcane'),
  },
  divination: narrative(vfx('glow', 'holy')),
  'dominate-beast': {
    resolution: save('wis'),
    condition: cond('charmed', 10),
    manual:
      'Só afeta feras; o alvo tem vantagem se você ou amigos o combatem; com uma ação você controla totalmente o alvo até o fim do seu próximo turno; ao sofrer dano ele repete a salvaguarda.',
    vfx: vfx('glow', 'psychic'),
  },
  fabricate: narrative(vfx('glow', 'arcane')),
  'faithful-hound': {
    // cão fantasma: token oculto para todos menos para quem conjurou; morde quem chega perto no início do seu turno
    target: point,
    resolution: auto,
    summon: {
      custom: 'faithful-hound',
      srd: 'hound',
      n: 1,
      hidden: true,
      leashFt: 100,
      unique: 'faithful-hound',
    },
    manual:
      'Invisível para todos menos você e impossível de ferir. No início de cada turno seu morde uma criatura hostil a até 1,5 m (bônus = seu modificador + proficiência; 4d8 perfurante). Late se uma criatura Pequena ou maior chegar a 9 m sem dizer a senha (o Mestre avisa). Some se você se afastar mais de 30 m.',
    vfx: vfx('burst', 'force', { radius: 5 }),
  },
  'fire-shield': {
    target: self,
    resolution: auto,
    effect: effect({ resist: ['cold'] }),
    options: [
      opt('warm', 'Escudo quente (resistência a gelo; devolve fogo)', {
        effect: effect({ resist: ['cold'] }),
      }),
      opt('cold', 'Escudo frio (resistência a fogo; devolve gelo)', {
        effect: effect({ resist: ['fire'] }),
      }),
    ],
    manual:
      'Quem te acerta com ataque corpo a corpo a até 5 ft leva 2d8 de fogo (escudo quente) ou gelo (frio): aplique à mão.',
    vfx: vfx('glow', 'fire'),
  },
  'freedom-of-movement': {
    resolution: auto,
    effect: effect({
      immuneConditions: ['paralyzed', 'restrained'],
      note: 'Terreno difícil não o afeta; escapa de amarras gastando 5 ft de movimento; sem penalidade na água.',
    }),
    vfx: vfx('glow', 'arcane'),
  },
  'giant-insect': narrative(vfx('glow', 'poison')),
  'greater-invisibility': {
    resolution: auto,
    condition: cond('invisible', 10),
    vfx: vfx('glow', 'arcane'),
  },
  'guardian-of-faith': {
    target: point,
    resolution: save('dex', 'half'),
    damage: dmg('20', 'radiant'),
    noInitial: true,
    zone: { on: 'enter', radius: 10, color: 'holy' },
    manual: 'O guardião some depois de causar 60 de dano no total (acompanhe à mão).',
    vfx: vfx('burst', 'holy'),
  },
  'hallucinatory-terrain': narrative(vfx('glow', 'life')),
  'ice-storm': {
    target: sphere(20),
    resolution: save('dex', 'half'),
    damage: dmg('2d8', 'bludgeoning', { perLevel: '1d8' }),
    extraDamage: [dmg('4d6', 'cold')],
    manual: 'O granizo torna a área terreno difícil até o fim do seu próximo turno.',
    vfx: vfx('burst', 'frost'),
  },
  'locate-creature': narrative(vfx('burst', 'arcane', { radius: 100 })),
  'phantasmal-killer': {
    resolution: save('wis'),
    condition: cond('frightened', 10, { repeatSave: true }),
    // no início de cada turno do alvo: 4d10 psíquico; passar na salvaguarda acaba com a magia
    effect: effect({ dotStart: { dice: '4d10', type: 'psychic' } }),
    manual:
      'No início de cada turno o alvo faz salvaguarda de Sabedoria (aqui, no fim): se passar, a magia acaba.',
    vfx: vfx('glow', 'psychic'),
  },
  polymorph: narrative(vfx('glow', 'life'), {
    manual:
      'Transformação: troque as estatísticas do alvo pelas da fera escolhida (PV novos; ao voltar, o excesso de dano passa para a forma normal).',
  }),
  'private-sanctum': narrative(vfx('burst', 'arcane', { radius: 50 })),
  'resilient-sphere': {
    resolution: save('dex'),
    effect: effect({
      immune: ALL_DAMAGE,
      speedMult: 0.5,
      note: 'Preso numa esfera de energia: nada atravessa, o alvo não sofre dano de fora e rola a esfera a metade da velocidade.',
    }),
    vfx: vfx('glow', 'force'),
  },
  'secret-chest': narrative(vfx('glow', 'arcane')),
  'stone-shape': narrative(vfx('glow', 'steel')),
  stoneskin: {
    resolution: auto,
    effect: effect({
      resist: ['bludgeoning', 'piercing', 'slashing'],
      note: 'Resistência só a dano não mágico.',
    }),
    vfx: vfx('glow', 'steel'),
  },
  'wall-of-fire': {
    target: line(60, 5),
    resolution: save('dex', 'half'),
    damage: dmg('5d8', 'fire', { perLevel: '1d8' }),
    zone: { on: 'both', color: 'fire' },
    manual:
      'Só um lado da muralha causa dano (o que você escolher): o motor aplica aos que estão na linha; ajuste se estiverem do lado inofensivo.',
    vfx: vfx('ray', 'fire'),
  },
};
