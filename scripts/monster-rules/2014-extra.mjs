// Habilidades do SRD 2014 que usavam só nota para o Mestre e agora têm mecânica no motor.
import { man } from './helpers.mjs';

const arcane = { kind: 'glow', color: 'arcane' };
const R = (from, pt, en, ability, rule) => ({ replace: true, from, pt, en, ability, ...rule });

const illusion = (who) => ({
  abilities: {
    'illusory-appearance': R(
      'Illusory Appearance',
      'Aparência Ilusória',
      'Illusory Appearance',
      { cost: 'action' },
      {
        range: 0,
        target: { kind: 'self' },
        resolution: { kind: 'auto' },
        toggle: true,
        effect: {
          mods: {
            note: 'Disfarçada por ilusão: só falha numa inspeção física ou num teste de Investigação.',
            noteEn:
              'Disguised by an illusion: it fails only to physical inspection or an Investigation check.',
          },
        },
        ...man(
          `Usar de novo encerra a ilusão (ação bônus no SRD). Quem gasta uma ação examinando faz Inteligência (Investigação) CD ${who}.`,
          `Using it again ends the illusion (a bonus action in the SRD). A creature that spends an action examining makes an Intelligence (Investigation) check, DC ${who}.`,
        ),
        vfx: arcane,
      },
    ),
  },
});

export default {
  'green-hag': illusion(20),
  'sea-hag': illusion(16),
  doppelganger: {
    abilities: {
      'read-thoughts': R(
        'Read Thoughts',
        'Ler Pensamentos',
        'Read Thoughts',
        { cost: 'action' },
        {
          range: 60,
          target: { kind: 'creature' },
          resolution: { kind: 'auto' },
          concentration: true,
          effect: {
            to: 'self',
            mods: {
              note: 'Lê os pensamentos superficiais do alvo: vantagem em Intuição, Enganação, Intimidação e Persuasão contra ele.',
              noteEn:
                "Reads the target's surface thoughts: advantage on Insight, Deception, Intimidation and Persuasion checks against it.",
            },
          },
          vfx: arcane,
        },
      ),
    },
  },
  aboleth: {
    abilities: {
      'psychic-drain': R(
        'Psychic Drain',
        'Dreno Psíquico',
        'Psychic Drain',
        { cost: 'legendary', legendary: 2 },
        {
          range: 120,
          target: { kind: 'creature' },
          resolution: { kind: 'auto' },
          damage: { dice: '3d6', type: 'psychic', lifesteal: 1 },
          ...man(
            'Só contra uma criatura enfeitiçada pelo aboleth (o Mestre confere); ele recupera PV iguais ao dano.',
            'Only against a creature charmed by the aboleth (the DM checks); it regains HP equal to the damage.',
          ),
          vfx: { kind: 'ray', color: 'arcane' },
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
              label: 'Armadura ou escudo',
              labelEn: 'Armor or shield',
              patch: { effect: { stack: true, mods: { ac: -1 } } },
            },
            {
              id: 'weapon',
              label: 'Arma',
              labelEn: 'Weapon',
              patch: { effect: { stack: true, mods: { weaponBonus: -1 } } },
            },
          ],
          ...man(
            'Penalidade cumulativa de −1 na CA (armadura/escudo some a CA 10 ou +0) ou no dano da arma (some a −5; aqui também reduz o acerto). Objeto solto: destrói um cubo de 30 cm (o Mestre).',
            'Cumulative −1 penalty to AC (armor/shield destroyed at AC 10 or +0) or to weapon damage (destroyed at −5; here it also lowers the attack roll). A loose object: destroys a 1-foot cube (the DM).',
          ),
          vfx: arcane,
        },
      ),
    },
  },
  unicorn: {
    abilities: {
      'shimmering-shield': R(
        'Shimmering Shield',
        'Escudo Cintilante',
        'Shimmering Shield',
        { cost: 'legendary', legendary: 2 },
        {
          range: 60,
          target: { kind: 'creature' },
          resolution: { kind: 'auto' },
          effect: { rounds: 2, mods: { ac: 2 } },
          vfx: { kind: 'glow', color: 'holy' },
        },
      ),
    },
  },
};
