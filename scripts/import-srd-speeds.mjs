// Acrescenta `speeds` ({walk, fly, swim, climb, burrow, hover}) às fichas de public/data/monsters*.json.
// Fonte: fixtures do open5e/open5e-api (SRD 5.1 em v1/wotc-srd, SRD 5.2 em v2/wizards-of-the-coast/srd-2024), CC-BY-4.0.
// Uso: node scripts/import-srd-speeds.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = (f) => join(root, 'public', 'data', f);
const RAW = 'https://raw.githubusercontent.com/open5e/open5e-api/main/data';
const get = async (path) => {
  const res = await fetch(`${RAW}/${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};
const clean = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' && v > 0));

{
  const rows = await get('v1/wotc-srd/Monster.json');
  const bySlug = new Map(rows.map((r) => [r.pk, r.fields]));
  const monsters = JSON.parse(readFileSync(dataFile('monsters.json'), 'utf8'));
  let n = 0;
  for (const m of monsters) {
    const f = bySlug.get(m.id);
    if (!f?.speed_json) continue;
    const sp = clean(JSON.parse(f.speed_json));
    if (f.speed_json.includes('hover')) sp.hover = 1;
    m.speeds = sp;
    n++;
  }
  writeFileSync(dataFile('monsters.json'), JSON.stringify(monsters));
  console.log(`2014: ${n} fichas com velocidades`);
}
{
  const rows = await get('v2/wizards-of-the-coast/srd-2024/Creature.json');
  const byId = new Map(rows.map((r) => [r.pk, r.fields]));
  const monsters = JSON.parse(readFileSync(dataFile('monsters-2024.json'), 'utf8'));
  let n = 0;
  for (const m of monsters) {
    const f = byId.get(m.id);
    if (!f) continue;
    const sp = clean({ walk: f.walk, fly: f.fly, swim: f.swim, climb: f.climb, burrow: f.burrow });
    if (f.hover) sp.hover = 1;
    m.speeds = sp;
    n++;
  }
  writeFileSync(dataFile('monsters-2024.json'), JSON.stringify(monsters));
  console.log(`2024: ${n} fichas com velocidades`);
}
