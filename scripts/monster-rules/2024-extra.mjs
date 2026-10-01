// Habilidades do SRD 2024 que usavam só nota para o Mestre e agora têm mecânica no motor.
import { man, T } from './helpers.mjs';

const arcane = { kind: 'glow', color: 'arcane' };
const R = (from, pt, en, ability, rule) => ({ replace: true, from, pt, en, ability, ...rule });

const deathless = {
  abilities: {
    'deathless-agility': R(
      'Deathless Agility',
      'Agilidade Imortal',
      'Deathless Agility',
      { cost: 'bonus' },
      {
        range: 0,
        target: { kind: 'self' },
        resolution: { kind: 'auto' },
        options: [
          { id: 'dash', label: 'Correr', labelEn: 'Dash', patch: { grants: ['dash'] } },
          {
            id: 'disengage',
            label: 'Desengajar',
            labelEn: 'Disengage',
            patch: { grants: ['disengage'] },
          },
        ],
        vfx: arcane,
      },
    ),
  },
};

const breath = (type, pt, en) => ({
  id: type,
  label: pt,
  labelEn: en,
  patch: { damage: { dice: '8d6', type } },
});

const weight = {
  abilities: {
    'weight-of-years': R(
      'Weight of Years',
      'Peso dos Anos',
      'Weight of Years',
      { cost: 'legendary', dc: 16 },
      {
        range: 120,
        target: { kind: 'creature' },
        resolution: { kind: 'save', ability: 'con', onSave: 'none' },
        effect: { stack: true, mods: { attackBonus: -2, save: -2, speed: -5 } },
        ...man(
          'Cada nível de Exaustão: −2 em testes de d20 (ataques e salvaguardas) e −1,5 m de deslocamento, cumulativo; morre no 6º nível (o Mestre aplica). O alvo aparenta 3d10 anos mais velho.',
          'Each level of Exhaustion: −2 to d20 Tests (attacks and saves) and −5 ft speed, cumulative; dies at level 6 (the DM applies it). The target looks 3d10 years older.',
        ),
        vfx: { kind: 'ray', color: 'shadow' },
      },
    ),
  },
};

