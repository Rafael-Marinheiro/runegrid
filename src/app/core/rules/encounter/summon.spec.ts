import rules2014 from '../../../../../public/data/spell-rules.json';
import monsters from '../../../../../public/data/monsters.json';
import spells2014 from '../../../../../public/data/spells.json';
import { Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { EncounterState, Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { SrdMonster, SrdSpell } from '../../models/srd';
import { fullCasterSlots } from '../creature/rest';
import { monsterToCreature } from '../srd/convert';
import { buildSpells, SpellRules } from '../spells/build';
import { allSpells, getSpell, registerSpells } from '../spells/registry';
import { Command, dispatch, newEncounter, project } from '../encounter';
import { registerSummonSource, splitOnDamage } from './summon';
import { buildMonsterAbilities, MonsterRules } from '../monsters/build';
import { abilitiesOf, registerMonsterAbilities } from '../monsters/registry';
import monsterRules from '../../../../../public/data/monster-rules.json';

type CastCmd = Extract<Command, { type: 'cast' }>;
const dm: Role = { kind: 'dm' };
const rng = () => 0.5;
const map = mapFromAscii(Array.from({ length: 12 }, () => '....................'));
const sheet = new Map((monsters as unknown as SrdMonster[]).map((m) => [m.id, m]));

beforeAll(() => {
  registerMonsterAbilities(
    '2014',
    buildMonsterAbilities('2014', monsterRules as unknown as MonsterRules),
  );
  registerSpells(
    '2014',
    buildSpells(spells2014 as unknown as SrdSpell[], rules2014 as unknown as SpellRules),
  );
  registerSummonSource((id) => {
    const m = sheet.get(id);
    return m ? monsterToCreature(m) : undefined;
  });
});

function scene(spellId: string, extra: Partial<Creature> = {}, start = true) {
  let s: EncounterState = newEncounter(map);
  const run = (cmd: Command, role: Parameters<typeof dispatch>[2]['role'] = dm) =>
    (s = dispatch(s, cmd, { rng, role }));
  const caster = newCreature('pc', {
    id: 'c',
    name: 'Druida',
    level: 9,
    abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 18, cha: 10 },
    hp: { max: 60, current: 60, temp: 0 },
    spellSlots: fullCasterSlots(17),
    spellcasting: { ability: 'wis', spells: [spellId] },
    ...extra,
  });
  run({ type: 'addCreature', creature: caster, pos: { x: 5, y: 5 } });
  run({ type: 'setInitiative', id: 'c', value: 15 });
  run({
    type: 'addCreature',
    creature: newCreature('monster', {
      id: 'm',
      name: 'Ogro',
      hp: { max: 90, current: 90, temp: 0 },
    }),
    pos: { x: 12, y: 5 },
  });
  run({ type: 'setInitiative', id: 'm', value: 5 });
  if (start) run({ type: 'startCombat' });
  return { get: () => s, run };
}

const cast = (spellId: string, option: string, slotLevel: number): CastCmd => ({
  type: 'cast',
  actorId: 'c',
  spellId,
  slotLevel,
  option,
  ruleset: '2014',
  point: { x: 7, y: 5 },
});

describe('invocação de criaturas no mapa', () => {
  it('Conjurar Animais: oito lobos aparecem, aliados, logo depois do conjurador na iniciativa', () => {
    expect(getSpell('conjure-animals', '2014')?.options?.length).toBeGreaterThan(10);
    const t = scene('conjure-animals');
    t.run(cast('conjure-animals', 'wolf', 3));
    const wolves = t.get().creatures.filter((c) => c.summon);
    expect(wolves).toHaveLength(8);
    expect(wolves.every((w) => w.kind === 'npc' && w.summon?.by === 'c')).toBe(true);
    expect(wolves.every((w) => t.get().tokens.some((k) => k.creatureId === w.id))).toBe(true);
    const order = t.get().combat.order;
    expect(order.slice(0, 9)).toEqual(['c', ...wolves.map((w) => w.id)]);
    expect(t.get().combat.initiative[wolves[0].id]).toBe(15);
    expect(new Set(wolves.map((w) => w.name)).size).toBe(8);
  });

  it('com um espaço maior vêm mais criaturas', () => {
    const t = scene('conjure-animals');
    t.run(cast('conjure-animals', 'wolf', 5));
    expect(t.get().creatures.filter((c) => c.summon)).toHaveLength(16);
  });

  it('quebrar a concentração faz as invocações sumirem', () => {
    const t = scene('conjure-animals');
    t.run(cast('conjure-animals', 'wolf', 3));
    expect(t.get().creatures.filter((c) => c.summon)).toHaveLength(8);
    t.run({ type: 'heal', targetId: 'c', amount: 0 });
    expect(t.get().creatures.filter((c) => c.summon)).toHaveLength(8);
    const lost = {
      ...t.get(),
      creatures: t
        .get()
        .creatures.map((x) => (x.id === 'c' ? { ...x, concentration: undefined } : x)),
    };
    const out = dispatch(lost, { type: 'heal', targetId: 'c', amount: 0 }, { rng, role: dm });
    expect(out.creatures.filter((x) => x.summon)).toHaveLength(0);
    expect(out.combat.order).toEqual(['c', 'm']);
    expect(out.log.some((e) => /desaparece/.test(e.text))).toBe(true);
  });

  it('a invocação some ao chegar a 0 PV, menos as que ficam como cadáver', () => {
    const t = scene('conjure-animals');
    t.run(cast('conjure-animals', 'wolf', 3));
    const [wolf] = t.get().creatures.filter((c) => c.summon);
    const hit = {
      ...t.get(),
      creatures: t
        .get()
        .creatures.map((x) =>
          x.id === wolf.id ? { ...x, status: 'dead' as const, hp: { ...x.hp, current: 0 } } : x,
        ),
    };
    const out = dispatch(hit, { type: 'heal', targetId: 'c', amount: 0 }, { rng, role: dm });
    expect(out.creatures.some((c) => c.id === wolf.id)).toBe(false);
    expect(out.creatures.filter((c) => c.summon)).toHaveLength(7);
  });

  it('Animar Mortos (fora do combate): duas a mais por nível; ficam como cadáver e entram na iniciativa', () => {
    const t = scene('animate-dead', {}, false);
    t.run(cast('animate-dead', 'zombie', 5));
    const z = t.get().creatures.filter((c) => c.summon);
    expect(z).toHaveLength(5);
    expect(z.every((c) => c.summon?.corpse && c.summon.rounds === undefined)).toBe(true);
    t.run({ type: 'startCombat' });
    expect(t.get().combat.order.slice(0, 6)).toEqual(['c', ...z.map((c) => c.id)]);
    t.run({ type: 'heal', targetId: 'c', amount: 0 });
    expect(t.get().creatures.filter((c) => c.summon)).toHaveLength(5);
  });

  it('Convocar Familiar: só um por vez; conjurar de novo substitui', () => {
    const t = scene('find-familiar', {}, false);
    t.run(cast('find-familiar', 'owl', 1));
    expect(t.get().creatures.filter((c) => c.summon)).toHaveLength(1);
    t.run(cast('find-familiar', 'bat', 1));
    const fam = t.get().creatures.filter((c) => c.summon);
    expect(fam).toHaveLength(1);
    expect(fam[0].srdId).toBe('bat');
  });

  it('o prazo da invocação conta no fim do turno de quem invocou', () => {
    const t = scene('conjure-animals');
    const base = getSpell('conjure-animals', '2014')!;
    registerSpells('2014', [
      ...allSpells('2014'),
      {
        ...base,
        id: 'test-timed',
        concentration: false,
        rounds: 2,
        options: base.options!.filter((o) => o.id === 'wolf'),
      },
    ]);
    const c = t.get().creatures.find((x) => x.id === 'c')!;
    const s1 = {
      ...t.get(),
      creatures: t
        .get()
        .creatures.map((x) =>
          x.id === 'c'
            ? { ...c, spellcasting: { ability: 'wis' as const, spells: ['test-timed'] } }
            : x,
        ),
    };
    let s = dispatch(
      s1,
      { ...cast('test-timed', 'wolf', 3), spellId: 'test-timed' },
      { rng, role: dm },
    );
    const wolves = () => s.creatures.filter((x) => x.summon);
    expect(wolves()).toHaveLength(8);
    expect(wolves()[0].summon?.rounds).toBe(2);
    const turn = () =>
      (s = dispatch(s, { type: 'endTurn', actorId: s.combat.turn!.actorId }, { rng, role: dm }));
    // uma rodada inteira: sobra 1; a seguinte acaba
    for (let k = 0; k < 60 && s.creatures.some((x) => x.summon); k++) turn();
    expect(s.creatures.filter((x) => x.summon)).toHaveLength(0);
    expect(s.combat.round).toBeGreaterThanOrEqual(2);
  });

  it('o jogador controla as invocações do próprio personagem', () => {
    const t = scene('conjure-animals');
    t.run(cast('conjure-animals', 'wolf', 3));
    const wolf = t.get().creatures.find((c) => c.summon)!;
    const role: Role = { kind: 'player', owns: ['c'] };
    const projected = project(t.get(), role);
    expect(projected.creatures.some((c) => c.id === wolf.id)).toBe(true);
    expect(() => dispatch(t.get(), { type: 'dodge', actorId: wolf.id }, { rng, role })).not.toThrow(
      /controla/,
    );
    const stranger: Role = { kind: 'player', owns: ['x'] };
    expect(() =>
      dispatch(t.get(), { type: 'dodge', actorId: wolf.id }, { rng, role: stranger }),
    ).toThrow();
  });
});

describe('invocações de monstros', () => {
  const foes = (id: string, r: () => number) => {
    let s = newEncounter(map);
    const run = (cmd: Command) => (s = dispatch(s, cmd, { rng: r, role: dm }));
    const mon = monsterToCreature(sheet.get(id)!);
    run({ type: 'addCreature', creature: { ...mon, id: 'mon' }, pos: { x: 2, y: 2 } });
    run({ type: 'setInitiative', id: 'mon', value: 20 });
    run({
      type: 'addCreature',
      creature: newCreature('pc', {
        id: 'p',
        name: 'Herói',
        hp: { max: 90, current: 90, temp: 0 },
      }),
      pos: { x: 10, y: 2 },
    });
    run({ type: 'setInitiative', id: 'p', value: 5 });
    run({ type: 'startCombat' });
    return { get: () => s, run };
  };

  it('Convocar Mefits: 25% de chance; se der certo vêm 1d4 aliados que não invocam outros', () => {
    const fail = foes('dust-mephit', () => 0.5);
    const ab = abilitiesOf(fail.get().creatures[0]).find((a) => a.nameEn === 'Summon Mephits')!;
    fail.run({
      type: 'cast',
      actorId: 'mon',
      spellId: ab.id,
      option: 'dust-mephit',
      point: { x: 4, y: 2 },
      ruleset: '2014',
    });
    expect(fail.get().creatures.filter((c) => c.summon)).toHaveLength(0);
    expect(fail.get().log.some((e) => /ninguém atendeu/.test(e.text))).toBe(true);

    const ok = foes('dust-mephit', () => 0.1);
    ok.run({
      type: 'cast',
      actorId: 'mon',
      spellId: ab.id,
      option: 'dust-mephit',
      point: { x: 4, y: 2 },
      ruleset: '2014',
    });
    const kids = ok.get().creatures.filter((c) => c.summon);
    expect(kids.length).toBeGreaterThanOrEqual(1);
    expect(kids.every((c) => c.kind === 'monster' && c.summon?.rounds === 10)).toBe(true);
    // não repetem a invocação
    const again = abilitiesOf(kids[0]).find((a) => a.nameEn === 'Summon Mephits')!;
    expect(kids[0].abilityState?.[again.id]?.used).toBeGreaterThanOrEqual(1);
    expect(ok.get().combat.order.slice(0, 1 + kids.length)).toEqual([
      'mon',
      ...kids.map((c) => c.id),
    ]);
  });

  it('quem invocou morre: as invocações somem', () => {
    const t = foes('dust-mephit', () => 0.1);
    const ab = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Summon Mephits')!;
    t.run({
      type: 'cast',
      actorId: 'mon',
      spellId: ab.id,
      option: 'dust-mephit',
      point: { x: 4, y: 2 },
      ruleset: '2014',
    });
    const dead = {
      ...t.get(),
      creatures: t
        .get()
        .creatures.map((c) =>
          c.id === 'mon' ? { ...c, status: 'dead' as const, hp: { ...c.hp, current: 0 } } : c,
        ),
    };
    const out = dispatch(
      dead,
      { type: 'heal', targetId: 'p', amount: 0 },
      { rng: () => 0.1, role: dm },
    );
    expect(out.creatures.filter((c) => c.summon)).toHaveLength(0);
  });

  it('Dividir: a gosma Grande se divide em duas Médias com metade dos PV', () => {
    const t = foes('ochre-jelly', () => 0.5);
    const jelly = t.get().creatures.find((c) => c.id === 'mon')!;
    expect(jelly.size).toBe('large');
    const hurt = {
      ...t.get(),
      creatures: t
        .get()
        .creatures.map((c) =>
          c.id === 'mon'
            ? { ...c, hp: { ...c.hp, current: 40 }, lastHit: { type: 'slashing' as const } }
            : c,
        ),
    };
    const out = splitOnDamage(hurt, 'mon', 5);
    const jellies = out.creatures.filter((c) => c.srdId === 'ochre-jelly');
    expect(jellies).toHaveLength(2);
    expect(jellies.every((c) => c.size === 'medium' && c.hp.current === 20)).toBe(true);
    expect(out.combat.order.slice(0, 2)).toEqual(['mon', jellies[1].id]);
    // dano de fogo não divide
    const fire = {
      ...hurt,
      creatures: hurt.creatures.map((c) =>
        c.id === 'mon' ? { ...c, lastHit: { type: 'fire' as const } } : c,
      ),
    };
    expect(
      splitOnDamage(fire, 'mon', 5).creatures.filter((c) => c.srdId === 'ochre-jelly'),
    ).toHaveLength(1);
  });

  it('Criar Espectro: no máximo sete', () => {
    const t = foes('wraith', () => 0.5);
    const ab = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Create Specter')!;
    expect(ab).toBeDefined();
    t.run({
      type: 'cast',
      actorId: 'mon',
      spellId: ab.id,
      option: 'specter',
      point: { x: 3, y: 2 },
      ruleset: '2014',
    });
    expect(t.get().creatures.filter((c) => c.summon)).toHaveLength(1);
  });
});
