// Habilidades que o leitor automático não entende e que se repetem entre monstros (Engolir, sopros de
// controle). Lê os números do texto oficial; o que não cabe no motor vai para a nota `manual`.
import FORMS from './forms.mjs';
import { monsterPt, sheetOf } from '../spell-rules/summon-helpers.mjs';

const num = (re, text) => {
  const m = re.exec(text);
  return m ? Number(m[1]) : undefined;
};
const dice = (s) => s.replace(/\s+/g, '');
const flat = (a, fields) => {
  delete a.narrative;
  if (fields.cure) for (const k of ['damage', 'extraDamage', 'onHitSave']) delete a[k];
  Object.assign(a, fields);
  return a;
};

function biteOf(m) {
  const bite = m.actions.find((t) => /^bite/i.test(t.name) && /to hit/i.test(t.desc));
  if (!bite) return {};
  const hit = /\+(\d+) to hit/i.exec(bite.desc);
  const dmg = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\) (\w+) damage/i.exec(bite.desc);
  return {
    attackBonus: hit ? Number(hit[1]) : undefined,
    damage: dmg ? { dice: dice(dmg[1]), type: dmg[2].toLowerCase() } : undefined,
  };
}

const ABILITY = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

function swallow(a, m) {
  const d = a.desc;
  const hp = /(\d+d\d+(?:\s*[+-]\s*\d+)?)\) (\w+) damage at the start of each/i.exec(d);
  const save = /(Strength|Dexterity|Constitution) Saving Throw: DC (\d+)/i.exec(d);
  const size = /(Tiny|Small|Medium|Large|Huge) or smaller/i.exec(d)?.[1];
  const bite = biteOf(m);
  const conds = ['blinded', 'restrained'].filter((c) => new RegExp(c, 'i').test(d));
  const fields = {
    target: { kind: 'creature' },
    range: 5,
    resolution: save
      ? { kind: 'save', ability: ABILITY[save[1].toLowerCase()], onSave: 'none' }
      : { kind: 'attack' },
    ...(!save && bite.damage ? { damage: bite.damage } : {}),
    condition: conds.map((name) => ({ name, rounds: 0 })),
    cure: { conditions: ['grappled'] },
    ...(hp
      ? {
          effect: {
            rounds: 600,
            mods: { dotStart: { dice: dice(hp[1]), type: hp[2].toLowerCase() } },
          },
        }
      : {}),
    manual: `Engole um alvo agarrado${size ? ` (${size === 'Tiny' ? 'Miúdo' : size === 'Small' ? 'Pequeno' : size === 'Medium' ? 'Médio' : size === 'Large' ? 'Grande' : 'Enorme'} ou menor)` : ''}: cego e contido, cobertura total contra o que está fora, dano no início de cada turno do monstro; ao regurgitar ou morrer o alvo sai caído (o Mestre remove os efeitos).`,
    manualEn: `Swallows a grappled target${size ? ` (${size} or smaller)` : ''}: blinded and restrained, total cover from outside, damage at the start of each of the monster's turns; when it regurgitates or dies the target exits prone (the DM removes the effects).`,
    vfx: { kind: 'glow', color: 'acid' },
  };
  a.ability = {
    ...a.ability,
    needsGrappled: true,
    ...(save ? { dc: Number(save[2]) } : {}),
    ...(!save && bite.attackBonus !== undefined ? { attackBonus: bite.attackBonus } : {}),
  };
  return flat(a, fields);
}

