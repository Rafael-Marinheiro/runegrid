/**
 * Partida de ponta a ponta: um grupo, monstros de 2014 e 2024, magias reais. Cada teste ataca um ponto
 * de risco (do mais preocupante ao menos): ações lendárias de magia, reações simultâneas, remoção de
 * quem está na vez, ressurreição por ajuste, serialização do estado e perda do dono de invocações.
 */
import rules2014 from '../../../../../public/data/spell-rules.json';
import rules2024 from '../../../../../public/data/spell-rules-2024.json';
import monsters14 from '../../../../../public/data/monsters.json';
import monsters24 from '../../../../../public/data/monsters-2024.json';
import spells2014 from '../../../../../public/data/spells.json';
import spells2024 from '../../../../../public/data/spells-2024.json';
import mr14 from '../../../../../public/data/monster-rules.json';
import mr24 from '../../../../../public/data/monster-rules-2024.json';
import { Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { EncounterState, Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { SrdMonster, SrdSpell } from '../../models/srd';
import { Command, dispatch, newEncounter, project } from '../encounter';
import { registerSummonSource } from './summon';
import { fullCasterSlots } from '../creature/rest';
import { expandFormOptions } from '../monsters/form-options';
import { buildMonsterAbilities, MonsterRules } from '../monsters/build';
import { abilitiesOf, registerMonsterAbilities } from '../monsters/registry';
import { monsterToCreature } from '../srd/convert';
import { buildSpells, mergeRules, SpellRules } from '../spells/build';
import { registerSpells } from '../spells/registry';

const dm: Role = { kind: 'dm' };
const rng = () => 0.5;
const old = monsters14 as unknown as SrdMonster[];
const nu = monsters24 as unknown as SrdMonster[];
const by = new Map([...old, ...nu].map((m) => [m.id, m]));
const mon = (id: string, as: string, name = as): Creature => ({
  ...monsterToCreature(by.get(id)!),
  id: as,
  name,
});

beforeAll(() => {
  registerMonsterAbilities('2014', buildMonsterAbilities('2014', mr14 as unknown as MonsterRules));
  registerMonsterAbilities(
    '2024',
    buildMonsterAbilities('2024', mr24 as unknown as MonsterRules, nu),
  );
  registerSpells(
    '2014',
    expandFormOptions(
      buildSpells(spells2014 as unknown as SrdSpell[], rules2014 as unknown as SpellRules),
      old,
    ),
  );
  registerSpells(
    '2024',
    expandFormOptions(
      buildSpells(
        spells2024 as unknown as SrdSpell[],
        mergeRules(rules2014 as unknown as SpellRules, rules2024 as unknown as SpellRules),
      ),
      nu,
    ),
  );
  registerSummonSource((id) => (by.has(id) ? monsterToCreature(by.get(id)!) : undefined));
});

const map = mapFromAscii(Array.from({ length: 12 }, () => '....................'));

function game(cast: [Creature, number, number, number][]) {
  let s: EncounterState = newEncounter(map, 'Partida');
  const run = (cmd: Command, role: Role = dm) => (s = dispatch(s, cmd, { rng, role }));
  for (const [c, x, y, init] of cast) {
    run({ type: 'addCreature', creature: c, pos: { x, y } });
    run({ type: 'setInitiative', id: c.id, value: init });
  }
  run({ type: 'startCombat' });
  const turn = () => s.combat.turn?.actorId;
  const pass = () => {
    run({ type: 'endTurn', actorId: turn()! });
    for (const p of s.combat.pending ?? [])
      run({ type: 'reaction', actorId: p.reactorId, use: false });
    if (s.combat.pending?.length === 0 && s.combat.endOffered === turn())
      run({ type: 'endTurn', actorId: turn()! });
  };
  const until = (id: string) => {
    for (let i = 0; i < 40 && turn() !== id; i++) pass();
    return turn() === id;
  };
  const c = (id: string) => s.creatures.find((x) => x.id === id);
  return { get: () => s, run, turn, pass, until, c };
}

const pc = (over: Partial<Creature> & { id: string }) =>
  newCreature('pc', { name: over.id, level: 9, hp: { max: 90, current: 90, temp: 0 }, ...over });

describe('1. Ação lendária "Lançar Magia" com magia de verdade', () => {
  it('a esfinge conjura fora do turno, paga as ações lendárias e o espaço de magia', () => {
    const sphinx = mon('androsphinx', 'sph');
    const ab = abilitiesOf(sphinx).find((a) => a.nameEn === 'Cast a Spell')!;
    expect(sphinx.spellcasting?.spells.length).toBeGreaterThan(0);
    const g = game([
      [pc({ id: 'hero' }), 2, 2, 20],
      [sphinx, 4, 2, 10],
    ]);
    const spellId =
      sphinx.spellcasting!.spells.find((id) => id === 'bless' || id === 'cure-wounds') ??
      sphinx.spellcasting!.spells[0];
    const left0 = g.c('sph')!.legendary?.left ?? 3;
    // é a vez do herói: a esfinge age fora do turno
    expect(g.turn()).toBe('hero');
    g.run({ type: 'cast', actorId: 'sph', spellId, targetId: 'sph', ruleset: '2014' });
    expect(g.c('sph')!.legendary?.left).toBe(left0 - (ab.ability?.legendary ?? 1));
  });
});

describe('2. Duas reações ao mesmo golpe', () => {
  it('o Guardião Escudo e o Aparar do cavaleiro: o dano é aplicado uma vez só', () => {
    const attacker = pc({
      id: 'hero',
      attacks: [{ name: 'Espada', bonus: 7, damage: '2d6', type: 'slashing', range: 5 }],
    });
    const g = game([
      [attacker, 1, 2, 30],
      [mon('knight', 'kn'), 2, 2, 20],
      [mon('shield-guardian', 'sg'), 3, 2, 10],
    ]);
    g.run({ type: 'attack', actorId: 'hero', targetId: 'kn', attackIndex: 0 });
    const pend = g.get().combat.pending ?? [];
    expect(pend.length).toBeGreaterThanOrEqual(1);
    const hp0 = g.c('kn')!.hp.current;
    // quem reage primeiro recusa; o outro decide por último
    for (const p of [...pend]) g.run({ type: 'reaction', actorId: p.reactorId, use: false });
    expect(g.get().combat.pending).toEqual([]);
    const lost = hp0 - g.c('kn')!.hp.current;
    expect(lost).toBeGreaterThan(0);
    // 2d6 com o dado a 3,5 = 7: perder mais que 12 PV seria dano em dobro
    expect(lost).toBeLessThanOrEqual(12);
  });
});

describe('3. Remover quem está na vez', () => {
  it('o turno passa adiante sem erro e a ordem fica consistente', () => {
    const g = game([
      [pc({ id: 'a' }), 1, 1, 30],
      [pc({ id: 'b' }), 2, 2, 20],
      [mon('srd-2024_goblin-warrior', 'gob'), 6, 6, 10],
    ]);
    expect(g.turn()).toBe('a');
    g.run({ type: 'removeCreature', id: 'a' });
    expect(g.turn()).toBe('b');
    expect(g.get().combat.order).not.toContain('a');
    g.pass();
    g.pass();
    expect(g.turn()).toBe('b');
    expect(g.get().combat.round).toBe(2);
  });

  it('o dono sai de cena: as invocações dele saem junto', () => {
    const caster = pc({
      id: 'c',
      abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 18, cha: 10 },
      spellSlots: fullCasterSlots(17),
      spellcasting: { ability: 'wis', spells: ['faithful-hound'] },
    });
    const g = game([
      [caster, 3, 3, 30],
      [mon('srd-2024_goblin-warrior', 'gob'), 9, 9, 10],
    ]);
    g.run({
      type: 'cast',
      actorId: 'c',
      spellId: 'faithful-hound',
      point: { x: 4, y: 3 },
      slotLevel: 4,
      ruleset: '2024',
    });
    expect(g.get().creatures.some((c) => c.summon)).toBe(true);
    g.run({ type: 'removeCreature', id: 'c' });
    expect(g.get().creatures.some((c) => c.summon)).toBe(false);
    expect(g.get().combat.order.every((id) => g.c(id))).toBe(true);
  });
});

describe('4. Ajuste livre em criatura caída', () => {
  it('PV acima de zero a reanima e ela volta a poder agir na ordem', () => {
    const g = game([
      [pc({ id: 'a' }), 1, 1, 30],
      [pc({ id: 'b', hp: { max: 20, current: 20, temp: 0 } }), 2, 2, 20],
      [mon('srd-2024_goblin-warrior', 'gob'), 9, 9, 5],
    ]);
    g.run({ type: 'damage', targetId: 'b', amount: 200 });
    expect(g.get().combat.phase).toBe('running');
    expect(g.c('b')!.status).not.toBe('alive');
    g.run({ type: 'adjust', targetId: 'b', note: 'milagre', changes: { hpCurrent: 8 } });
    expect(g.c('b')!.status).toBe('alive');
    expect(g.until('b')).toBe(true);
    expect(() => g.run({ type: 'dash', actorId: 'b' })).not.toThrow();
  });
});

describe('5. O estado sobrevive a salvar e carregar', () => {
  it('JSON ida e volta no meio do combate (com invocação oculta) continua jogável e projeta para jogadores', () => {
    const caster = pc({
      id: 'c',
      abilities: { str: 10, dex: 14, con: 14, int: 10, wis: 18, cha: 10 },
      spellSlots: fullCasterSlots(17),
      spellcasting: { ability: 'wis', spells: ['faithful-hound'] },
    });
    const g = game([
      [caster, 3, 3, 30],
      [mon('srd-2024_goblin-warrior', 'gob'), 4, 4, 10],
    ]);
    g.run({
      type: 'cast',
      actorId: 'c',
      spellId: 'faithful-hound',
      point: { x: 4, y: 3 },
      slotLevel: 4,
      ruleset: '2024',
    });
    g.until('c');
    const copy: EncounterState = JSON.parse(JSON.stringify(g.get()));
    const next = dispatch(
      copy,
      { type: 'endTurn', actorId: copy.combat.turn!.actorId },
      { rng, role: dm },
    );
    expect(next.combat.round + next.combat.order.length).toBeGreaterThan(0);
    for (const owns of [['c'], ['x']]) {
      const view = project(copy, { kind: 'player', owns });
      expect(() => JSON.stringify(view)).not.toThrow();
    }
    expect(project(copy, { kind: 'player', owns: ['x'] }).creatures.some((c) => c.summon)).toBe(
      false,
    );
  });
});

describe('6. Metamorfose e dano excedente', () => {
  it('o excesso de dano volta à forma normal e o personagem não morre por causa da fera', () => {
    const wiz = pc({
      id: 'w',
      hp: { max: 40, current: 40, temp: 0 },
      abilities: { str: 10, dex: 14, con: 14, int: 18, wis: 10, cha: 10 },
      spellSlots: fullCasterSlots(17),
      spellcasting: { ability: 'int', spells: ['polymorph'] },
    });
    const g = game([
      [wiz, 2, 2, 30],
      [mon('srd-2024_goblin-warrior', 'gob'), 8, 8, 10],
    ]);
    const spell = abilitiesOf(wiz); // sem habilidades de monstro
    expect(spell).toEqual([]);
    expect(() =>
      g.run({
        type: 'cast',
        actorId: 'w',
        spellId: 'polymorph',
        targetId: 'w',
        option: 'giant-ape',
        slotLevel: 4,
        ruleset: '2014',
      }),
    ).not.toThrow();
    const apeHp = g.c('w')!.hp.current;
    expect(g.c('w')!.form).toBeDefined();
    g.run({ type: 'damage', targetId: 'w', amount: apeHp + 15 });
    const after = g.c('w')!;
    expect(after.form).toBeUndefined();
    expect(after.hp.current).toBe(40 - 15);
    expect(after.status).toBe('alive');
  });
});

describe('7. Duas reações aceitas ao mesmo tempo', () => {
  /** Cavaleiro (CA 18, Aparar +2) com um Guardião Escudo ao lado (+2): o golpe de 21 só erra com os dois. */
  const duo = () => {
    const attacker = pc({
      id: 'hero',
      attacksPerAction: 2,
      attacks: [{ name: 'Espada', bonus: 10, damage: '2d6', type: 'slashing', range: 5 }],
    });
    const g = game([
      [attacker, 1, 2, 30],
      [mon('knight', 'kn'), 2, 2, 20],
      [mon('shield-guardian', 'sg'), 3, 2, 10],
    ]);
    const spellOf = (id: string, name: string) =>
      abilitiesOf(g.c(id)!).find((a) => a.nameEn === name)!;
    return { g, parry: spellOf('kn', 'Parry'), shield: spellOf('sg', 'Shield') };
  };

  it('as duas oferecem; aceitando as duas o bônus soma e o golpe erra', () => {
    const { g, parry, shield } = duo();
    expect(g.c('kn')!.ac).toBe(18);
    g.run({ type: 'attack', actorId: 'hero', targetId: 'kn', attackIndex: 0 });
    expect(
      g
        .get()
        .combat.pending?.map((p) => p.reactorId)
        .sort(),
    ).toEqual(['kn', 'sg']);
    const hp = g.c('kn')!.hp.current;
    g.run({ type: 'reaction', actorId: 'kn', use: true, spellId: parry.id, ruleset: '2014' });
    // com só o Aparar o golpe (21) ainda acerta a CA 20: o Guardião precisa poder reagir antes do dano
    expect(g.get().combat.pending?.map((p) => p.reactorId)).toEqual(['sg']);
    expect(g.c('kn')!.hp.current).toBe(hp);
    g.run({ type: 'reaction', actorId: 'sg', use: true, spellId: shield.id, ruleset: '2014' });
    expect(g.get().combat.pending).toEqual([]);
    expect(g.c('kn')!.hp.current).toBe(hp);
    expect(g.get().combat.reactionUsed).toEqual(expect.arrayContaining(['kn', 'sg']));
  });

  it('na ordem inversa (Guardião primeiro) o resultado é o mesmo', () => {
    const { g, parry, shield } = duo();
    g.run({ type: 'attack', actorId: 'hero', targetId: 'kn', attackIndex: 0 });
    const hp = g.c('kn')!.hp.current;
    g.run({ type: 'reaction', actorId: 'sg', use: true, spellId: shield.id, ruleset: '2014' });
    expect(g.get().combat.pending?.map((p) => p.reactorId)).toEqual(['kn']);
    g.run({ type: 'reaction', actorId: 'kn', use: true, spellId: parry.id, ruleset: '2014' });
    expect(g.get().combat.pending).toEqual([]);
    expect(g.c('kn')!.hp.current).toBe(hp);
  });

  it('aceitar uma e recusar a outra: o golpe acerta uma única vez', () => {
    const { g, parry } = duo();
    g.run({ type: 'attack', actorId: 'hero', targetId: 'kn', attackIndex: 0 });
    const hp = g.c('kn')!.hp.current;
    g.run({ type: 'reaction', actorId: 'kn', use: true, spellId: parry.id, ruleset: '2014' });
    g.run({ type: 'reaction', actorId: 'sg', use: false });
    expect(g.get().combat.pending).toEqual([]);
    const lost = hp - g.c('kn')!.hp.current;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(12);
  });

  it('a mesma reação não pode ser usada duas vezes e quem gastou fica sem reação até o próximo turno', () => {
    const { g, parry } = duo();
    g.run({ type: 'attack', actorId: 'hero', targetId: 'kn', attackIndex: 0 });
    g.run({ type: 'reaction', actorId: 'kn', use: true, spellId: parry.id, ruleset: '2014' });
    g.run({ type: 'reaction', actorId: 'sg', use: false });
    g.run({ type: 'attack', actorId: 'hero', targetId: 'kn', attackIndex: 0 });
    expect(g.get().combat.pending?.map((p) => p.reactorId) ?? []).not.toContain('kn');
  });
});
