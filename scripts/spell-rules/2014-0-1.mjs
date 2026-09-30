// SRD 5.1 — truques e 1º nível. Lido a partir de public/data/spells.json (texto oficial, sem memória).
// As magias já embutidas em src/app/core/rules/spells/builtin.ts (Raio de Fogo, Mísseis Mágicos…) não entram aqui.
import {
  attack,
  auto,
  cantrip,
  cond,
  creature,
  cube,
  cone,
  dmg,
  effect,
  narrative,
  pool,
  save,
  self,
  sphere,
  vfx,
} from './helpers.mjs';

export default {
  // ---------- truques ----------
  'acid-splash': {
    // uma criatura, ou duas a até 5 ft uma da outra
    target: creature(2),
    resolution: save('dex'),
    damage: cantrip('1d6', 'acid'),
    vfx: vfx('bolts', 'acid'),
  },
  'chill-touch': {
    resolution: attack,
    damage: cantrip('1d8', 'necrotic'),
    // "não pode recuperar PV até o início do seu próximo turno"
    effect: effect({ noHealing: true }, { ends: 'casterStart' }),
    manual:
      'Se o alvo for morto-vivo, ele tem desvantagem nos ataques contra você até o fim do seu próximo turno.',
    vfx: vfx('ray', 'shadow'),
  },
  'dancing-lights': narrative(vfx('glow', 'holy')),
  druidcraft: narrative(vfx('glow', 'life')),
  'eldritch-blast': {
    // um raio por nível do conjurador (1, 2, 3, 4), cada um com a própria jogada de ataque
    target: creature(4),
    resolution: attack,
    damage: cantrip('1d10', 'force', { beams: true }),
    vfx: vfx('bolts', 'force'),
  },
  guidance: {
    // uma vez, +1d4 em um teste de atributo à escolha (testes de atributo ficam com o Mestre)
    resolution: auto,
    effect: effect({ once: true, note: '+1d4 em um teste de atributo à escolha, uma vez.' }),
    vfx: vfx('glow', 'holy'),
  },
  light: narrative(vfx('glow', 'holy')),
  'mage-hand': narrative(vfx('glow', 'arcane')),
  mending: narrative(vfx('glow', 'arcane')),
  message: narrative(vfx('glow', 'arcane')),
  'minor-illusion': narrative(vfx('glow', 'arcane')),
  'poison-spray': {
    resolution: save('con'),
    damage: cantrip('1d12', 'poison'),
    vfx: vfx('ray', 'poison'),
  },
  prestidigitation: narrative(vfx('glow', 'arcane')),
  'produce-flame': {
    // a chama pode ser arremessada a até 30 ft; aqui a conjuração já a arremessa
    range: 30,
    target: creature(),
    resolution: attack,
    damage: cantrip('1d8', 'fire'),
    vfx: vfx('bolts', 'fire'),
  },
  resistance: {
    // uma vez, +1d4 em uma salvaguarda à escolha: o motor gasta no próximo teste
    resolution: auto,
    effect: effect({ once: true, saveDie: '1d4' }),
    vfx: vfx('glow', 'holy'),
  },
  shillelagh: {
    target: self,
    resolution: auto,
    effect: effect({
      note: 'Clava/bordão: ataque e dano com o atributo de conjuração; dado de dano d8; arma mágica.',
    }),
    manual:
      'Atributo de conjuração no ataque e dano da arma e dado d8: aplique na ficha enquanto durar.',
    vfx: vfx('glow', 'life'),
  },
  'spare-the-dying': {
    resolution: auto,
    stabilize: true,
    vfx: vfx('glow', 'life'),
  },
  thaumaturgy: narrative(vfx('glow', 'arcane')),
  'true-strike': {
    // vantagem no primeiro ataque do próximo turno: o motor gasta no primeiro ataque feito
    resolution: auto,
    effect: effect({ attackMode: 'advantage', once: true }, { rounds: 2, to: 'self' }),
    vfx: vfx('glow', 'arcane'),
  },

  // ---------- 1º nível ----------
  alarm: narrative(vfx('burst', 'arcane', { radius: 20 })),
  'animal-friendship': {
    target: creature(1, 1),
    resolution: save('wis'),
    condition: cond('charmed', 14400),
    manual:
      'Só funciona em uma fera com Inteligência 3 ou menos; se você ou um companheiro a ferir, a magia termina.',
    vfx: vfx('glow', 'life'),
  },
  bane: {
    target: creature(3, 1),
    resolution: save('cha'),
    effect: effect({ attackDie: '-1d4', saveDie: '-1d4' }),
    vfx: vfx('glow', 'shadow'),
  },
  bless: {
    target: creature(3, 1),
    resolution: auto,
    effect: effect({ attackDie: '1d4', saveDie: '1d4' }),
    vfx: vfx('glow', 'holy'),
  },
  'charm-person': {
    target: creature(1, 1),
    resolution: save('wis'),
    condition: cond('charmed', 600),
    manual:
      'Só afeta humanoides; a criatura tem vantagem na salvaguarda se você ou seus companheiros a estiverem combatendo.',
    vfx: vfx('glow', 'psychic'),
  },
  'color-spray': {
    target: cone(15),
    resolution: pool('6d10', '2d10'),
    condition: cond('blinded', 1),
    vfx: vfx('cone', 'arcane'),
  },
  command: {
    target: creature(1, 1),
    resolution: save('wis'),
    effect: effect(
      { note: 'Segue o comando no próximo turno: Aproximar, Largar, Fugir, Rastejar ou Parar.' },
      { rounds: 1 },
    ),
    vfx: vfx('glow', 'psychic'),
  },
  'comprehend-languages': narrative(vfx('glow', 'arcane')),
  'create-or-destroy-water': narrative(vfx('glow', 'frost')),
  'detect-evil-and-good': narrative(vfx('burst', 'holy', { radius: 30 })),
  'detect-magic': narrative(vfx('burst', 'arcane', { radius: 30 })),
  'detect-poison-and-disease': narrative(vfx('burst', 'poison', { radius: 30 })),
  'disguise-self': narrative(vfx('glow', 'arcane')),
  'divine-favor': {
    target: self,
    resolution: auto,
    effect: effect({ weaponDamage: { dice: '1d4', type: 'radiant' } }),
    vfx: vfx('glow', 'holy'),
  },
  entangle: {
    target: cube(20),
    resolution: save('str'),
    condition: cond('restrained', 10),
    zone: { on: 'cast', difficult: true, color: 'life' },
    manual:
      'Quem está preso pode usar a ação para um teste de Força contra a sua CD e se libertar (remova a condição).',
    vfx: vfx('burst', 'life'),
  },
  'expeditious-retreat': {
    target: self,
    resolution: auto,
    effect: effect({ bonusActions: ['dash'] }),
    manual:
      'Ao conjurar você já pode Correr (gaste a ação bônus em Correr); em cada turno seguinte, Correr é ação bônus.',
    vfx: vfx('glow', 'arcane'),
  },
  'faerie-fire': {
    target: cube(20),
    resolution: save('dex'),
    effect: effect({ attackedMode: 'advantage' }),
    vfx: vfx('burst', 'arcane'),
  },
  'false-life': {
    target: self,
    resolution: auto,
    tempHp: { dice: '1d4', flat: 4, flatPerLevel: 5 },
    vfx: vfx('glow', 'shadow'),
  },
  'feather-fall': {
    // reação avulsa: quedas não são simuladas, o Mestre aplica
    target: creature(5),
    narrative: true,
    vfx: vfx('glow', 'arcane'),
  },
  'find-familiar': narrative(vfx('glow', 'arcane')),
  'floating-disk': narrative(vfx('glow', 'force')),
  'fog-cloud': {
    target: sphere(20),
    resolution: auto,
    zone: { on: 'cast', obscures: true, color: 'arcane' },
    vfx: vfx('burst', 'arcane'),
  },
  goodberry: narrative(vfx('glow', 'life')),
  grease: {
    target: cube(10),
    resolution: save('dex'),
    condition: cond('prone', 0),
    zone: { on: 'both', difficult: true, color: 'poison' },
    vfx: vfx('burst', 'poison'),
  },
  'hellish-rebuke': {
    react: { on: 'damaged' },
    resolution: save('dex', 'half'),
    damage: dmg('2d10', 'fire', { perLevel: '1d10' }),
    vfx: vfx('glow', 'fire'),
  },
  heroism: {
    resolution: auto,
    effect: effect({ immuneConditions: ['frightened'], tempPerTurnMod: true }),
    vfx: vfx('glow', 'holy'),
  },
  'hideous-laughter': {
    resolution: save('wis'),
    condition: [
      cond('prone', 0, { repeatSave: true }),
      cond('incapacitated', 10, { repeatSave: true }),
    ],
    manual:
      'Criaturas com Inteligência 4 ou menos não são afetadas; ao sofrer dano o alvo repete a salvaguarda com vantagem.',
    vfx: vfx('glow', 'psychic'),
  },
  'hunters-mark': {
    resolution: auto,
    effect: effect(
      { weaponDamage: { dice: '1d6', type: 'weapon', onlyAgainst: '@target' } },
      { to: 'self' },
    ),
    manual:
      'Vantagem em Sabedoria (Percepção ou Sobrevivência) para achá-lo; se ele cair a 0 PV, use uma ação bônus para marcar outra criatura.',
    vfx: vfx('glow', 'fire'),
  },
  identify: narrative(vfx('glow', 'arcane')),
  'illusory-script': narrative(vfx('glow', 'arcane')),
  jump: {
    resolution: auto,
    effect: effect({ note: 'Distância de salto triplicada.' }),
    vfx: vfx('glow', 'life'),
  },
  longstrider: {
    target: creature(1, 1),
    resolution: auto,
    effect: effect({ speed: 10 }),
    vfx: vfx('glow', 'life'),
  },
  'mage-armor': {
    resolution: auto,
    effect: effect({ acBase: 13, acBaseDex: true }),
    manual: 'Só vale em criatura sem armadura; termina se o alvo vestir armadura.',
    vfx: vfx('glow', 'arcane'),
  },
  'protection-from-evil-and-good': {
    resolution: auto,
    effect: effect({
      note: 'Aberrações, celestiais, elementais, fadas, ínferos e mortos-vivos têm desvantagem nos ataques contra o alvo e não podem enfeitiçá-lo, amedrontá-lo nem possuí-lo.',
    }),
    vfx: vfx('glow', 'holy'),
  },
  'purify-food-and-drink': narrative(vfx('glow', 'life')),
  sanctuary: {
    resolution: auto,
    effect: effect({
      endsOnAttack: true,
      note: 'Quem o ataca ou mira magia nociva nele faz salvaguarda de Sabedoria; se falhar, perde o ataque/magia. Termina se o protegido atacar ou ferir.',
    }),
    vfx: vfx('glow', 'holy'),
  },
  shield: {
    react: { on: 'hit', acBonus: 5 },
    target: self,
    resolution: auto,
    effect: effect({ ac: 5 }, { ends: 'casterStart' }),
    vfx: vfx('glow', 'force'),
  },
  'shield-of-faith': {
    resolution: auto,
    effect: effect({ ac: 2 }),
    vfx: vfx('glow', 'holy'),
  },
  'silent-image': narrative(vfx('glow', 'arcane')),
  sleep: {
    target: sphere(20),
    resolution: pool('5d8', '2d8'),
    condition: cond('unconscious', 10, { endsOnDamage: true }),
    manual:
      'Mortos-vivos e criaturas imunes a enfeitiçamento não são afetados; acordar também exige uma ação para sacudir o dorminhoco.',
    vfx: vfx('burst', 'psychic'),
  },
  'speak-with-animals': narrative(vfx('glow', 'life')),
  thunderwave: {
    target: cube(15, { self: true }),
    resolution: save('con', 'half'),
    damage: dmg('2d8', 'thunder', { perLevel: '1d8' }),
    push: { ft: 10 },
    vfx: vfx('burst', 'thunder'),
  },
  'unseen-servant': narrative(vfx('glow', 'force')),
};
