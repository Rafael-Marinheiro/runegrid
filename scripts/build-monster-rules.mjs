// Gera public/data/monster-rules.json (SRD 2014) e monster-rules-2024.json (SRD 2024) a partir de scripts/monster-rules/*.mjs.
// Cada módulo exporta { 'id-do-monstro': { legendary?, abilities: { slug: rule } } }; o texto oficial da habilidade
// (`desc`) vem do JSON do SRD, procurado pelo nome em inglês (`en`). Uso: node scripts/build-monster-rules.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAbility, report } from './monster-rules/parse.mjs';
import { applyPattern } from './monster-rules/patterns.mjs';
import {
  autoAbility,
  autoInnate,
  autoTraits,
  castingNumbers,
  isSkipped,
  parseAttackRider,
  slug,
} from './monster-rules/auto.mjs';
import PT_NAMES from './monster-rules/names.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'scripts', 'monster-rules');
const srd = (f) => JSON.parse(readFileSync(join(root, 'public', 'data', f), 'utf8'));
const base = (id) => id.replace(/^srd-2024_/, '');
const cleanName = (n) =>
  n
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/^Variant: /, '')
    .trim();
const plainName = (n) => cleanName(n).toLowerCase();

/** Pés/milhas do texto em pt-BR viram metros/km (mesma regra de `core/rules/units.ts`). */
function ptUnits(text) {
  const dec = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  return text
    .replace(
      /(\d+(?:[.,]\d+)?)[- ]?(?:ft\.?|feet|foot)(?![a-z])/gi,
      (_, n) => `${dec(Number(n.replace(',', '.')) * 0.3)} m`,
    )
    .replace(
      /(\d+(?:[.,]\d+)?)[- ]?miles?/gi,
      (_, n) => `${dec(Number(n.replace(',', '.')) * 1.6)} km`,
    );
}

const COLOR = {
  fire: 'fire',
  cold: 'frost',
  lightning: 'lightning',
  poison: 'poison',
  acid: 'acid',
  thunder: 'thunder',
  necrotic: 'shadow',
  radiant: 'holy',
  psychic: 'psychic',
  force: 'force',
};
const COND_COLOR = {
  frightened: 'psychic',
  charmed: 'psychic',
  paralyzed: 'steel',
  restrained: 'steel',
  poisoned: 'poison',
  blinded: 'arcane',
  stunned: 'arcane',
};

/** Efeito visual padrão a partir do que a habilidade faz (a regra pode escrever o seu). */
function defaultVfx(r) {
  const dmgType = r.damage?.type;
  const first = [].concat(r.condition ?? [])[0]?.name;
  const color =
    (dmgType && COLOR[dmgType]) || (first && COND_COLOR[first]) || (dmgType ? 'steel' : 'arcane');
  const t = r.target ?? {};
  if (t.kind === 'cone') return { kind: 'cone', color };
  if (t.kind === 'line') return { kind: 'ray', color };
  if (t.kind === 'sphere' || t.kind === 'cube') return { kind: 'burst', color };
  if (t.kind === 'point') return { kind: 'glow', color };
  if (t.kind === 'self') return { kind: 'glow', color };
  return (r.range ?? 5) > 5 ? { kind: 'ray', color } : { kind: 'glow', color };
}

