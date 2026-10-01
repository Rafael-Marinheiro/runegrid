// Opções de invocação: lê as fichas do SRD (public/data/monsters*.json) e monta uma opção por criatura.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => JSON.parse(readFileSync(join(root, 'public', 'data', f), 'utf8'));
const strip = (id) => id.replace(/^srd-2024_/, '');

const MONSTERS = { 2014: read('monsters.json'), 2024: read('monsters-2024.json') };

/** Nomes pt-BR do glossário do app (`names-pt.ts`). */
const NAMES = new Map(
  [
    ...readFileSync(join(root, 'src/app/core/rules/srd/names-pt.ts'), 'utf8')
      .split('export const MONSTER_NAMES_PT')[1]
      .split('export const SPELL_NAMES_PT')[0]
      .matchAll(/^\s*(?:'([^']+)'|(\w+)): '([^']+)',$/gm),
  ].map((m) => [m[1] ?? m[2], m[3]]),
);

const FRACTION = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };
const crText = (cr) => FRACTION[cr] ?? String(cr);

/** Fichas do conjunto que passam no filtro, por nome. */
export function sheets(ruleset, filter) {
  return MONSTERS[ruleset]
    .map((m) => ({ ...m, id: strip(m.id) }))
    .filter(filter)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Uma opção por criatura; `spec(m)` devolve o `summon` base e `count(m)` quantas aparecem. */
export function creatureOptions(list, spec, count = () => 1, withCr = true) {
  return list.map((m) => {
    const n = count(m);
    const pt = NAMES.get(m.name) ?? m.name;
    const tag = (name) => `${name}${withCr ? ` (ND ${crText(m.cr)})` : ''}${n > 1 ? ` ×${n}` : ''}`;
    return {
      id: m.id,
      label: tag(pt),
      ...(pt !== m.name ? { labelEn: tag(m.name) } : {}),
      patch: { summon: { ...spec, srd: m.id, n } },
    };
  });
}

/** Conjurar Animais e afins: 1 criatura de ND 2, 2 de ND 1, 4 de ND 1/2, 8 de ND 1/4 ou menos. */
export const groupSize = (m) => (m.cr <= 0.25 ? 8 : m.cr <= 0.5 ? 4 : m.cr <= 1 ? 2 : 1);

export const byType = (types, maxCr) => (m) =>
  types.some((t) => t.toLowerCase() === m.type.toLowerCase()) && m.cr <= maxCr;

/** Nome pt-BR de uma criatura do SRD (glossário do app), ou o próprio nome. */
export const monsterPt = (name) => NAMES.get(name) ?? name;

/** Uma criatura do SRD pelo id (sem o prefixo do conjunto). */
export const sheetOf = (ruleset, id) => sheets(ruleset, (m) => m.id === id)[0];
