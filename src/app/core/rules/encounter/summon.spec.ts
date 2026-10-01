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
import { buildSpells, mergeRules, SpellRules } from '../spells/build';
import rules2024 from '../../../../../public/data/spell-rules-2024.json';
import spells2024 from '../../../../../public/data/spells-2024.json';
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

describe('Corcel de Outro Mundo (SRD 5.2)', () => {
  beforeAll(() => {
    registerSpells(
      '2024',
      buildSpells(
        spells2024 as unknown as SrdSpell[],
        mergeRules(rules2014 as unknown as SpellRules, rules2024 as unknown as SpellRules),
      ),
    );
  });
  const steedCast = (kind: string, slotLevel: number): CastCmd => ({
    type: 'cast',
    actorId: 'c',
    spellId: getSpell('find-steed', '2024')!.id,
    slotLevel,
    option: kind,
    ruleset: '2024',
    point: { x: 7, y: 5 },
  });

  it('a ficha escala com o espaço: CA 10 + nível, PV 5 + 10 por nível, Grande, pancada com o ataque de magia', () => {
    const t = scene(getSpell('find-steed', '2024')!.id);
    t.run(steedCast('fiend', 4));
    const steed = t.get().creatures.find((c) => c.summon)!;
    expect(steed.size).toBe('large');
    expect(steed.ac).toBe(14);
    expect(steed.hp.max).toBe(45);
    expect(steed.speed).toBe(60);
    expect(steed.attacks[0]).toMatchObject({
      name: 'Otherworldly Slam',
      damage: '1d8+4',
      type: 'necrotic',
    });
    // proficiência 4 (nível 9) + Sabedoria 18 (+4)
    expect(steed.attacks[0].bonus).toBe(8);
    expect(steed.summon).toMatchObject({ by: 'c', unique: 'steed', dc: 16 });
    expect(t.get().combat.order.slice(0, 2)).toEqual(['c', steed.id]);
  });

  it('Olhar Sombrio (Corruptor) usa a CD de magia de quem conjurou', () => {
    const t = scene(getSpell('find-steed', '2024')!.id);
    t.run(steedCast('fiend', 2));
    const steed = t.get().creatures.find((c) => c.summon)!;
    const glare = abilitiesOf(steed).find((a) => a.nameEn === 'Fell Glare')!;
    expect(glare).toBeDefined();
    t.run({ type: 'endTurn', actorId: 'c' });
    t.run({ type: 'cast', actorId: steed.id, spellId: glare.id, targetId: 'm', ruleset: '2024' });
    // Ogro (Sabedoria 10): d20 11 + 0 contra CD 16 falha
    expect(
      t
        .get()
        .creatures.find((c) => c.id === 'm')!
        .conditions.map((k) => k.name),
    ).toContain('frightened');
  });

  it('Toque Curativo (Celestial) cura 2d8 + nível; Passo Feérico (Feérico) teleporta', () => {
    const c = scene(getSpell('find-steed', '2024')!.id);
    c.run(steedCast('celestial', 3));
    const steed = c.get().creatures.find((x) => x.summon)!;
    const touch = abilitiesOf(steed).find((a) => a.nameEn === 'Healing Touch')!;
    expect(touch.heal).toEqual({ dice: '2d8', flat: 3 });
    expect(abilitiesOf(steed).map((a) => a.nameEn)).toEqual(['Healing Touch']);
    const f = scene(getSpell('find-steed', '2024')!.id);
    f.run(steedCast('fey', 2));
    const fey = f.get().creatures.find((x) => x.summon)!;
    expect(abilitiesOf(fey).map((a) => a.nameEn)).toEqual(['Fey Step']);
  });

  it('conjurar de novo troca o corcel', () => {
    const t = scene(getSpell('find-steed', '2024')!.id);
    t.run(steedCast('fey', 2));
    t.run({ type: 'endTurn', actorId: 'c' });
    for (let i = 0; i < 3 && t.get().combat.turn?.actorId !== 'c'; i++)
      t.run({ type: 'endTurn', actorId: t.get().combat.turn!.actorId });
    t.run(steedCast('celestial', 3));
    const steeds = t.get().creatures.filter((x) => x.summon);
    expect(steeds).toHaveLength(1);
    expect(steeds[0].name).toContain('Celestial');
  });
});

describe('Espírito Dracônico (SRD 5.2)', () => {
  beforeAll(() => {
    registerSpells(
      '2024',
      buildSpells(
        spells2024 as unknown as SrdSpell[],
        mergeRules(rules2014 as unknown as SpellRules, rules2024 as unknown as SpellRules),
      ),
    );
  });

  it('a ficha escala com o espaço e o sopro segue o tipo escolhido; quem conjura ganha a resistência', () => {
    const id = getSpell('summon-dragon', '2024')!.id;
    const t = scene(id);
    t.run({
      type: 'cast',
      actorId: 'c',
      spellId: id,
      slotLevel: 7,
      option: 'fire',
      ruleset: '2024',
      point: { x: 7, y: 5 },
    });
    const d = t.get().creatures.find((c) => c.summon)!;
    expect(d.size).toBe('large');
    expect(d.ac).toBe(21);
    expect(d.hp.max).toBe(70);
    expect(d.attacksPerAction).toBe(3);
    expect(d.attacks[0]).toMatchObject({ name: 'Rend', damage: '1d6+11', range: 10, bonus: 8 });
    expect(d.summon).toMatchObject({ by: 'c', concentration: true, dc: 16 });
    expect(t.get().combat.order.slice(0, 2)).toEqual(['c', d.id]);
    const breath = abilitiesOf(d).find((a) => a.nameEn === 'Breath Weapon')!;
    expect(breath.damage).toEqual({ dice: '2d6', type: 'fire' });
    expect(breath.target).toEqual({ kind: 'cone', length: 30 });
    const caster = t.get().creatures.find((c) => c.id === 'c')!;
    expect(caster.effects?.some((e) => e.mods.resist?.includes('fire'))).toBe(true);
  });

  it('o espírito some quando a concentração quebra', () => {
    const id = getSpell('summon-dragon', '2024')!.id;
    const t = scene(id);
    t.run({
      type: 'cast',
      actorId: 'c',
      spellId: id,
      slotLevel: 5,
      option: 'cold',
      ruleset: '2024',
      point: { x: 7, y: 5 },
    });
    expect(t.get().creatures.filter((c) => c.summon)).toHaveLength(1);
    const lost = {
      ...t.get(),
      creatures: t
        .get()
        .creatures.map((x) => (x.id === 'c' ? { ...x, concentration: undefined } : x)),
    };
    const out = dispatch(lost, { type: 'heal', targetId: 'c', amount: 0 }, { rng, role: dm });
    expect(out.creatures.filter((c) => c.summon)).toHaveLength(0);
  });
});

