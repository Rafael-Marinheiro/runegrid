import { Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { EncounterState, Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { Spell } from '../../models/spell';
import { effectiveAc, effectiveSpeed } from '../creature';
import { fullCasterSlots } from '../creature/rest';
import { registerSpells } from '../spells/registry';
import { Command, dispatch, newEncounter } from './index';

const DM: Role = { kind: 'dm' };
const run = (s: EncounterState, cmd: Command, rng: () => number = () => 0.5) =>
  dispatch(s, cmd, { rng, role: DM });

const base = {
  school: 'Evocação',
  castTime: 'action',
  description: 'teste',
  range: 60,
} as const;

const SPELLS: Spell[] = [
  {
    ...base,
    id: 't-bless',
    name: 'Bênção T',
    level: 1,
    target: { kind: 'creature', max: 3, perLevel: 1 },
    resolution: { kind: 'auto' },
    concentration: true,
    rounds: 10,
    effect: { mods: { attackDie: '1d4', saveDie: '1d4' } },
  },
  {
    ...base,
    id: 't-shield',
    name: 'Escudo T',
    level: 1,
    range: 0,
    target: { kind: 'self' },
    resolution: { kind: 'auto' },
    rounds: 1,
    effect: { ends: 'casterStart', mods: { ac: 5 } },
  },
  {
    ...base,
    id: 't-armor',
    name: 'Armadura T',
    level: 1,
    target: { kind: 'creature' },
    resolution: { kind: 'auto' },
    rounds: 4800,
    effect: { mods: { acBase: 13, acBaseDex: true } },
  },
  {
    ...base,
    id: 't-hold',
    name: 'Imobilizar T',
    level: 2,
    target: { kind: 'creature', max: 1, perLevel: 1 },
    resolution: { kind: 'save', ability: 'wis', onSave: 'none' },
    concentration: true,
    condition: { name: 'paralyzed', rounds: 10, repeatSave: true },
  },
  {
    ...base,
    id: 't-wave',
    name: 'Onda T',
    level: 1,
    range: 0,
    target: { kind: 'cube', size: 15, self: true },
    resolution: { kind: 'save', ability: 'con', onSave: 'half' },
    damage: { dice: '2d8', type: 'thunder', perLevel: '1d8' },
    push: { ft: 10 },
  },
  {
    ...base,
    id: 't-rays',
    name: 'Raios T',
    level: 2,
    range: 120,
    target: { kind: 'creature', max: 3 },
    resolution: { kind: 'attack' },
    damage: { dice: '2d6', type: 'fire', perLevel: '1d6', instances: { base: 3, perLevel: 1 } },
  },
  {
    ...base,
    id: 't-blast',
    name: 'Rajada T',
    level: 0,
    target: { kind: 'creature', max: 2 },
    resolution: { kind: 'attack' },
    damage: { dice: '1d10', type: 'force', cantrip: true, beams: true },
  },
  {
    ...base,
    id: 't-missiles',
    name: 'Mísseis T',
    level: 1,
    target: { kind: 'creature', max: 3 },
    resolution: { kind: 'auto' },
    damage: { dice: '1d4+1', type: 'force', instances: { base: 3, perLevel: 1 } },
  },
  {
    ...base,
    id: 't-web',
    name: 'Teia T',
    level: 2,
    range: 60,
    target: { kind: 'cube', size: 20 },
    resolution: { kind: 'save', ability: 'dex', onSave: 'none' },
    concentration: true,
    condition: { name: 'restrained', rounds: 600 },
    zone: { on: 'start' },
  },
  {
    ...base,
    id: 't-aura',
    name: 'Aura T',
    level: 3,
    range: 0,
    target: { kind: 'sphere', radius: 15, self: true },
    resolution: { kind: 'save', ability: 'wis', onSave: 'half' },
    damage: { dice: '3d8', type: 'radiant' },
    concentration: true,
    noInitial: true,
    zone: { on: 'start', aura: true },
  },
  {
    ...base,
    id: 't-weapon',
    name: 'Arma T',
    level: 2,
    castTime: 'bonus',
    range: 60,
    target: { kind: 'creature' },
    resolution: { kind: 'attack' },
    damage: { dice: '1d8', type: 'force' },
    rounds: 10,
    sustain: { cost: 'bonus' },
  },
  {
    ...base,
    id: 't-slow',
    name: 'Lentidão T',
    level: 1,
    target: { kind: 'creature' },
    resolution: { kind: 'auto' },
    rounds: 10,
    effect: { mods: { speed: -10, resist: ['fire'], dotEnd: { dice: '1d4', type: 'acid' } } },
  },
  {
    ...base,
    id: 't-false-life',
    name: 'Vida Falsa T',
    level: 1,
    range: 0,
    target: { kind: 'self' },
    resolution: { kind: 'auto' },
    tempHp: { dice: '1d4', flat: 4, flatPerLevel: 5 },
  },
  {
    ...base,
    id: 't-step',
    name: 'Passo T',
    level: 2,
    castTime: 'bonus',
    range: 30,
    target: { kind: 'point' },
    resolution: { kind: 'auto' },
    teleport: true,
  },
  {
    ...base,
    id: 't-rshield',
    name: 'Escudo R',
    level: 1,
    castTime: 'reaction',
    range: 0,
    target: { kind: 'self' },
    resolution: { kind: 'auto' },
    react: { on: 'hit', acBonus: 5 },
    effect: { ends: 'casterStart', mods: { ac: 5 } },
  },
  {
    ...base,
    id: 't-rebuke',
    name: 'Repreensão R',
    level: 1,
    castTime: 'reaction',
    range: 60,
    target: { kind: 'creature' },
    resolution: { kind: 'save', ability: 'dex', onSave: 'half' },
    damage: { dice: '2d10', type: 'fire', perLevel: '1d10' },
    react: { on: 'damaged' },
  },
  {
    ...base,
    id: 't-counter',
    name: 'Contrafeitiço R',
    level: 3,
    castTime: 'reaction',
    range: 60,
    target: { kind: 'creature' },
    resolution: { kind: 'auto' },
    react: { on: 'cast' },
  },
  {
    ...base,
    id: 't-feather',
    name: 'Queda R',
    level: 1,
    castTime: 'reaction',
    range: 60,
    target: { kind: 'creature', max: 5 },
    resolution: { kind: 'auto' },
    narrative: true,
  },
  {
    ...base,
    id: 't-lore',
    name: 'Saber T',
    level: 1,
    range: 0,
    target: { kind: 'self' },
    resolution: { kind: 'auto' },
    narrative: true,
  },
];
registerSpells('2014', SPELLS);

const map = mapFromAscii(Array.from({ length: 8 }, () => '................'));

const mage = (over: Partial<Creature> = {}) =>
  newCreature('pc', {
    id: 'mage',
    name: 'Maga',
    level: 5,
    abilities: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 },
    spellSlots: fullCasterSlots(5),
    spellcasting: { ability: 'int', spells: SPELLS.map((s) => s.id) },
    ...over,
  });
const foe = (id: string, over: Partial<Creature> = {}) =>
  newCreature('monster', {
    id,
    name: id,
    ac: 12,
    hp: { max: 60, current: 60, temp: 0 },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ...over,
  });

function scene(foes: { id: string; x: number; y: number; over?: Partial<Creature> }[] = []) {
  let s = newEncounter(map);
  const add = (c: Creature, x: number, y: number, init: number) => {
    s = run(s, { type: 'addCreature', creature: c, pos: { x, y } });
    s = run(s, { type: 'setInitiative', id: c.id, value: init });
  };
  add(mage(), 4, 4, 20);
  add(newCreature('pc', { id: 'ally', name: 'Aliado', ac: 14 }), 3, 4, 15);
  foes.forEach((f, i) => add(foe(f.id, f.over), f.x, f.y, 10 - i));
  return run(s, { type: 'startCombat' });
}
const cast = (
  over: Partial<Extract<Command, { type: 'cast' }>> & { spellId: string },
): Command => ({
  type: 'cast',
  actorId: 'mage',
  ...over,
});
const get = (s: EncounterState, id: string) => s.creatures.find((c) => c.id === id)!;
const at = (s: EncounterState, id: string) => s.tokens.find((t) => t.creatureId === id)!.pos;

describe('efeitos ativos', () => {
  it('Bênção: vários alvos, limite por espaço, dado extra e some com a concentração', () => {
    let s = scene([
      { id: 'a', x: 6, y: 4 },
      { id: 'b', x: 7, y: 4 },
    ]);
    expect(() =>
      run(s, cast({ spellId: 't-bless', targetIds: ['mage', 'ally', 'a', 'b'], slotLevel: 1 })),
    ).toThrow(/no máximo 3/);
    expect(() =>
      run(s, cast({ spellId: 't-bless', targetIds: ['mage', 'ally', 'a', 'b'], slotLevel: 2 })),
    ).not.toThrow(); // +1 alvo por nível acima do 1º
    s = run(s, cast({ spellId: 't-bless', targetIds: ['mage', 'ally'] }));
    expect(get(s, 'ally').effects?.[0].mods.attackDie).toBe('1d4');
    expect(get(s, 'mage').concentration).toBe('Bênção T');
    // a concentração quebra: o efeito some dos aliados
    s = run(s, { type: 'damage', targetId: 'mage', amount: 40 }, () => 0.01);
    expect(get(s, 'ally').effects).toBeUndefined();
  });

  it('Escudo: +5 na CA até o início do próximo turno do conjurador', () => {
    let s = scene([{ id: 'a', x: 6, y: 4 }]);
    s = run(s, cast({ spellId: 't-shield' }));
    expect(effectiveAc(get(s, 'mage'))).toBe(get(s, 'mage').ac + 5);
    s = run(s, { type: 'endTurn', actorId: 'mage' });
    expect(effectiveAc(get(s, 'mage'))).toBe(get(s, 'mage').ac + 5);
    s = run(s, { type: 'endTurn', actorId: 'ally' });
    s = run(s, { type: 'endTurn', actorId: 'a' });
    expect(get(s, 'mage').effects).toBeUndefined();
    expect(effectiveAc(get(s, 'mage'))).toBe(get(s, 'mage').ac);
  });

  it('Armadura: CA base 13 + Des só vale se maior', () => {
    let s = scene();
    s = run(s, cast({ spellId: 't-armor', targetId: 'ally' }));
    expect(effectiveAc(get(s, 'ally'))).toBe(14); // tinha 14, base 13 não melhora
    const d = mage({ ac: 10 });
    const withArmor = {
      ...d,
      effects: [
        { id: 'x', spell: 't-armor', name: 'x', by: 'y', mods: { acBase: 13, acBaseDex: true } },
      ],
    };
    expect(effectiveAc(withArmor)).toBe(15); // 13 + Des 14 (+2)
  });

  it('velocidade, resistência e dano contínuo vêm do efeito', () => {
    let s = scene([{ id: 'a', x: 6, y: 4 }]);
    s = run(s, cast({ spellId: 't-slow', targetId: 'a' }));
    expect(effectiveSpeed(get(s, 'a'))).toBe(get(s, 'a').speed - 10);
    s = run(s, { type: 'endTurn', actorId: 'mage' });
    s = run(s, { type: 'endTurn', actorId: 'ally' });
    const before = get(s, 'a').hp.current;
    s = run(s, { type: 'endTurn', actorId: 'a' });
    expect(get(s, 'a').hp.current).toBeLessThan(before); // 1d4 ácido no fim do turno
    s = run(s, { type: 'damage', targetId: 'a', amount: 10, damageType: 'fire' });
    expect(s.log.at(-1)?.text).toContain('5'); // resistência a fogo: 10 → 5
  });

  it('PV temporários: dado + fixo + por nível', () => {
    let s = scene();
    s = run(s, cast({ spellId: 't-false-life', slotLevel: 3 }));
    expect(get(s, 'mage').hp.temp).toBe(3 + 4 + 10); // 1d4 (0,5→3) + 4 + 5×2
  });

  it('magia narrativa gasta o espaço e registra a nota', () => {
    let s = scene();
    s = run(s, cast({ spellId: 't-lore' }));
    expect(get(s, 'mage').spellSlots[1].used).toBe(1);
    expect(s.log.some((e) => e.text.includes('narrativo'))).toBe(true);
  });
});

describe('condição com salvaguarda repetida', () => {
  it('o alvo repete a salvaguarda no fim do turno e sai da paralisia ao passar', () => {
    let s = scene([
      {
        id: 'a',
        x: 6,
        y: 4,
        over: { abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 30, cha: 10 } },
      },
    ]);
    // Sab 30 (+10): passa sempre; para forçar falha, use Sab 1
    s = run(s, cast({ spellId: 't-hold', targetId: 'a' }), () => 0.01);
    expect(get(s, 'a').conditions.some((c) => c.name === 'paralyzed')).toBe(true);
    s = run(s, { type: 'endTurn', actorId: 'mage' });
    s = run(s, { type: 'endTurn', actorId: 'ally' });
    s = run(s, { type: 'endTurn', actorId: 'a' }, () => 0.99); // passa na repetição
    expect(get(s, 'a').conditions.some((c) => c.name === 'paralyzed')).toBe(false);
  });
});

