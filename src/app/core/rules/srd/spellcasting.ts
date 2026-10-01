import { Ability } from '../../models/creature';
import { SrdMonster } from '../../models/srd';

export interface MonsterCasting {
  ability: Ability;
  /** Ids das magias (truques à vontade e as de espaço). */
  spells: string[];
  slots: Record<number, { max: number; used: number }>;
}

const ABILITY: Record<string, Ability> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

/** "Detect Evil and Good", "blindness/deafness" → id do SRD (`detect-evil-and-good`, `blindnessdeafness`). */
export const spellId = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/['_*]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/ +/g, '-');

/**
 * Bloco "Spellcasting" do SRD 5.1 (monstro com lista de magias por espaço):
 * "Cantrips (at will): light, sacred flame" + "1st level (3 slots): bless, cure wounds".
 * Conjuração inata (à vontade, N/dia) não entra aqui: vira habilidade (ver `monster-rules`).
 */
export function parseSpellcasting(
  m: Pick<SrdMonster, 'traits' | 'actions'>,
): MonsterCasting | null {
  const t = [...m.traits, ...m.actions].find(
    (x) => /^Spellcasting\b/i.test(x.name) && /\(\d+ slots?\)|Cantrips \(at will\)/i.test(x.desc),
  );
  if (!t) return null;
  const ab = /spellcasting ability is (\w+)/i.exec(t.desc)?.[1]?.toLowerCase();
  const ability = ab ? ABILITY[ab] : undefined;
  if (!ability) return null;
  const spells: string[] = [];
  const slots: MonsterCasting['slots'] = {};
  for (const line of t.desc.split(/\n/)) {
    const mm = /^\s*\*?\s*(Cantrips|(\d+)(?:st|nd|rd|th) level)\s*\(([^)]*)\)\s*:\s*(.+)$/i.exec(
      line,
    );
    if (!mm) continue;
    const level = mm[2] ? Number(mm[2]) : 0;
    const n = /(\d+) slots?/i.exec(mm[3]);
    if (level > 0 && n) slots[level] = { max: Number(n[1]), used: 0 };
    for (const name of mm[4].split(/,\s*/)) {
      const id = spellId(name);
      if (id) spells.push(id);
    }
  }
  return spells.length ? { ability, spells, slots } : null;
}
