// Gera public/data/{monsters,spells}.json a partir da Open5e (SRD 5.1, licença CC-BY-4.0).
// Uso: node scripts/import-srd.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const API = 'https://api.open5e.com/v1';
const OUT = new URL('../public/data/', import.meta.url);

async function all(path) {
  const rows = [];
  for (let url = `${API}/${path}/?document__slug=wotc-srd&limit=100`; url; ) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const page = await res.json();
    rows.push(...page.results);
    url = page.next;
  }
  return rows;
}

const DAMAGE = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const SIZES = { Tiny: 'tiny', Small: 'small', Medium: 'medium', Large: 'large', Huge: 'huge', Gargantuan: 'gargantuan' };

/** Tipos de dano de um trecho simples; trechos "de armas não mágicas" ficam de fora (só no texto). */
function damageTypes(text) {
  if (!text) return [];
  const simple = text.split(';').filter((seg) => !/nonmagical|silvered|adamantine/i.test(seg)).join(' ');
  return DAMAGE.filter((d) => new RegExp(`\\b${d}\\b`, 'i').test(simple));
}

const ATTACK = /(?:Melee|Ranged)(?: or (?:Melee|Ranged))? (?:Weapon|Spell) Attack: \+(\d+) to hit, (?:reach (\d+) ft\.|range (\d+)(?:\/\d+)? ft\.)[^]*?Hit: \d+ \(([^)]+)\) (\w+) damage/;

// "Hit: 1 piercing damage" (sem dados)
const FLAT_ATTACK = /(?:Melee|Ranged)(?: or (?:Melee|Ranged))? (?:Weapon|Spell) Attack: \+(\d+) to hit, (?:reach (\d+) ft\.|range (\d+)(?:\/\d+)? ft\.)[^]*?Hit: (\d+) (\w+) damage/;

function parseAttack(a) {
  const text = a.desc ?? '';
  const m = ATTACK.exec(text);
  if (m && DAMAGE.includes(m[5])) {
    return { name: a.name, bonus: Number(m[1]), damage: m[4].replace(/\s+/g, ''), type: m[5], range: Number(m[2] ?? m[3]) };
  }
  const f = FLAT_ATTACK.exec(text);
  if (f && DAMAGE.includes(f[5])) {
    return { name: a.name, bonus: Number(f[1]), damage: f[4], type: f[5], range: Number(f[2] ?? f[3]) };
  }
  return null;
}

function multiattack(actions) {
  const m = actions.find((a) => a.name === 'Multiattack');
  const w = /makes (\w+) (?:\w+ )?attacks?/i.exec(m?.desc ?? '');
  return NUMBER_WORDS[w?.[1]?.toLowerCase()] ?? 1;
}

function monster(m) {
  const actions = m.actions ?? [];
  const saves = {};
  for (const [k, ab] of [['strength_save', 'str'], ['dexterity_save', 'dex'], ['constitution_save', 'con'], ['intelligence_save', 'int'], ['wisdom_save', 'wis'], ['charisma_save', 'cha']]) {
    if (m[k] !== null && m[k] !== undefined) saves[ab] = m[k];
  }
  const speeds = Object.values(m.speed ?? {}).filter((v) => typeof v === 'number');
  return {
    id: m.slug,
    name: m.name,
    size: SIZES[m.size] ?? 'medium',
    type: m.type,
    cr: m.cr,
    ac: m.armor_class,
    hp: m.hit_points,
    hitDice: m.hit_dice,
    speed: m.speed?.walk ?? (speeds.length ? Math.max(...speeds) : 0),
    abilities: [m.strength, m.dexterity, m.constitution, m.intelligence, m.wisdom, m.charisma],
    saves,
    skills: m.skills ?? {},
    resistances: damageTypes(m.damage_resistances),
    immunities: damageTypes(m.damage_immunities),
    vulnerabilities: damageTypes(m.damage_vulnerabilities),
    notes: [m.damage_resistances, m.damage_immunities, m.condition_immunities].filter(Boolean).join(' | '),
    senses: m.senses,
    languages: m.languages,
    attacks: actions.map(parseAttack).filter(Boolean),
    attacksPerAction: multiattack(actions),
    traits: (m.special_abilities ?? []).map((t) => ({ name: t.name, desc: t.desc })),
    actions: actions.map((a) => ({ name: a.name, desc: a.desc })),
  };
}

function spell(s) {
  return {
    id: s.slug,
    name: s.name,
    level: s.level_int,
    school: s.school,
    castingTime: s.casting_time,
    range: s.range,
    components: s.components + (s.material ? ` (${s.material})` : ''),
    duration: s.duration,
    concentration: s.concentration === 'yes',
    ritual: s.ritual === 'yes',
    classes: (s.dnd_class ?? '').split(',').map((c) => c.trim()).filter(Boolean),
    desc: s.desc,
    higher: s.higher_level || undefined,
  };
}

mkdirSync(OUT, { recursive: true });
const monsters = (await all('monsters')).map(monster).sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
const spells = (await all('spells')).map(spell).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
writeFileSync(new URL('monsters.json', OUT), JSON.stringify(monsters));
writeFileSync(new URL('spells.json', OUT), JSON.stringify(spells));
console.log(`monstros: ${monsters.length} (${monsters.filter((m) => m.attacks.length).length} com ataque reconhecido), magias: ${spells.length}`);
