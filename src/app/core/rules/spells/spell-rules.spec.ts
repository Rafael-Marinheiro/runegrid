import rules2014 from '../../../../../public/data/spell-rules.json';
import rules2024 from '../../../../../public/data/spell-rules-2024.json';
import spells2014 from '../../../../../public/data/spells.json';
import spells2024 from '../../../../../public/data/spells-2024.json';
import { CONDITIONS, Creature, DAMAGE_TYPES } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { EncounterState } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { Spell } from '../../models/spell';
import { SrdSpell } from '../../models/srd';
import { RuleError } from '../creature';
import { fullCasterSlots } from '../creature/rest';
import { parseDice } from '../dice';
import { dispatch, newEncounter } from '../encounter';
import { buildSpells, mergeRules, SpellRules } from './build';
import { allSpells, getSpell, registerSpells } from './registry';

const COLORS = [
  'violet',
  'shadow',
  'fire',
  'frost',
  'lightning',
  'holy',
  'life',
  'acid',
  'poison',
  'thunder',
  'psychic',
  'force',
  'arcane',
  'steel',
];
const MODS = new Set([
  'ac',
  'acMin',
  'acBase',
  'acBaseDex',
  'attackDie',
  'saveDie',
  'save',
  'attackMode',
  'attackedMode',
  'saveMode',
  'speed',
  'speedMult',
  'speedSet',
  'resist',
  'immune',
  'vulnerable',
  'immuneConditions',
  'weaponDamage',
  'weaponBonus',
  'regen',
  'tempPerTurn',
  'tempPerTurnMod',
  'bonusActions',
  'dotStart',
  'dotEnd',
  'noReactions',
  'noHealing',
  'halfWeaponDamage',
  'maxHp',
  'images',
  'repeatSave',
  'once',
  'endsOnAttack',
  'note',
]);

const base = rules2014 as unknown as SpellRules;
const over = rules2024 as unknown as SpellRules;
const sets: { name: '2014' | '2024'; srd: SrdSpell[]; rules: SpellRules }[] = [
  { name: '2014', srd: spells2014 as unknown as SrdSpell[], rules: base },
  { name: '2024', srd: spells2024 as unknown as SrdSpell[], rules: mergeRules(base, over) },
];

/** Nível máximo já conferido pela cobertura; sobe a cada lote até o 9 (ver PLANO.md, F12). */
const DONE_LEVEL = { '2014': 3, '2024': -1 };

const dice = (d: string) => expect(() => parseDice(d), d).not.toThrow();

function checkSpell(s: Spell) {
  const at = `${s.id}`;
  for (const d of [s.damage, ...(s.extraDamage ?? [])]) {
    if (!d) continue;
    dice(d.dice);
    if (d.perLevel) dice(d.perLevel);
    expect(DAMAGE_TYPES as readonly string[], at).toContain(d.type);
  }
  if (s.heal?.dice) dice(s.heal.dice);
  if (s.heal?.perLevel) dice(s.heal.perLevel);
  if (s.tempHp?.dice) dice(s.tempHp.dice);
  if (s.resolution.kind === 'pool') dice(s.resolution.dice);
  for (const c of Array.isArray(s.condition) ? s.condition : s.condition ? [s.condition] : [])
    expect(CONDITIONS as readonly string[], at).toContain(c.name);
  if (s.vfx) {
    expect(COLORS, at).toContain(s.vfx.color);
    expect(['bolts', 'ray', 'glow', 'burst', 'cone'], at).toContain(s.vfx.kind);
  }
  const effects = [s.effect, ...(s.options ?? []).map((o) => o.patch.effect)];
  const mods = effects.flatMap((e) => [e?.mods, ...(e?.scale ?? []).map((x) => x.mods)]);
  for (const m of mods)
    for (const k of Object.keys(m ?? {})) expect(MODS.has(k), `${at}: ${k}`).toBe(true);
  for (const m of mods) {
    for (const k of ['attackDie', 'saveDie'] as const) {
      const v = m?.[k];
      if (v) dice(v.replace(/^-/, ''));
    }
    if (m?.weaponDamage) dice(m.weaponDamage.dice);
    if (m?.dotStart) dice(m.dotStart.dice);
    if (m?.dotEnd) dice(m.dotEnd.dice);
  }
  if (s.castTime === 'reaction')
    expect(!!s.react || !!s.narrative, `${at}: reação sem gatilho`).toBe(true);
  if (s.narrative) {
    expect(
      !s.damage && !s.heal && !s.condition && !s.effect && !s.tempHp,
      `${at}: narrativa com mecânica`,
    ).toBe(true);
  } else {
    const real =
      s.damage ||
      s.heal ||
      s.condition ||
      s.effect ||
      s.tempHp ||
      s.stabilize ||
      s.push ||
      s.react ||
      s.cure ||
      s.dispel ||
      s.revive ||
      s.teleport ||
      s.zone ||
      s.sustain;
    expect(!!real, `${at}: sem mecânica nem narrativa`).toBe(true);
  }
  expect(s.vfx, `${at}: sem efeito visual`).toBeDefined();
}

