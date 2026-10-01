import monsterRules from '../../../../../public/data/monster-rules.json';
import monsterRules24 from '../../../../../public/data/monster-rules-2024.json';
import monsters from '../../../../../public/data/monsters.json';
import { newCreature } from '../../models/creature-factory';
import { mapFromAscii } from '../../models/grid';
import { SrdMonster } from '../../models/srd';
import { RuleError } from '../creature';
import { sizeOf } from '../encounter/state';
import { attackAllowed } from '../encounter/forms';
import { registerSummonSource } from '../encounter/summon';
import { Command, dispatch, newEncounter } from '../encounter';
import { attackFx } from '../encounter/fx';
import { monsterToCreature } from '../srd/convert';
import { buildMonsterAbilities, MonsterRules } from './build';
import { abilitiesOf, registerMonsterAbilities, riderOf } from './registry';

const srd = (id: string) => (monsters as unknown as SrdMonster[]).find((m) => m.id === id)!;
const dm = { kind: 'dm' } as const;
const map = mapFromAscii(Array.from({ length: 12 }, () => '....................'));

beforeAll(() => {
  registerMonsterAbilities(
    '2014',
    buildMonsterAbilities(
      '2014',
      monsterRules as unknown as MonsterRules,
      monsters as unknown as SrdMonster[],
    ),
  );
  registerSummonSource((id) => {
    const m = (monsters as unknown as SrdMonster[]).find((x) => x.id === id);
    return m ? monsterToCreature(m) : undefined;
  });
});

function scene(monsterId: string, rng: () => number) {
  let s = newEncounter(map);
  const run = (cmd: Command) => (s = dispatch(s, cmd, { rng, role: dm }));
  const mon = monsterToCreature(srd(monsterId), 'Monstro');
  run({ type: 'addCreature', creature: { ...mon, id: 'mon' }, pos: { x: 0, y: 4 } });
  run({ type: 'setInitiative', id: 'mon', value: 20 });
  for (const [i, x] of [5, 7].entries()) {
    run({
      type: 'addCreature',
      creature: newCreature('pc', {
        id: `pc${i}`,
        name: `Herói ${i}`,
        hp: { max: 200, current: 200, temp: 0 },
      }),
      pos: { x, y: 5 },
    });
    run({ type: 'setInitiative', id: `pc${i}`, value: 10 - i });
  }
  run({ type: 'startCombat' });
  return { get: () => s, run };
}

describe('habilidades de monstros', () => {
  it('o monstro do SRD traz as habilidades e a origem', () => {
    const c = monsterToCreature(srd('blink-dog'));
    expect(c.srdId).toBe('blink-dog');
    expect(abilitiesOf(c).map((a) => a.nameEn)).toEqual(['Teleport']);
  });

  it('Teleporte do Cão Teleportador: move o monstro e entra em recarga', () => {
    const t = scene('blink-dog', () => 0.5);
    const id = abilitiesOf(t.get().creatures[0])[0].id;
    t.run({ type: 'cast', actorId: 'mon', spellId: id, point: { x: 7, y: 8 } });
    expect(t.get().tokens.find((x) => x.creatureId === 'mon')?.pos).toEqual({ x: 7, y: 8 });
    expect(t.get().creatures[0].abilityState?.[id]?.recharging).toBe(true);
    expect(t.get().combat.turn?.action).toBe(false);
    // 40 ft = 12 m em pt-BR
    expect(() => t.run({ type: 'endTurn', actorId: 'mon' })).not.toThrow();
  });

  it('recarga: d6 no início do turno devolve a habilidade (Recharge 4-6)', () => {
    const rolls = [0.5, 0.5, 0.5, 0.5, 0.5]; // d6 = 4 com 0.5
    let i = 0;
    const t = scene('blink-dog', () => rolls[i++ % rolls.length]);
    const id = abilitiesOf(t.get().creatures[0])[0].id;
    t.run({ type: 'cast', actorId: 'mon', spellId: id, point: { x: 7, y: 8 } });
    for (const who of ['mon', 'pc0', 'pc1']) t.run({ type: 'endTurn', actorId: who });
    expect(t.get().creatures[0].abilityState?.[id]?.recharging).toBe(false);
    expect(t.get().log.some((e) => /recarregou/.test(e.text) && /recharged/.test(e.en ?? ''))).toBe(
      true,
    );
  });

  it('não repete enquanto recarrega', () => {
    const t = scene('blink-dog', () => 0.01); // d6 = 1: não recarrega
    const id = abilitiesOf(t.get().creatures[0])[0].id;
    t.run({ type: 'cast', actorId: 'mon', spellId: id, point: { x: 7, y: 8 } });
    for (const who of ['mon', 'pc0', 'pc1']) t.run({ type: 'endTurn', actorId: who });
    expect(() =>
      t.run({ type: 'cast', actorId: 'mon', spellId: id, point: { x: 3, y: 3 } }),
    ).toThrow(RuleError);
  });

  it('Sopro de Fogo: cone com salvaguarda de Destreza CD 21, metade se passar', () => {
    const t = scene('adult-red-dragon', () => 0.5); // d20 = 11 + Des < 21: falha; d6 = 4 → 18d6 = 72
    const id = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Fire Breath')!.id;
    t.run({ type: 'cast', actorId: 'mon', spellId: id, point: { x: 8, y: 5 } });
    const hp = t
      .get()
      .creatures.filter((c) => c.id.startsWith('pc'))
      .map((c) => c.hp.current);
    expect(hp).toEqual([200 - 72, 200 - 72]);
    const log = t.get().log.at(-2)!;
    expect(log.en).toMatch(/DC 21/);
    expect(t.get().log.some((e) => e.fx?.some((f) => f.kind === 'cone'))).toBe(true);
  });
});

