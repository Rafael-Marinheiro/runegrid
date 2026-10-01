// Camada automática das regras de monstros: lê o texto do SRD e produz as regras que não precisam de
// decisão humana (traços por nome, ataques com consequência, ações com salvaguarda/ataque). As regras
// escritas à mão em 2014-*.mjs / 2024-*.mjs têm prioridade e podem desligar o automático (`skip`).
import { parseAbility } from './parse.mjs';

export const slug = (s) =>
  s
    .replace(/\s*\(.*\)\s*$/, '')
    .toLowerCase()
    .replace(/^variant: /, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const plain = (n) => n.replace(/\s*\(.*\)\s*$/, '').trim();
const cleanName = (n) =>
  n
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/^Variant: /, '')
    .trim();
const num = (s) => Number(String(s).replace(',', '.'));

/** Traços que o motor aplica sozinhos, por nome. Cada função recebe o texto e devolve `mods` (ou null). */
const TRAITS = {
  'Magic Resistance': () => ({ magicResistance: true }),
  'Greater Magic Resistance': () => ({ magicResistance: true }),
  'Pack Tactics': () => ({ packTactics: true }),
  Flyby: () => ({ noOpportunity: true }),
  'Blood Frenzy': () => ({ bloodFrenzy: true }),
  'Undead Fortitude': () => ({ undeadFortitude: true }),
  'Legendary Resistance': (d, name) => {
    const m = /\((\d+)\/Day\)/i.exec(name);
    return { legendaryResistance: m ? Number(m[1]) : 3 };
  },
  Relentless: (d) => {
    const m = /(\d+) damage or less/i.exec(d);
    return m ? { relentless: Number(m[1]) } : null;
  },
  Regeneration: (d) => {
    const m = /regains? (\d+) hit points at the start/i.exec(d);
    if (!m) return null;
    const stops = [
      'acid',
      'bludgeoning',
      'cold',
      'fire',
      'force',
      'lightning',
      'necrotic',
      'piercing',
      'poison',
      'psychic',
      'radiant',
      'slashing',
      'thunder',
    ].filter(
      (t) =>
        new RegExp(`takes? (?:[a-z ,]+ or )?${t}(?: or [a-z]+)? damage`, 'i').test(d) ||
        new RegExp(`\\b${t}\\b[^.]*doesn't function`, 'i').test(d),
    );
    return { regen: Number(m[1]), ...(stops.length ? { regenStops: stops } : {}) };
  },
  'Heated Body': (d) => retaliate(d),
  'Fire Aura': () => null,
  'Martial Advantage': (d) => {
    const m = /extra \d+ \((\d+d\d+)\) damage/i.exec(d);
    return m ? { allyBonus: { dice: m[1] } } : null;
  },
};

function retaliate(d) {
  const m = /takes \d+ \((\d+d\d+)\) (\w+) damage/i.exec(d);
  return m
    ? { retaliate: { dice: m[1], type: m[2].toLowerCase(), melee: /melee attack/i.test(d) } }
    : null;
}

export function autoTraits(m, ptName) {
  const out = {};
  for (const t of m.traits) {
    const key = plain(t.name);
    const fn = TRAITS[key];
    if (!fn) continue;
    const mods = fn(t.desc, t.name);
    if (!mods) continue;
    out[slug(t.name)] = {
      pt: ptName(t.name),
      en: cleanName(t.name),
      mods,
      desc: t.desc,
      auto: true,
    };
  }
  return out;
}

/** Anotação de fuga de agarrão: "escape DC 13". */
export function escapeNote(text) {
  const m = /escape DC (\d+)/i.exec(text);
  if (!m) return {};
  return {
    manual: `Agarrado: escapa com um teste de Força (Atletismo) ou Destreza (Acrobacia) contra CD ${m[1]}.`,
    manualEn: `Grappled: escapes with a Strength (Athletics) or Dexterity (Acrobatics) check against DC ${m[1]}.`,
  };
}