/** Custo, recarga e usos do que o SRD diz sobre a ação (nome com "(Recharge 5-6)", tipo e usos do 5.2). */
function inferCost(monster, name, rules) {
  const find = (list) => list.find((t) => plainName(t.name) === plainName(name));
  const act = find(monster.actions);
  const leg = find(monster.legendary?.actions ?? []);
  const rea = find(monster.reactions ?? []);
  const src = act ?? leg ?? rea;
  const out = { cost: 'action' };
  if (leg) {
    out.cost = 'legendary';
    if (leg.cost > 1) out.legendary = leg.cost;
  } else if (rea) out.cost = 'reaction';
  else if (act?.type === 'legendary') {
    out.cost = 'legendary';
    if ((act.cost ?? 1) > 1) out.legendary = act.cost;
  } else if (act?.type === 'reaction') out.cost = 'reaction';
  else if (act?.type === 'bonus') out.cost = 'bonus';
  const n = src?.name ?? '';
  let m;
  if (act?.uses) {
    if (act.uses.type === 'recharge') out.recharge = act.uses.n;
    else if (act.uses.type === 'day') out.uses = { n: act.uses.n ?? 1, per: 'day' };
    else out.uses = { n: 1, per: 'rest' };
  } else if ((m = /Recharge (\d)/i.exec(n))) out.recharge = Number(m[1]);
  else if ((m = /\((\d+)\/Day\)/i.exec(n))) out.uses = { n: Number(m[1]), per: 'day' };
  else if (/Recharges after a Short or Long Rest/i.test(n)) out.uses = { n: 1, per: 'rest' };
  return out;
}

async function collect(prefix) {
  const out = {};
  for (const f of readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.mjs'))
    .sort()) {
    const mod = (await import(pathToFileURL(join(dir, f)).href)).default;
    for (const [id, rule] of Object.entries(mod)) {
      const cur = (out[id] ??= { abilities: {} });
      if (rule.legendary) cur.legendary = rule.legendary;
      for (const [slug, a] of Object.entries(rule.abilities ?? {})) {
        if (slug in cur.abilities) throw new Error(`${f}: ${id}/${slug} repetido`);
        cur.abilities[slug] = a;
      }
      for (const [slug, t] of Object.entries(rule.traits ?? {})) {
        cur.traits ??= {};
        if (slug in cur.traits) throw new Error(`${f}: ${id}/trait ${slug} repetido`);
        cur.traits[slug] = t;
      }
    }
  }
  return out;
}

const review = [];
const flags = [];
const SPELL_IDS = new Set([
  ...srd('spells.json').map((x) => x.id),
  ...srd('spells-2024.json').map((x) => x.id.replace(/^srd-2024_/, '')),
]);

/** Confere o que foi lido contra o texto: CD, dados de dano e condições citados que não entraram na regra. */
function audit(id, slugName, a, file = '') {
  const text = a.desc.replace(/\*\*/g, '');
  const issues = [];
  const json = JSON.stringify({ ...a, desc: undefined });
  for (const m of text.matchAll(/DC (\d+)/g))
    if (!json.includes(`"dc":${m[1]}`) && !json.includes(`CD ${m[1]}`) && !a.narrative)
      issues.push(`DC ${m[1]} não lida`);
  let first = !!a.ability?.rider;
  for (const m of text.matchAll(/\((\d+d\d+(?: ?[+-] ?\d+)?)\) (\w+) damage/gi)) {
    if (first) {
      first = false;
      continue;
    }
    const dice = m[1].replace(/\s+/g, '');
    if (!json.includes(`"dice":"${dice}"`) && !a.narrative)
      issues.push(`dano ${dice} ${m[2]} não lido`);
  }
  for (const c of [
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
  ]) {
    if (
      new RegExp(`\\b${c}\\b`, 'i').test(text) &&
      !json.includes(`"name":"${c}"`) &&
      !a.narrative &&
      !a.manual
    )
      issues.push(`condição ${c} não lida`);
  }
  if (a.narrative) issues.push('narrativa');
  if (issues.length)
    flags.push(
      `${file.includes('2024') ? '24' : '14'} ${id} / ${slugName} [${issues.join('; ')}]\n    ${text.slice(0, 420).replace(/\n/g, ' ')}`,
    );
}

/** Trecho de uma ação com várias opções ("**Fire Breath.** …"). */
function sectionOf(desc, name) {
  const i = desc.indexOf(`**${name}.**`);
  if (i < 0) return desc;
  const rest = desc.slice(i);
  const j = rest.indexOf('**', 4 + name.length);
  return (j > 0 ? rest.slice(0, j) : rest).replace(/\*\*/g, '').trim();
}