function control(a, kind) {
  const d = a.desc;
  const save = /(Strength|Dexterity|Constitution) Saving Throw: DC (\d+)/i.exec(d);
  const old = /DC (\d+) (Strength|Dexterity|Constitution) saving throw/i.exec(d);
  const ability = ABILITY[(save?.[1] ?? old?.[2] ?? '').toLowerCase()];
  const dc = save ? Number(save[2]) : old ? Number(old[1]) : undefined;
  if (!ability || !dc) return a;
  const len = Number(/(\d+(?: \d)?)[- ]foot cone/i.exec(d)?.[1].replace(' ', '')) || undefined;
  const target = len ? { kind: 'cone', length: len } : a.target;
  const until = /until the end of its next turn/i.test(d);
  const rep = until ? {} : { repeatSave: { ability, dc } };
  const base = { target, range: 0, resolution: { kind: 'save', ability, onSave: 'none' } };
  a.ability = { ...a.ability, dc };
  if (kind === 'slow')
    return flat(a, {
      ...base,
      effect: {
        rounds: until ? 1 : 10,
        mods: {
          noReactions: true,
          speedMult: 0.5,
          ...rep,
          note: 'Velocidade pela metade, sem reações, só uma ação ou ação bônus (e um ataque) por turno.',
          noteEn:
            'Speed halved, no reactions, either an action or a bonus action (and one attack) per turn.',
        },
      },
      vfx: { kind: 'cone', color: 'arcane' },
    });
  if (kind === 'weak')
    return flat(a, {
      ...base,
      effect: {
        rounds: 10,
        mods: {
          ...rep,
          note: 'Desvantagem em ataques, testes e salvaguardas de Força (e −1d6 de dano na versão 2024).',
          noteEn:
            'Disadvantage on Strength-based attacks, checks and saves (and −1d6 damage in the 2024 version).',
        },
      },
      vfx: { kind: 'cone', color: 'arcane' },
    });
  const ft = num(/pushed (?:up to )?(\d+) feet/i, d);
  return flat(a, {
    ...base,
    ...(ft ? { push: { ft, dir: 'away' } } : {}),
    ...(/Prone/.test(d) ? { condition: { name: 'prone', rounds: 0 } } : {}),
    vfx: { kind: 'cone', color: 'arcane' },
  });
}

/** Opção de invocação: `n` fixo ou `dice` rolado ("1d8 vrocks"). */
function summonOption(ruleset, id, dice, extra = {}) {
  const sheet = sheetOf(ruleset, id);
  if (!sheet) return null;
  const pt = monsterPt(sheet.name);
  const tag = (name) => `${name}${dice ? ` (${dice})` : ''}`;
  return {
    id,
    label: tag(pt),
    ...(pt !== sheet.name ? { labelEn: tag(sheet.name) } : {}),
    patch: { summon: { srd: id, ...(dice ? { dice } : { n: 1 }), ...extra } },
  };
}

const FIELDS = {
  target: { kind: 'point' },
  range: 60,
  resolution: { kind: 'auto' },
  vfx: { kind: 'burst', color: 'fire', radius: 5 },
};

/** "Summon Demon" / "Summon Mephits": chance de funcionar e o que pode vir (1d8 vrocks, one marilith…). */
function summonChance(a, m, ruleset) {
  const d = a.desc;
  const chance = num(/(\d+) percent chance/i, d);
  const list = /summoning ([^.]+)\./i.exec(d)?.[1];
  if (!chance || !list) return a;
  const ids = (word) =>
    [word, word.replace(/s$/, ''), word.replace(/es$/, ''), word.replace(/ies$/, 'y')].find((x) =>
      sheetOf(ruleset, x),
    );
  const options = list
    .split(/,\s*(?:or\s+)?|\s+or\s+/)
    .map((tok) => {
      const mm = /^(\d+d\d+|one|an?)\s+(.+)$/i.exec(tok.trim());
      if (!mm) return null;
      let word = mm[2].toLowerCase().replace(/ /g, '-');
      if (word === 'mephits-of-its-kind') word = m.id.replace(/^srd-2024_/, '');
      const id = /of its kind/.test(mm[2]) ? m.id.replace(/^srd-2024_/, '') : ids(word);
      return id ? summonOption(ruleset, id, /d/.test(mm[1]) ? mm[1] : null) : null;
    })
    .filter(Boolean)
    .map((o) => ({
      ...o,
      patch: { summon: { ...o.patch.summon, chance: chance / 100, rounds: 10, blockSelf: true } },
    }));
  if (!options.length) return a;
  return flat(a, {
    ...FIELDS,
    options,
    manual: `Chance de ${chance}% de dar certo; os convocados agem como aliados, não invocam outros e somem em 1 minuto ou se quem os chamou morrer.`,
    manualEn: `${chance}% chance to work; summoned creatures act as allies, can't summon others and vanish after 1 minute or when their summoner dies.`,
  });
}

