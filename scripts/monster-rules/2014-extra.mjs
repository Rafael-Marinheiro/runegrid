// Habilidades do SRD 2014 que usavam só nota para o Mestre e agora têm mecânica no motor.
import { man, T } from './helpers.mjs';

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

const castList = (n) =>
  R(
    'Cast a Spell',
    'Lançar Magia',
    'Cast a Spell',
    { cost: 'legendary', legendary: n, legendaryCast: 'spell' },
    {
      range: 0,
      target: { kind: 'self' },
      resolution: { kind: 'auto' },
      ...man(
        'No turno de outra criatura, conjure uma magia da lista pelo comando de conjurar: o motor cobra as ações lendárias e o espaço de magia.',
        "On another creature's turn, cast a spell from the list with the normal cast command: the engine charges the legendary actions and the spell slot.",
      ),
      vfx: arcane,
    },
  );

export default {
  androsphinx: { abilities: { 'cast-a-spell': castList(3) } },
  gynosphinx: { abilities: { 'cast-a-spell': castList(3) } },
  lich: {
    abilities: {
      cantrip: R(
        'Cantrip',
        'Truque',
        'Cantrip',
        { cost: 'legendary', legendaryCast: 'cantrip' },
        {
          range: 0,
          target: { kind: 'self' },
          resolution: { kind: 'auto' },
          ...man(
            'No turno de outra criatura, conjure um truque pelo comando de conjurar: o motor cobra a ação lendária.',
            "On another creature's turn, cast a cantrip with the normal cast command: the engine charges the legendary action.",
          ),
          vfx: arcane,
        },
      ),
    },
  },
  'stone-giant': {
    abilities: {
      'rock-catching': R(
        'Rock Catching',
        'Pegar Pedra',
        'Rock Catching',
        { cost: 'reaction' },
        {
          castTime: 'reaction',
          range: 0,
          target: { kind: 'self' },
          resolution: { kind: 'auto' },
          react: { on: 'hit', acBonus: 0, catch: { ability: 'dex', dc: 10 } },
          vfx: { kind: 'glow', color: 'steel' },
        },
      ),
    },
  },
  bulette: {
    abilities: {
      'deadly-leap': R(
        'Deadly Leap',
        'Salto Mortal',
        'Deadly Leap',
        { cost: 'action', dc: 16 },
        {
          range: 30,
          target: { kind: 'point' },
          resolution: { kind: 'auto' },
          move: { ft: 30, mode: 'walk', noOpportunity: true },
          landing: {
            radius: 5,
            patch: {
              target: { kind: 'creature' },
              resolution: { kind: 'save', ability: 'dex', onSave: 'half' },
              damage: { dice: '3d6+4', type: 'bludgeoning' },
              extraDamage: [{ dice: '3d6+4', type: 'slashing' }],
              condition: { name: 'prone', rounds: 0 },
            },
          },
          ...man(
            'Só vale se o salto tiver pelo menos 4,5 m (o Mestre confere). A criatura que passa na salvaguarda escolhe Força ou Destreza (aqui, Destreza), não cai e é empurrada 1,5 m; o motor atinge as criaturas ao lado do ponto de pouso.',
            'Only if the jump was at least 15 ft (the DM checks). A creature that succeeds chooses Strength or Dexterity (here, Dexterity), is not knocked prone and is pushed 5 ft; the engine hits the creatures next to the landing point.',
          ),
          vfx: { kind: 'burst', color: 'earth', radius: 5 },
        },
      ),
    },
  },
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
    traits: {
      'rust-metal': T(
        'Ferrugem do Metal',
        'Rust Metal',
        { rustMetal: true, corrodeOnHit: 'Bite' },
        { from: 'Rust Metal' },
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
              patch: { corrode: { kind: 'armor', on: 'damage' } },
            },
            {
              id: 'shield',
              label: 'Escudo de metal',
              labelEn: 'Metal shield',
              patch: { corrode: { kind: 'shield', on: 'damage' } },
            },
            {
              id: 'weapon',
              label: 'Arma de metal',
              labelEn: 'Metal weapon',
              patch: { corrode: { kind: 'weapon', on: 'damage' } },
            },
            {
              id: 'object',
              label: 'Objeto solto (cenário)',
              labelEn: 'Loose object (scenery)',
              patch: {
                target: { kind: 'point' },
                resolution: { kind: 'auto' },
                destroyObject: 'metal',
              },
            },
          ],
          ...man(
            'Item de metal não mágico, usado ou carregado: salvaguarda de Destreza CD 11 ou perde 1 cumulativo (CA da armadura/escudo; dano da arma). Armadura que chega a CA 10, escudo a +0 e arma a −5 são destruídos. Itens mágicos e de outros materiais não sofrem. Objeto solto: indique o ponto no mapa e ele é destruído.',
            'A nonmagical metal item worn or carried: Dexterity save DC 11 or it loses 1 cumulatively (armor/shield AC; weapon damage). Armor reaching AC 10, a shield at +0 and a weapon at −5 are destroyed. Magic items and other materials are unaffected. A loose object: give the map point and it is destroyed.',
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
