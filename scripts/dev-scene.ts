// Gera e2e/.scene.json: encontro de teste com Chefe Goblin + Goblin (Redirecionar Ataque), Polvo (Tinta),
// Androesfinge (Lançar Magia lendário) e a Guardiã com o Cão Fiel. Uso: npm run scene
import fs from 'node:fs';
import rules2014 from '../public/data/spell-rules.json';
import rules2024 from '../public/data/spell-rules-2024.json';
import monsters14 from '../public/data/monsters.json';
import monsters24 from '../public/data/monsters-2024.json';
import spells14 from '../public/data/spells.json';
import spells24 from '../public/data/spells-2024.json';
import mr14 from '../public/data/monster-rules.json';
import mr24 from '../public/data/monster-rules-2024.json';
import { newCreature } from '@core/models/creature-factory';
import { mapFromAscii } from '@core/models/grid';
import { dispatch, newEncounter } from '@core/rules/encounter';
import { registerSummonSource } from '@core/rules/encounter/summon';
import { buildMonsterAbilities } from '@core/rules/monsters/build';
import { abilitiesOf, registerMonsterAbilities } from '@core/rules/monsters/registry';
import { expandFormOptions } from '@core/rules/monsters/form-options';
import { monsterToCreature } from '@core/rules/srd/convert';
import { buildSpells, mergeRules } from '@core/rules/spells/build';
import { registerSpells } from '@core/rules/spells/registry';
import { fullCasterSlots } from '@core/rules/creature/rest';

const m14: any[] = monsters14 as any;
const m24: any[] = monsters24 as any;
registerMonsterAbilities('2014', buildMonsterAbilities('2014', mr14 as any));
registerMonsterAbilities('2024', buildMonsterAbilities('2024', mr24 as any, m24));
registerSpells('2014', expandFormOptions(buildSpells(spells14 as any, rules2014 as any), m14));
registerSpells(
  '2024',
  expandFormOptions(
    buildSpells(spells24 as any, mergeRules(rules2014 as any, rules2024 as any)),
    m24,
  ),
);
const by = new Map([...m14, ...m24].map((m) => [m.id, m]));
registerSummonSource((id) => (by.get(id) ? monsterToCreature(by.get(id)) : undefined));

const rng = () => 0.5;
let s = newEncounter(
  mapFromAscii(Array.from({ length: 12 }, () => '....................')),
  'Cena de teste',
);
const run = (cmd: any) => (s = dispatch(s, cmd, { rng, role: { kind: 'dm' } }));
const add = (c: any, x: number, y: number, init: number) => {
  run({ type: 'addCreature', creature: c, pos: { x, y } });
  run({ type: 'setInitiative', id: c.id, value: init });
};
const mon = (id: string, as: string, name: string) => ({
  ...monsterToCreature(by.get(id)),
  id: as,
  name,
});

add(
  newCreature('pc', {
    id: 'hero',
    name: 'Herói',
    level: 9,
    hp: { max: 90, current: 90, temp: 0 },
    ac: 16,
    attacks: [{ name: 'Espada', bonus: 20, damage: '2d6+5', type: 'slashing', range: 5 }],
  }),
  4,
  3,
  30,
);
add(
  newCreature('pc', {
    id: 'guard',
    name: 'Guardiã',
    level: 9,
    hp: { max: 60, current: 60, temp: 0 },
    abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 18, cha: 10 },
    spellSlots: fullCasterSlots(17),
    spellcasting: { ability: 'wis', spells: ['faithful-hound'] },
  }),
  2,
  6,
  25,
);
add(mon('srd-2024_goblin-boss', 'boss', 'Chefe Goblin'), 5, 3, 20);
add(mon('srd-2024_goblin-warrior', 'gob', 'Goblin'), 6, 3, 18);
add(mon('srd-2024_octopus', 'oct', 'Polvo'), 3, 4, 16);
add(mon('androsphinx', 'sph', 'Androesfinge'), 12, 6, 14);
run({ type: 'startCombat' });
const turn = () => s.combat.turn?.actorId;
const endT = (id: string) => {
  run({ type: 'endTurn', actorId: id });
  for (const p of s.combat.pending ?? [])
    run({ type: 'reaction', actorId: p.reactorId, use: false });
  if (s.combat.turn?.actorId === id) run({ type: 'endTurn', actorId: id });
};
endT('hero');
run({
  type: 'cast',
  actorId: 'guard',
  spellId: 'faithful-hound',
  point: { x: 2, y: 7 },
  slotLevel: 4,
  ruleset: '2024',
});
let guard = 0;
while (!(s.combat.round >= 2 && turn() === 'hero') && guard++ < 30) {
  try {
    endT(turn()!);
  } catch (e: any) {
    console.error(String(e.marked ?? e.message));
    break;
  }
}
console.log('e2e/.scene.json gerado');
fs.writeFileSync('e2e/.scene.json', JSON.stringify(s));