/** Observações que o motor não aplica sozinho, ditas ao Mestre (os mesmos trechos se repetem em vários monstros). */
export function extraNotes(text) {
  const pt = [];
  const en = [];
  if (/fails by 5 or more|result is 5 or lower/i.test(text)) {
    pt.push(
      'Se falhar por 5 ou mais, o alvo também fica inconsciente enquanto envenenado; acorda ao sofrer dano ou se alguém usar uma ação para sacudi-lo.',
    );
    en.push(
      'If the save fails by 5 or more, the target is also unconscious while poisoned; it wakes on taking damage or when someone uses an action to shake it.',
    );
  }
  if (/reduces the target to 0 hit points, the target is stable but poisoned/i.test(text)) {
    pt.push(
      'Se o veneno reduzir o alvo a 0 PV, ele fica estável e envenenado por 1 hora, paralisado enquanto envenenado.',
    );
    en.push(
      'If the poison reduces the target to 0 HP, it is stable but poisoned for 1 hour, paralyzed while poisoned.',
    );
  }
  if (/hit point maximum/i.test(text)) {
    pt.push(
      'Os PV máximos reduzidos voltam depois de um descanso longo (ou magia que remova o efeito); a 0 o alvo morre.',
    );
    en.push(
      'The reduced hit point maximum returns after a long rest (or a spell that removes it); at 0 the target dies.',
    );
  }
  return pt.length ? { manual: pt.join(' '), manualEn: en.join(' ') } : {};
}

// ---------- ataques com consequência ----------

const DAMAGE = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
];
const CONDS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
];
const AB = {
  Strength: 'str',
  Dexterity: 'dex',
  Constitution: 'con',
  Intelligence: 'int',
  Wisdom: 'wis',
  Charisma: 'cha',
};

