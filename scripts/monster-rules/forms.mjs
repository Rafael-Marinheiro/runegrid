// Formas alternativas dos que mudam de forma (Vampiro, Lobisomem…). Os números vêm do texto do SRD
// (data/monsters*.json); onde o texto não dá o valor (CA e velocidade do lobisomem), foi anotado à parte.
const rev = { id: 'true', label: 'Forma verdadeira', labelEn: 'True form', revert: true };
const f = (id, label, labelEn, rest = {}) => ({ id, label, labelEn, ...rest });

const D = {
  2014: {
    vampire: {
      note: 'Só fora da luz do sol e da água corrente (o Mestre confere). Morcego: não fala, Tamanho Miúdo, anda 1,5 m e voa 9 m; só a Mordida. Névoa: não age nem fala, voo 6 m, resistência a todo dano (no SRD, imune a dano não mágico), vantagem em Força/Destreza/Constituição (o Mestre aplica).',
      noteEn:
        "Only outside sunlight and running water (the DM checks). Bat: can't speak, Tiny, fly 30 ft; only the Bite. Mist: takes no actions and can't speak, fly 20 ft, resistance to all damage (immune to nonmagical damage in the SRD), advantage on Str/Dex/Con saves (the DM applies it).",
      forms: [
        f('bat', 'Morcego', 'Bat', { size: 'tiny', speed: 5, speeds: { fly: 30 }, keys: ['bat'] }),
        f('mist', 'Névoa', 'Mist', {
          size: 'medium',
          speed: 5,
          speeds: { fly: 20, hover: true },
          keys: [],
          resistAll: true,
          noActions: true,
        }),
        rev,
      ],
    },
    werewolf: {
      note: 'Híbrido e lobo: CA 12 (11 na forma humanoide); lobo com 12 m de deslocamento. Híbrido usa Mordida e Garras; lobo só a Mordida; o equipamento não se transforma. Volta à forma humanoide se morrer.',
      noteEn:
        'Hybrid and wolf: AC 12 (11 in humanoid form); wolf speed 40 ft. Hybrid uses Bite and Claws; wolf only the Bite; equipment does not transform. Reverts to humanoid form if it dies.',
      forms: [
        f('hybrid', 'Híbrido', 'Hybrid', { ac: 12, keys: ['hybrid'], attacksPerAction: 2 }),
        f('wolf', 'Lobo', 'Wolf', { ac: 12, speed: 40, keys: ['wolf'], attacksPerAction: 1 }),
        { ...rev, label: 'Forma humanoide', labelEn: 'Humanoid form' },
      ],
    },
  },
  2024: {
    vampire: {
      note: 'Só fora da luz do sol e da água corrente (o Mestre confere). Morcego: Miúdo, voo 9 m, não fala. Névoa: Média, voo 6 m, não age nem fala, resistência a todo dano menos o da luz do sol.',
      noteEn:
        "Only outside sunlight and running water (the DM checks). Bat: Tiny, fly 30 ft, can't speak. Mist: Medium, fly 20 ft, takes no actions or speech, resistance to all damage except sunlight.",
      forms: [
        f('bat', 'Morcego', 'Bat', { size: 'tiny', speed: 5, speeds: { fly: 30 } }),
        f('mist', 'Névoa', 'Mist', {
          size: 'medium',
          speed: 5,
          speeds: { fly: 20, hover: true },
          resistAll: true,
          noActions: true,
        }),
        rev,
      ],
    },
    werewolf: {
      note: 'Híbrido Grande ou lobo Médio; só o tamanho muda. O equipamento não se transforma.',
      noteEn: 'Large hybrid or Medium wolf; only the size changes. Equipment does not transform.',
      forms: [
        f('hybrid', 'Híbrido', 'Hybrid', { size: 'large' }),
        f('wolf', 'Lobo', 'Wolf', { size: 'medium' }),
        { ...rev, label: 'Forma humanoide', labelEn: 'Humanoid form' },
      ],
    },
  },
};

const humanoid = (...sizes) =>
  sizes.map(([id, label, labelEn, size]) => f(id, label, labelEn, { size, keys: [] }));