describe('áreas, empurrão e vários ataques', () => {
  it('cubo a partir do conjurador: falhou é empurrado 10 ft; passou toma metade e fica', () => {
    let s = scene([
      { id: 'a', x: 5, y: 4 },
      {
        id: 'b',
        x: 6,
        y: 5,
        over: { abilities: { str: 10, dex: 10, con: 30, int: 10, wis: 10, cha: 10 } },
      },
    ]);
    const before = at(s, 'a');
    s = run(s, cast({ spellId: 't-wave', point: { x: 7, y: 4 } }), () => 0.3);
    expect(at(s, 'a').x).toBe(before.x + 2);
    expect(get(s, 'a').hp.current).toBeLessThan(60);
    expect(at(s, 'b')).toEqual({ x: 6, y: 5 }); // Con 30 passou: sem empurrão
  });

  it('Raios: um ataque por raio, repartido entre os alvos; +1 raio por nível', () => {
    let s = scene([
      { id: 'a', x: 6, y: 4, over: { ac: 5 } },
      { id: 'b', x: 7, y: 4, over: { ac: 5 } },
    ]);
    s = run(s, cast({ spellId: 't-rays', targetIds: ['a', 'b'], slotLevel: 3 }));
    expect(s.log.filter((e) => e.text.includes('raio ')).length).toBe(4);
  });

  it('truque com raios: 2 raios no nível 5', () => {
    let s = scene([{ id: 'a', x: 6, y: 4, over: { ac: 5 } }]);
    s = run(s, cast({ spellId: 't-blast', targetId: 'a' }));
    expect(s.log.filter((e) => e.text.includes('raio ')).length).toBe(2);
  });

  it('Mísseis: dardos repartidos entre alvos, um dado por dardo', () => {
    let s = scene([
      { id: 'a', x: 6, y: 4 },
      { id: 'b', x: 7, y: 4 },
    ]);
    s = run(s, cast({ spellId: 't-missiles', targetIds: ['a', 'b'] }));
    // 3 dardos de 1d4+1 (0,5 → 3+1 = 4): a leva 2 (8), b leva 1 (4)
    expect(get(s, 'a').hp.current).toBe(52);
    expect(get(s, 'b').hp.current).toBe(56);
  });
});