function rounds(text) {
  const m = /for (?:up to )?(\d+) (round|minute|hour|day)s?/i.exec(text);
  if (m) return Number(m[1]) * { round: 1, minute: 10, hour: 600, day: 14400 }[m[2].toLowerCase()];
  if (/until the end of (?:its|the \w+'s) next turn/i.test(text)) return 1;
  return 0;
}

/**
 * O que um ataque de arma faz além do dano base: dano extra ("plus 7 (3d4) poison damage"),
 * salvaguarda depois do acerto (veneno, derrubar, paralisia) e condições (agarrar). Devolve `null`
 * se não há nada além do dano.
 */
export function parseAttackRider(desc) {
  const hit = desc.replace(/\*\*/g, '').replace(/\s+/g, ' ');
  // 5.1: "... Hit: 7 (1d8 + 3) piercing damage, and ..."; 5.2: "Melee Attack Roll: +4, reach 5 ft. 5 (1d6 + 2) Piercing damage. If ..."
  const h = hit.indexOf('Hit:');
  let body =
    h >= 0
      ? hit.slice(h + 4)
      : hit.replace(/^[^.]*?(?:reach|range) [^.]*?ft\.(?:\/\d+ ft\.)?/i, '');
  const base = /^\s*(?:\d+ \((\d+d\d+(?: ?[+-] ?\d+)?)\)|\d+) (\w+) damage/i.exec(body);
  if (base) body = body.slice(base[0].length);
  else if (/^\s*Hit: /.test(hit.slice(h)) && h >= 0) body = hit.slice(h + 4);
  else if (h >= 0) return null;
  body = body.trim();
  if (!body || /^\.?$/.test(body)) return null;

  const rule = {};
  const notes = [];
  // dano extra sem salvaguarda: "plus 7 (3d4) poison damage"
  const extra = [];
  const rp = /(?:plus|an extra|extra) \d+ \((\d+d\d+(?: ?[+-] ?\d+)?)\) (\w+) damage/gi;
  let m;
  const bodyNoPlus = body.replace(rp, (all, dice, type) => {
    extra.push({ dice: dice.replace(/\s+/g, ''), type: type.toLowerCase() });
    return '';
  });
  if (extra.length)
    ((rule.damage = extra[0]), extra.length > 1 && (rule.extraDamage = extra.slice(1)));

  const sv =
    /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(
      bodyNoPlus,
    ) ??
    /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)/.exec(
      bodyNoPlus,
    );
  const conds = [];
  const effectText = bodyNoPlus
    .split(/(?<=\.)\s+/)
    .filter(
      (sn) =>
        !/reduces the target to 0 hit points|fails by 5 or more|result is 5 or lower/i.test(sn),
    )
    .join(' ');
  for (const c of CONDS) {
    const rx = new RegExp(
      `\\b(?:be|is|becomes?|become|are|fall|falls) (?:instead )?(?:\\w+ )?${c}\\b|knocked ${c}\\b|has the ${c} condition|have the ${c} condition`,
      'i',
    );
    const hitC = rx.exec(effectText);
    if (hitC) conds.push({ name: c, rounds: rounds(effectText.slice(hitC.index)) });
  }
  if (sv) {
    const [saveDc, saveAb] = /^\d/.test(sv[1])
      ? [Number(sv[1]), AB[sv[2]]]
      : [Number(sv[2]), AB[sv[1]]];
    const dmg = [];
    const rd = /(?:taking|takes?|suffers?) \d+ \((\d+d\d+(?: ?[+-] ?\d+)?)\) (\w+) damage/gi;
    while ((m = rd.exec(bodyNoPlus)))
      dmg.push({ dice: m[1].replace(/\s+/g, ''), type: m[2].toLowerCase() });
    const half = /half as much damage/i.test(bodyNoPlus);
    rule.dc = saveDc;
    rule.onHitSave = {
      ability: saveAb,
      onSave: half ? 'half' : 'none',
      ...(dmg.length ? { damage: dmg[0] } : {}),
      ...(dmg.length > 1 ? { extraDamage: dmg.slice(1) } : {}),
      ...(conds.length ? { condition: conds.length === 1 ? conds[0] : conds } : {}),
    };
    if (!dmg.length && !conds.length) notes.push('salvaguarda sem efeito lido');
  } else if (conds.length) {
    // condição sem salvaguarda (agarrar com CD de fuga, derrubar): vale no acerto
    const esc = /escape DC (\d+)/i.exec(bodyNoPlus);
    if (esc) rule.dc = Number(esc[1]);
    const names = new Set(conds.map((c) => c.name));
    if (names.has('grappled') && /restrained/i.test(bodyNoPlus)) names.add('restrained');
    rule.condition = [...names].map((name) => ({
      name,
      rounds: conds.find((c) => c.name === name)?.rounds ?? 0,
    }));
    if (rule.condition.length === 1) rule.condition = rule.condition[0];
  }
  // Investida/Bote (5.2): "moved 20+ feet straight toward it immediately before the hit"
  const mv = /moved (\d+)\+? (?:feet|ft)\.? straight toward/i.exec(bodyNoPlus);
  if (mv) rule.moveFt = Number(mv[1]);
  // PV máximos reduzidos pelo dano causado (Dreno de Vida, Beijo Drenante)
  if (
    /hit point maximum (?:is|decreases|reduced)[^.]*(?:damage taken|amount equal)/i.test(
      bodyNoPlus,
    ) &&
    rule.onHitSave
  )
    rule.onHitSave.drainMaxHp = true;
  if (!rule.damage && !rule.onHitSave && !rule.condition) return null;
  const a = escapeNote(bodyNoPlus);
  const b = extraNotes(bodyNoPlus);
  if (a.manual || b.manual)
    Object.assign(rule, {
      manual: [a.manual, b.manual].filter(Boolean).join(' '),
      manualEn: [a.manualEn, b.manualEn].filter(Boolean).join(' '),
    });
  return { rule, rest: bodyNoPlus };
}

// ---------- ações ----------

const SKIP = new Set([
  'Multiattack',
  'Spellcasting',
  'Innate Spellcasting',
  'Variant: Innate Spellcasting',
  'Shared Spellcasting',
  'Nimble Escape',
  'Cunning Action',
]);

export function isSkipped(name) {
  return SKIP.has(plain(name));
}

/** Teleporte: "teleports ... up to 40 ft. to an unoccupied space". */
function teleport(desc) {
  const m = /teleports?[^.]*?up to (\d+) (?:feet|ft)/i.exec(desc);
  return m ? Number(m[1]) : null;
}

/** "makes one X attack" / "makes a tail attack" / "makes one attack with its rotting fist": repete um ataque do monstro. */
function repeatsAttack(desc, attackNames) {
  const m =
    /makes? (?:a|an|one|two) ([\w' -]+?) attacks?\b(?: with (?:its )?([\w' -]+?)(?: or|\.|,|$))?/i.exec(
      desc,
    );
  if (!m) return null;
  const want = (m[2] ?? m[1]).toLowerCase();
  return (
    attackNames.find(
      (n) =>
        n.toLowerCase() === want ||
        n.toLowerCase().startsWith(want) ||
        want.startsWith(n.toLowerCase()),
    ) ?? null
  );
}

