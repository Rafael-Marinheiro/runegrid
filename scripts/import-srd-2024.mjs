// Gera public/data/{monsters,spells}-2024.json a partir da Open5e v2 (SRD 5.2, licença CC-BY-4.0).
// Mesmo formato de saída do import-srd.mjs (SRD 5.1/v1), para os dois conviverem no app.
// Uso: node scripts/import-srd-2024.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const API = 'https://api.open5e.com/v2';
const DOC = 'srd-2024';
const OUT = new URL('../public/data/', import.meta.url);

async function all(path) {
  const rows = [];
  for (let url = `${API}/${path}/?document__key=${DOC}&limit=100`; url;) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const page = await res.json();
    rows.push(...page.results);
    url = page.next;
  }
  return rows;
}

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
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const damageKind = (a) => (a.extra_damage_type ?? a.damage_type)?.key;

/** Um ataque estruturado do bloco de monstro (v2 já separa acerto/dano; sem regex). */
function parseAttack(a) {
  const type = damageKind(a);
  if (a.attack_type !== 'WEAPON' || !DAMAGE.includes(type) || !a.damage_die_count) return null;
  const bonus = a.damage_bonus
    ? a.damage_bonus > 0
      ? `+${a.damage_bonus}`
      : `${a.damage_bonus}`
    : '';
  return {
    name: a.name.replace(/ attack$/i, ''),
    bonus: a.to_hit_mod ?? 0,
    damage: `${a.damage_die_count}${a.damage_die_type.toLowerCase()}${bonus}`,
    type,
    range: a.reach ?? a.range ?? 5,
  };
}

function multiattack(actions) {
  const m = actions.find((a) => a.name === 'Multiattack');
  const w = /makes (\w+) (?:\w+ )?attacks?/i.exec(m?.desc ?? '');
  return NUMBER_WORDS[w?.[1]?.toLowerCase()] ?? 1;
}

const ABILITY_KEYS = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];
const ABILITY_SHORT = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

function monster(m) {
  const actions = m.actions ?? [];
  const saves = {};
  for (const k of ABILITY_KEYS) {
    const withProf = m.saving_throws?.[k];
    const raw = m.modifiers?.[k];
    if (withProf !== undefined && withProf !== raw) saves[ABILITY_SHORT[k]] = withProf;
  }
  const ri = m.resistances_and_immunities ?? {};
  const damageOf = (list) => (list ?? []).map((d) => d.key).filter((k) => DAMAGE.includes(k));
  const senses = [
    m.darkvision_range && `darkvision ${m.darkvision_range} ft.`,
    m.blindsight_range && `blindsight ${m.blindsight_range} ft.`,
    m.tremorsense_range && `tremorsense ${m.tremorsense_range} ft.`,
    m.truesight_range && `truesight ${m.truesight_range} ft.`,
    `passive Perception ${m.passive_perception}`,
  ]
    .filter(Boolean)
    .join(', ');
  const speeds = Object.entries(m.speed_all ?? {}).filter(
    ([k, v]) => typeof v === 'number' && v > 0,
  );
  return {
    id: m.key,
    name: m.name,
    size: m.size?.key ?? 'medium',
    type: m.type?.key ?? '',
    cr: m.challenge_rating,
    ac: m.armor_class,
    hp: m.hit_points,
    hitDice: m.hit_dice,
    speed: m.speed?.walk ?? (speeds.length ? Math.max(...speeds.map(([, v]) => v)) : 0),
    abilities: ABILITY_KEYS.map((k) => m.ability_scores[k]),
    saves,
    skills: m.skill_bonuses ?? {},
    resistances: damageOf(ri.damage_resistances),
    immunities: damageOf(ri.damage_immunities),
    vulnerabilities: damageOf(ri.damage_vulnerabilities),
    notes: [
      ri.damage_resistances_display,
      ri.damage_immunities_display,
      ri.condition_immunities_display,
    ]
      .filter(Boolean)
      .join(' | '),
    senses,
    languages: m.languages?.as_string ?? '',
    attacks: actions.flatMap((a) => (a.attacks ?? []).map(parseAttack)).filter(Boolean),
    attacksPerAction: multiattack(actions),
    traits: (m.traits ?? []).map((t) => ({ name: t.name, desc: t.desc })),
    actions: actions.map((a) => ({ name: a.name, desc: a.desc })),
  };
}

function spell(s) {
  return {
    id: s.key,
    name: s.name,
    level: s.level,
    school: s.school?.name ?? '',
    castingTime: s.casting_time,
    range: s.range_text ?? String(s.range ?? ''),
    components:
      [s.verbal && 'V', s.somatic && 'S', s.material && 'M'].filter(Boolean).join(', ') +
      (s.material_specified ? ` (${s.material_specified})` : ''),
    duration: s.duration,
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    classes: (s.classes ?? []).map((c) => c.name),
    desc: s.desc,
    higher: s.higher_level || undefined,
  };
}

mkdirSync(OUT, { recursive: true });
const monsters = (await all('creatures'))
  .map(monster)
  .sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
const spells = (await all('spells'))
  .map(spell)
  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
writeFileSync(new URL('monsters-2024.json', OUT), JSON.stringify(monsters));
writeFileSync(new URL('spells-2024.json', OUT), JSON.stringify(spells));
console.log(
  `SRD 2024 — monstros: ${monsters.length} (${monsters.filter((m) => m.attacks.length).length} com ataque), magias: ${spells.length}`,
);