/** Cria Espectro: o espírito de um humanoide recém-morto se levanta (até sete). */
function createSpecter(a, ruleset) {
  const o = summonOption(ruleset, 'specter', null, { permanent: true, corpse: true, cap: 7 });
  if (!o) return a;
  return flat(a, {
    ...FIELDS,
    range: 10,
    options: [o],
    vfx: { kind: 'burst', color: 'shadow', radius: 5 },
    manual:
      'Escolha o ponto onde caiu um humanoide morto há até 1 minuto (o Mestre confere). O espectro obedece ao aparição; no máximo sete.',
    manualEn:
      'Pick the spot where a humanoid died within the last minute (the DM checks). The specter obeys the wraith; at most seven.',
  });
}

/** Nuvem de Tinta: área obscurecida em volta do polvo (esfera no 2014, cubo de 5/10 pés no 2024). */
function inkCloud(a) {
  const d = a.desc;
  const radius = num(/(\d+)-foot-radius/i, d) ?? num(/(\d+)-foot Cube/i, d);
  if (!radius || a.ability?.cost === 'legendary') return a;
  const reactive = /takes damage/i.test(d);
  const atEnd = /ends its turn within (\d+) feet/i.exec(d);
  if (/_Trigger:_/.test(d) && !reactive && !atEnd) return a;
  return flat(a, {
    target: { kind: 'sphere', radius, self: true },
    range: 0,
    resolution: { kind: 'auto' },
    zone: { on: 'cast', obscures: true, color: 'shadow' },
    rounds: 10,
    ...(reactive ? { react: { on: 'damaged' } } : {}),
    ...(reactive || atEnd ? { moveAfter: 'swim' } : {}),
    ...(atEnd ? { castTime: 'reaction', react: { on: 'turnEnd', within: Number(atEnd[1]) } } : {}),
    manual:
      reactive || atEnd
        ? "Só debaixo d'água; depois de soltar a tinta o polvo se move até a velocidade de natação (informe o ponto ao usar a reação). A área fica muito obscurecida por 1 minuto, a não ser que uma corrente forte a disperse."
        : "Só debaixo d'água; depois de soltar a tinta o polvo pode Correr como ação bônus. A área fica muito obscurecida por 1 minuto, a não ser que uma corrente forte a disperse.",
    manualEn:
      reactive || atEnd
        ? 'Underwater only; after releasing the ink the octopus moves up to its swim speed (give the point when using the reaction). The area is heavily obscured for 1 minute unless a strong current disperses it.'
        : 'Underwater only; after releasing the ink the octopus can Dash as a bonus action. The area is heavily obscured for 1 minute unless a strong current disperses it.',
    vfx: { kind: 'burst', color: 'shadow', radius },
  });
}

/** Aura de Escuridão (Ocultador): escuridão mágica que acompanha o monstro enquanto ele se concentra. */
function darknessAura(a) {
  const radius = num(/(\d+)-foot/i, a.desc);
  if (!radius) return a;
  return flat(a, {
    target: { kind: 'sphere', radius, self: true },
    range: 0,
    resolution: { kind: 'auto' },
    zone: { aura: true, on: 'cast', obscures: true, color: 'shadow' },
    concentration: true,
    rounds: 100,
    manual:
      'Escuridão mágica: visão no escuro não a atravessa e nenhuma luz natural a ilumina; dissipa luzes de magias de 2º nível ou menos (o Mestre aplica).',
    manualEn:
      'Magical darkness: darkvision cannot see through it and no natural light lights it; it dispels light spells of level 2 or lower (the DM applies it).',
    vfx: { kind: 'burst', color: 'shadow', radius },
  });
}

