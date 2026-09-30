// SRD 5.2 (2024) — truques e 1º nível. Lido a partir de public/data/spells-2024.json.
// Entradas somam-se às do 2014 (`replace: true` troca tudo); o que não aparece aqui é igual ao 2014.
// Magias embutidas (builtin.ts) que o 2024 muda entram com `replace: true` e a mecânica completa.
import {
  attack,
  auto,
  cantrip,
  cond,
  cone,
  creature,
  dmg,
  effect,
  ladder,
  narrative,
  opt,
  save,
  self,
  sphere,
  vfx,
} from './helpers.mjs';

const ENSNARE = (dice) => ({
  save: 'str',
  condition: { name: 'restrained', rounds: 10 },
  mods: { dotStart: { dice, type: 'piercing' } },
  rounds: 10,
  endsOnSave: true,
});

export default {
  // ---------- truques ----------
  'acid-splash': { target: sphere(5) },
  'chill-touch': {
    replace: true,
    resolution: attack,
    damage: cantrip('1d10', 'necrotic'),
    effect: effect({ noHealing: true }, { ends: 'casterEnd' }),
    vfx: vfx('ray', 'shadow'),
  },
  elementalism: narrative(vfx('glow', 'arcane')),
  guidance: {
    effect: effect({ note: '+1d4 nos testes da perícia escolhida enquanto durar.' }),
  },
  'poison-spray': { resolution: attack },
  'produce-flame': {
    replace: true,
    // ação bônus cria a chama; a ação Magia a arremessa a até 60 ft
    target: self,
    resolution: auto,
    noInitial: true,
    sustain: {
      cost: 'action',
      use: {
        target: creature(),
        range: 60,
        resolution: attack,
        damage: cantrip('1d8', 'fire'),
        vfx: vfx('bolts', 'fire'),
      },
    },
    vfx: vfx('glow', 'fire'),
  },
  resistance: {
    effect: effect({ note: 'Reduz em 1d4 o dano do tipo escolhido que sofrer (uma vez por turno).' }),
    manual: 'Escolha o tipo de dano; a redução de 1d4 no dano sofrido é aplicada à mão.',
  },
  'sorcerous-burst': {
    target: creature(),
    resolution: attack,
    damage: cantrip('1d8', 'fire'),
    options: [
      ...[
        ['fire', 'Fogo', 'fire'],
        ['acid', 'Ácido', 'acid'],
        ['cold', 'Gélido', 'frost'],
        ['lightning', 'Elétrico', 'lightning'],
        ['poison', 'Veneno', 'poison'],
        ['psychic', 'Psíquico', 'psychic'],
        ['thunder', 'Trovejante', 'thunder'],
      ].map(([t, label, color]) =>
        opt(t, label, { damage: cantrip('1d8', t), vfx: vfx('bolts', color) }),
      ),
    ],
    manual: 'Se sair 8 em um d8 do dano, role outro d8 e some (no máximo seu modificador de conjuração vezes).',
    vfx: vfx('bolts', 'fire'),
  },
  'starry-wisp': {
    target: creature(),
    resolution: attack,
    damage: cantrip('1d8', 'radiant'),
    effect: effect(
      { note: 'Emite luz fraca em 10 ft e não se beneficia de Invisível.' },
      { rounds: 1, ends: 'casterEnd' },
    ),
    vfx: vfx('bolts', 'holy'),
  },
  'true-strike': {
    replace: true,
    ...narrative(vfx('glow', 'arcane'), {
      manual: 'Faça um ataque com a arma usando o atributo de conjuração no ataque e no dano (pode causar radiante, +1d6/2d6/3d6 nos níveis 5/11/17): use a ação Atacar.',
    }),
  },
  'vicious-mockery': {
    replace: true,
    target: creature(),
    resolution: save('wis'),
    damage: cantrip('1d6', 'psychic'),
    effect: effect({ attackMode: 'disadvantage', once: true }, { rounds: 1 }),
    vfx: vfx('glow', 'psychic'),
  },

  // ---------- 1º nível ----------
  'chromatic-orb': {
    target: creature(),
    resolution: attack,
    damage: dmg('3d8', 'fire', { perLevel: '1d8' }),
    options: [
      ['fire', 'Fogo', 'fire'],
      ['acid', 'Ácido', 'acid'],
      ['cold', 'Gélido', 'frost'],
      ['lightning', 'Elétrico', 'lightning'],
      ['poison', 'Veneno', 'poison'],
      ['thunder', 'Trovejante', 'thunder'],
    ].map(([t, label, color]) =>
      opt(t, label, { damage: dmg('3d8', t, { perLevel: '1d8' }), vfx: vfx('bolts', color) }),
    ),
    manual: 'Se dois ou mais d8 saírem iguais, o orbe salta para outra criatura a até 30 ft do alvo (lance um novo ataque à mão).',
    vfx: vfx('bolts', 'fire'),
  },
  'color-spray': {
    replace: true,
    target: cone(15),
    resolution: save('con'),
    condition: cond('blinded', 1),
    vfx: vfx('cone', 'arcane'),
  },
  command: {
    options: [
      opt('halt', 'Parar', {
        effect: effect(
          { speedSet: 0, note: 'Não se move nem age neste turno.' },
          { rounds: 1 },
        ),
      }),
      opt('drop', 'Largar', {
        effect: effect({ note: 'Larga o que segura e encerra o turno.' }, { rounds: 1 }),
      }),
      opt('flee', 'Fugir', {
        effect: effect({ note: 'Gasta o turno se afastando de você.' }, { rounds: 1 }),
      }),
      opt('grovel', 'Rastejar', {
        effect: effect({ note: 'Cai no chão e encerra o turno.' }, { rounds: 1 }),
        condition: cond('prone', 0),
      }),
    ],
  },
  'cure-wounds': {
    replace: true,
    resolution: auto,
    heal: { dice: '2d8', perLevel: '2d8', addModifier: true },
    vfx: vfx('glow', 'life'),
  },
  'dissonant-whispers': {
    resolution: save('wis', 'half'),
    damage: dmg('3d6', 'psychic', { perLevel: '1d6' }),
    manual: 'Se falhar, o alvo usa a reação (se tiver) para se afastar de você o máximo possível.',
    vfx: vfx('glow', 'psychic'),
  },
  'divine-smite': {
    target: self,
    resolution: auto,
    // o próximo acerto com arma leva 2d8 radiantes (+1d8 por nível do espaço acima do 1º)
    effect: effect(
      { weaponDamage: { dice: '2d8', type: 'radiant' }, once: true },
      { scale: ladder(2, 9, (s) => ({ weaponDamage: { dice: `${s + 1}d8`, type: 'radiant' } })) },
    ),
    manual: '+1d8 se o alvo for ínfero ou morto-vivo.',
    vfx: vfx('glow', 'holy'),
  },
  'ensnaring-strike': {
    target: self,
    resolution: auto,
    effect: effect(
      { once: true, onHit: ENSNARE('1d6') },
      { scale: ladder(2, 9, (s) => ({ onHit: ENSNARE(`${s}d6`) })) },
    ),
    manual: 'Criatura Grande ou maior tem vantagem na salvaguarda; o alvo (ou alguém ao alcance) pode usar uma ação para um teste de Força (Atletismo) e acabar com a magia.',
    vfx: vfx('glow', 'life'),
  },
  'false-life': { tempHp: { dice: '2d4', flat: 4, flatPerLevel: 5 } },
  'healing-word': {
    replace: true,
    resolution: auto,
    heal: { dice: '2d4', perLevel: '2d4', addModifier: true },
    vfx: vfx('glow', 'life'),
  },
  heroism: { target: creature(1, 1) },
  hex: {
    resolution: auto,
    effect: effect(
      { weaponDamage: { dice: '1d6', type: 'necrotic', onlyAgainst: '@target' } },
      { to: 'self' },
    ),
    manual: 'Escolha um atributo: o alvo tem desvantagem em testes dele. Se o alvo cair a 0 PV, use uma ação bônus para transferir a maldição.',
    vfx: vfx('glow', 'shadow'),
  },
  'hideous-laughter': { target: creature(1, 1) },
  'hunters-mark': {
    effect: effect(
      { weaponDamage: { dice: '1d6', type: 'force', onlyAgainst: '@target' } },
      { to: 'self' },
    ),
  },
  'ice-knife': {
    target: creature(),
    resolution: attack,
    damage: dmg('1d10', 'piercing'),
    splash: { radius: 5, ability: 'dex', onSave: 'none', damage: dmg('2d6', 'cold', { perLevel: '1d6' }) },
    vfx: vfx('bolts', 'frost'),
  },
  'inflict-wounds': {
    replace: true,
    resolution: save('con', 'half'),
    damage: dmg('2d10', 'necrotic', { perLevel: '1d10' }),
    vfx: vfx('ray', 'shadow'),
  },
  jump: {
    target: creature(1, 1),
    effect: effect({ note: 'Uma vez por turno, salta 30 ft gastando 10 ft de deslocamento.' }),
  },
  'ray-of-sickness': {
    resolution: attack,
    damage: dmg('2d8', 'poison', { perLevel: '1d8' }),
    condition: cond('poisoned', 1),
    vfx: vfx('ray', 'poison'),
  },
  'searing-smite': {
    target: self,
    resolution: auto,
    effect: effect(
      {
        weaponDamage: { dice: '1d6', type: 'fire' },
        once: true,
        onHit: {
          save: 'con',
          mods: { dotStart: { dice: '1d6', type: 'fire' }, repeatSave: { ability: 'con', dc: 0 } },
          rounds: 10,
        },
      },
      {
        scale: ladder(2, 9, (s) => ({
          weaponDamage: { dice: `${s}d6`, type: 'fire' },
          onHit: {
            save: 'con',
            mods: { dotStart: { dice: `${s}d6`, type: 'fire' }, repeatSave: { ability: 'con', dc: 0 } },
            rounds: 10,
          },
        })),
      },
    ),
    manual: 'O alvo queima: no início de cada turno sofre o dano e faz salvaguarda de Constituição; passar acaba com a magia.',
    vfx: vfx('glow', 'fire'),
  },
  sleep: {
    replace: true,
    // 2024: esfera de 5 ft; incapacitado até o fim do próximo turno, depois repete a salvaguarda
    target: sphere(5),
    resolution: save('wis'),
    condition: cond('incapacitated', 1, { endsOnDamage: true }),
    manual: 'Ao fim do próximo turno o alvo repete a salvaguarda: se falhar, fica inconsciente pela duração (aplique a condição); elfos e quem não dorme passam automaticamente.',
    vfx: vfx('burst', 'psychic'),
  },
};