const spellSlug = (name) =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/'/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/ +/g, '-');

/** Magias citadas em "casts A, B, or C" (com a versão de nível, se o texto a cita). */
function castsSpells(desc) {
  const m =
    /\bcasts?(?: the)? ([A-Z][\w' /]*?(?:(?:, | or | and )(?:or )?[A-Z][\w' /]*?)*?)(?: spell| on itself| on that creature| in response| twice|,? requiring|,? using|,? and it| \(|\.)/.exec(
      desc,
    );
  if (!m) return [];
  const names = m[1]
    .split(/,\s*(?:or\s+)?|\s+or\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const level = /\(level (\d+) version\)/i.exec(desc);
  return names.map((n) => ({
    id: spellSlug(n),
    name: n,
    level: level ? Number(level[1]) : undefined,
  }));
}

export function autoAbility(item, kind, m, ptName) {
  const name = plain(item.name);
  const attackNames = m.attacks.map((a) => a.name);
  const rule = { pt: ptName(item.name), en: cleanName(item.name), desc: item.desc, auto: true };
  const text = item.desc.replace(/_/g, '');
  // Aparar / Riposta: reação que soma à CA contra um golpe corpo a corpo
  const parry = /adds (\d+) to (?:its|their) AC (?:against|until)/i.exec(text);
  if (parry && kind === 'reaction') {
    Object.assign(rule, {
      castTime: 'reaction',
      range: 0,
      target: { kind: 'self' },
      resolution: { kind: 'auto' },
      react: { on: 'hit', acBonus: Number(parry[1]), melee: /melee attack/i.test(text) },
      effect: { mods: { ac: Number(parry[1]) }, rounds: 1, to: 'self' },
      vfx: { kind: 'glow', color: 'steel' },
    });
    return rule;
  }
  // invisibilidade em si mesmo
  if (
    /(?:magically )?turns invisible|casts Invisibility on itself|have the Invisible condition|has the Invisible condition/i.test(
      text,
    ) &&
    !/each creature|saving throw/i.test(text)
  ) {
    Object.assign(rule, {
      range: 0,
      target: { kind: 'self' },
      resolution: { kind: 'auto' },
      condition: { name: 'invisible', rounds: 0, endsOnAttack: true },
      vfx: { kind: 'glow', color: 'arcane' },
    });
    return rule;
  }
  // cura (toque ou em si)
  const heal =
    /(?:magically )?regains? \d+ \((\d+d\d+(?: ?\+ ?\d+)?)\) hit points/i.exec(text) ??
    /regains? (?:\d+ \()?(\d+d\d+(?: ?\+ ?\d+)?)\)? Hit Points/i.exec(text);
  if (
    heal &&
    !/saving throw|damage|bite/i.test(
      text.replace(/\b(?:poison|curse|disease|neutralizes)\b/gi, ''),
    )
  ) {
    const self = /regains .* hit points\.?$/i.test(text.trim()) && !/touches/i.test(text);
    Object.assign(rule, {
      range: self ? 0 : 5,
      target: self ? { kind: 'self' } : { kind: 'creature' },
      resolution: { kind: 'auto' },
      heal: { dice: heal[1].replace(/\s+/g, '') },
      vfx: { kind: 'glow', color: 'life' },
    });
    return rule;
  }
  const spellsCast = castsSpells(text);
  if (spellsCast.length && !/saving throw|DC \d+ /i.test(text.replace(/spell save DC \d+/i, ''))) {
    const one = (sp) => ({
      ...rule,
      ability: { spell: { id: sp.id, ...(sp.level ? { level: sp.level } : {}) } },
      spellName: sp.name,
    });
    if (spellsCast.length === 1) return one(spellsCast[0]);
    // "casts A, B, or C": uma habilidade por magia
    return {
      multi: spellsCast.map((sp) => ({
        ...one(sp),
        pt: `${rule.pt} (${sp.name})`,
        en: `${rule.en} (${sp.name})`,
        suffix: sp.id,
      })),
    };
  }
  const tp = teleport(text);
  const rep = repeatsAttack(text, attackNames);
  if (rep && (kind === 'legendary' || kind === 'bonus') && !/saving throw|DC \d+/.test(text)) {
    rule.ability = { attack: rep };
    rule.target = { kind: 'creature' };
    rule.range = 5;
    return rule;
  }
  if (tp) {
    Object.assign(rule, { range: tp, target: { kind: 'point' }, teleport: true });
    return rule;
  }
  // ataque de arma/magia fora da lista de ataques (forma híbrida, Teia, Mordida com maldição…)
  const header =
    /^(?:Melee|Ranged)(?: or (?:Melee|Ranged))?(?: Weapon| Spell)? Attack(?: Roll)?: \+(\d+)/i.exec(
      text.trim(),
    );
  const base =
    /(?:Hit: |ft\.\)? |reach \d+ ?(?:ft|feet)\.? )(\d+ \()?(\d+d\d+(?: ?[+-] ?\d+)?)\)? (\w+) damage/i.exec(
      text,
    );
  if (header && base && DAMAGE.includes(base[3].toLowerCase())) {
    const rg =
      /range (\d+)(?:\/\d+)? ?(?:ft|feet)/i.exec(text) ?? /reach (\d+) ?(?:ft|feet)/i.exec(text);
    const r = parseAttackRider(item.desc);
    Object.assign(rule, {
      resolution: { kind: 'attack' },
      target: { kind: 'creature' },
      range: rg ? Number(rg[1]) : 5,
      damage: { dice: base[2].replace(/\s+/g, ''), type: base[3].toLowerCase() },
      ...(r
        ? {
            ...r.rule,
            extraDamage: [...(r.rule.damage ? [r.rule.damage] : []), ...(r.rule.extraDamage ?? [])],
          }
        : {}),
      ability: { attackBonus: Number(header[1]), ...(r?.rule.dc ? { dc: r.rule.dc } : {}) },
    });
    if (rule.extraDamage && !rule.extraDamage.length) delete rule.extraDamage;
    return rule;
  }
  const { rule: p } = parseAbility(item.desc);
  const grappledOnly =
    /(?:creature|target|humanoid)s?(?: that is| that's)? grappled by (?:the|it)|Grappled by the \w+/i.test(
      text,
    );
  if (
    (p.resolution?.kind === 'save' || p.resolution?.kind === 'attack') &&
    (p.damage || p.condition)
  ) {
    const { dc, attackBonus, ...fields } = p;
    Object.assign(rule, fields, {
      ability: { ...(dc ? { dc } : {}), ...(attackBonus !== undefined ? { attackBonus } : {}) },
    });
    if (
      /can repeat the saving throw|repeats? the saving throw/i.test(item.desc) &&
      rule.condition
    ) {
      const list = [].concat(rule.condition).map((c) => ({ ...c, repeatSave: true }));
      rule.condition = list.length === 1 ? list[0] : list;
    }
    Object.assign(rule, escapeNote(item.desc));
    if (grappledOnly) {
      rule.ability = { ...rule.ability, needsGrappled: true };
      rule.target = { kind: 'creature', ...(/each creature/i.test(text) ? { max: 4 } : {}) };
      rule.range = 5;
    }
    return rule;
  }
  rule.narrative = true;
  rule.target = { kind: 'self' };
  return rule;
}