describe('regras das magias do SRD (F12)', () => {
  for (const set of sets) {
    describe(`SRD ${set.name}`, () => {
      const built = buildSpells(set.srd, set.rules);

      it('toda entrada tem mecânica válida e efeito visual', () => {
        for (const s of built) checkSpell(s);
      });

      it('cobre as magias dos níveis já mecanizados (mecânica real ou narrativa explícita)', () => {
        registerSpells(set.name, built);
        const missing = set.srd
          .filter((s) => s.level <= DONE_LEVEL[set.name])
          .filter((s) => !getSpell(s.id, set.name));
        expect(missing.map((s) => s.id)).toEqual([]);
      });
    });
  }

  it('o 2024 herda o 2014 onde não muda', () => {
    const merged = mergeRules({ a: { range: 30 } }, { a: { rounds: 5 }, b: { range: 5 } });
    expect(merged['a']).toEqual({ range: 30, rounds: 5 });
    expect(merged['b']).toEqual({ range: 5 });
    const replaced = mergeRules({ a: { range: 30 } }, { a: { replace: true, rounds: 5 } });
    expect(replaced['a']).toEqual({ rounds: 5 });
  });
});

describe('fumaça: conjurar cada magia mecanizada não quebra o motor', () => {
  const map = mapFromAscii(Array.from({ length: 12 }, () => '....................'));
  const dm = { kind: 'dm' } as const;
  const rng = () => 0.5;

  function scene(spell: Spell): EncounterState {
    const caster: Creature = newCreature('pc', {
      id: 'c',
      name: 'Conjurador',
      level: 9,
      abilities: { str: 10, dex: 14, con: 14, int: 18, wis: 18, cha: 18 },
      hp: { max: 60, current: 60, temp: 0 },
      spellSlots: fullCasterSlots(17),
      spellcasting: { ability: 'int', spells: [spell.id] },
    });
    let s = newEncounter(map);
    const add = (c: Creature, x: number, y: number, init: number) => {
      s = dispatch(s, { type: 'addCreature', creature: c, pos: { x, y } }, { rng, role: dm });
      s = dispatch(s, { type: 'setInitiative', id: c.id, value: init }, { rng, role: dm });
    };
    add(caster, 5, 5, 20);
    add(
      newCreature('pc', { id: 'ally', name: 'Aliado', hp: { max: 30, current: 10, temp: 0 } }),
      4,
      5,
      15,
    );
    for (let i = 0; i < 4; i++)
      add(
        newCreature('monster', {
          id: `m${i}`,
          name: `Monstro ${i}`,
          ac: 11,
          hp: { max: 40, current: 40, temp: 0 },
          attacks: [{ name: 'Garra', bonus: 4, damage: '1d6+2', type: 'slashing', range: 5 }],
        }),
        7 + i,
        5,
        10 - i,
      );
    return dispatch(s, { type: 'startCombat' }, { rng, role: dm });
  }

  for (const set of sets) {
    it(`SRD ${set.name}: todas as magias mecanizadas`, () => {
      registerSpells(set.name, buildSpells(set.srd, set.rules));
      const list = allSpells(set.name).filter(
        (sp) => !sp.narrative && sp.castTime !== 'long' && sp.castTime !== 'reaction',
      );
      expect(list.length).toBeGreaterThan(10);
      const refused: string[] = [];
      for (const sp of list) {
        const s = scene(sp);
        const cmd = {
          type: 'cast' as const,
          actorId: 'c',
          spellId: sp.id,
          slotLevel: sp.level === 0 ? undefined : Math.max(sp.level, 5),
          ruleset: set.name,
          // toque: o aliado ao lado; o resto: os dois monstros à frente
          targetIds: (sp.range <= 5 ? ['ally'] : ['m0', 'm1']).slice(
            0,
            sp.target.kind === 'creature'
              ? (sp.target.max ?? 1) + (sp.target.perLevel ?? 0) * 4
              : 1,
          ),
          point: sp.teleport ? { x: 5, y: 9 } : { x: 8, y: 5 },
        };
        try {
          dispatch(s, cmd, { rng, role: dm });
        } catch (e) {
          if (!(e instanceof RuleError)) throw new Error(`${sp.id}: ${String(e)}`, { cause: e });
          refused.push(`${sp.id}: ${e.message}`);
        }
      }
      // a cena de teste alcança todos os alvos: recusar uma magia é exceção (ex.: só toca em si)
      expect(refused).toEqual([]);
    });
  }
});
