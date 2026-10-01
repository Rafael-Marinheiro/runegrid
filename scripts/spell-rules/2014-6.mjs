// SRD 5.1 — 6º nível. Lido a partir de public/data/spells.json.
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
  'blade-barrier': {
    target: line(100, 5),
    resolution: save('dex', 'half'),
    damage: dmg('6d10', 'slashing'),
    noInitial: true,
    zone: { on: 'both', difficult: true, color: 'steel' },
    manual: 'A muralha dá três quartos de cobertura a quem está atrás.',
    vfx: vfx('ray', 'steel'),
  },
  'chain-lightning': {
    // o raio atinge o primeiro alvo e salta para até três outros (+1 por nível acima do 6º) a 30 ft dele
    target: creature(4, 1),
    resolution: save('dex', 'half'),
    damage: dmg('10d8', 'lightning'),
    vfx: vfx('ray', 'lightning'),
  },
  'circle-of-death': {
    target: sphere(60),
    resolution: save('con', 'half'),
    damage: dmg('8d6', 'necrotic', { perLevel: '2d6' }),
    vfx: vfx('burst', 'shadow'),
  },
  contingency: narrative(vfx('glow', 'arcane')),
  disintegrate: {
    resolution: save('dex'),
    damage: dmg('10d6+40', 'force', { perLevel: '3d6' }),
    manual:
      'Se o dano reduzir o alvo a 0 PV, ele é desintegrado (só o true resurrection ou o wish o trazem de volta).',
    vfx: vfx('ray', 'acid'),
  },
  eyebite: {
    range: 60,
    target: creature(),
    resolution: save('wis'),
    condition: cond('unconscious', 10, { endsOnDamage: true }),
    options: [
      opt('asleep', 'Adormecido', { condition: cond('unconscious', 10, { endsOnDamage: true }) }),
      opt('panicked', 'Em pânico (amedrontado)', { condition: cond('frightened', 10) }),
      opt('sickened', 'Enjoado (desvantagem em ataques e testes)', {
        condition: null,
        effect: effect({
          attackMode: 'disadvantage',
          repeatSave: { ability: 'wis', dc: 0 },
          note: 'Desvantagem em ataques e testes de atributo.',
        }),
      }),
    ],
    // a cada turno: uma ação para mirar outra criatura
    sustain: { cost: 'action' },
    vfx: vfx('glow', 'shadow'),
  },
  'find-the-path': narrative(vfx('glow', 'arcane')),
  'flesh-to-stone': {
    resolution: save('con'),
    condition: cond('restrained', 10),
    manual:
      'O alvo repete a salvaguarda a cada turno: três falhas o petrificam (aplique a condição Petrificado); três sucessos encerram a magia.',
    vfx: vfx('glow', 'steel'),
  },
  forbiddance: narrative(vfx('burst', 'holy', { radius: 100 })),
  'freezing-sphere': {
    target: sphere(60),
    resolution: save('con', 'half'),
    damage: dmg('10d6', 'cold', { perLevel: '1d6' }),
    vfx: vfx('burst', 'frost'),
  },
  'globe-of-invulnerability': {
    target: sphere(10, { self: true }),
    resolution: auto,
    zone: { aura: true, on: 'cast', color: 'arcane' },
    manual:
      'Magias de 5º nível ou menor lançadas de fora da esfera não a afetam (+1 nível por espaço acima do 6º).',
    vfx: vfx('burst', 'arcane'),
  },
  'guards-and-wards': narrative(vfx('burst', 'arcane', { radius: 50 })),
  harm: {
    resolution: save('con', 'half'),
    damage: dmg('14d6', 'necrotic'),
    manual:
      'O dano não reduz os PV do alvo abaixo de 1; se falhar, os PV máximos dele caem pelo mesmo valor por 1 hora (aplique à mão).',
    vfx: vfx('ray', 'shadow'),
  },
  heal: {
    resolution: auto,
    heal: { flat: 70, flatPerLevel: 10 },
    cure: { conditions: ['blinded', 'deafened'], all: true },
    manual: 'Também encerra doenças; sem efeito em constructos e mortos-vivos.',
    vfx: vfx('glow', 'life'),
  },
  'heroes-feast': narrative(vfx('glow', 'life')),
  'instant-summons': narrative(vfx('glow', 'arcane')),
  'irresistible-dance': {
    resolution: save('wis'),
    effect: effect({
      attackMode: 'disadvantage',
      attackedMode: 'advantage',
      saveMode: { mode: 'disadvantage', abilities: ['dex'] },
      speedSet: 0,
      note: 'Dança sem sair do lugar; com uma ação faz salvaguarda de Sabedoria para recuperar o controle.',
    }),
    vfx: vfx('glow', 'psychic'),
  },
  'magic-jar': narrative(vfx('glow', 'arcane')),
  'mass-suggestion': {
    target: creature(12),
    resolution: save('wis'),
    effect: effect({ note: 'Segue a sugestão (uma ou duas frases) pelo tempo dela.' }),
    vfx: vfx('glow', 'psychic'),
  },
  'move-earth': narrative(vfx('glow', 'life')),
  'planar-ally': narrative(vfx('glow', 'holy'), {
    manual: 'Invocação: o Mestre adiciona o aliado planar ao combate conforme o acordo.',
  }),
  'programmed-illusion': narrative(vfx('glow', 'arcane')),
  sunbeam: {
    target: { kind: 'line', length: 60, width: 5 },
    resolution: save('con', 'half'),
    damage: dmg('6d8', 'radiant'),
    condition: cond('blinded', 1),
    // nos turnos seguintes: uma ação para uma nova linha de luz
    sustain: { cost: 'action' },
    manual: 'Mortos-vivos e limos têm desvantagem na salvaguarda.',
    vfx: vfx('ray', 'holy'),
  },
  'transport-via-plants': narrative(vfx('glow', 'life')),
  'true-seeing': {
    resolution: auto,
    effect: effect({
      note: 'Visão verdadeira, vê portas secretas mágicas e o Plano Etéreo até 120 ft.',
    }),
    vfx: vfx('glow', 'arcane'),
  },
  'wall-of-ice': {
    target: line(100, 5),
    resolution: save('dex', 'half'),
    damage: dmg('10d6', 'cold', { perLevel: '2d6' }),
    zone: { on: 'cast', color: 'frost' },
    manual:
      'A muralha é um objeto (CA 12, 30 PV por trecho de 10 ft, vulnerável a fogo); ao quebrar deixa ar gélido (5d6 de frio, Constituição).',
    vfx: vfx('ray', 'frost'),
  },
  'wall-of-thorns': {
    target: line(60, 5),
    resolution: save('dex', 'half'),
    damage: dmg('7d8', 'piercing', { perLevel: '1d8' }),
    zone: { on: 'both', difficult: true, color: 'life' },
    manual:
      'Ao entrar ou terminar o turno na muralha o alvo sofre 7d8 cortante (aqui o motor repete o dano perfurante); atravessá-la custa 4 ft de movimento por pé.',
    vfx: vfx('ray', 'life'),
  },
  'wind-walk': narrative(vfx('glow', 'steel')),
  'word-of-recall': narrative(vfx('glow', 'holy')),
};