const back = { ...rev, label: 'Forma verdadeira', labelEn: 'True form' };
const humanoidBack = { ...rev, label: 'Forma humanoide', labelEn: 'Humanoid form' };
const lyc = (note, noteEn, forms) => ({ note, noteEn, forms: [...forms, humanoidBack] });
const EQUIP = 'O equipamento não se transforma; volta à forma humanoide se morrer.';
const EQUIP_EN = 'Equipment does not transform; it reverts to humanoid form if it dies.';
const SIZE = 'Só o tamanho muda';
const SIZE_EN = 'Only the size changes';
const beast = (note, noteEn, forms) => ({ note, noteEn, forms: [...forms, back] });

Object.assign(D[2014], {
  wereboar: lyc(
    `Híbrido ou javali; a CA muda conforme a ficha (o Mestre aplica). ${EQUIP}`,
    `Hybrid or boar; AC changes as on the sheet (the DM applies it). ${EQUIP_EN}`,
    [
      f('hybrid', 'Híbrido', 'Hybrid', { keys: ['hybrid'] }),
      f('boar', 'Javali', 'Boar', { keys: ['boar'] }),
    ],
  ),
  wererat: lyc(
    `Híbrido ou rato gigante (Pequeno). ${EQUIP}`,
    `Hybrid or giant rat (Small). ${EQUIP_EN}`,
    [
      f('hybrid', 'Híbrido', 'Hybrid', { keys: ['hybrid'] }),
      f('rat', 'Rato gigante', 'Giant rat', { size: 'small', keys: ['rat'] }),
    ],
  ),
  weretiger: lyc(`Híbrido ou tigre (Grande). ${EQUIP}`, `Hybrid or tiger (Large). ${EQUIP_EN}`, [
    f('hybrid', 'Híbrido', 'Hybrid', { keys: ['hybrid'] }),
    f('tiger', 'Tigre', 'Tiger', { size: 'large', keys: ['tiger'] }),
  ]),
  werebear: lyc(
    `Híbrido ou urso, ambos Grandes; a CA muda conforme a ficha (o Mestre aplica). ${EQUIP}`,
    `Hybrid or bear, both Large; AC changes as on the sheet (the DM applies it). ${EQUIP_EN}`,
    [
      f('hybrid', 'Híbrido', 'Hybrid', { size: 'large', keys: ['hybrid'] }),
      f('bear', 'Urso', 'Bear', { size: 'large', keys: ['bear'] }),
    ],
  ),
  doppelganger: beast(
    'Humanoide Pequeno ou Médio que já viu; só o tamanho muda.',
    'A Small or Medium humanoid it has seen; only the size changes.',
    humanoid(
      ['small', 'Humanoide Pequeno', 'Small humanoid', 'small'],
      ['medium', 'Humanoide Médio', 'Medium humanoid', 'medium'],
    ),
  ),
  mimic: beast(
    'Vira um objeto e mantém as estatísticas.',
    'Becomes an object and keeps its statistics.',
    [f('object', 'Objeto', 'Object', { keys: [] })],
  ),
  imp: beast(
    'Forma de fera: rato, corvo ou aranha; só o deslocamento muda (o corvo voa 18 m).',
    'Beast form: rat, raven or spider; only the speed changes (the raven flies 60 ft).',
    [
      f('rat', 'Rato', 'Rat', { speed: 20 }),
      f('raven', 'Corvo', 'Raven', { speed: 20, speeds: { fly: 60 } }),
      f('spider', 'Aranha', 'Spider', { speed: 20, speeds: { climb: 20 } }),
    ],
  ),
  quasit: beast(
    'Forma de fera: morcego, centopeia ou sapo; só o deslocamento muda.',
    'Beast form: bat, centipede or toad; only the speed changes.',
    [
      f('bat', 'Morcego', 'Bat', { speed: 10, speeds: { fly: 40 } }),
      f('centipede', 'Centopeia', 'Centipede', { speed: 40, speeds: { climb: 40 } }),
      f('toad', 'Sapo', 'Toad', { speed: 40, speeds: { swim: 40 } }),
    ],
  ),
  succubusincubus: beast(
    'Humanoide Pequeno ou Médio; sem asas perde o voo. Sem a Garra.',
    'A Small or Medium humanoid; without wings it loses its flight. No Claw.',
    humanoid(
      ['small', 'Humanoide Pequeno', 'Small humanoid', 'small'],
      ['medium', 'Humanoide Médio', 'Medium humanoid', 'medium'],
    ),
  ),
  'night-hag': beast(
    'Humanoide feminino Pequeno ou Médio; sem a Garra.',
    'A Small or Medium female humanoid; no Claws.',
    humanoid(
      ['small', 'Humanoide Pequeno', 'Small humanoid', 'small'],
      ['medium', 'Humanoide Médio', 'Medium humanoid', 'medium'],
    ),
  ),
  oni: beast(
    'Humanoide Pequeno ou Médio, ou gigante Grande; só o tamanho muda; a glaive encolhe junto.',
    'A Small or Medium humanoid or a Large giant; only the size changes; the glaive shrinks with it.',
    humanoid(
      ['small', 'Humanoide Pequeno', 'Small humanoid', 'small'],
      ['medium', 'Humanoide Médio', 'Medium humanoid', 'medium'],
      ['giant', 'Gigante', 'Giant', 'large'],
    ),
  ),
});

