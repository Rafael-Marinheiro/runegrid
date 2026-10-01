// Gera public/data/monster-rules.json (SRD 2014) e monster-rules-2024.json (SRD 2024) a partir de scripts/monster-rules/*.mjs.
// Cada módulo exporta { 'id-do-monstro': { legendary?, abilities: { slug: rule } } }; o texto oficial da habilidade
// (`desc`) vem do JSON do SRD, procurado pelo nome em inglês (`en`). Uso: node scripts/build-monster-rules.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    }
  }
  return out;
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
    const texts = [...m.traits, ...m.actions];
    for (const [slug, a] of Object.entries(rule.abilities)) {
      if (!a.desc) {
        const hit = texts.find((t) => plainName(t.name) === plainName(a.en));
        if (!hit) {
          problems.push(`${file}: ${id}/${slug}: não achei "${a.en}" no SRD (${texts.map((t) => t.name).join(' | ')})`);
          continue;
        }
        a.desc = hit.desc;
      }
      if (a.manual) a.manual = ptUnits(a.manual);
      for (const k of ['pt', 'en', 'desc', 'ability']) if (!a[k]) problems.push(`${file}: ${id}/${slug}: falta ${k}`);
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  const ids = Object.keys(rules).sort();
  const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(rules[id])}`).join(',\n');
  writeFileSync(join(root, 'public', 'data', file), `{\n${body}\n}\n`);
  const n = ids.reduce((s, id) => s + Object.keys(rules[id].abilities).length, 0);
  console.log(`${file}: ${ids.length} monstros, ${n} habilidades`);
}

write('monster-rules.json', await collect('2014-'), srd('monsters.json'));
write('monster-rules-2024.json', await collect('2024-'), srd('monsters-2024.json'));
