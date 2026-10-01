import monsterRules24 from '../../../../../public/data/monster-rules-2024.json';
import monsterRules14 from '../../../../../public/data/monster-rules.json';
import monsters14 from '../../../../../public/data/monsters.json';
import monsters24 from '../../../../../public/data/monsters-2024.json';
import { newCreature } from '../../models/creature-factory';
import { Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { SrdMonster } from '../../models/srd';
import { Command, dispatch, newEncounter } from '../encounter';
import { buildMonsterAbilities, MonsterRules } from '../monsters/build';
import { abilitiesOf, registerMonsterAbilities } from '../monsters/registry';
import { monsterToCreature } from '../srd/convert';

const dm: Role = { kind: 'dm' };
const rng = () => 0.5; // d20 = 11
const sheets = monsters24 as unknown as SrdMonster[];
const old = monsters14 as unknown as SrdMonster[];
const mon = (id: string, as: string) => ({
  ...monsterToCreature(
    id === 'aboleth'
      ? old.find((m) => m.id === id)!
      : sheets.find((m) => m.id === `srd-2024_${id}`)!,
  ),
  id: as,
});

beforeAll(() => {
  registerMonsterAbilities(
    '2014',
    buildMonsterAbilities('2014', monsterRules14 as unknown as MonsterRules),
  );
  registerMonsterAbilities(
    '2024',
    buildMonsterAbilities('2024', monsterRules24 as unknown as MonsterRules, sheets),
  );
});

/** O herói (iniciativa 20) ataca `foes`, posicionados em linha na linha 2. */
function scene(foes: [ReturnType<typeof mon>, number][], bonus: number, range = 5) {
  let s = newEncounter(mapFromAscii(Array.from({ length: 5 }, () => '..........')));
  const run = (cmd: Command) => (s = dispatch(s, cmd, { rng, role: dm }));
  run({
    type: 'addCreature',
    creature: newCreature('pc', {
      id: 'pc',
      name: 'Herói',
      hp: { max: 90, current: 90, temp: 0 },
      attacks: [{ name: 'Golpe', bonus, damage: '2d6', type: 'slashing', range }],
    }),
    pos: { x: 0, y: 2 },
  });
  run({ type: 'setInitiative', id: 'pc', value: 20 });
  foes.forEach(([c, x], i) => {
    run({ type: 'addCreature', creature: c, pos: { x, y: 2 } });
    run({ type: 'setInitiative', id: c.id, value: 5 - i });
  });
  run({ type: 'startCombat' });
  return { get: () => s, run, patch: (f: (x: typeof s) => typeof s) => (s = f(s)) };
}

describe('reações em favor de outros', () => {
  it('o Guardião Escudo dá +5 de CA ao aliado golpeado e o golpe erra', () => {
    const t = scene(
      [
        [mon('goblin-warrior', 'gob'), 1],
        [mon('shield-guardian', 'guard'), 2],
      ],
      7,
    );
    const ac = t.get().creatures.find((c) => c.id === 'gob')!.ac;
    t.run({ type: 'attack', actorId: 'pc', targetId: 'gob', attackIndex: 0 });
    // total 11 + 7 = 18: acerta CA 15, mas o guardião pode somar +5
    expect(ac).toBeLessThan(18);
    const pend = t.get().combat.pending ?? [];
    expect(pend.map((p) => p.reactorId)).toEqual(['guard']);
    const spell = abilitiesOf(t.get().creatures.find((c) => c.id === 'guard')!).find(
      (a) => a.nameEn === 'Protection',
    )!;
    const hp = t.get().creatures.find((c) => c.id === 'gob')!.hp.current;
    t.run({
      type: 'reaction',
      actorId: 'guard',
      use: true,
      spellId: spell.id,
      ruleset: '2024',
    });
    expect(t.get().creatures.find((c) => c.id === 'gob')!.hp.current).toBe(hp);
    expect(t.get().combat.pending).toEqual([]);
    expect(t.get().combat.reactionUsed).toContain('guard');
  });

  it('recusar a reação deixa o dano correr', () => {
    const t = scene(
      [
        [mon('goblin-warrior', 'gob'), 1],
        [mon('shield-guardian', 'guard'), 2],
      ],
      7,
    );
    const hp = t.get().creatures.find((c) => c.id === 'gob')!.hp.current;
    t.run({ type: 'attack', actorId: 'pc', targetId: 'gob', attackIndex: 0 });
    t.run({ type: 'reaction', actorId: 'guard', use: false });
    expect(t.get().creatures.find((c) => c.id === 'gob')!.hp.current).toBeLessThan(hp);
  });

  it('Redirecionar Ataque: o chefe troca de lugar com o aliado, que passa a ser o alvo', () => {
    const t = scene(
      [
        [mon('goblin-boss', 'boss'), 1],
        [mon('goblin-warrior', 'gob'), 2],
      ],
      20,
    );
    const hpBoss = t.get().creatures.find((c) => c.id === 'boss')!.hp.current;
    t.run({ type: 'attack', actorId: 'pc', targetId: 'boss', attackIndex: 0 });
    const redirect = abilitiesOf(t.get().creatures.find((c) => c.id === 'boss')!).find(
      (a) => a.nameEn === 'Redirect Attack',
    )!;
    expect(() =>
      t.run({
        type: 'reaction',
        actorId: 'boss',
        use: true,
        spellId: redirect.id,
        ruleset: '2024',
      }),
    ).toThrow();
    t.run({
      type: 'reaction',
      actorId: 'boss',
      use: true,
      spellId: redirect.id,
      targetId: 'gob',
      ruleset: '2024',
    });
    const pos = (id: string) => t.get().tokens.find((k) => k.creatureId === id)!.pos;
    expect(pos('boss').x).toBe(2);
    expect(pos('gob').x).toBe(1);
    expect(t.get().creatures.find((c) => c.id === 'boss')!.hp.current).toBe(hpBoss);
    expect(t.get().creatures.find((c) => c.id === 'gob')!.hp.current).toBeLessThan(
      mon('goblin-warrior', 'x').hp.max,
    );
  });

  it('Desviar Projétil só responde a ataques à distância e reduz o dano', () => {
    const melee = scene([[mon('stone-giant', 'giant'), 1]], 20);
    melee.run({ type: 'attack', actorId: 'pc', targetId: 'giant', attackIndex: 0 });
    expect(melee.get().combat.pending).toEqual([]);
    const ranged = scene([[mon('stone-giant', 'giant'), 3]], 20, 60);
    ranged.run({ type: 'attack', actorId: 'pc', targetId: 'giant', attackIndex: 0 });
    expect(ranged.get().combat.pending?.length).toBe(1);
    const spell = abilitiesOf(ranged.get().creatures.find((c) => c.id === 'giant')!).find(
      (a) => a.nameEn === 'Deflect Missile',
    )!;
    const hp = ranged.get().creatures.find((c) => c.id === 'giant')!.hp.current;
    ranged.run({
      type: 'reaction',
      actorId: 'giant',
      use: true,
      spellId: spell.id,
      ruleset: '2024',
    });
    // 2d6 (7) é menos que 1d10+6: o gigante não sofre nada
    expect(ranged.get().creatures.find((c) => c.id === 'giant')!.hp.current).toBe(hp);
  });
});

describe('testes e perseguição', () => {
  it('Detectar rola Percepção e revela quem se escondia mal', () => {
    const t = scene([[mon('aboleth', 'abo'), 4]], 5);
    t.patch((x) => ({
      ...x,
      tokens: x.tokens.map((k) => (k.creatureId === 'pc' ? { ...k, hidden: true } : k)),
    }));
    const detect = abilitiesOf(t.get().creatures.find((c) => c.id === 'abo')!).find(
      (a) => a.nameEn === 'Detect',
    )!;
    expect(detect.check).toEqual({ skill: 'perception' });
    t.run({ type: 'cast', actorId: 'abo', spellId: detect.id, ruleset: '2014' });
    expect(t.get().log.some((e) => /Percepção|perception/i.test(e.text))).toBe(true);
    expect(t.get().tokens.find((k) => k.creatureId === 'pc')!.hidden).toBeFalsy();
  });

  it('Perseguição: quem termina o movimento à vista é seguido, para até 3 m dele', () => {
    const t = scene([[mon('nalfeshnee', 'nal'), 8]], 5);
    t.run({ type: 'move', actorId: 'pc', to: { x: 3, y: 2 } });
    expect(t.get().combat.pending?.map((p) => p.reactorId)).toEqual(['nal']);
    const p = abilitiesOf(t.get().creatures.find((c) => c.id === 'nal')!).find(
      (a) => a.nameEn === 'Pursuit',
    )!;
    t.run({ type: 'reaction', actorId: 'nal', use: true, spellId: p.id, ruleset: '2024' });
    const pos = t.get().tokens.find((k) => k.creatureId === 'nal')!.pos;
    expect(Math.max(Math.abs(pos.x - 3), Math.abs(pos.y - 2))).toBeLessThanOrEqual(2);
    expect(t.get().combat.reactionUsed).toContain('nal');
  });

  it('Tinta do Polvo 2024: ao fim do turno de quem está perto, e só uma vez por consulta', () => {
    const t = scene([[mon('octopus', 'oct'), 1]], 5);
    t.run({ type: 'endTurn', actorId: 'pc' });
    expect(t.get().combat.pending?.map((p) => p.reactorId)).toEqual(['oct']);
    t.run({ type: 'reaction', actorId: 'oct', use: false });
    t.run({ type: 'endTurn', actorId: 'pc' });
    expect(t.get().combat.pending).toEqual([]);
  });

  it('Desviar Projétil devolve a força quando o dano chega a 0', () => {
    const t = scene([[mon('stone-giant', 'giant'), 3]], 20, 60);
    t.run({ type: 'attack', actorId: 'pc', targetId: 'giant', attackIndex: 0 });
    const spell = abilitiesOf(t.get().creatures.find((c) => c.id === 'giant')!).find(
      (a) => a.nameEn === 'Deflect Missile',
    )!;
    t.run({ type: 'reaction', actorId: 'giant', use: true, spellId: spell.id, ruleset: '2024' });
    expect(t.get().creatures.find((c) => c.id === 'pc')!.hp.current).toBeLessThan(90);
  });
});
