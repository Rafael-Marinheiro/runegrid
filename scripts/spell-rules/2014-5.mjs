// SRD 5.1 — 5º nível. Lido a partir de public/data/spells.json.
import {
  ALL_DAMAGE,
  attack,
  auto,
  cond,
  cone,
  creature,
  dmg,
  effect,
  line,
  narrative,
  opt,
  save,
  self,
  sphere,
  vfx,
} from './helpers.mjs';

export default {
  'animate-objects': narrative(vfx('glow', 'arcane'), {
    manual: 'Invocação: o Mestre adiciona os objetos animados (PV, CA e ataque conforme o tamanho) ao combate.',
  }),
  'antilife-shell': {
    target: sphere(10, { self: true }),
    resolution: auto,
    zone: { aura: true, on: 'cast', color: 'holy' },
    manual: 'A barreira impede que criaturas (exceto mortos-vivos e constructos) passem ou alcancem através; quem for forçado a atravessá-la encerra a magia.',
    vfx: vfx('burst', 'holy'),
  },
  'arcane-hand': {
    range: 120,
    target: creature(),
    resolution: attack,
    damage: dmg('4d8', 'force', { perLevel: '2d8' }),
    // ação bônus nos turnos seguintes: a mão move-se 60 ft e golpeia de novo
    sustain: { cost: 'bonus' },
    manual: 'Além do punho (aplicado), a mão pode empurrar, agarrar (2d6 + modificador a cada esmagada) ou interpor-se como meia cobertura: conduza à mão.',
    vfx: vfx('ray', 'force'),
  },
  awaken: narrative(vfx('glow', 'life')),
  cloudkill: {
    target: sphere(20),
    resolution: save('con', 'half'),
    damage: dmg('5d8', 'poison', { perLevel: '1d8' }),
    noInitial: true,
    zone: { on: 'both', obscures: true, color: 'poison' },
    // a nuvem anda 10 ft a cada turno seu: clique no novo ponto
    sustain: { cost: 'free' },
    vfx: vfx('burst', 'poison'),
  },
  commune: narrative(vfx('glow', 'holy')),
  'commune-with-nature': narrative(vfx('burst', 'life', { radius: 100 })),
  'cone-of-cold': {
    target: cone(60),
    resolution: save('con', 'half'),
    damage: dmg('8d8', 'cold', { perLevel: '1d8' }),
    vfx: vfx('cone', 'frost'),
  },
  'conjure-elemental': narrative(vfx('glow', 'fire'), {
    manual: 'Invocação: o Mestre adiciona o elemental (ND 5 ou menor) ao combate; se a concentração quebrar ele fica hostil.',
  }),
  'contact-other-plane': narrative(vfx('glow', 'psychic'), {
    manual: 'Faça uma salvaguarda de Inteligência CD 15: se falhar, 6d6 psíquico e insanidade até o descanso longo (aplique à mão).',
  }),
  contagion: {
    range: 5,
    target: creature(),
    resolution: attack,
    effect: effect({ note: 'Doença: a cada fim de turno faz salvaguarda de Constituição (três falhas a fixam; três sucessos a curam).' }),
    options: [
      opt('blinding', 'Doença Cegante (cego; desv. em Sabedoria)', {
        effect: effect({ note: 'Cego; desvantagem em testes e salvaguardas de Sabedoria.' }),
        condition: cond('blinded', 0),
      }),
      opt('filth', 'Febre Imunda (desv. em Força)', {
        effect: effect({ note: 'Desvantagem em testes, salvaguardas e ataques de Força.' }),
      }),
      opt('rot', 'Carne Podre (vulnerável a tudo)', {
        effect: effect({ vulnerable: ALL_DAMAGE, note: 'Desvantagem em Carisma; vulnerável a todo dano.' }),
      }),
      opt('mindfire', 'Fogo Mental (desv. em Inteligência; confuso)', {
        effect: effect({ noReactions: true, note: 'Desvantagem em Inteligência; age como sob Confusão em combate.' }),
      }),
      opt('seizure', 'Convulsão (desv. em Destreza)', {
        effect: effect({ note: 'Desvantagem em testes, salvaguardas e ataques de Destreza.' }),
      }),
      opt('slimy', 'Perdição Viscosa (atordoa ao sofrer dano)', {
        effect: effect({ note: 'Desvantagem em Constituição; ao sofrer dano fica atordoado até o fim do próximo turno.' }),
      }),
    ],
    vfx: vfx('ray', 'poison'),
  },
  creation: narrative(vfx('glow', 'shadow')),
  'dispel-evil-and-good': {
    target: self,
    resolution: auto,
    effect: effect({
      note: 'Celestiais, elementais, fadas, ínferos e mortos-vivos têm desvantagem nos ataques contra você.',
    }),
    manual: 'Você pode encerrar a magia para Quebrar Encantamento (toque: acaba enfeitiçado/amedrontado/possuído por essas criaturas) ou Dispensar (ataque corpo a corpo; salvaguarda de Carisma ou é mandado de volta).',
    vfx: vfx('glow', 'holy'),
  },
  'dominate-person': {
    resolution: save('wis'),
    condition: cond('charmed', 10),
    manual: 'Só afeta humanoides; o alvo tem vantagem se você ou amigos o combatem; com uma ação você o controla até o fim do seu próximo turno; ao sofrer dano ele repete a salvaguarda.',
    vfx: vfx('glow', 'psychic'),
  },
  dream: narrative(vfx('glow', 'psychic')),
  'flame-strike': {
    target: sphere(10),
    resolution: save('dex', 'half'),
    damage: dmg('4d6', 'fire', { perLevel: '1d6' }),
    extraDamage: [dmg('4d6', 'radiant')],
    vfx: vfx('burst', 'fire'),
  },
  geas: {
    resolution: save('wis'),
    condition: cond('charmed', 432000),
    manual: 'O alvo sofre 5d10 psíquico (no máximo uma vez por dia) sempre que agir contra as suas instruções.',
    vfx: vfx('glow', 'psychic'),
  },
  'greater-restoration': {
    resolution: auto,
    cure: { conditions: ['charmed', 'petrified'] },
    manual: 'Também reduz um nível de exaustão ou encerra uma maldição, uma redução de atributo ou de PV máximos (aplique à mão).',
    vfx: vfx('glow', 'life'),
  },
  hallow: narrative(vfx('burst', 'holy', { radius: 60 })),
  'hold-monster': {
    target: creature(1, 1),
    resolution: save('wis'),
    condition: cond('paralyzed', 10, { repeatSave: true }),
    manual: 'Sem efeito em mortos-vivos.',
    vfx: vfx('glow', 'arcane'),
  },
  'insect-plague': {
    target: sphere(20),
    resolution: save('con', 'half'),
    damage: dmg('4d10', 'piercing', { perLevel: '1d10' }),
    zone: { on: 'both', difficult: true, obscures: true, color: 'life' },
    vfx: vfx('burst', 'life'),
  },
  'legend-lore': narrative(vfx('glow', 'holy')),
  'mass-cure-wounds': {
    target: creature(6),
    resolution: auto,
    heal: { dice: '3d8', perLevel: '1d8', addModifier: true },
    vfx: vfx('glow', 'life'),
  },
  mislead: {
    target: self,
    resolution: auto,
    condition: cond('invisible', 600, { endsOnAttack: true }),
    manual: 'Um duplo ilusório surge onde você estava e pode ser movido com uma ação (aplique à mão).',
    vfx: vfx('glow', 'arcane'),
  },
  'modify-memory': {
    resolution: save('wis'),
    condition: [
      cond('charmed', 10, { endsOnDamage: true }),
      cond('incapacitated', 10, { endsOnDamage: true }),
    ],
    manual: 'Enquanto durar, você reescreve a memória de um evento das últimas 24 horas (narrativa).',
    vfx: vfx('glow', 'psychic'),
  },
  passwall: narrative(vfx('glow', 'steel')),
  'planar-binding': narrative(vfx('glow', 'arcane')),
  'raise-dead': {
    resolution: auto,
    revive: true,
    // -4 em ataques, salvaguardas e testes; cai 1 por descanso longo (aqui, some no primeiro)
    effect: effect({ attackDie: '-4', saveDie: '-4', note: '−4 em ataques, salvaguardas e testes até o descanso longo.' }),
    manual: 'Só vale se a criatura morreu há no máximo 10 dias e a alma quer voltar.',
    vfx: vfx('glow', 'holy'),
  },
  reincarnate: narrative(vfx('glow', 'life')),
  scrying: narrative(vfx('glow', 'arcane')),
  seeming: narrative(vfx('glow', 'arcane')),
  telekinesis: narrative(vfx('glow', 'force'), {
    manual: 'Você move uma criatura (teste de atributo contra o de Força dela) ou um objeto a cada turno: conduza à mão.',
  }),
  'telepathic-bond': narrative(vfx('glow', 'psychic')),
  'teleportation-circle': narrative(vfx('burst', 'arcane', { radius: 5 })),
  'tree-stride': narrative(vfx('glow', 'life')),
  'wall-of-force': {
    target: line(100, 5),
    resolution: auto,
    zone: { on: 'cast', color: 'force' },
    manual: 'Uma barreira invisível: nada a atravessa e ela resiste a todo dano; mova os tokens à mão se ela corta um espaço.',
    vfx: vfx('ray', 'force'),
  },
  'wall-of-stone': {
    target: line(100, 5),
    resolution: auto,
    zone: { on: 'cast', color: 'steel' },
    manual: 'Uma muralha de pedra (CA 15, 30 PV por polegada): mova os tokens à mão se ela corta um espaço.',
    vfx: vfx('ray', 'steel'),
  },
};