/** Puxar (Roper, Ettercap): arrasta até 25–30 pés em direção ao monstro as criaturas agarradas ou presas. */
function reel(a) {
  const ft = num(/up to (\d+) f(?:ee|oo)?t/i, a.desc);
  if (!ft) return a;
  const grappled = /grappled/i.test(a.desc);
  const many = /each creature/i.test(a.desc);
  a.ability = { ...a.ability, ...(grappled ? { needsGrappled: true } : {}) };
  return flat(a, {
    target: { kind: 'creature', ...(many ? { max: 6 } : {}) },
    range: 50,
    resolution: { kind: 'auto' },
    push: { ft, dir: 'toward' },
    ...(grappled
      ? {}
      : {
          manual: 'Só vale contra criatura contida pelo Fio de Teia (o Mestre confere).',
          manualEn: 'Only works on a creature Restrained by its Web Strand (the DM checks).',
        }),
    vfx: { kind: 'ray', color: 'steel' },
  });
}

/** Fantasmas do Ocultador: três duplicatas ilusórias (aproximadas pela Imagem Espelhada). */
function phantasms(a) {
  return flat(a, {
    target: { kind: 'self' },
    range: 0,
    resolution: { kind: 'auto' },
    effect: {
      rounds: 100,
      to: 'self',
      mods: {
        images: 3,
        note: 'Três duplicatas: ataques e magias podem mirar uma delas (sorteio) e a duplicata some ao ser atingida. Somem sob luz forte.',
        noteEn:
          'Three duplicates: attacks and spells may target one of them (random) and a duplicate vanishes when hit. They vanish in bright light.',
      },
    },
    vfx: { kind: 'glow', color: 'arcane' },
  });
}

/** Etereidade / Passo Etéreo: alterna entre o plano Material e o Etéreo (o token fica a 50% de opacidade). */
function ethereal(a) {
  return flat(a, {
    target: { kind: 'self' },
    range: 0,
    resolution: { kind: 'auto' },
    plane: 'toggle',
    manual:
      'No plano Etéreo só interage com quem também está nele; continua visível no plano Material como silhueta, mas não afeta nem é afetado por nada de lá. Companheiros levados junto (Passo Etéreo) o Mestre move.',
    manualEn:
      'On the Ethereal Plane it only interacts with creatures there; it stays visible on the Material Plane as a silhouette but cannot affect or be affected by anything there. Companions taken along (Ethereal Stride) are moved by the DM.',
    vfx: { kind: 'glow', color: 'arcane' },
  });
}

/** Mudar de Forma: uma opção por forma, trocando tamanho, velocidade, CA e ataques permitidos. */
function shapeShift(a, m, ruleset) {
  const def = FORMS[ruleset]?.[m.id.replace(/^srd-2024_/, '')];
  if (!def) return a;
  if (def.poly)
    return flat(a, {
      target: { kind: 'self' },
      range: 0,
      resolution: { kind: 'auto' },
      formFrom: { ...def.poly, maxCr: m.cr },
      options: def.forms.map((fm) => {
        const { id, label, labelEn, ...rest } = fm;
        return { id, label, labelEn, patch: { form: { id, label, labelEn, ...rest } } };
      }),
      manual: def.note,
      manualEn: def.noteEn,
      vfx: { kind: 'glow', color: 'arcane' },
    });
  return flat(a, {
    target: { kind: 'self' },
    range: 0,
    resolution: { kind: 'auto' },
    options: def.forms.map((fm) => {
      const { id, label, labelEn, ...rest } = fm;
      return { id, label, labelEn, patch: { form: { id, label, labelEn, ...rest } } };
    }),
    manual: def.note,
    manualEn: def.noteEn,
    vfx: { kind: 'glow', color: 'shadow' },
  });
}

