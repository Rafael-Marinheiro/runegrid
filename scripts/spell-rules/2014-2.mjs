// SRD 5.1 — 2º nível. Lido a partir de public/data/spells.json (Imobilizar Pessoa e Despedaçar estão em builtin.ts).
import {
  ALL_DAMAGE,
  attack,
  auto,
  cond,
  creature,
  cube,
  dmg,
  effect,
  ladder,
  line,
  narrative,
  point,
  save,
  self,
  sphere,
  vfx,
} from './helpers.mjs';

export default {
  'acid-arrow': {
    resolution: attack,
    // errar ainda causa metade do dano inicial e nenhum dano depois
    damage: dmg('4d4', 'acid', { perLevel: '1d4', missHalf: true }),
    // no fim do próximo turno do alvo: 2d4 (+1d4 por nível acima do 2º), só se acertou
    effect: effect(
      { dotEnd: { dice: '2d4', type: 'acid' } },
      {
        rounds: 1,
        scale: ladder(3, 9, (s) => ({ dotEnd: { dice: `${s}d4`, type: 'acid' } })),
      },
    ),
    vfx: vfx('bolts', 'acid'),
  },
  aid: {
    target: creature(3, 1),
    resolution: auto,
    // PV máximos e atuais +5 (+5 por nível acima do 2º) por 8 horas
    effect: effect({ maxHp: 5 }, { scale: ladder(3, 9, (s) => ({ maxHp: 5 * (s - 1) })) }),
    vfx: vfx('glow', 'life'),
  },
  'alter-self': narrative(vfx('glow', 'life')),
  'animal-messenger': narrative(vfx('glow', 'life')),
  'arcane-lock': narrative(vfx('glow', 'arcane')),
  'arcanists-magic-aura': narrative(vfx('glow', 'arcane')),
  augury: narrative(vfx('glow', 'holy')),
  barkskin: {
    resolution: auto,
    effect: effect({ acMin: 16 }),
    vfx: vfx('glow', 'life'),
  },
  blindnessdeafness: {
    target: creature(1, 1),
    resolution: save('con'),
    condition: cond('blinded', 10, { repeatSave: true }),
    manual:
      'Você escolhe cegar (aplicado) ou ensurdecer: para surdez, troque a condição para Surdo.',
    vfx: vfx('glow', 'shadow'),
  },
  blur: {
    target: self,
    resolution: auto,
    effect: effect({ attackedMode: 'disadvantage' }),
    vfx: vfx('glow', 'arcane'),
  },
  'branding-smite': {
    target: self,
    resolution: auto,
    // o próximo acerto com arma causa 2d6 radiante extras (+1d6 por nível acima do 2º) e a magia acaba
    effect: effect(
      { weaponDamage: { dice: '2d6', type: 'radiant' }, once: true },
      { scale: ladder(3, 9, (s) => ({ weaponDamage: { dice: `${s}d6`, type: 'radiant' } })) },
    ),
    vfx: vfx('glow', 'holy'),
  },
  'calm-emotions': {
    target: sphere(20),
    resolution: save('cha'),
    effect: effect({
      note: 'Suprime enfeitiçado/amedrontado ou torna indiferente a quem você escolher (só humanoides).',
    }),
    vfx: vfx('burst', 'psychic'),
  },
  'continual-flame': narrative(vfx('glow', 'fire')),
  darkness: {
    target: sphere(15),
    resolution: auto,
    zone: { on: 'cast', obscures: true, color: 'shadow' },
    manual: 'Visão no escuro não enxerga dentro; luz não mágica não a ilumina.',
    vfx: vfx('burst', 'shadow'),
  },
  darkvision: {
    resolution: auto,
    effect: effect({ note: 'Visão no escuro de 60 ft.' }),
    vfx: vfx('glow', 'arcane'),
  },
  'detect-thoughts': narrative(vfx('burst', 'psychic', { radius: 30 })),
  'enhance-ability': {
    target: creature(1, 1),
    resolution: auto,
    effect: effect({
      note: 'Vantagem em testes de um atributo à escolha (Fortitude do Urso: +2d6 PV temporários).',
    }),
    manual: 'Escolha o aspecto; Fortitude do Urso dá 2d6 PV temporários (aplique à mão).',
    vfx: vfx('glow', 'life'),
  },
  enlargereduce: {
    resolution: auto,
    // Ampliar: +1d4 de dano nas armas; Reduzir: −1d4 (à mão)
    effect: effect({
      weaponDamage: { dice: '1d4', type: 'weapon' },
      note: 'Ampliar: um tamanho maior, vantagem em Força, +1d4 nas armas.',
    }),
    manual:
      'Ampliar está aplicado (+1d4 nas armas); para Reduzir aplique −1d4 e desvantagem em Força à mão. Alvo relutante faz salvaguarda de Constituição.',
    vfx: vfx('glow', 'arcane'),
  },
  enthrall: {
    target: creature(6),
    resolution: save('wis'),
    effect: effect({
      note: 'Desvantagem em Percepção para notar qualquer criatura além do conjurador.',
    }),
    vfx: vfx('glow', 'psychic'),
  },
  'find-steed': narrative(vfx('glow', 'holy')),
  'find-traps': narrative(vfx('burst', 'arcane', { radius: 120 })),
  'flame-blade': {
    // ação bônus cria a lâmina; o ataque é uma ação por turno (repetição)
    target: self,
    resolution: auto,
    noInitial: true,
    sustain: {
      cost: 'action',
      use: {
        target: creature(),
        range: 5,
        resolution: attack,
        damage: dmg('3d6', 'fire', { perLevel: '1d6', every: 2 }),
        vfx: vfx('ray', 'fire'),
      },
    },
    vfx: vfx('glow', 'fire'),
  },
  'flaming-sphere': {
    // a esfera fica no ponto; quem termina o turno a até 5 ft faz a salvaguarda (aprox.: início do turno)
    target: point,
    resolution: save('dex', 'half'),
    damage: dmg('2d6', 'fire', { perLevel: '1d6' }),
    noInitial: true,
    zone: { on: 'start', radius: 7.5, color: 'fire' },
    // ação bônus: mover a esfera (clique no ponto) ou jogá-la contra uma criatura (alvo)
    sustain: { cost: 'bonus', use: { target: creature(), range: 60 } },
    vfx: vfx('glow', 'fire'),
  },
  'gentle-repose': narrative(vfx('glow', 'shadow')),
  'gust-of-wind': {
    target: line(60, 10),
    resolution: save('str'),
    push: { ft: 15 },
    noInitial: true,
    zone: { on: 'start', color: 'steel' },
    // ação bônus: mudar a direção da rajada (clique na nova direção)
    sustain: { cost: 'bonus' },
    vfx: vfx('ray', 'steel'),
  },
  'heat-metal': {
    resolution: auto,
    damage: dmg('2d8', 'fire', { perLevel: '1d8' }),
    // ação bônus nos turnos seguintes: o mesmo dano de novo
    sustain: { cost: 'bonus' },
    manual:
      'Quem segura ou veste o objeto faz salvaguarda de Constituição para largá-lo; se não largar, tem desvantagem em ataques e testes até o início do seu próximo turno.',
    vfx: vfx('ray', 'fire'),
  },
  invisibility: {
    target: creature(1, 1),
    resolution: auto,
    condition: cond('invisible', 600, { endsOnAttack: true }),
    vfx: vfx('glow', 'arcane'),
  },
  knock: narrative(vfx('glow', 'thunder')),
  'lesser-restoration': {
    resolution: auto,
    cure: { conditions: ['blinded', 'deafened', 'paralyzed', 'poisoned'] },
    manual: 'Também pode encerrar uma doença.',
    vfx: vfx('glow', 'life'),
  },
  levitate: {
    resolution: auto,
    effect: effect({
      note: 'Flutua 20 ft acima do chão; só se move empurrando/puxando algo fixo.',
    }),
    manual: 'Alvo relutante faz salvaguarda de Constituição.',
    vfx: vfx('glow', 'force'),
  },
  'locate-animals-or-plants': narrative(vfx('burst', 'life', { radius: 30 })),
  'locate-object': narrative(vfx('burst', 'arcane', { radius: 30 })),
  'magic-mouth': narrative(vfx('glow', 'arcane')),
  'magic-weapon': {
    resolution: auto,
    effect: effect(
      { weaponBonus: 1 },
      {
        scale: [
          { from: 4, mods: { weaponBonus: 2 } },
          { from: 6, mods: { weaponBonus: 3 } },
        ],
      },
    ),
    vfx: vfx('glow', 'arcane'),
  },
  'mirror-image': {
    target: self,
    resolution: auto,
    effect: effect({ images: 3 }),
    vfx: vfx('glow', 'arcane'),
  },
  'misty-step': {
    range: 30,
    target: point,
    resolution: auto,
    teleport: true,
    vfx: vfx('glow', 'arcane'),
  },
  moonbeam: {
    target: sphere(5),
    resolution: save('con', 'half'),
    damage: dmg('2d10', 'radiant', { perLevel: '1d10' }),
    noInitial: true,
    zone: { on: 'both', color: 'holy' },
    // ação: mover o feixe 60 ft (clique no novo ponto)
    sustain: { cost: 'action' },
    manual: 'Um metamorfo faz a salvaguarda com desvantagem e, se falhar, volta à forma original.',
    vfx: vfx('burst', 'holy'),
  },
  'pass-without-trace': {
    target: sphere(30, { self: true }),
    resolution: auto,
    effect: effect({ note: '+10 em Destreza (Furtividade) e não deixa rastros.' }, { to: 'both' }),
    vfx: vfx('burst', 'arcane'),
  },
  'prayer-of-healing': {
    target: creature(6),
    resolution: auto,
    heal: { dice: '2d8', perLevel: '1d8', addModifier: true },
    vfx: vfx('glow', 'life'),
  },
  'protection-from-poison': {
    resolution: auto,
    cure: { conditions: ['poisoned'] },
    effect: effect({ resist: ['poison'], note: 'Vantagem em salvaguardas contra ser envenenado.' }),
    vfx: vfx('glow', 'life'),
  },
  'ray-of-enfeeblement': {
    resolution: attack,
    // metade do dano das armas de Força; o alvo repete a salvaguarda de Constituição no fim de cada turno
    effect: effect({ halfWeaponDamage: true, repeatSave: { ability: 'con', dc: 0 } }),
    vfx: vfx('ray', 'shadow'),
  },
  'rope-trick': narrative(vfx('glow', 'arcane')),
  'scorching-ray': {
    target: creature(3, 1),
    resolution: attack,
    damage: dmg('2d6', 'fire', { instances: { base: 3, perLevel: 1 } }),
    vfx: vfx('bolts', 'fire'),
  },
  'see-invisibility': narrative(vfx('glow', 'arcane')),
  silence: {
    target: sphere(20),
    resolution: auto,
    zone: { on: 'cast', color: 'thunder' },
    manual:
      'Dentro da esfera: sem som, imunes a trovejante, surdos; não se conjura magia com componente verbal.',
    vfx: vfx('burst', 'thunder'),
  },
  'spider-climb': {
    resolution: auto,
    effect: effect({
      note: 'Anda em paredes e tetos, velocidade de escalada igual à de caminhada.',
    }),
    vfx: vfx('glow', 'poison'),
  },
  'spike-growth': {
    target: sphere(20),
    resolution: auto,
    damage: dmg('2d4', 'piercing'),
    noInitial: true,
    zone: { on: 'enter', difficult: true, color: 'life' },
    manual:
      'Causa 2d4 a cada 5 ft percorridos dentro da área; aqui, uma vez ao entrar (o Mestre acrescenta o resto).',
    vfx: vfx('burst', 'life'),
  },
  'spiritual-weapon': {
    target: creature(),
    range: 60,
    resolution: attack,
    damage: dmg('1d8', 'force', { perLevel: '1d8', every: 2, addModifier: true }),
    // ação bônus: repete o ataque
    sustain: { cost: 'bonus' },
    vfx: vfx('ray', 'force'),
  },
  suggestion: {
    resolution: save('wis'),
    effect: effect({ note: 'Segue a sugestão (uma ou duas frases) pelo tempo dela.' }),
    vfx: vfx('glow', 'psychic'),
  },
  'warding-bond': {
    resolution: auto,
    // +1 CA e salvaguardas, resistência a todo dano; o conjurador sofre o mesmo dano (à mão)
    effect: effect({ ac: 1, save: 1, resist: ALL_DAMAGE }),
    manual:
      'Cada vez que o protegido sofre dano, você sofre o mesmo dano; a magia acaba se vocês se afastarem mais de 60 ft.',
    vfx: vfx('glow', 'holy'),
  },
  web: {
    target: cube(20),
    resolution: save('dex'),
    condition: cond('restrained', 600),
    noInitial: true,
    zone: { on: 'both', difficult: true, color: 'steel' },
    manual:
      'Preso: usa a ação para um teste de Força contra a sua CD e se liberta (remova a condição). As teias queimam: 2d4 de fogo.',
    vfx: vfx('burst', 'steel'),
  },
  'zone-of-truth': {
    target: sphere(15),
    resolution: save('cha'),
    effect: effect({ note: 'Não consegue mentir deliberadamente dentro da área.' }),
    noInitial: true,
    zone: { on: 'both', color: 'holy' },
    vfx: vfx('burst', 'holy'),
  },
};