/** Nomes de magias em pt-BR, lidos do glossário do app (`names-pt.ts`). */
const SPELL_PT = new Map(
  [
    ...readFileSync(join(root, 'src/app/core/rules/srd/names-pt.ts'), 'utf8')
      .split('export const SPELL_NAMES_PT')[1]
      .split('export const monsterNamePt')[0]
      .matchAll(/^\s*(?:'([^']+)'|(\w+)): '([^']+)',$/gm),
  ].map((m) => [(m[1] ?? m[2]).toLowerCase(), m[3]]),
);

/** Tradução pt-BR dos nomes de habilidades (sem entrada, fica o nome em inglês). */
function ptName(name) {
  const m = /^(.*?)\s*\((.*)\)\.?\s*$/.exec(name);
  const one = (n) =>
    PT_NAMES[plainName(n)] ?? SPELL_PT.get(plainName(n)) ?? n.replace(/^Variant: /, '');
  if (m && SPELL_PT.has(plainName(m[2]))) return `${one(m[1])} (${one(m[2])})`;
  return one(m && !/^(Recharge|\d)/.test(m[2]) && !SPELL_PT.has(plainName(m[2])) ? m[1] : name);
}

/** Itens do SRD que podem virar habilidade, com o tipo (ação, bônus, reação, lendária). */
function itemsOf(m) {
  const items = [];
  for (const a of m.actions) {
    const kind =
      a.type === 'legendary'
        ? 'legendary'
        : a.type === 'reaction'
          ? 'reaction'
          : a.type === 'bonus'
            ? 'bonus'
            : 'action';
    items.push({ item: a, kind });
  }
  for (const a of m.reactions ?? []) items.push({ item: a, kind: 'reaction' });
  for (const a of m.legendary?.actions ?? []) items.push({ item: a, kind: 'legendary' });
  return items;
}

/** Regras automáticas de um monstro (traços por nome, riders de ataque, ações lidas do texto). */
function autoEntry(m) {
  const entry = { abilities: {}, traits: autoTraits(m, ptName) };
  const attackNames = new Set(m.attacks.map((a) => plainName(a.name)));
  const legendNarrative = [];
  for (const { item, kind } of itemsOf(m)) {
    if (isSkipped(item.name)) continue;
    const key = slug(item.name);
    if (attackNames.has(plainName(item.name)) && kind === 'action') {
      // ataque de arma comum: só interessa o que ele faz além do dano
      const r = parseAttackRider(item.desc);
      if (!r) continue;
      const { dc, moveFt, ...fields } = r.rule;
      const atk = m.attacks.find((a) => plainName(a.name) === plainName(item.name));
      entry.abilities[`rider-${key}`] = {
        pt: ptName(item.name),
        en: cleanName(item.name),
        desc: item.desc,
        auto: true,
        ability: {
          cost: 'free',
          rider: atk.name,
          ...(dc ? { dc } : {}),
          ...(moveFt ? { moveFt } : {}),
        },
        ...fields,
        target: { kind: 'creature' },
      };
      continue;
    }
    // ação lendária com o nome de um ataque ("Unarmed Strike"): faz esse ataque
    if (kind === 'legendary' && attackNames.has(plainName(item.name))) {
      const atk = m.attacks.find((x) => plainName(x.name) === plainName(item.name));
      entry.abilities[`${key}-legendary`] = {
        pt: ptName(item.name),
        en: cleanName(item.name),
        desc: item.desc,
        auto: true,
        ability: { cost: 'legendary', attack: atk.name },
        target: { kind: 'creature' },
        range: atk.range,
      };
      continue;
    }
    // "Breath Weapons": várias opções com a mesma recarga ("**Fire Breath.** … **Sleep Breath.** …")
    const heads = [...item.desc.matchAll(/\*\*([A-Z][A-Za-z' ]+?)\.\*\*/g)];
    if (heads.length >= 2 && /one of the following|following breath/i.test(item.desc)) {
      heads.forEach((h, i) => {
        const body = item.desc
          .slice(h.index + h[0].length, heads[i + 1]?.index ?? undefined)
          .trim();
        const sub = autoAbility({ name: h[1], desc: `${h[1]}. ${body}` }, kind, m, ptName);
        sub.from = item.name;
        sub.ability = { ...(sub.ability ?? {}), group: slug(item.name) };
        entry.abilities[`${key}-${slug(h[1])}`] = sub;
      });
      continue;
    }
    const made = autoAbility(item, kind, m, ptName);
    if (made.multi)
      for (const sub of made.multi) {
        const { suffix, ...rest } = sub;
        entry.abilities[`${key}-${suffix}`] = rest;
      }
    else if (kind === 'legendary' && entry.abilities[key] && !entry.abilities[key].ability?.rider) {
      // a ação lendária de mesmo nome só repete a ação (Tempestade de Raios do Kraken)
      const { legendary: _l, ...own } = entry.abilities[key].ability ?? {};
      entry.abilities[key].ability = { ...own, cost: 'action' };
      made.ability = { ...(made.ability ?? {}), invoke: key };
      entry.abilities[`${key}-legendary`] = made;
    } else {
      entry.abilities[key] = made;
      if (kind === 'legendary' && made.narrative) legendNarrative.push(key);
    }
  }
  // "The kraken uses Lightning Strike": a ação lendária repete a ação de outro nome
  for (const key of legendNarrative) {
    const a = entry.abilities[key];
    const want = /\buses? (?:its )?([\w' -]+?)\.(?:\s|$)/i.exec(a.desc.trim())?.[1];
    const hit = Object.entries(entry.abilities).find(
      ([k, x]) =>
        k !== key && want && x.en.toLowerCase() === want.toLowerCase() && !x.ability?.rider,
    );
    if (hit) a.ability = { ...(a.ability ?? {}), invoke: hit[0] };
  }
  Object.assign(entry.abilities, autoInnate(m, null, ptName));
  // Explosão de Morte / Estertor (traço): dispara quando o monstro morre
  for (const t of m.traits) {
    if (
      !/^(Death Burst|Death Throes)$/i.test(plainName(t.name)) &&
      !/^Death (Burst|Throes)/i.test(t.name)
    )
      continue;
    const { rule: p } = parseAbility(t.desc);
    if (p.resolution?.kind !== 'save') {
      flags.push(`14 ${m.id} / ${slug(t.name)} [narrativa]\n    ${t.desc.slice(0, 300)}`);
      continue;
    }
    const { dc, ...fields } = p;
    entry.abilities[slug(t.name)] = {
      pt: ptName(t.name),
      en: cleanName(t.name),
      desc: t.desc,
      auto: true,
      ...fields,
      ability: { cost: 'death', ...(dc ? { dc } : {}) },
    };
  }
  // Investida / Bote / Investida Atropeladora (5.1, em traços): vira consequência do ataque citado
  for (const t of m.traits) {
    const mv =
      /moves at least (\d+) (?:ft|feet)\.? straight toward (?:a|the) (?:target|creature)(?: and then hits (?:it|that target) with an? ([\w' ]+?) attack on the same turn)/i.exec(
        t.desc,
      );
    if (!mv) continue;
    const atk = m.attacks.find(
      (a) =>
        a.name.toLowerCase() === mv[2].toLowerCase() ||
        mv[2].toLowerCase().startsWith(a.name.toLowerCase()),
    );
    if (!atk) continue;
    const extra = /extra (\d+) \((\d+d\d+)\)(?: (\w+))? damage/i.exec(t.desc);
    const save =
      /DC (\d+) (Strength|Dexterity|Constitution) saving throw or be knocked prone/i.exec(t.desc);
    const key = `rider-${slug(atk.name)}`;
    const AB = { Strength: 'str', Dexterity: 'dex', Constitution: 'con' };
    const rider = {
      pt: ptName(t.name),
      en: cleanName(t.name),
      desc: t.desc,
      auto: true,
      ability: {
        cost: 'free',
        rider: atk.name,
        moveFt: Number(mv[1]),
        ...(save ? { dc: Number(save[1]) } : {}),
      },
      target: { kind: 'creature' },
      ...(extra ? { damage: { dice: extra[2], type: (extra[3] ?? atk.type).toLowerCase() } } : {}),
      ...(save
        ? {
            onHitSave: {
              ability: AB[save[2]],
              onSave: 'none',
              condition: { name: 'prone', rounds: 0 },
            },
          }
        : {}),
      ...(/bonus action/i.test(t.desc)
        ? {
            manual:
              'Se o alvo está caído, o monstro pode fazer um ataque extra contra ele com uma ação bônus.',
            manualEn:
              'If the target is prone, the monster can make one extra attack against it as a bonus action.',
          }
        : {}),
    };
    if (entry.abilities[key])
      flags.push(
        `14 ${m.id} / ${key} [conflito: Investida e rider do mesmo ataque]\n    ${t.desc.slice(0, 200)}`,
      );
    else entry.abilities[key] = rider;
  }
  if (m.legendary?.count) entry.legendary = m.legendary.count;
  else if (itemsOf(m).some((x) => x.kind === 'legendary')) entry.legendary = 3;
  return entry;
}

function write(file, rules, monsters) {
  const byId = new Map(monsters.map((m) => [base(m.id), m]));
  const problems = [];
  const out = {};
  for (const m of monsters) {
    const id = base(m.id);
    const explicit = rules[id] ?? { abilities: {} };
    const auto = autoEntry(m);
    const skip = new Set(explicit.skip ?? []);
    const entry = {
      ...(auto.legendary || explicit.legendary
        ? { legendary: explicit.legendary ?? auto.legendary }
        : {}),
      abilities: {},
      traits: {},
    };
    for (const [k, a] of Object.entries(auto.abilities)) if (!skip.has(k)) entry.abilities[k] = a;
    for (const [k, a] of Object.entries(auto.traits)) if (!skip.has(k)) entry.traits[k] = a;
    for (const [k, a] of Object.entries(explicit.abilities ?? {}))
      entry.abilities[k] = a.replace
        ? a
        : {
            ...(entry.abilities[k] ?? {}),
            ...a,
            ability: { ...(entry.abilities[k]?.ability ?? {}), ...(a.ability ?? {}) },
          };
    for (const [k, a] of Object.entries(explicit.traits ?? {})) entry.traits[k] = a;
    out[id] = entry;
  }
  for (const id of Object.keys(rules))
    if (!byId.has(id)) problems.push(`${file}: monstro inexistente: ${id}`);

  for (const [id, rule] of Object.entries(out)) {
    const m = byId.get(id);
    const texts = [
      ...m.traits,
      ...m.actions,
      ...(m.reactions ?? []),
      ...(m.legendary?.actions ?? []),
    ];
    for (const [slugName, a] of [
      ...Object.entries(rule.abilities),
      ...Object.entries(rule.traits),
    ]) {
      const isTrait = !!a.mods;
      if (!a.desc) {
        const hit = texts.find((t) => plainName(t.name) === plainName(a.from ?? a.en));
        if (!hit) {
          problems.push(
            `${file}: ${id}/${slugName}: não achei "${a.from ?? a.en}" no SRD (${texts.map((t) => t.name).join(' | ')})`,
          );
          continue;
        }
        a.desc = a.section ? sectionOf(hit.desc, a.section) : hit.desc;
      }
      if (!isTrait) {
        if (!a.parse) applyPattern(a, m, file.includes('2024') ? '2024' : '2014');
        let r = a;
        if (a.parse) {
          const { rule: p } = parseAbility(a.desc);
          const { dc, attackBonus, ...fields } = p;
          r = {
            ...fields,
            ...a,
            ability: {
              ...(dc ? { dc } : {}),
              ...(attackBonus !== undefined ? { attackBonus } : {}),
              ...a.ability,
            },
          };
        }
        r.ability = { ...inferCost(m, a.from ?? a.en, rules), ...r.ability };
        if (r.ability.spell) {
          if (!SPELL_IDS.has(r.ability.spell.id)) {
            flags.push(
              `${file.includes('2024') ? '24' : '14'} ${id} / ${slugName} [magia desconhecida: ${r.ability.spell.id}]\n    ${a.desc.slice(0, 200)}`,
            );
            delete r.ability.spell;
            r.narrative = true;
            r.target = { kind: 'self' };
          } else {
            // CD e ataque do monstro: do texto da conjuração, senão dos atributos
            const cast = [...m.traits, ...m.actions].find((t) => /Spellcasting/i.test(t.name));
            const abilityName =
              /(?:spellcasting ability is|using) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i.exec(
                cast?.desc ?? a.desc,
              )?.[1];
            const nums = castingNumbers(m, abilityName);
            const dcText =
              /spell save DC (\d+)/i.exec(a.desc) ?? /spell save DC (\d+)/i.exec(cast?.desc ?? '');
            const atkText =
              /\+(\d+) to hit with spell attacks/i.exec(a.desc) ??
              /\+(\d+) to hit with spell attacks/i.exec(cast?.desc ?? '');
            r.ability.dc ??= dcText ? Number(dcText[1]) : nums.dc;
            r.ability.attackBonus ??= atkText ? Number(atkText[1]) : nums.attack;
          }
        }
        if (r.ability.rider) r.ability.cost = r.ability.cost === 'action' ? 'free' : r.ability.cost;
        if (!r.narrative && !r.vfx && !r.ability.rider && !r.ability.attack) r.vfx = defaultVfx(r);
        if (r.narrative && !r.vfx) r.vfx = { kind: 'glow', color: 'arcane' };
        Object.assign(a, r);
        audit(id, slugName, a, file);
        review.push(
          `${file.includes('2024') ? '24' : '14'} ${id} / ${slugName} [${a.ability.cost}${a.ability.recharge ? ' R' + a.ability.recharge : ''}${a.ability.uses ? ' ' + a.ability.uses.n + '/' + a.ability.uses.per : ''}${a.ability.attack ? ' attack:' + a.ability.attack : ''}${a.auto ? ' auto' : ''}] ${a.narrative ? 'NARRATIVA' : report(a) + (a.onHitSave ? ' ONHIT:' + JSON.stringify(a.onHitSave) : '')}`,
        );
      } else
        review.push(
          `${file.includes('2024') ? '24' : '14'} ${id} / trait ${slugName} ${JSON.stringify(a.mods)}`,
        );
      delete a.from;
      delete a.parse;
      delete a.section;
      delete a.auto;
      delete a.replace;
      delete a.innate;
      delete a.spellName;
      if (a.manual) a.manual = ptUnits(a.manual);
      for (const k of ['pt', 'en', 'desc'])
        if (!a[k]) problems.push(`${file}: ${id}/${slugName}: falta ${k}`);
    }
    if (!Object.keys(rule.abilities).length && !Object.keys(rule.traits).length && !rule.legendary)
      delete out[id];
  }
  if (problems.length) throw new Error(problems.join('\n'));
  const ids = Object.keys(out).sort();
  const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(out[id])}`).join(',\n');
  writeFileSync(join(root, 'public', 'data', file), `{\n${body}\n}\n`);
  const n = ids.reduce((s, id) => s + Object.keys(out[id].abilities).length, 0);
  const t = ids.reduce((s, id) => s + Object.keys(out[id].traits ?? {}).length, 0);
  console.log(`${file}: ${ids.length} monstros, ${n} habilidades, ${t} traços`);
}

write('monster-rules.json', await collect('2014-'), srd('monsters.json'));
write('monster-rules-2024.json', await collect('2024-'), srd('monsters-2024.json'));

if (process.env.REVIEW) writeFileSync(process.env.REVIEW, review.join('\n') + '\n');
if (process.env.FLAGS) writeFileSync(process.env.FLAGS, flags.join('\n') + '\n');