export default {
  'sphinx-of-lore': weight,
  'sphinx-of-valor': weight,
  roc: {
    abilities: {
      swoop: R(
        'Swoop',
        'Mergulho',
        'Swoop',
        { cost: 'bonus', uses: { n: 1, per: 'rest' } },
        {
          range: 60,
          target: { kind: 'point' },
          resolution: { kind: 'auto' },
          move: { ft: 60, mode: 'fly', noOpportunity: true },
          dropGrappled: true,
          ...man(
            'Voa até metade do deslocamento de voo sem provocar ataques de oportunidade e solta quem estava agarrado; a queda do solto o Mestre aplica.',
            'Flies up to half its Fly Speed without provoking opportunity attacks and drops the grappled creature; the fall damage is applied by the DM.',
          ),
          vfx: { kind: 'glow', color: 'arcane' },
        },
      ),
    },
  },
  tarrasque: {
    abilities: {
      'world-shaking-movement': R(
        'World-Shaking Movement',
        'Movimento Abalador do Mundo',
        'World-Shaking Movement',
        { cost: 'legendary' },
        {
          range: 60,
          target: { kind: 'point' },
          resolution: { kind: 'auto' },
          move: { ft: 60, mode: 'walk', noOpportunity: false },
          landing: {
            radius: 60,
            maxSize: 'medium',
            breakConcentration: true,
            patch: { resolution: { kind: 'auto' }, condition: { name: 'prone', rounds: 0 } },
          },
          ...man(
            'No fim do movimento, onda de choque de 18 m: todos perdem a concentração e quem é Médio ou menor cai. Não pode repetir até o início do próximo turno.',
            'At the end of the move, an 60 ft shock wave: all lose Concentration and Medium or smaller creatures fall Prone. It cannot repeat until the start of its next turn.',
          ),
          vfx: { kind: 'burst', color: 'earth', radius: 60 },
        },
      ),
    },
  },
  'clay-golem': {
    abilities: {
      hasten: R(
        'Hasten',
        'Apressar',
        'Hasten',
        { cost: 'bonus', uses: { n: 1, per: 'rest' } },
        {
          range: 0,
          target: { kind: 'self' },
          resolution: { kind: 'auto' },
          grants: ['dash', 'disengage'],
          vfx: arcane,
        },
      ),
    },
  },
  'vampire-spawn': deathless,
  'vampire-familiar': deathless,
  shadow: {
    abilities: {
      'shadow-stealth': R(
        'Shadow Stealth',
        'Furtividade Sombria',
        'Shadow Stealth',
        { cost: 'bonus' },
        {
          range: 0,
          target: { kind: 'self' },
          resolution: { kind: 'auto' },
          grants: ['hide'],
          ...man(
            'Só vale em penumbra ou escuridão: o Mestre confere a luz do lugar.',
            'Only works in dim light or darkness: the DM checks the light.',
          ),
          vfx: { kind: 'glow', color: 'shadow' },
        },
      ),
    },
  },
  'rust-monster': {
    traits: {
      'corrosive-bite': T(
        'Mordida Corrosiva',
        'Corrosive Bite',
        { corrodeOnHit: 'Bite' },
        {
          desc: 'A Bite hit also corrodes the target’s nonmagical metal armor by −1 (cumulative).',
        },
      ),
    },
    abilities: {
      antennae: R(
        'Antennae',
        'Antenas',
        'Antennae',
        { cost: 'action', dc: 11 },
        {
          range: 5,
          target: { kind: 'creature' },
          resolution: { kind: 'save', ability: 'dex', onSave: 'none' },
          options: [
            {
              id: 'armor',
              label: 'Armadura de metal',
              labelEn: 'Metal armor',
              patch: { corrode: { kind: 'armor', on: 'attack' } },
            },
            {
              id: 'weapon',
              label: 'Arma de metal',
              labelEn: 'Metal weapon',
              patch: { corrode: { kind: 'weapon', on: 'attack' } },
            },
          ],
          ...man(
            'Objeto de metal não mágico usado ou carregado a até 1,5 m: salvaguarda de Destreza CD 11 ou −1 cumulativo na CA (armadura) ou nas jogadas de ataque (arma). Armadura destruída ao chegar a CA 10, arma a −5. Consertar remove a penalidade (o Mestre). Itens mágicos não sofrem.',
            'A nonmagical metal object worn or carried within 5 ft: Dexterity save DC 11 or a cumulative −1 to AC (armor) or attack rolls (weapon). Armor is destroyed at AC 10, a weapon at −5. Mending removes the penalty (the DM). Magic items are unaffected.',
          ),
          vfx: arcane,
        },
      ),
      'destroy-metal': R(
        'Destroy Metal',
        'Destruir Metal',
        'Destroy Metal',
        { cost: 'action' },
        {
          range: 5,
          target: { kind: 'point' },
          resolution: { kind: 'auto' },
          destroyObject: 'metal',
          ...man(
            'Objeto de metal não mágico, solto, a até 1,5 m: indique o ponto no mapa e o objeto é destruído.',
            'A loose nonmagical metal object within 5 ft: give the map point and the object is destroyed.',
          ),
          vfx: arcane,
        },
      ),
      'reflexive-antennae': R(
        'Reflexive Antennae',
        'Antenas Reflexas',
        'Reflexive Antennae',
        { cost: 'reaction', dc: 11 },
        {
          castTime: 'reaction',
          range: 5,
          target: { kind: 'creature' },
          resolution: { kind: 'save', ability: 'dex', onSave: 'none' },
          react: { on: 'damaged' },
          corrode: { kind: 'weapon', on: 'attack' },
          ...man(
            'Corrói a arma de metal de quem acertou o monstro (−1 cumulativo nas jogadas de ataque; some em −5).',
            'Corrodes the metal weapon of whoever hit the monster (cumulative −1 to attack rolls; destroyed at −5).',
          ),
          vfx: arcane,
        },
      ),
    },
  },
  'chain-devil': {
    abilities: {
      'unnerving-gaze': R(
        'Unnerving Gaze',
        'Olhar Inquietante',
        'Unnerving Gaze',
        { cost: 'reaction', dc: 15 },
        {
          castTime: 'reaction',
          range: 30,
          target: { kind: 'creature' },
          resolution: { kind: 'save', ability: 'wis', onSave: 'none' },
          react: { on: 'turnStart', within: 30, target: 'trigger' },
          condition: { name: 'frightened', rounds: 1 },
          immuneOnSave: 14400,
          ...man(
            'Quem passa na salvaguarda fica imune ao Olhar deste diabo por 24 horas (o motor anota).',
            "A creature that succeeds is immune to this devil's Gaze for 24 hours (the engine tracks it).",
          ),
          vfx: { kind: 'glow', color: 'shadow' },
        },
      ),
    },
  },
  'half-dragon': {
    abilities: {
      'dragon-s-breath': R(
        "Dragon's Breath",
        'Sopro do Dragão',
        "Dragon's Breath",
        { cost: 'action', recharge: 5, dc: 14 },
        {
          range: 0,
          target: { kind: 'cone', length: 30 },
          resolution: { kind: 'save', ability: 'dex', onSave: 'half' },
          damage: { dice: '8d6', type: 'fire' },
          options: [
            breath('acid', 'Ácido', 'Acid'),
            breath('cold', 'Gélido', 'Cold'),
            breath('fire', 'Fogo', 'Fire'),
            breath('lightning', 'Elétrico', 'Lightning'),
            breath('poison', 'Veneno', 'Poison'),
          ],
          vfx: { kind: 'cone', color: 'fire' },
        },
      ),
    },
  },
};
