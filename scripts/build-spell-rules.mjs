// Gera public/data/spell-rules.json (SRD 2014) e spell-rules-2024.json (mudanças do SRD 2024 por cima do 2014)
// a partir dos módulos em scripts/spell-rules/. Uso: node scripts/build-spell-rules.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import EN_NOTES from './spell-rules/en-notes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'scripts', 'spell-rules');
const srd = (f) => JSON.parse(readFileSync(join(root, 'public', 'data', f), 'utf8'));
const base = (id) => id.replace(/^srd-2024_/, '');

/** Pés/milhas do texto em pt-BR viram metros/km (mesma regra de `core/rules/units.ts`; a versão em inglês fica em ft). */
function ptUnits(text) {
  const dec = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  return text
    .replace(/(\d+(?:[.,]\d+)?)[- ]?(?:ft\.?|feet|foot)(?![a-z])/gi, (_, n) => `${dec(Number(n.replace(',', '.')) * 0.3)} m`)
    .replace(/(\d+(?:[.,]\d+)?)[- ]?miles?/gi, (_, n) => `${dec(Number(n.replace(',', '.')) * 1.6)} km`);
}

/** Para cada nota `manual`/`note` em pt-BR acrescenta a versão `manualEn`/`noteEn` (do dicionário `en-notes.mjs`). */
function withEnglish(node, where) {
  if (Array.isArray(node)) return node.map((x) => withEnglish(x, where));
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = withEnglish(v, where);
    if ((k === 'manual' || k === 'note') && typeof v === 'string') out[k] = ptUnits(v);
    if ((k === 'manual' || k === 'note') && typeof v === 'string' && v) {
      const en = EN_NOTES.get(v);
      if (!en) throw new Error(`${where}: falta tradução em en-notes.mjs para: ${v}`);
      out[k + 'En'] = en;
    }
  }
  return out;
}

async function collect(prefix) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.mjs'))
    .sort();
  const out = {};
  for (const f of files) {
    const mod = (await import(pathToFileURL(join(dir, f)).href)).default;
    for (const [id, rule] of Object.entries(mod)) {
      if (id in out) throw new Error(`${f}: ${id} repetido`);
      out[id] = withEnglish(rule, `${f}:${id}`);
    }
  }
  return out;
}

function write(file, rules, known) {
  const unknown = Object.keys(rules).filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`${file}: ids que não existem no SRD: ${unknown.join(', ')}`);
  const ids = Object.keys(rules).sort();
  const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(rules[id])}`).join(',\n');
  writeFileSync(join(root, 'public', 'data', file), `{\n${body}\n}\n`);
  console.log(`${file}: ${ids.length} magias`);
}

const s14 = new Set(srd('spells.json').map((s) => s.id));
const s24 = new Set(srd('spells-2024.json').map((s) => base(s.id)));
write('spell-rules.json', await collect('2014-'), s14);
write('spell-rules-2024.json', await collect('2024-'), s24);