describe('traços passivos de monstros', () => {
  /** Monstro em (5,5) e heróis encostados nele; `allies` = outros monstros do mesmo id que agem depois. */
  function duel(monsterId: string, rng: () => number, opts: { allies?: number } = {}) {
    let s = newEncounter(map);
    const run = (cmd: Command) => (s = dispatch(s, cmd, { rng, role: dm }));
    const mon = monsterToCreature(srd(monsterId), 'Monstro');
    const cells = sizeOf(mon);
    run({ type: 'addCreature', creature: { ...mon, id: 'mon' }, pos: { x: 5, y: 5 } });
    run({ type: 'setInitiative', id: 'mon', value: 20 });
    run({
      type: 'addCreature',
      creature: newCreature('pc', {
        id: 'pc0',
        name: 'Herói',
        ac: 10,
        hp: { max: 300, current: 300, temp: 0 },
        attacks: [{ name: 'Espada', bonus: 5, damage: '1d8+3', type: 'slashing', range: 5 }],
      }),
      pos: { x: 5 + cells, y: 5 },
    });
    run({ type: 'setInitiative', id: 'pc0', value: 10 });
    for (let i = 0; i < (opts.allies ?? 0); i++) {
      run({
        type: 'addCreature',
        creature: { ...monsterToCreature(srd(monsterId), `Aliado ${i}`), id: `ally${i}` },
        pos: { x: 5 + cells, y: 5 + 1 + i },
      });
      run({ type: 'setInitiative', id: `ally${i}`, value: 5 - i });
    }
    run({ type: 'startCombat' });
    return {
      get: () => s,
      run,
      mon: () => s.creatures.find((c) => c.id === 'mon')!,
      pc: () => s.creatures.find((c) => c.id === 'pc0')!,
      log: () => s.log.map((e) => e.en ?? e.text),
    };
  }
  const hit = (actor: string, target: string): Command => ({
    type: 'attack',
    actorId: actor,
    attackIndex: 0,
    targetId: target,
  });

  it('Fortitude de Morto-vivo: sobrevive com 1 PV se passar na salvaguarda', () => {
    const d = duel('zombie', () => 0.99); // d20 = 20 (+1 de Con) contra CD 5 + dano
    d.run({ type: 'damage', targetId: 'mon', amount: 12, damageType: 'slashing' });
    d.run({ type: 'damage', targetId: 'mon', amount: 10, damageType: 'slashing' }); // 22 PV no total
    expect(d.mon()).toMatchObject({ status: 'alive', hp: { current: 1 } });
    expect(d.log().some((l) => /Undead Fortitude/.test(l))).toBe(true);
    // radiante não deixa tentar
    const r = duel('zombie', () => 0.99);
    r.run({ type: 'damage', targetId: 'mon', amount: 12, damageType: 'slashing' });
    r.run({ type: 'damage', targetId: 'mon', amount: 10, damageType: 'radiant' });
    expect(r.mon().status).toBe('dead');
    // CD alta demais: falha
    const f = duel('zombie', () => 0.01);
    f.run({ type: 'damage', targetId: 'mon', amount: 22, damageType: 'slashing' });
    expect(f.mon().status).toBe('dead');
  });

  it('Regeneração do troll: cura 10 PV e para depois de dano de fogo', () => {
    const d = duel('troll', () => 0.5);
    d.run({ type: 'damage', targetId: 'mon', amount: 30, damageType: 'slashing' });
    const hp = d.mon().hp.current;
    for (const who of ['mon', 'pc0']) d.run({ type: 'endTurn', actorId: who });
    expect(d.mon().hp.current).toBe(hp + 10);
    d.run({ type: 'damage', targetId: 'mon', amount: 5, damageType: 'fire' });
    const after = d.mon().hp.current;
    for (const who of ['mon', 'pc0']) d.run({ type: 'endTurn', actorId: who });
    expect(d.mon().hp.current).toBe(after);
    expect(d.log().some((l) => /does not regenerate/.test(l))).toBe(true);
    // e volta no turno seguinte
    for (const who of ['mon', 'pc0']) d.run({ type: 'endTurn', actorId: who });
    expect(d.mon().hp.current).toBe(after + 10);
  });

  it('Táticas de Matilha: vantagem só com aliado ao lado do alvo', () => {
    const alone = duel('wolf', () => 0.5);
    alone.run(hit('mon', 'pc0'));
    expect(alone.log().some((l) => /attacked.*\(advantage\)/.test(l))).toBe(false);
    const pack = duel('wolf', () => 0.5, { allies: 1 });
    pack.run(hit('mon', 'pc0'));
    expect(pack.log().some((l) => /attacked.*\(advantage\)/.test(l))).toBe(true);
  });

  it('Corpo Aquecido: quem acerta o azer corpo a corpo sofre 1d10 de fogo', () => {
    const d = duel('azer', () => 0.99); // d20 20 sempre acerta; 1d10 = 10
    d.run({ type: 'endTurn', actorId: 'mon' });
    d.run(hit('pc0', 'mon'));
    expect(d.pc().hp.current).toBe(300 - 10);
    expect(d.log().some((l) => /for hitting/.test(l))).toBe(true);
  });

  it('Implacável do javali: sobrevive uma vez com 1 PV', () => {
    const d = duel('boar', () => 0.5);
    d.run({
      type: 'damage',
      targetId: 'mon',
      amount: d.mon().hp.current - 5,
      damageType: 'slashing',
    });
    d.run({ type: 'damage', targetId: 'mon', amount: 5, damageType: 'slashing' });
    expect(d.mon()).toMatchObject({ status: 'alive', hp: { current: 1 } });
    d.run({ type: 'damage', targetId: 'mon', amount: 1, damageType: 'slashing' });
    expect(d.mon().status).toBe('dead');
  });

  it('Investida do javali: só vale depois de andar 20 ft', () => {
    // sem andar: só o dano da presa
    const still = duel('boar', () => 0.99);
    still.run(hit('mon', 'pc0'));
    const plain = 300 - still.pc().hp.current;
    // andando 20 ft (4 casas) para longe e voltando: 20 ft gastos e a investida vale
    const run = duel('boar', () => 0.99);
    run.run({ type: 'move', actorId: 'mon', to: { x: 2, y: 5 } });
    run.run({ type: 'move', actorId: 'mon', to: { x: 5, y: 5 } });
    run.run(hit('mon', 'pc0'));
    expect(300 - run.pc().hp.current).toBeGreaterThan(plain);
    expect(run.log().some((l) => /STR saving throw/.test(l))).toBe(true);
  });

  it('Mordida venenosa da aranha: salvaguarda de Constituição e dano de veneno', () => {
    const d = duel('giant-spider', () => 0.99); // acerta e o herói passa (20): metade do veneno
    d.run(hit('mon', 'pc0'));
    expect(300 - d.pc().hp.current).toBeGreaterThan(7);
    expect(d.log().some((l) => /CON saving throw/.test(l))).toBe(true);
  });

  it('Teia da aranha: ataque à distância que prende e recarrega', () => {
    const d = duel('giant-spider', () => 0.99);
    const web = abilitiesOf(d.mon()).find((a) => a.nameEn === 'Web')!;
    d.run({ type: 'cast', actorId: 'mon', spellId: web.id, targetId: 'pc0' });
    expect(d.pc().conditions.some((c) => c.name === 'restrained')).toBe(true);
    expect(d.mon().abilityState?.[web.id]?.recharging).toBe(true);
  });

  it('Vantagem Marcial: +2d6 com aliado ao lado do alvo, uma vez por turno', () => {
    const d = duel('hobgoblin', () => 0.99, { allies: 1 });
    const w = d.pc().hp.current;
    d.run(hit('mon', 'pc0'));
    const first = w - d.pc().hp.current;
    expect(first).toBeGreaterThan(12); // arma + 2d6 (12 com d6 = 6)
  });

  it('Explosão de Morte do magmin atinge quem está a 10 ft', () => {
    const d = duel('magmin', () => 0.01); // salvaguarda falha; d6 = 1
    d.run({ type: 'damage', targetId: 'mon', amount: 100, damageType: 'slashing' });
    expect(d.mon().status).toBe('dead');
    expect(d.pc().hp.current).toBeLessThan(300);
    expect(d.log().some((l) => /Death Burst/.test(l))).toBe(true);
  });

  it('Passagem Rápida: a coruja não provoca ataque de oportunidade', () => {
    const d = duel('flying-snake', () => 0.5);
    d.run({ type: 'move', actorId: 'mon', to: { x: 2, y: 5 } });
    expect(d.get().combat.pending ?? []).toHaveLength(0);
  });

  it('Resistência Lendária: o dragão falha e passa na salvaguarda, 3 vezes por dia', () => {
    const d = duel('adult-red-dragon', () => 0.01); // d20 = 1: falha sempre
    const caster = newCreature('pc', {
      id: 'c',
      name: 'Mago',
      level: 9,
      abilities: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 },
      spellSlots: { 3: { max: 9, used: 0 } },
      spellcasting: { ability: 'int', spells: ['fireball'] },
    });
    let s = d.get();
    s = {
      ...s,
      creatures: [...s.creatures, caster],
      tokens: [...s.tokens, { creatureId: 'c', pos: { x: 12, y: 12 } }],
    };
    const dragon = s.creatures.find((c) => c.id === 'mon')!;
    for (let i = 0; i < 4; i++) {
      s = {
        ...s,
        combat: { ...s.combat, turn: { ...s.combat.turn!, actorId: 'c', action: true } },
      };
      s = dispatch(
        s,
        { type: 'cast', actorId: 'c', spellId: 'fireball', slotLevel: 3, point: { x: 6, y: 6 } },
        { rng: () => 0.01, role: dm },
      );
    }
    const used = s.creatures.find((c) => c.id === dragon.id)!.abilityState?.['legendary-resistance']
      ?.used;
    expect(used).toBe(3);
    expect(s.log.filter((e) => /Legendary Resistance/.test(e.en ?? '')).length).toBe(3);
  });
});

