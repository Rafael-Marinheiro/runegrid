// Gera public/data/monster-rules.json (SRD 2014) e monster-rules-2024.json (SRD 2024) a partir de scripts/monster-rules/*.mjs.
// Cada módulo exporta { 'id-do-monstro': { legendary?, abilities: { slug: rule } } }; o texto oficial da habilidade
// (`desc`) vem do JSON do SRD, procurado pelo nome em inglês (`en`). Uso: node scripts/build-monster-rules.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseAbility, report } from './monster-rules/parse.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'scripts', 'monster-rules');
const srd = (f) => JSON.parse(readFileSync(join(root, 'public', 'data', f), 'utf8'));
const base = (id) => id.replace(/^srd-2024_/, '');
const plainName = (n) => n.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

/** Pés/milhas do texto em pt-BR viram metros/km (mesma regra de `core/rules/units.ts`). */
function ptUnits(text) {
  const dec = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  return text
    .replace(/(\d+(?:[.,]\d+)?)[- ]?(?:ft\.?|feet|foot)(?![a-z])/gi, (_, n) => `${dec(Number(n.replace(',', '.')) * 0.3)} m`)
    .replace(/(\d+(?:[.,]\d+)?)[- ]?miles?/gi, (_, n) => `${dec(Number(n.replace(',', '.')) * 1.6)} km`);
}

const COLOR = { fire: 'fire', cold: 'frost', lightning: 'lightning', poison: 'poison', acid: 'acid', thunder: 'thunder', necrotic: 'shadow', radiant: 'holy', psychic: 'psychic', force: 'force' };
const COND_COLOR = { frightened: 'psychic', charmed: 'psychic', paralyzed: 'steel', restrained: 'steel', poisoned: 'poison', blinded: 'arcane', stunned: 'arcane' };

/** Efeito visual padrão a partir do que a habilidade faz (a regra pode escrever o seu). */
function defaultVfx(r) {
  const dmgType = r.damage?.type;
  const first = [].concat(r.condition ?? [])[0]?.name;
  const color = (dmgType && COLOR[dmgType]) || (first && COND_COLOR[first]) || (dmgType ? 'steel' : 'arcane');
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
  for (const f of readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.mjs')).sort()) {
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

/** Trecho de uma ação com várias opções ("**Fire Breath.** …"). */
function sectionOf(desc, name) {
  const i = desc.indexOf(`**${name}.**`);
  if (i < 0) return desc;
  const rest = desc.slice(i);
  const j = rest.indexOf('**', 4 + name.length);
  return (j > 0 ? rest.slice(0, j) : rest).replace(/\*\*/g, '').trim();
}

function write(file, rules, monsters) {
  const byId = new Map(monsters.map((m) => [base(m.id), m]));
  const problems = [];
  for (const [id, rule] of Object.entries(rules)) {
    const m = byId.get(id);
    if (!m) {
      problems.push(`${file}: monstro inexistente: ${id}`);
      continue;
    }
    const texts = [...m.traits, ...m.actions, ...(m.reactions ?? []), ...(m.legendary?.actions ?? [])];
    for (const [slug, a] of [
      ...Object.entries(rule.abilities),
      ...Object.entries(rule.traits ?? {}),
    ]) {
      const isTrait = !!a.mods;
      if (!a.desc) {
        const hit = texts.find((t) => plainName(t.name) === plainName(a.from ?? a.en));
        if (!hit) {
          problems.push(`${file}: ${id}/${slug}: não achei "${a.from ?? a.en}" no SRD (${texts.map((t) => t.name).join(' | ')})`);
          continue;
        }
        a.desc = a.section ? sectionOf(hit.desc, a.section) : hit.desc;
      }
      if (!isTrait) {
        let r = a;
        if (a.parse) {
          const { rule: p } = parseAbility(a.desc);
          const { dc, attackBonus, ...fields } = p;
          r = { ...fields, ...a, ability: { ...(dc ? { dc } : {}), ...(attackBonus !== undefined ? { attackBonus } : {}), ...a.ability } };
        }
        r.ability = { ...inferCost(m, a.from ?? a.en, rules), ...r.ability };
        if (!r.narrative && !r.vfx) r.vfx = defaultVfx(r);
        Object.assign(a, r);
        review.push(`${id} / ${slug} [${a.ability.cost}${a.ability.recharge ? ' R' + a.ability.recharge : ''}${a.ability.uses ? ' ' + a.ability.uses.n + '/' + a.ability.uses.per : ''}] ${a.narrative ? 'NARRATIVA' : report(a)}`);
      }
      delete a.from;
      delete a.parse;
      delete a.section;
      if (a.manual) a.manual = ptUnits(a.manual);
      for (const k of ['pt', 'en', 'desc']) if (!a[k]) problems.push(`${file}: ${id}/${slug}: falta ${k}`);
      if (!a.ability && !a.mods) problems.push(`${file}: ${id}/${slug}: falta ability ou mods`);
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  const ids = Object.keys(rules).sort();
  const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(rules[id])}`).join(',\n');
  writeFileSync(join(root, 'public', 'data', file), `{\n${body}\n}\n`);
  const n = ids.reduce((s, id) => s + Object.keys(rules[id].abilities).length, 0);
  const t = ids.reduce((s, id) => s + Object.keys(rules[id].traits ?? {}).length, 0);
  console.log(`${file}: ${ids.length} monstros, ${n} habilidades, ${t} traços`);
}

write('monster-rules.json', await collect('2014-'), srd('monsters.json'));
write('monster-rules-2024.json', await collect('2024-'), srd('monsters-2024.json'));

if (process.env.REVIEW) writeFileSync(process.env.REVIEW, review.join('\n') + '\n');
