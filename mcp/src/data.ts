/** SRD content and miniature index, bundled from the Angular app's `public/data` (one portable file). */
import type { SrdMonster, SrdSpell } from '@core/models/srd';
import type { MiniatureEntry } from '@core/rules/srd/miniature';
import type { Ruleset } from './campaign';
import artMap from '../../public/data/monster-art-map.json';
import catalog from '../../public/data/miniatura-catalogo.json';
import monsters2014 from '../../public/data/monsters.json';
import monsters2024 from '../../public/data/monsters-2024.json';
import spells2014 from '../../public/data/spells.json';
import spells2024 from '../../public/data/spells-2024.json';
import rules2014 from '../../public/data/spell-rules.json';
import rules2024 from '../../public/data/spell-rules-2024.json';
import { buildSpells, mergeRules, type SpellRules } from '@core/rules/spells/build';
import { registerSpells } from '@core/rules/spells/registry';
import { expandFormOptions } from '@core/rules/monsters/form-options';
import monsterRules2014 from '../../public/data/monster-rules.json';
import monsterRules2024 from '../../public/data/monster-rules-2024.json';
import { buildMonsterAbilities, type MonsterRules } from '@core/rules/monsters/build';
import { registerMonsterAbilities } from '@core/rules/monsters/registry';
import { registerSummonSource } from '@core/rules/encounter';
import { monsterToCreature } from '@core/rules/srd/convert';

export const monstersOf = (r: Ruleset): SrdMonster[] =>
  (r === '2024' ? monsters2024 : monsters2014) as unknown as SrdMonster[];
export const spellsOf = (r: Ruleset): SrdSpell[] =>
  (r === '2024' ? spells2024 : spells2014) as unknown as SrdSpell[];

export const MINIATURES = catalog as unknown as MiniatureEntry[];
export const ART_BY_MONSTER = artMap as unknown as Record<string, string>;

/** Mecânica de todas as magias do SRD (2014 e 2024) registrada no motor, como no app. */
const base = rules2014 as unknown as SpellRules;
registerSpells(
  '2014',
  expandFormOptions(buildSpells(spells2014 as unknown as SrdSpell[], base), monstersOf('2014')),
);
registerSpells(
  '2024',
  expandFormOptions(
    buildSpells(
      spells2024 as unknown as SrdSpell[],
      mergeRules(base, rules2024 as unknown as SpellRules),
    ),
    monstersOf('2024'),
  ),
);

registerMonsterAbilities(
  '2014',
  buildMonsterAbilities('2014', monsterRules2014 as unknown as MonsterRules, monstersOf('2014')),
);
registerMonsterAbilities(
  '2024',
  buildMonsterAbilities('2024', monsterRules2024 as unknown as MonsterRules, monstersOf('2024')),
);

// Criaturas invocadas por magias e habilidades (Conjurar Animais, Convocar Demônio…).
const sheets = {
  '2014': new Map(monstersOf('2014').map((m) => [m.id, m])),
  '2024': new Map(monstersOf('2024').map((m) => [m.id.replace(/^srd-2024_/, ''), m])),
};
registerSummonSource((id, rs) => {
  const m = sheets[rs].get(id);
  return m ? monsterToCreature(m) : undefined;
});