// ---------- conjuração inata (à vontade, N/dia) ----------

const ABILITY_IDX = {
  strength: 0,
  dexterity: 1,
  constitution: 2,
  intelligence: 3,
  wisdom: 4,
  charisma: 5,
};

/** CD e bônus de ataque de magia a partir dos atributos e do ND (quando o texto não os traz). */
export function castingNumbers(m, abilityName) {
  const prof = 2 + Math.floor((Math.max(1, Math.ceil(m.cr)) - 1) / 4);
  const idx = ABILITY_IDX[(abilityName ?? 'charisma').toLowerCase()] ?? 5;
  const mod = Math.floor((m.abilities[idx] - 10) / 2);
  return { dc: 8 + prof + mod, attack: prof + mod };
}

const cleanSpell = (n) =>
  n
    .replace(/\(.*?\)/g, '')
    .replace(/[_*]/g, '')
    .trim();

/** Lista de magias inatas de um trecho de conjuração: "At will: a, b" / "1/day each: c" / "**2/Day Each:** d". */
export function parseInnate(text) {
  const out = [];
  const t = text.replace(/\*\*/g, '');
  for (const line of t.split(/\n|\s-\s(?=At Will|\d)/)) {
    const mm = /^\s*[-*]?\s*(At will|\d+\/day(?: each)?)\s*:\s*(.+)$/i.exec(line.trim());
    if (!mm) continue;
    const freq = /at will/i.test(mm[1]) ? null : Number(/(\d+)/.exec(mm[1])[1]);
    for (const n of mm[2].split(/,\s*/)) {
      const name = cleanSpell(n);
      if (name) out.push({ name, uses: freq });
    }
  }
  if (!out.length) {
    // variante "The mephit can innately cast _blur_" (1/dia pelo nome do traço)
    const v = /innately cast _?([A-Za-z' /]+?)_?,/.exec(text);
    if (v) out.push({ name: cleanSpell(v[1]), uses: 1 });
  }
  return out;
}

export function autoInnate(m, kindOf, ptName) {
  const out = {};
  const sources = [...m.traits, ...m.actions].filter(
    (t) => /Spellcasting/i.test(t.name) && !/Shared/i.test(t.name),
  );
  for (const t of sources) {
    // conjuradores com espaços (Cantrips + "1st level (3 slots)") são tratados na ficha
    if (/Cantrips \(at will\)|\(\d+ slots?\)/i.test(t.desc)) continue;
    const abilityName =
      /(?:spellcasting ability is|using) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i.exec(
        t.desc,
      )?.[1];
    const dcText = /spell save DC (\d+)/i.exec(t.desc);
    const atkText = /\+(\d+) to hit with spell attacks/i.exec(t.desc);
    const nums = castingNumbers(m, abilityName);
    const dailyFromName = /\((\d+)\/Day\)/i.exec(t.name);
    for (const sp of parseInnate(t.desc)) {
      const id = spellSlug(sp.name);
      const uses = dailyFromName ? Number(dailyFromName[1]) : sp.uses;
      out[`innate-${id}`] = {
        pt: sp.name,
        en: sp.name,
        desc: t.desc,
        auto: true,
        innate: true,
        ability: {
          spell: { id },
          ...(uses ? { uses: { n: uses, per: 'day' } } : {}),
          dc: dcText ? Number(dcText[1]) : nums.dc,
          attackBonus: atkText ? Number(atkText[1]) : nums.attack,
        },
      };
    }
  }
  return out;
}
