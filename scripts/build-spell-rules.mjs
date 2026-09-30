// Gera public/data/spell-rules.json (SRD 2014) e spell-rules-2024.json (mudanças do SRD 2024 por cima do 2014)
// a partir dos módulos em scripts/spell-rules/. Uso: node scripts/build-spell-rules.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'scripts', 'spell-rules');
const srd = (f) => JSON.parse(readFileSync(join(root, 'public', 'data', f), 'utf8'));
const base = (id) => id.replace(/^srd-2024_/, '');

async function collect(prefix) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.mjs'))
    .sort();
  const out = {};
  for (const f of files) {
    const mod = (await import(pathToFileURL(join(dir, f)).href)).default;
    for (const [id, rule] of Object.entries(mod)) {
      if (id in out) throw new Error(`${f}: ${id} repetido`);
      out[id] = rule;
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
