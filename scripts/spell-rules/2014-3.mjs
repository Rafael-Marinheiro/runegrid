// SRD 5.1 — 3º nível. Lido a partir de public/data/spells.json (Bola de Fogo está em builtin.ts).
// Invocações (Conjurar Animais, Animar Mortos) ficam como narrativa com nota: o motor ainda não cria criaturas.
import {
  attack,
  auto,
  cond,
  cone,
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
  'animate-dead': narrative(vfx('glow', 'shadow'), {
    manual: 'Invocação: o Mestre adiciona o esqueleto ou zumbi ao combate (as estatísticas estão no Bestiário).',
  }),
  'beacon-of-hope': {
    target: creature(12),
    resolution: auto,
    effect: effect({
      saveMode: { mode: 'advantage', abilities: ['wis'] },
      note: 'Vantagem em salvaguardas contra a morte; toda cura rola o máximo possível.',
    }),
    vfx: vfx('glow', 'holy'),
  },
  'bestow-curse': {
    resolution: save('wis'),
    effect: effect({ note: 'Amaldiçoado: desvantagem nos ataques contra o conjurador.' }),
    options: [
      opt('attack', 'Desvantagem nos ataques contra você', {
        effect: effect({ note: 'Amaldiçoado: desvantagem nos ataques contra o conjurador.' }),
      }),
      opt('ability', 'Desvantagem num atributo', {
        effect: effect({ note: 'Amaldiçoado: desvantagem em testes e salvaguardas do atributo escolhido.' }),
      }),
      opt('turns', 'Perde a ação (Sabedoria no início do turno)', {
        effect: effect({ note: 'Amaldiçoado: no início de cada turno faz salvaguarda de Sabedoria; se falhar, perde a ação.' }),
      }),
      opt('necrotic', '+1d8 necrótico nos seus ataques contra ele', {
        effect: effect(
          { weaponDamage: { dice: '1d8', type: 'necrotic', onlyAgainst: '@target' } },
          { to: 'both' },
        ),
      }),
    ],
    vfx: vfx('glow', 'shadow'),
  },
  blink: narrative(vfx('glow', 'arcane'), {
    manual: 'No fim de cada turno role d20: 11 ou mais, você vai ao Plano Etéreo e volta no início do próximo turno.',
  }),
  'call-lightning': {
    target: sphere(5),
    resolution: save('dex', 'half'),
    damage: dmg('3d10', 'lightning', { perLevel: '1d10' }),
    // a cada turno: uma ação para chamar outro raio (clique no ponto)
    sustain: { cost: 'action' },
    manual: 'Em tempestade, o dano aumenta em 1d10.',
    vfx: vfx('burst', 'lightning'),
  },
  clairvoyance: narrative(vfx('glow', 'arcane')),
  'conjure-animals': narrative(vfx('glow', 'life'), {
    manual: 'Invocação: o Mestre adiciona as feras (ND conforme a opção) ao combate como grupo amigo.',
  }),
  counterspell: {
    react: { on: 'cast' },
    target: self,
    resolution: auto,
    vfx: vfx('glow', 'arcane'),
  },
  'create-food-and-water': narrative(vfx('glow', 'life')),
  daylight: narrative(vfx('burst', 'holy', { radius: 60 })),
  'dispel-magic': {
    resolution: auto,
    dispel: true,
    vfx: vfx('glow', 'arcane'),
  },
  fear: {
    target: cone(30),
    resolution: save('wis'),
    condition: cond('frightened', 10),
    manual: 'Larga o que segura e deve Correr para longe de você; ao terminar o turno sem linha de visão, repete a salvaguarda.',
    vfx: vfx('cone', 'psychic'),
  },
  fly: {
    target: creature(1, 1),
    resolution: auto,
    effect: effect({ note: 'Velocidade de voo de 60 ft.' }),
    manual: 'O movimento aéreo não é simulado: o Mestre move o token.',
    vfx: vfx('glow', 'arcane'),
  },
  'gaseous-form': {
    resolution: auto,
    effect: effect({
      resist: ['bludgeoning', 'piercing', 'slashing'],
      saveMode: { mode: 'advantage', abilities: ['str', 'dex', 'con'] },
      note: 'Forma de névoa: voo 10 ft, atravessa frestas; não ataca nem conjura.',
    }),
    vfx: vfx('glow', 'steel'),
  },
  'glyph-of-warding': narrative(vfx('glow', 'arcane')),
  haste: {
    resolution: auto,
    effect: effect({
      speedMult: 2,
      ac: 2,
      saveMode: { mode: 'advantage', abilities: ['dex'] },
      bonusActions: ['dash', 'disengage', 'hide'],
      note: 'Ação extra por turno (um ataque com arma, Correr, Desengajar, Esconder ou Usar Objeto).',
    }),
    manual: 'O ataque extra com arma e o torpor ao terminar a magia são aplicados à mão.',
    vfx: vfx('glow', 'lightning'),
  },
  'hypnotic-pattern': {
    target: cube(30),
    resolution: save('wis'),
    condition: [
      cond('charmed', 10, { endsOnDamage: true }),
      cond('incapacitated', 10, { endsOnDamage: true }),
    ],
    effect: effect({ speedSet: 0 }, { endsOnDamage: true }),
    manual: 'Acorda ao sofrer dano ou se alguém usar uma ação para sacudi-lo.',
    vfx: vfx('burst', 'psychic'),
  },
  'lightning-bolt': {
    target: line(100, 5),
    resolution: save('dex', 'half'),
    damage: dmg('8d6', 'lightning', { perLevel: '1d6' }),
    vfx: vfx('ray', 'lightning'),
  },
  'magic-circle': narrative(vfx('burst', 'holy', { radius: 10 })),
  'major-image': narrative(vfx('glow', 'arcane')),
  'mass-healing-word': {
    target: creature(6),
    resolution: auto,
    heal: { dice: '1d4', perLevel: '1d4', addModifier: true },
    vfx: vfx('glow', 'life'),
  },
  'meld-into-stone': narrative(vfx('glow', 'steel')),
  nondetection: narrative(vfx('glow', 'arcane')),
  'phantom-steed': narrative(vfx('glow', 'arcane')),
  'plant-growth': narrative(vfx('burst', 'life', { radius: 100 })),
  'protection-from-energy': {
    resolution: auto,
    effect: effect({ resist: ['fire'] }),
    options: [
      opt('fire', 'Fogo', { effect: effect({ resist: ['fire'] }) }),
      opt('acid', 'Ácido', { effect: effect({ resist: ['acid'] }) }),
      opt('cold', 'Gélido', { effect: effect({ resist: ['cold'] }) }),
      opt('lightning', 'Elétrico', { effect: effect({ resist: ['lightning'] }) }),
      opt('thunder', 'Trovejante', { effect: effect({ resist: ['thunder'] }) }),
    ],
    vfx: vfx('glow', 'arcane'),
  },
  'remove-curse': {
    resolution: auto,
    cure: { spells: ['bestow-curse'] },
    manual: 'Também desfaz a sintonização de um item amaldiçoado.',
    vfx: vfx('glow', 'holy'),
  },
  revivify: {
    resolution: auto,
    revive: true,
    manual: 'Só vale se a criatura morreu há no máximo 1 minuto (e não de velhice).',
    vfx: vfx('glow', 'life'),
  },
  sending: narrative(vfx('glow', 'arcane')),
  'sleet-storm': {
    target: sphere(40),
    resolution: save('dex'),
    condition: cond('prone', 0),
    noInitial: true,
    zone: { on: 'both', difficult: true, obscures: true, color: 'frost' },
    manual: 'Quem se concentra dentro da área faz salvaguarda de Constituição contra a sua CD ou perde a concentração.',
    vfx: vfx('burst', 'frost'),
  },
  slow: {
    // até seis criaturas à escolha no cubo: o motor usa todas as que estiverem nele
    target: cube(40),
    resolution: save('wis'),
    effect: effect({
      speedMult: 0.5,
      ac: -2,
      save: -2,
      noReactions: true,
      repeatSave: { ability: 'wis', dc: 0 },
      note: 'Uma ação ou uma ação bônus por turno, um único ataque; magia de 1 ação pode atrasar (d20, 11+).',
    }),
    manual: 'Até seis criaturas à sua escolha: desconsidere as que passarem da sexta.',
    vfx: vfx('burst', 'arcane'),
  },
  'speak-with-dead': narrative(vfx('glow', 'shadow')),
  'speak-with-plants': narrative(vfx('glow', 'life')),
  'spirit-guardians': {
    target: sphere(15, { self: true }),
    resolution: save('wis', 'half'),
    damage: dmg('3d8', 'radiant', { perLevel: '1d8' }),
    // deslocamento reduzido à metade enquanto estiver na área (até o fim do turno)
    effect: effect({ speedMult: 0.5 }, { rounds: 1 }),
    noInitial: true,
    zone: { aura: true, on: 'both', color: 'holy' },
    options: [
      opt('good', 'Bom ou neutro (radiante)', { damage: dmg('3d8', 'radiant', { perLevel: '1d8' }) }),
      opt('evil', 'Mau (necrótico)', { damage: dmg('3d8', 'necrotic', { perLevel: '1d8' }) }),
    ],
    manual: 'Você escolhe quem não é afetado; os espíritos causam radiante (bom/neutro) ou necrótico (mau).',
    vfx: vfx('burst', 'holy'),
  },
  'stinking-cloud': {
    target: sphere(20),
    resolution: save('con'),
    effect: effect(
      { note: 'Gasta a ação vomitando e cambaleando neste turno.' },
      { rounds: 1 },
    ),
    noInitial: true,
    zone: { on: 'start', obscures: true, color: 'poison' },
    vfx: vfx('burst', 'poison'),
  },
  'tiny-hut': narrative(vfx('burst', 'force', { radius: 10 })),
  tongues: narrative(vfx('glow', 'arcane')),
  'vampiric-touch': {
    range: 5,
    target: creature(),
    resolution: attack,
    damage: dmg('3d6', 'necrotic', { perLevel: '1d6', lifesteal: 0.5 }),
    // nos turnos seguintes: o mesmo ataque, como ação
    sustain: { cost: 'action' },
    vfx: vfx('ray', 'shadow'),
  },
  'water-breathing': {
    target: creature(10),
    resolution: auto,
    effect: effect({ note: 'Respira debaixo d’água.' }),
    vfx: vfx('glow', 'frost'),
  },
  'water-walk': {
    target: creature(10),
    resolution: auto,
    effect: effect({ note: 'Anda sobre qualquer líquido como se fosse chão.' }),
    vfx: vfx('glow', 'frost'),
  },
  'wind-wall': {
    target: line(50, 5),
    resolution: save('str', 'half'),
    damage: dmg('3d8', 'bludgeoning'),
    zone: { on: 'cast', color: 'steel' },
    manual: 'A parede desvia projéteis comuns e impede criaturas voadoras Pequenas de atravessá-la.',
    vfx: vfx('ray', 'steel'),
  },
};