/** Canalizar Energia Negativa (Senhor das Múmias): ninguém na área recupera PV até o fim do próximo turno dele. */
function negativeEnergy(a) {
  const ft = num(/within (\d+) feet/i, a.desc);
  if (!ft || !/can't regain hit points/i.test(a.desc)) return a;
  return flat(a, {
    target: { kind: 'sphere', radius: ft, self: true },
    range: 0,
    resolution: { kind: 'auto' },
    effect: { rounds: 2, ends: 'casterEnd', mods: { noHealing: true } },
    vfx: { kind: 'burst', color: 'shadow', radius: ft },
  });
}

/** Saltos e deslocamentos de ação bônus (Salto, Investida, Espreita): andam pelo mapa (`Spell.move`). */
function hop(a, m) {
  const d = a.desc;
  const jump = num(/jumps up to (\d+) feet/i, d);
  const spend = num(/spending (\d+) feet of movement/i, d);
  const move = /moves up to (half )?its Speed/i.exec(d);
  const tree = /second Large or bigger tree that is within (\d+) feet/i.exec(d);
  if (tree)
    return flat(a, {
      target: { kind: 'point' },
      range: Number(tree[1]),
      teleport: true,
      manual:
        'Precisa estar a até 1,5 m de uma árvore Grande ou maior e chegar a até 1,5 m de outra a até 18 m (o motor leva ao ponto; confira as árvores).',
      manualEn:
        'Must be within 5 ft of a Large or bigger tree and arrive within 5 ft of another within 60 ft (the engine takes it to the point; check the trees).',
      vfx: { kind: 'glow', color: 'arcane' },
    });
  const swim = /swims up to (half )?its Swim Speed|moves up to (half )?its Swim Speed/i.exec(d);
  if (swim && m.speeds?.swim) {
    const ft = swim[1] || swim[2] ? Math.floor(m.speeds.swim / 2) : m.speeds.swim;
    return flat(a, {
      target: { kind: 'point' },
      range: ft,
      move: {
        ft,
        mode: 'swim',
        ...(/without provoking/i.test(d) ? { noOpportunity: true } : {}),
        ...(/straight toward an enemy/i.test(d) ? { towardEnemy: true } : {}),
      },
      manual: "Só debaixo d'água (o Mestre confere).",
      manualEn: 'Underwater only (the DM checks).',
      vfx: { kind: 'glow', color: 'frost' },
    });
  }
  const flies = !!m.speeds?.fly;
  const base = flies ? m.speeds.fly : m.speed;
  const ft = jump ?? (move && base ? (move[1] ? Math.floor(base / 2) : base) : undefined);
  if (!ft) return a;
  const toward = /straight toward an enemy/i.test(d);
  const free = /without provoking/i.test(d);
  return flat(a, {
    target: { kind: 'point' },
    range: ft,
    move: {
      ft,
      ...(spend ? { spend } : {}),
      ...(free ? { noOpportunity: true } : {}),
      ...(toward ? { towardEnemy: true } : {}),
      mode: jump || flies ? 'fly' : 'walk',
    },
    vfx: { kind: 'glow', color: 'arcane' },
  });
}

/** Acender-se (Magmin): fica em chamas e ilumina; só uma nota por enquanto. */
function ignite(a) {
  return flat(a, {
    target: { kind: 'self' },
    range: 0,
    resolution: { kind: 'auto' },
    effect: {
      rounds: 600,
      to: 'self',
      mods: {
        note: 'Em chamas: luz plena num raio de 3 m e penumbra por mais 3 m; usar de novo apaga.',
        noteEn:
          'Ablaze: bright light in a 10 ft radius and dim light for another 10 ft; use again to put it out.',
      },
    },
    vfx: { kind: 'glow', color: 'fire' },
  });
}

/** Consumir Vida (Fogo-fátuo): quem está a 0 PV falha na Constituição e morre (a cura do fogo-fátuo o Mestre aplica). */
function consumeLife(a) {
  const dc = num(/DC (\d+)/i, a.desc);
  if (!dc || !/dies/i.test(a.desc)) return a;
  a.ability = { ...a.ability, dc };
  return flat(a, {
    target: { kind: 'creature' },
    range: 5,
    resolution: { kind: 'save', ability: 'con', onSave: 'none' },
    kill: true,
    ifHpAtMost: 0,
    manual: 'Só vale em criatura viva a 0 PV; o fogo-fátuo recupera 3d6 PV (o Mestre aplica).',
    manualEn:
      'Only works on a living creature at 0 HP; the wisp regains 3d6 HP (the DM applies it).',
    vfx: { kind: 'ray', color: 'shadow' },
  });
}

/** Filhos da Noite (Vampiro 2014): 2d4 enxames de morcegos ou ratos, ou 3d6 lobos ao ar livre. */
function childrenOfTheNight(a, ruleset) {
  const kinds = [
    ['swarm-of-bats', '2d4'],
    ['swarm-of-rats', '2d4'],
    ['wolf', '3d6'],
  ];
  const options = kinds.flatMap(([id, dice]) => {
    const o = summonOption(ruleset, id, dice, { rounds: 600 });
    return o ? [o] : [];
  });
  if (!options.length) return a;
  return flat(a, {
    ...FIELDS,
    options,
    manual:
      'Só se o sol não estiver a pino; os lobos só ao ar livre. Chegam em 1d4 rodadas (o Mestre atrasa) e ficam 1 hora, até o vampiro morrer ou ele os dispensar com uma ação bônus.',
    manualEn:
      "Only if the sun isn't up; wolves only outdoors. They arrive in 1d4 rounds (the DM delays them) and stay 1 hour, until the vampire dies or dismisses them as a bonus action.",
    vfx: { kind: 'burst', color: 'shadow', radius: 5 },
  });
}

/** Liderança (Cavaleiro): aliados escolhidos somam 1d4 em ataques e salvaguardas por 1 minuto (como a Bênção). */
function leadership(a) {
  const dice = /add a (d\d+)/i.exec(a.desc)?.[1];
  const ft = num(/within (\d+) ft/i, a.desc);
  if (!dice || !ft) return a;
  return flat(a, {
    target: { kind: 'creature', max: 8 },
    range: ft,
    resolution: { kind: 'auto' },
    effect: {
      rounds: 10,
      mods: {
        attackDie: `1${dice}`,
        saveDie: `1${dice}`,
        note: `+1${dice} em ataques e salvaguardas, só se ouvir e entender o cavaleiro; acaba se ele ficar incapacitado.`,
        noteEn: `+1${dice} on attacks and saves, only if it can hear and understand the knight; ends if the knight is incapacitated.`,
      },
    },
    vfx: { kind: 'glow', color: 'holy' },
  });
}

/** Mover (ação lendária): anda até a velocidade (ou metade) sem provocar ataques de oportunidade. */
function legendaryMove(a, m) {
  const mv = /moves up to (half )?its speed/i.exec(a.desc);
  const flies = !!m.speeds?.fly;
  const base = flies ? m.speeds.fly : m.speed;
  if (!mv || !base) return a;
  const ft = mv[1] ? Math.floor(base / 2) : base;
  return flat(a, {
    target: { kind: 'point' },
    range: ft,
    move: { ft, noOpportunity: true, mode: flies ? 'fly' : 'walk' },
    vfx: { kind: 'glow', color: 'arcane' },
  });
}

/** Redemoinho de Areia (2014): anda até 18 m sem provocar; enquanto dura, imune a dano (instantâneo). */
function whirlwind(a) {
  const ft = num(/moves up to (\d+) feet/i, a.desc);
  if (!ft || /_Trigger:_/.test(a.desc)) return a;
  return flat(a, {
    target: { kind: 'point' },
    range: ft,
    move: { ft, noOpportunity: true, mode: 'fly' },
    manual:
      'Enquanto é redemoinho é imune a todo dano e não pode ser agarrado, petrificado, derrubado, contido ou atordoado; como o movimento é instantâneo, isso só importa se o Mestre o interromper.',
    manualEn:
      'While a whirlwind it is immune to all damage and cannot be grappled, petrified, knocked prone, restrained or stunned; since the move is instant, this only matters if the DM interrupts it.',
    vfx: { kind: 'glow', color: 'arcane' },
  });
}

/** Espada Voadora (Solar, 2014): a espada larga vira um token que voa e ataca por comando. */
function flyingSword(a, ruleset) {
  if (ruleset !== '2014') return a;
  return flat(a, {
    ...FIELDS,
    range: 5,
    options: [
      {
        id: 'sword',
        label: 'Espada Voadora',
        labelEn: 'Flying Sword',
        patch: {
          summon: { custom: 'flying-sword', srd: 'sword', n: 1, rounds: 600, unique: true },
        },
      },
    ],
    vfx: { kind: 'glow', color: 'holy' },
    manual:
      'A espada paira num espaço livre a até 1,5 m; com ação bônus o Solar a comanda: voa até 15 m e ataca (+15, 4d6 + 8 cortante e 6d8 radiante) ou volta às suas mãos (dispense-a). Cai se o Solar morrer.',
    manualEn:
      'The sword hovers in a free space within 5 ft; as a bonus action the solar commands it: it flies up to 50 ft and attacks (+15, 4d6 + 8 slashing plus 6d8 radiant) or returns to its hands (dismiss it). It falls if the solar dies.',
  });
}

/** Animar Correntes (2014): até quatro correntes viram objetos que atacam junto com o diabo. */
function animateChains(a, ruleset) {
  if (ruleset !== '2014') return a;
  const options = [4, 3, 2, 1].map((n) => ({
    id: `chains-${n}`,
    label: `${n} ${n > 1 ? 'correntes' : 'corrente'}`,
    labelEn: `${n} chain${n > 1 ? 's' : ''}`,
    patch: {
      summon: {
        custom: 'animated-chain',
        srd: 'chain',
        n,
        rounds: 600,
        endsIfOwnerIncapacitated: true,
      },
    },
  }));
  return flat(a, {
    ...FIELDS,
    options,
    vfx: { kind: 'burst', color: 'steel', radius: 5 },
    manual:
      'Cada corrente é um objeto (CA 20, 20 PV, resistência a perfurante, imune a psíquico e trovejante) com a iniciativa do diabo; ataca com alcance de 3 m. Voltam a ser correntes comuns se o diabo ficar incapacitado ou morrer.',
    manualEn:
      "Each chain is an object (AC 20, 20 HP, resistant to piercing, immune to psychic and thunder) that shares the devil's initiative and attacks with a 10 ft reach. They revert to ordinary chains if the devil is incapacitated or dies.",
  });
}

/** Animar Árvores: uma ou duas árvores com a ficha do ent. */
function animateTrees(a, ruleset) {
  const opts = [1, 2].flatMap((n) => {
    const o = summonOption(ruleset, 'treant', null, { permanent: true, blockSelf: true });
    return o
      ? [
          {
            ...o,
            id: `treant-${n}`,
            label: `${n} ${n > 1 ? 'árvores' : 'árvore'}`,
            labelEn: `${n} tree${n > 1 ? 's' : ''}`,
            patch: { summon: { ...o.patch.summon, n } },
          },
        ]
      : [];
  });
  if (!opts.length) return a;
  return flat(a, {
    ...FIELDS,
    options: opts,
    vfx: { kind: 'burst', color: 'life', radius: 5 },
    manual:
      'As árvores têm a ficha do ent, mas só a Pancada, Inteligência e Carisma 1; duram 1 dia ou até o ent morrer.',
    manualEn:
      "The trees use the treant's stat block but only the Slam, with Intelligence and Charisma 1; they last 1 day or until the treant dies.",
  });
}

/** Detectar (ação lendária): teste de Sabedoria (Percepção) rolado pelo motor. */
function detect(a) {
  return flat(a, {
    target: { kind: 'self' },
    range: 0,
    resolution: { kind: 'auto' },
    check: { skill: 'perception' },
  });
}

const REACT = {
  castTime: 'reaction',
  range: 0,
  target: { kind: 'self' },
  resolution: { kind: 'auto' },
};

/** Guardião Escudo: dá o bônus de CA ao portador do amuleto (um aliado a 1,5 m) contra o golpe. */
function guardianShield(a) {
  const n = Number(
    /\+(\d+) bonus to (?:the wearer's|AC)/i.exec(a.desc)?.[1] ??
      /\+(\d+) bonus/i.exec(a.desc)?.[1] ??
      2,
  );
  return flat(a, {
    ...REACT,
    range: 5,
    react: { on: 'hit', acBonus: n, ally: 5 },
    effect: { mods: { ac: n }, rounds: 1, to: 'targets' },
    vfx: { kind: 'glow', color: 'steel' },
  });
}

/** Redirecionar Ataque: troca de lugar com um aliado Pequeno ou Médio, que vira o alvo. */
function redirectAttack(a) {
  return flat(a, {
    ...REACT,
    react: { on: 'hit', acBonus: 0, redirect: true },
    vfx: { kind: 'glow', color: 'arcane' },
    manual:
      'Indique o aliado (Pequeno ou Médio, a até 1,5 m): trocam de lugar e ele é o alvo do golpe.',
    manualEn:
      'Name the ally (Small or Medium, within 5 ft): they swap places and the ally is the target.',
  });
}

/** Desviar Projétil: reduz o dano de um ataque à distância; o dano devolvido fica com o Mestre. */
function deflectMissile(a) {
  const dice = /\((\d+d\d+(?: \+ \d+)?)\)/.exec(a.desc)?.[1].replace(/\s/g, '') ?? '1d10+6';
  const m =
    /Dexterity Saving Throw:_ DC (\d+), one creature the giant can see within (\d+) feet\. Failure: \d+ \((\d+d\d+(?: \+ \d+)?)\) (\w+) damage/i.exec(
      a.desc,
    );
  const reflect = m
    ? {
        ability: 'dex',
        dc: Number(m[1]),
        range: Number(m[2]),
        dice: m[3].replace(/\s/g, ''),
        type: m[4].toLowerCase(),
      }
    : undefined;
  return flat(a, {
    ...REACT,
    react: {
      on: 'hit',
      acBonus: 0,
      reduce: dice,
      ...(reflect ? { reflect } : {}),
    },
    vfx: { kind: 'glow', color: 'steel' },
    manual:
      'Se o dano chegar a 0, a força volta contra quem atacou (salvaguarda de Destreza, a até 18 m).',
    manualEn:
      "If the damage drops to 0, the attack's force is thrown back at the attacker (Dexterity save, within 60 ft).",
  });
}

/** Perseguição: usa o Teleporte, mas só para perto de um inimigo. */
function pursuit(a) {
  return flat(a, {
    castTime: 'reaction',
    range: 120,
    target: { kind: 'point' },
    teleport: true,
    teleportNear: 10,
    react: { on: 'moved', within: 120 },
    vfx: { kind: 'glow', color: 'arcane' },
  });
}

/** Corrige `a` no lugar quando o nome casa com um padrão conhecido. */
export function applyPattern(a, m, ruleset = '2014') {
  if (a.ability?.rider) return a;
  switch (a.en) {
    case 'Swallow':
      return swallow(a, m);
    case 'Slowing Breath':
      return control(a, 'slow');
    case 'Weakening Breath':
      return control(a, 'weak');
    case 'Repulsion Breath':
      return control(a, 'push');
    case 'Summon Demon':
    case 'Summon Mephits':
      return summonChance(a, m, ruleset);
    case 'Create Specter':
      return createSpecter(a, ruleset);
    case 'Ink Cloud':
      return inkCloud(a);
    case 'Darkness Aura':
      return darknessAura(a);
    case 'Reel':
      return reel(a);
    case 'Phantasms':
      return phantasms(a);
    case 'Etherealness':
    case 'Ethereal Jaunt':
    case 'Ethereal Stride':
      return ethereal(a);
    case 'Shapechanger':
    case 'Change Shape':
    case 'Shape-Shift':
      return shapeShift(a, m, ruleset);
    case 'Whirlwind of Sand':
      return whirlwind(a);
    case 'Channel Negative Energy':
      return negativeEnergy(a);
    case 'Leap':
    case 'Charge':
    case 'Prowl':
    case 'Aquatic Charge':
    case 'Bubble Dash':
    case 'Tree Stride':
      return hop(a, m);
    case 'Ignited Illumination':
      return ignite(a);
    case 'Consume Life':
      return consumeLife(a);
    case 'Children of the Night':
      return childrenOfTheNight(a, ruleset);
    case 'Leadership':
      return leadership(a);
    case 'Move':
      return legendaryMove(a, m);
    case 'Flying Sword':
      return flyingSword(a, ruleset);
    case 'Animate Chains':
      return animateChains(a, ruleset);
    case 'Animate Trees':
      return animateTrees(a, ruleset);
    case 'Detect':
      return /Perception/.test(a.desc) ? detect(a) : a;
    case 'Redirect Attack':
      return redirectAttack(a);
    case 'Deflect Missile':
      return deflectMissile(a);
    case 'Pursuit':
      return pursuit(a);
    case 'Protection':
    case 'Shield':
      return /amulet/.test(a.desc) ? guardianShield(a) : a;
  }
  return a;
}