const flatAll = (name: '2014' | '2024', rules: unknown) =>
  [...buildMonsterAbilities(name, rules as MonsterRules).values()].flatMap((e) => [
    ...e.abilities,
    ...Object.values(e.riders),
  ]);

describe('cobertura das regras de monstros (F13)', () => {
  const sets = [
    { name: '2014' as const, rules: monsterRules },
    { name: '2024' as const, rules: monsterRules24 },
  ];
  for (const set of sets) {
    it(`SRD ${set.name}: toda habilidade tem mecânica real ou narrativa explícita`, () => {
      const built = flatAll(set.name, set.rules);
      expect(built.length).toBeGreaterThan(300);
      const bad: string[] = [];
      for (const sp of built) {
        if (sp.narrative) {
          if (!sp.description) bad.push(`${sp.id}: narrativa sem texto`);
          continue;
        }
        const real =
          sp.damage ||
          sp.heal ||
          sp.condition ||
          sp.effect ||
          sp.tempHp ||
          sp.push ||
          sp.cure ||
          sp.teleport ||
          sp.move ||
          sp.zone ||
          sp.table ||
          sp.react ||
          sp.check ||
          sp.manual ||
          sp.ability?.rider ||
          sp.ability?.attack ||
          sp.ability?.spell ||
          sp.ability?.invoke;
        if (!real) bad.push(`${sp.id}: sem mecânica nem narrativa`);
        if (!sp.vfx && !sp.ability?.rider && !sp.ability?.attack && !sp.ability?.spell)
          bad.push(`${sp.id}: sem efeito visual`);
      }
      expect(bad).toEqual([]);
    });
  }

  it('Engolir: o agarrado fica cego, contido e sofre ácido no início do turno', () => {
    const t = scene('behir', () => 0.5);
    const swallow = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Swallow')!;
    expect(swallow.ability?.needsGrappled).toBe(true);
    expect(swallow.effect?.mods.dotStart?.type).toBe('acid');
    expect(swallow.cure?.conditions).toContain('grappled');
  });

  it('sopros de controle: Sopro Lento corta reações e velocidade; Repulsão empurra', () => {
    const slow = flatAll('2014', monsterRules).find(
      (x) => x.id.startsWith('mon/adult-copper-dragon/') && x.nameEn === 'Slowing Breath',
    )!;
    expect(slow.effect?.mods.noReactions).toBe(true);
    expect(slow.effect?.mods.speedMult).toBe(0.5);
    const push = flatAll('2014', monsterRules).find(
      (x) => x.id.startsWith('mon/adult-bronze-dragon/') && x.nameEn === 'Repulsion Breath',
    )!;
    expect(push.push?.ft).toBe(60);
  });

  it('ação lendária de mesmo nome repete a ação (Tempestade de Raios do Kraken)', () => {
    const k = flatAll('2014', monsterRules).filter((x) => x.id.startsWith('mon/kraken/'));
    const act = k.find((x) => x.id.endsWith('/lightning-storm'))!;
    const leg = k.find((x) => x.id.endsWith('/lightning-storm-legendary'))!;
    expect(act.ability?.cost).toBe('action');
    expect(leg.ability?.cost).toBe('legendary');
    expect(leg.damage?.type).toBe('lightning');
  });

  it('o golpe ganha forma pelo nome do ataque (mordida, garra, pancada)', () => {
    const t = scene('wolf', () => 0.5);
    const fx = (name: string, type: 'piercing' | 'slashing' | 'bludgeoning') =>
      attackFx(t.get(), 'mon', 'pc0', 5, type, name)[0];
    expect(fx('Bite', 'piercing')).toMatchObject({ kind: 'slash', style: 'bite' });
    expect(fx('Claw', 'slashing')).toMatchObject({ style: 'claw' });
    expect(fx('Slam', 'bludgeoning')).toMatchObject({ style: 'bash' });
  });

  it('Nuvem de Tinta cria uma zona obscurecida; Aura de Escuridão acompanha o monstro e pede concentração', () => {
    const o = scene('octopus', () => 0.5);
    const ink = abilitiesOf(o.get().creatures[0]).find((a) => a.nameEn === 'Ink Cloud')!;
    expect(ink.zone).toMatchObject({ obscures: true });
    o.run({ type: 'cast', actorId: 'mon', spellId: ink.id });
    expect(o.get().zones).toHaveLength(1);
    const d = scene('darkmantle', () => 0.5);
    const dark = abilitiesOf(d.get().creatures[0]).find((a) => a.nameEn === 'Darkness Aura')!;
    expect(dark.concentration).toBe(true);
    expect(dark.zone?.aura).toBe(true);
  });

  it('Puxar do Roper arrasta o agarrado em direção a ele', () => {
    const t = scene('roper', () => 0.5);
    const reel = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Reel')!;
    expect(reel.push).toEqual({ ft: 25, dir: 'toward' });
    expect(reel.ability?.needsGrappled).toBe(true);
  });

  it('Mover (ação lendária) leva o vampiro até o ponto sem ataque de oportunidade', () => {
    const t = scene('vampire', () => 0.5);
    const mv = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Move')!;
    expect(mv).toMatchObject({ move: { ft: 30, noOpportunity: true }, range: 30 });
    expect(mv.ability?.cost).toBe('legendary');
  });

  const shift = (t: ReturnType<typeof scene>, name: string, option: string) => {
    const ab = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === name)!;
    t.run({ type: 'cast', actorId: 'mon', spellId: ab.id, option, ruleset: '2014' });
  };

  it('Vampiro vira morcego: Miúdo, deslocamento de voo e só a Mordida; volta à forma verdadeira', () => {
    const t = scene('vampire', () => 0.5);
    const base = t.get().creatures[0];
    shift(t, 'Shapechanger', 'bat');
    const bat = t.get().creatures[0];
    expect(bat.size).toBe('tiny');
    expect(bat.speed).toBe(5);
    expect(bat.speeds?.fly).toBe(30);
    expect(bat.form?.id).toBe('bat');
    expect(attackAllowed(bat, 'Bite (Bat or Vampire Form Only)')).toBe(true);
    expect(attackAllowed(bat, 'Unarmed Strike (Vampire Form Only)')).toBe(false);
    expect(attackAllowed(base, 'Unarmed Strike (Vampire Form Only)')).toBe(true);
    // gastou a ação; voltar à forma verdadeira custa outra
    expect(t.get().combat.turn?.action).toBe(false);
    t.run({ type: 'endTurn', actorId: 'mon' });
    for (const id of ['pc0', 'pc1']) t.run({ type: 'endTurn', actorId: id });
    shift(t, 'Shapechanger', 'true');
    const back = t.get().creatures[0];
    expect(back.form).toBeUndefined();
    expect(back.size).toBe(base.size);
    expect(back.speed).toBe(base.speed);
    expect(back.speeds).toEqual(base.speeds);
  });

  it('Vampiro em névoa: resistente a tudo, sem ações; reverter não custa ação', () => {
    const t = scene('vampire', () => 0.5);
    shift(t, 'Shapechanger', 'mist');
    const mist = t.get().creatures[0];
    expect(mist.resistances).toContain('slashing');
    expect(mist.form?.noActions).toBe(true);
    t.run({ type: 'endTurn', actorId: 'mon' });
    for (const id of ['pc0', 'pc1']) t.run({ type: 'endTurn', actorId: id });
    expect(t.get().combat.turn).toMatchObject({ actorId: 'mon', action: false, bonus: false });
    shift(t, 'Shapechanger', 'true');
    expect(t.get().creatures[0].form).toBeUndefined();
  });

  it('Lobisomem híbrido: CA 12 e Mordida + Garras, sem a Lança; lobo corre mais', () => {
    const t = scene('werewolf', () => 0.5);
    shift(t, 'Shapechanger', 'hybrid');
    const h = t.get().creatures[0];
    expect(h.ac).toBe(12);
    expect(h.attacksPerAction).toBe(2);
    expect(attackAllowed(h, 'Claws (Hybrid Form Only)')).toBe(true);
    expect(attackAllowed(h, 'Spear (Humanoid Form Only)')).toBe(false);
    expect(attackAllowed(h, 'Bite (Wolf or Hybrid Form Only)')).toBe(true);
    expect(() =>
      t.run({ type: 'attack', actorId: 'mon', targetId: 'pc0', attackIndex: 2 }),
    ).toThrow(/forma/);
  });

  it('quem muda de forma e morre volta à forma verdadeira', () => {
    const t = scene('werewolf', () => 0.5);
    shift(t, 'Shapechanger', 'wolf');
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
      { type: 'heal', targetId: 'pc0', amount: 0 },
      { rng: () => 0.5, role: dm },
    );
    expect(out.creatures[0].form).toBeUndefined();
  });

  it('Etereidade: o token vai ao plano Etéreo e só interage com quem também está nele', () => {
    const t = scene('ghost', () => 0.5);
    const eth = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Etherealness')!;
    expect(eth.plane).toBe('toggle');
    t.run({ type: 'cast', actorId: 'mon', spellId: eth.id, ruleset: '2014' });
    expect(t.get().creatures[0].plane).toBe('ethereal');
    expect(() =>
      t.run({ type: 'attack', actorId: 'mon', targetId: 'pc0', attackIndex: 0 }),
    ).toThrow(/Etéreo/);
  });

  it('Dragão de Ouro vira uma fera do Bestiário: toma CA, Força/Destreza/Constituição, ataques e tamanho; mantém os PV', () => {
    const t = scene('adult-gold-dragon', () => 0.5);
    const ab = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Change Shape')!;
    expect(ab.options!.some((o) => o.id === 'wolf')).toBe(true);
    // ND 17: nenhum bicho acima disso entra, e o próprio dragão não aparece
    expect(ab.options!.some((o) => o.id === 'tarrasque')).toBe(false);
    const hp = t.get().creatures[0].hp.current;
    t.run({ type: 'cast', actorId: 'mon', spellId: ab.id, option: 'wolf', ruleset: '2014' });
    const w = t.get().creatures[0];
    expect(w.size).toBe('medium');
    expect(w.ac).toBe(srd('wolf').ac);
    expect(w.abilities.str).toBe(srd('wolf').abilities[0]);
    expect(w.abilities.int).toBe(srd('adult-gold-dragon').abilities[3]);
    expect(w.attacks.map((a) => a.name)).toEqual(srd('wolf').attacks.map((a) => a.name));
    expect(w.hp.current).toBe(hp);
    expect(w.form?.id).toBe('wolf');
    t.run({ type: 'endTurn', actorId: 'mon' });
    for (const id of ['pc0', 'pc1']) t.run({ type: 'endTurn', actorId: id });
    t.run({ type: 'cast', actorId: 'mon', spellId: ab.id, option: 'true', ruleset: '2014' });
    const back = t.get().creatures[0];
    expect(back.attacks.map((a) => a.name)).toEqual(
      srd('adult-gold-dragon').attacks.map((a) => a.name),
    );
    expect(back.size).toBe('huge');
  });

  it('Couatl mantém a Mordida se a nova forma também tem uma', () => {
    const t = scene('couatl', () => 0.5);
    const ab = abilitiesOf(t.get().creatures[0]).find((a) => a.nameEn === 'Change Shape')!;
    t.run({ type: 'cast', actorId: 'mon', spellId: ab.id, option: 'wolf', ruleset: '2014' });
    const names = t.get().creatures[0].attacks.map((a) => a.name);
    expect(names.filter((n) => /bite/i.test(n)).length).toBeGreaterThanOrEqual(1);
    expect(names).not.toContain('Constrict');
  });

  it('Mordida do vampiro (nome com "Form Only") agora é rider: drena PV máximos; Filhos da Noite invoca enxames e lobos', () => {
    const t = scene('vampire', () => 0.5);
    const entry = [...abilitiesOf(t.get().creatures[0])];
    const bite = t.get().creatures[0].attacks.find((a) => /^Bite/.test(a.name))!;
    expect(riderOf(t.get().creatures[0], bite.name)).toBeDefined();
    const kids = entry.find((a) => a.nameEn === 'Children of the Night')!;
    expect(kids.options!.map((o) => o.id)).toEqual(['swarm-of-bats', 'swarm-of-rats', 'wolf']);
    expect(kids.options![2].patch.summon).toMatchObject({
      dice: '3d6',
      rounds: 600,
    });
    const legend = entry.find((a) => a.id.endsWith('unarmed-strike-legendary'))!;
    expect(legend.ability).toMatchObject({
      cost: 'legendary',
      attack: 'Unarmed Strike (Vampire Form Only)',
    });
  });

  it('Consumir Vida (fogo-fátuo, 2024) só vale em criatura a 0 PV e mata ao falhar', () => {
    const rules24 = buildMonsterAbilities('2024', monsterRules24 as unknown as MonsterRules);
    const wisp = rules24.get('will-o-wisp')!.abilities.find((a) => a.nameEn === 'Consume Life')!;
    expect(wisp).toMatchObject({ kill: true, ifHpAtMost: 0, range: 5 });
    expect(wisp.resolution).toMatchObject({ kind: 'save', ability: 'con' });
    const troll = rules24.get('troll')!.abilities.find((a) => a.nameEn === 'Charge')!;
    expect(troll.move).toMatchObject({ towardEnemy: true });
  });
});