Object.assign(D[2024], {
  wereboar: lyc(
    `Híbrido Médio ou javali Pequeno. ${SIZE}. ${EQUIP}`,
    `Medium hybrid or Small boar. ${SIZE_EN}. ${EQUIP_EN}`,
    [
      f('hybrid', 'Híbrido', 'Hybrid', { size: 'medium' }),
      f('boar', 'Javali', 'Boar', { size: 'small' }),
    ],
  ),
  wererat: lyc(
    `Híbrido Médio ou rato Pequeno. ${SIZE}. ${EQUIP}`,
    `Medium hybrid or Small rat. ${SIZE_EN}. ${EQUIP_EN}`,
    [
      f('hybrid', 'Híbrido', 'Hybrid', { size: 'medium' }),
      f('rat', 'Rato', 'Rat', { size: 'small' }),
    ],
  ),
  weretiger: lyc(
    `Híbrido ou tigre, ambos Grandes. ${SIZE}. ${EQUIP}`,
    `Hybrid or tiger, both Large. ${SIZE_EN}. ${EQUIP_EN}`,
    [
      f('hybrid', 'Híbrido', 'Hybrid', { size: 'large' }),
      f('tiger', 'Tigre', 'Tiger', { size: 'large' }),
    ],
  ),
  werebear: lyc(
    `Híbrido ou urso, ambos Grandes. ${SIZE}. ${EQUIP}`,
    `Hybrid or bear, both Large. ${SIZE_EN}. ${EQUIP_EN}`,
    [
      f('hybrid', 'Híbrido', 'Hybrid', { size: 'large' }),
      f('bear', 'Urso', 'Bear', { size: 'large' }),
    ],
  ),
  doppelganger: beast(
    'Humanoide Pequeno ou Médio; só o tamanho muda.',
    'A Small or Medium humanoid; only the size changes.',
    humanoid(
      ['small', 'Humanoide Pequeno', 'Small humanoid', 'small'],
      ['medium', 'Humanoide Médio', 'Medium humanoid', 'medium'],
    ),
  ),
  mimic: beast(
    'Vira um objeto Pequeno ou Médio e mantém as estatísticas.',
    'Becomes a Small or Medium object and keeps its statistics.',
    humanoid(
      ['small', 'Objeto Pequeno', 'Small object', 'small'],
      ['medium', 'Objeto Médio', 'Medium object', 'medium'],
    ),
  ),
  imp: beast(
    'Forma de rato, corvo ou aranha; só o deslocamento muda (o corvo voa 18 m).',
    'Rat, raven or spider form; only the speed changes (the raven flies 60 ft).',
    [
      f('rat', 'Rato', 'Rat', { speed: 20 }),
      f('raven', 'Corvo', 'Raven', { speed: 20, speeds: { fly: 60 } }),
      f('spider', 'Aranha', 'Spider', { speed: 20, speeds: { climb: 20 } }),
    ],
  ),
  quasit: beast(
    'Forma de morcego, centopeia ou sapo; só o deslocamento muda.',
    'Bat, centipede or toad form; only the speed changes.',
    [
      f('bat', 'Morcego', 'Bat', { speed: 10, speeds: { fly: 40 } }),
      f('centipede', 'Centopeia', 'Centipede', { speed: 40, speeds: { climb: 40 } }),
      f('toad', 'Sapo', 'Toad', { speed: 40, speeds: { swim: 40 } }),
    ],
  ),
  succubus: beast(
    'Humanoide Pequeno ou Médio; o voo só existe na forma verdadeira.',
    'A Small or Medium humanoid; flight only exists in the true form.',
    humanoid(
      ['small', 'Humanoide Pequeno', 'Small humanoid', 'small'],
      ['medium', 'Humanoide Médio', 'Medium humanoid', 'medium'],
    ),
  ),
  incubus: beast(
    'Humanoide Pequeno ou Médio; o voo só existe na forma verdadeira.',
    'A Small or Medium humanoid; flight only exists in the true form.',
    humanoid(
      ['small', 'Humanoide Pequeno', 'Small humanoid', 'small'],
      ['medium', 'Humanoide Médio', 'Medium humanoid', 'medium'],
    ),
  ),
  'night-hag': beast(
    'Humanoide Pequeno ou Médio; só o tamanho muda.',
    'A Small or Medium humanoid; only the size changes.',
    humanoid(
      ['small', 'Humanoide Pequeno', 'Small humanoid', 'small'],
      ['medium', 'Humanoide Médio', 'Medium humanoid', 'medium'],
    ),
  ),
  oni: beast(
    'Humanoide Pequeno ou Médio, ou gigante Grande; só o tamanho muda.',
    'A Small or Medium humanoid or a Large giant; only the size changes.',
    humanoid(
      ['small', 'Humanoide Pequeno', 'Small humanoid', 'small'],
      ['medium', 'Humanoide Médio', 'Medium humanoid', 'medium'],
      ['giant', 'Gigante', 'Giant', 'large'],
    ),
  ),
});

