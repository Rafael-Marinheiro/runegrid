// Completa public/data/monsters*.json com o que os importadores não traziam (SRD 5.1 e 5.2, CC-BY-4.0):
// reações, ações lendárias e lista de magias (2014, fixtures da Open5e v1) e o tipo/custo/usos de cada ação (2024, Open5e v2).
// Lê os fixtures do repositório open5e/open5e-api (GitHub raw) e só acrescenta campos; não mexe nos que já existem.
// Uso: node scripts/import-srd-extras.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RAW = 'https://raw.githubusercontent.com/open5e/open5e-api/main/data';
const dataFile = (f) => new URL(`../public/data/${f}`, import.meta.url);
const get = async (path) => {
  const res = await fetch(`${RAW}/${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

/** "Wing Attack (Costs 2 Actions)" → custo 2. */
const costOf = (name) => Number(/Costs (\d+) Actions/i.exec(name)?.[1] ?? 1);

// ---------- SRD 5.1 ----------
{
  const rows = await get('v1/wotc-srd/Monster.json');
  const bySlug = new Map(rows.map((r) => [r.pk, r.fields]));
  const monsters = JSON.parse(readFileSync(dataFile('monsters.json'), 'utf8'));
  let reactions = 0, legendary = 0, spells = 0;
  for (const m of monsters) {
    const f = bySlug.get(m.id);
    if (!f) continue;
    const r = parse(f.reactions_json);
    if (r?.length) {
      m.reactions = r.map((x) => ({ name: x.name, desc: x.desc }));
      reactions++;
    }
    const l = parse(f.legendary_actions_json);
    if (l?.length) {
      const count = Number(/can take (\d+) legendary actions/i.exec(f.legendary_desc ?? '')?.[1] ?? 3);
      m.legendary = {
        desc: f.legendary_desc ?? '',
        count,
        actions: l.map((x) => ({ name: x.name.replace(/\s*\(Costs \d+ Actions\)/i, ''), desc: x.desc, cost: costOf(x.name) })),
      };
      legendary++;
    }
    const sp = parse(f.spells_json);
    if (sp?.length) {
      m.spells = sp;
      spells++;
    }
  }
  writeFileSync(dataFile('monsters.json'), JSON.stringify(monsters));
  console.log(`2014: ${reactions} com reações, ${legendary} com ações lendárias, ${spells} com lista de magias`);
}

// ---------- SRD 5.2 ----------
{
  const rows = await get('v2/wizards-of-the-coast/srd-2024/CreatureAction.json');
  const byMonster = new Map();
  for (const r of rows) (byMonster.get(r.fields.parent) ?? byMonster.set(r.fields.parent, []).get(r.fields.parent)).push(r.fields);
  const monsters = JSON.parse(readFileSync(dataFile('monsters-2024.json'), 'utf8'));
  const TYPE = { BONUS_ACTION: 'bonus', REACTION: 'reaction', LEGENDARY_ACTION: 'legendary' };
  const USES = { RECHARGE_ON_ROLL: 'recharge', RECHARGE: 'rest', PER_DAY: 'day' };
  let n = 0;
  for (const m of monsters) {
    const acts = byMonster.get(m.id) ?? [];
    for (const a of m.actions) {
      const f = acts.find((x) => x.name === a.name);
      if (!f) continue;
      if (TYPE[f.action_type]) a.type = TYPE[f.action_type];
      if (f.action_type === 'LEGENDARY_ACTION') a.cost = f.legendary_action_cost ?? 1;
      if (f.uses_type) a.uses = { type: USES[f.uses_type] ?? f.uses_type, ...(f.uses_param ? { n: f.uses_param } : {}) };
      n++;
    }
  }
  // ataques que o importador da API não reconheceu (dano fixo "1 Piercing damage", bônus com condição…)
  const DAMAGE = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
  const ATTACK = /^(?:Melee|Ranged)(?: or (?:Melee|Ranged))? Attack Roll: \+(\d+)[^,]*?, (?:reach (\d+) ?(?:ft|feet)\.?(?: or range (\d+)(?:\/\d+)? ?(?:ft|feet)\.?)?|range (\d+)(?:\/\d+)? ?(?:ft|feet)\.?)\s+(?:Hit: )?(\d+)(?: \(([^)]+)\))? (\w+) damage/i;
  let added = 0;
  for (const m of monsters) {
    const strip = (n) => n.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
    const have = new Set(m.attacks.map((a) => strip(a.name)));
    for (const a of m.actions) {
      const name = a.name.trim();
      if (have.has(strip(name))) continue;
      const x = ATTACK.exec(a.desc);
      const type = x?.[7]?.toLowerCase();
      if (!x || !DAMAGE.includes(type)) continue;
      m.attacks.push({
        name,
        bonus: Number(x[1]),
        damage: (x[6] ?? x[5]).replace(/\s+/g, ''),
        type,
        range: Number(x[2] ?? x[4] ?? 5),
      });
      added++;
    }
  }
  writeFileSync(dataFile('monsters-2024.json'), JSON.stringify(monsters));
  console.log(`2024: ${n} ações anotadas com tipo/custo/usos; ${added} ataques que faltavam`);
}