describe('Cão Fiel', () => {
  const setup = (ruleset: '2014' | '2024') => {
    const id = getSpell('faithful-hound', ruleset)!.id;
    const t = scene(id);
    t.run({
      type: 'cast',
      actorId: 'c',
      spellId: id,
      slotLevel: 4,
      ruleset,
      point: { x: 7, y: 5 },
    });
    return t;
  };
  /** Passa os turnos até voltar ao conjurador. */
  const untilCaster = (t: ReturnType<typeof scene>) => {
    do t.run({ type: 'endTurn', actorId: t.get().combat.turn!.actorId });
    while (t.get().combat.turn?.actorId !== 'c');
  };

  it('2014: aparece como token oculto de runa de cão, invulnerável, e morde quem chega perto no início do turno', () => {
    const t = setup('2014');
    const dog = t.get().creatures.find((c) => c.summon)!;
    expect(dog.icon).toBe('hound');
    expect(dog.immunities).toContain('piercing');
    expect(t.get().tokens.find((k) => k.creatureId === dog.id)?.hidden).toBe(true);
    expect(dog.summon).toMatchObject({
      by: 'c',
      leashFt: 100,
      guard: { mode: 'attack', dice: '4d8', bonus: 8 },
    });
    // o ogro chega ao lado do cão; no início do próximo turno do conjurador ele é mordido
    t.run({ type: 'placeToken', id: 'm', pos: { x: 8, y: 5 } });
    const hp = t.get().creatures.find((c) => c.id === 'm')!.hp.current;
    untilCaster(t);
    expect(t.get().log.some((e) => /morde/.test(e.text))).toBe(true);
    expect(t.get().creatures.find((c) => c.id === 'm')!.hp.current).toBeLessThan(hp);
  });

  it('o jogador dono do conjurador vê o cão; outro jogador não', () => {
    const t = setup('2014');
    const dog = t.get().creatures.find((c) => c.summon)!;
    const mine = project(t.get(), { kind: 'player', owns: ['c'] });
    const other = project(t.get(), { kind: 'player', owns: ['m'] });
    expect(mine.tokens.some((k) => k.creatureId === dog.id)).toBe(true);
    expect(other.tokens.some((k) => k.creatureId === dog.id)).toBe(false);
  });

  it('2024: salvaguarda de Destreza, 4d8 de energia; nada acontece sem inimigo adjacente', () => {
    const t = setup('2024');
    const dog = t.get().creatures.find((c) => c.summon)!;
    expect(dog.summon?.guard).toMatchObject({ mode: 'save', type: 'force', dice: '4d8' });
    expect(dog.summon?.leashFt).toBe(300);
    untilCaster(t);
    expect(
      t
        .get()
        .log.filter((e) => /^Cão Fiel morde/.test(e.text))
        .map((e) => e.text),
    ).toEqual([]);
  });
});

describe('Animar Correntes', () => {
  it('o diabo anima correntes: objetos CA 20 / 20 PV na iniciativa dele, que agarram com a corrente', () => {
    let s = newEncounter(map);
    const run = (cmd: Command) => (s = dispatch(s, cmd, { rng, role: dm }));
    run({
      type: 'addCreature',
      creature: { ...monsterToCreature(sheet.get('chain-devil')!), id: 'dev' },
      pos: { x: 2, y: 2 },
    });
    run({ type: 'setInitiative', id: 'dev', value: 20 });
    run({
      type: 'addCreature',
      creature: newCreature('pc', {
        id: 'p',
        name: 'Herói',
        hp: { max: 90, current: 90, temp: 0 },
      }),
      pos: { x: 8, y: 2 },
    });
    run({ type: 'setInitiative', id: 'p', value: 5 });
    run({ type: 'startCombat' });
    const ab = abilitiesOf(s.creatures.find((c) => c.id === 'dev')!).find(
      (a) => a.nameEn === 'Animate Chains',
    )!;
    run({
      type: 'cast',
      actorId: 'dev',
      spellId: ab.id,
      option: 'chains-4',
      point: { x: 5, y: 2 },
      ruleset: '2014',
    });
    const chains = s.creatures.filter((c) => c.summon);
    expect(chains).toHaveLength(4);
    expect(chains.every((c) => c.ac === 20 && c.hp.max === 20 && c.kind === 'monster')).toBe(true);
    expect(s.combat.order.slice(0, 5)).toEqual(['dev', ...chains.map((c) => c.id)]);
    const rider = abilitiesOf(chains[0]);
    expect(rider).toEqual([]);
    expect(chains[0].icon).toBe('chain');
    expect(chains[0].attacks[0]).toMatchObject({ name: 'Chain', range: 10, bonus: 8 });
  });
});