describe('zonas e magias mantidas', () => {
  it('Teia: contém quem falhou, e quem entra na área no início do turno repete a salvaguarda', () => {
    let s = scene([{ id: 'a', x: 6, y: 4 }]);
    s = run(s, cast({ spellId: 't-web', point: { x: 6, y: 4 } }), () => 0.01);
    expect(get(s, 'a').conditions.some((c) => c.name === 'restrained')).toBe(true);
    expect(s.zones?.length).toBe(1);
    // perder a concentração desfaz a zona
    s = run(s, { type: 'damage', targetId: 'mage', amount: 40 }, () => 0.01);
    expect(s.zones?.length ?? 0).toBe(0);
    expect(get(s, 'a').conditions.some((c) => c.name === 'restrained')).toBe(false);
  });

  it('Aura: a conjuração não causa dano; o dano vem no início do turno de quem está dentro', () => {
    let s = scene([{ id: 'a', x: 6, y: 4 }]);
    s = run(s, cast({ spellId: 't-aura', slotLevel: 3 }));
    expect(get(s, 'a').hp.current).toBe(60);
    s = run(s, { type: 'endTurn', actorId: 'mage' });
    s = run(s, { type: 'endTurn', actorId: 'ally' });
    expect(get(s, 'a').hp.current).toBeLessThan(60); // início do turno de 'a'
  });

  it('Arma Espiritual: repete sem gastar espaço, pela ação bônus', () => {
    let s = scene([{ id: 'a', x: 6, y: 4, over: { ac: 5 } }]);
    s = run(s, cast({ spellId: 't-weapon', targetId: 'a', slotLevel: 2 }));
    expect(get(s, 'mage').sustained?.length).toBe(1);
    expect(() => run(s, cast({ spellId: 't-weapon', targetId: 'a', sustain: true }))).toThrow(); // sem ação bônus
    s = run(s, { type: 'endTurn', actorId: 'mage' });
    s = run(s, { type: 'endTurn', actorId: 'ally' });
    s = run(s, { type: 'endTurn', actorId: 'a' });
    const used = get(s, 'mage').spellSlots[2].used;
    s = run(s, cast({ spellId: 't-weapon', targetId: 'a', sustain: true }));
    expect(get(s, 'mage').spellSlots[2].used).toBe(used);
  });

  it('Passo: teletransporta até o ponto, dentro do alcance', () => {
    let s = scene();
    s = run(s, cast({ spellId: 't-step', point: { x: 4, y: 7 }, slotLevel: 2 }));
    expect(at(s, 'mage')).toEqual({ x: 4, y: 7 });
    expect(() =>
      run(scene(), cast({ spellId: 't-step', point: { x: 15, y: 0 }, slotLevel: 2 })),
    ).toThrow(/alcance/);
  });
});