// Dragões metálicos, couatl e deva (2014): "humanoide ou fera de ND igual ou menor": as opções saem do Bestiário ao
// carregar (`formFrom`). O que a nova forma substitui muda por monstro (ver o texto de cada Change Shape).
const poly = (take, keepAttacks, noteExtra, noteExtraEn) => ({
  poly: { types: ['beast', 'humanoid'], take, ...(keepAttacks ? { keepAttacks } : {}) },
  note: `Vira um humanoide ou uma fera de ND igual ou menor (escolha na lista). ${noteExtra} Volta à forma verdadeira se morrer.`,
  noteEn: `Becomes a humanoid or a beast of equal or lower CR (pick from the list). ${noteExtraEn} Reverts to its true form if it dies.`,
  forms: [back],
});
const DRAGON = poly(
  ['size', 'speed', 'ac', 'str', 'dex', 'con', 'attacks', 'resist', 'senses'],
  undefined,
  'Mantém PV, Dados de Vida, alinhamento, fala, proficiências, Resistência Lendária e Inteligência, Sabedoria e Carisma; o resto passa a ser o da nova forma.',
  'Keeps HP, Hit Dice, alignment, speech, proficiencies, Legendary Resistance and Intelligence, Wisdom and Charisma; everything else becomes the new form’s.',
);
const COUATL = poly(
  ['size', 'speed', 'ac', 'str', 'dex', 'attacks'],
  ['Bite'],
  'Mantém a ficha; CA, movimento, Força, Destreza e as outras ações passam a ser as da nova forma, e a Mordida continua se a forma também tiver uma.',
  'Keeps its sheet; AC, movement, Strength, Dexterity and other actions become the new form’s, and its bite carries over if the form has one.',
);
const DEVA = poly(
  ['size', 'speed', 'ac', 'str', 'dex', 'senses', 'attacksAdd'],
  undefined,
  'Mantém a ficha; CA, movimento, Força, Destreza e sentidos passam a ser os da nova forma, e ganha os ataques que a forma tiver.',
  'Keeps its sheet; AC, movement, Strength, Dexterity and senses become the new form’s, and it gains the form’s attacks.',
);
D[2014].couatl = COUATL;
D[2014].deva = DEVA;
for (const kind of ['adult', 'ancient'])
  for (const metal of ['brass', 'bronze', 'copper', 'gold', 'silver'])
    D[2014][`${kind}-${metal}-dragon`] = DRAGON;

export default D;
