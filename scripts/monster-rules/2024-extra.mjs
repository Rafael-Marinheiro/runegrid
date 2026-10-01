// Habilidades do SRD 2024 que usavam só nota para o Mestre e agora têm mecânica no motor.
import { man } from './helpers.mjs';

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

export default {
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
              label: 'Armadura',
              labelEn: 'Armor',
              patch: { effect: { stack: true, mods: { ac: -1 } } },
            },
            {
              id: 'weapon',
              label: 'Arma',
              labelEn: 'Weapon',
              patch: { effect: { stack: true, mods: { attackBonus: -1 } } },
            },
          ],
          ...man(
            'Penalidade cumulativa de −1 na CA (armadura) ou nas jogadas de ataque (arma); armadura some se a CA cair a 10 e arma ao chegar a −5 (o Mestre confere). Remove-se com Consertar.',
            'Cumulative −1 penalty to AC (armor) or attack rolls (weapon); armor is destroyed if its AC drops to 10 and a weapon at −5 (the DM checks). Mending removes it.',
          ),
          vfx: { kind: 'glow', color: 'arcane' },
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
          effect: { stack: true, mods: { attackBonus: -1 } },
          ...man(
            'Corrói a arma de quem acertou o monstro (−1 cumulativo nas jogadas de ataque; a arma some em −5).',
            'Corrodes the weapon of whoever hit the monster (cumulative −1 to attack rolls; the weapon is destroyed at −5).',
          ),
          vfx: { kind: 'glow', color: 'arcane' },
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
          ...man(
            'Quem passa na salvaguarda fica imune ao Olhar deste diabo por 24 horas (o Mestre anota).',
            "A creature that succeeds is immune to this devil's Gaze for 24 hours (the DM tracks it).",
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