describe('reações de magia', () => {
  const duel = () => {
    let s = newEncounter(map);
    const add = (c: Creature, x: number, y: number, init: number) => {
      s = run(s, { type: 'addCreature', creature: c, pos: { x, y } });
      s = run(s, { type: 'setInitiative', id: c.id, value: init });
    };
    add(
      foe('orc', {
        attacks: [{ name: 'Machado', bonus: 5, damage: '1d12+3', type: 'slashing', range: 5 }],
      }),
      5,
      4,
      20,
    );
    add(mage({ ac: 12, hp: { max: 60, current: 60, temp: 0 } }), 4, 4, 10);
    return run(s, { type: 'startCombat' });
  };

  it('Escudo: o acerto fica suspenso; usar a magia transforma em erro', () => {
    let s = duel();
    const hp = get(s, 'mage').hp.current;
    s = run(s, { type: 'attack', actorId: 'orc', targetId: 'mage', attackIndex: 0 });
    expect(s.combat.pending?.[0]?.kind).toBe('spell');
    expect(get(s, 'mage').hp.current).toBe(hp); // dano ainda não aplicado
    expect(() => run(s, { type: 'endTurn', actorId: 'orc' })).toThrow(/Aguardando/);
    s = run(s, { type: 'reaction', actorId: 'mage', use: true, spellId: 't-rshield' });
    expect(get(s, 'mage').hp.current).toBe(hp);
    expect(s.log.some((e) => e.text.includes('erro (Escudo R)'))).toBe(true);
    expect(get(s, 'mage').spellSlots[1].used).toBe(1);
    expect(s.combat.reactionUsed).toContain('mage');
  });

  it('Escudo recusado: o dano é aplicado', () => {
    let s = duel();
    const hp = get(s, 'mage').hp.current;
    s = run(s, { type: 'attack', actorId: 'orc', targetId: 'mage', attackIndex: 0 });
    s = run(s, { type: 'reaction', actorId: 'mage', use: false });
    expect(get(s, 'mage').hp.current).toBeLessThan(hp);
    // a Repreensão passa a ser oferecida depois do dano
    expect((s.combat.pending ?? []).every((p) => p.spell?.trigger === 'damaged')).toBe(true);
  });

  it('Repreensão: depois do dano, queima quem feriu', () => {
    let s = duel();
    // a Repreensão só é oferecida se o Escudo não for (mago sem Escudo conhecido)
    s = run(s, { type: 'addCondition', targetId: 'orc', condition: 'prone' });
    const mg = get(s, 'mage');
    s = {
      ...s,
      creatures: s.creatures.map((c) =>
        c.id === 'mage' ? { ...mg, spellcasting: { ability: 'int', spells: ['t-rebuke'] } } : c,
      ),
    };
    s = run(s, { type: 'attack', actorId: 'orc', targetId: 'mage', attackIndex: 0 });
    expect(s.combat.pending?.[0]?.spell?.trigger).toBe('damaged');
    const orc = get(s, 'orc').hp.current;
    s = run(s, { type: 'reaction', actorId: 'mage', use: true, spellId: 't-rebuke' }, () => 0.01);
    expect(get(s, 'orc').hp.current).toBeLessThan(orc);
  });

  it('Contrafeitiço: anula uma magia de nível igual ou menor', () => {
    let s = newEncounter(map);
    const add = (c: Creature, x: number, y: number, init: number) => {
      s = run(s, { type: 'addCreature', creature: c, pos: { x, y } });
      s = run(s, { type: 'setInitiative', id: c.id, value: init });
    };
    add(
      foe('lich', {
        spellcasting: { ability: 'int', spells: ['t-missiles'] },
        spellSlots: fullCasterSlots(9),
      }),
      6,
      4,
      20,
    );
    add(mage({ spellcasting: { ability: 'int', spells: ['t-counter'] } }), 4, 4, 10);
    s = run(s, { type: 'startCombat' });
    s = run(s, { type: 'cast', actorId: 'lich', spellId: 't-missiles', targetId: 'mage' });
    expect(s.combat.pending?.[0]?.spell?.trigger).toBe('cast');
    const hp = get(s, 'mage').hp.current;
    s = run(s, {
      type: 'reaction',
      actorId: 'mage',
      use: true,
      spellId: 't-counter',
      slotLevel: 3,
    });
    expect(get(s, 'mage').hp.current).toBe(hp);
    expect(s.log.some((e) => e.text.includes('perde'))).toBe(true);
    expect(get(s, 'lich').spellSlots[1].used).toBe(1); // o espaço já tinha sido gasto
  });

  it('Contrafeitiço recusado: a magia segue', () => {
    let s = newEncounter(map);
    const add = (c: Creature, x: number, y: number, init: number) => {
      s = run(s, { type: 'addCreature', creature: c, pos: { x, y } });
      s = run(s, { type: 'setInitiative', id: c.id, value: init });
    };
    add(
      foe('lich', {
        spellcasting: { ability: 'int', spells: ['t-missiles'] },
        spellSlots: fullCasterSlots(9),
      }),
      6,
      4,
      20,
    );
    add(mage({ spellcasting: { ability: 'int', spells: ['t-counter'] } }), 4, 4, 10);
    s = run(s, { type: 'startCombat' });
    s = run(s, { type: 'cast', actorId: 'lich', spellId: 't-missiles', targetId: 'mage' });
    const hp = get(s, 'mage').hp.current;
    s = run(s, { type: 'reaction', actorId: 'mage', use: false });
    expect(get(s, 'mage').hp.current).toBeLessThan(hp);
  });

  it('reação avulsa (Queda Suave) gasta espaço e reação sem gatilho', () => {
    let s = scene();
    s = run(s, {
      type: 'reaction',
      actorId: 'mage',
      use: true,
      spellId: 't-feather',
      targetId: 'ally',
    });
    expect(get(s, 'mage').spellSlots[1].used).toBe(1);
    expect(() =>
      run(s, {
        type: 'reaction',
        actorId: 'mage',
        use: true,
        spellId: 't-feather',
        targetId: 'ally',
      }),
    ).toThrow(/já usou/);
  });
});
