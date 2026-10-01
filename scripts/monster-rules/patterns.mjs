// Habilidades que o leitor automático não entende e que se repetem entre monstros (Engolir, sopros de
// controle). Lê os números do texto oficial; o que não cabe no motor vai para a nota `manual`.
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
    case 'Animate Trees':
      return animateTrees(a, ruleset);
  }
  return a;
}
