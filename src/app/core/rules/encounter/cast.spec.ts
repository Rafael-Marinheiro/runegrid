import { Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { EncounterState, Role } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { RuleError } from '../creature';
import { fullCasterSlots } from '../creature/rest';
import { inCone, inSphere } from '../grid/area';
import { getSpell } from '../spells/data';
import { cantripTier, damageExpression, healExpression, scaleDice } from '../spells/scaling';
import { Command, dispatch, ForbiddenError, newEncounter } from './index';

const DM: Role = { kind: 'dm' };
const dice = (...rolls: [sides: number, value: number][]) => {
  let i = 0;
  return () => {
    const [sides, v] = rolls[i++] ?? [20, 10];
    return (v - 0.5) / sides;
  };
};
const run = (s: EncounterState, cmd: Command, rng = dice(), role: Role = DM) =>
  dispatch(s, cmd, { rng, role });

const map = mapFromAscii(['..........', '..........', '..........', '..........', '..........']);

// Int 18 (+4), nível 5 (prof +3): ataque de magia +7, CD 15
const mage = (over: Partial<Creature> = {}) =>
  newCreature('pc', {
    id: 'mage',
    name: 'Maga',
    level: 5,
    abilities: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 },
    spellSlots: fullCasterSlots(5),
    spellcasting: {
      ability: 'int',
      spells: [
        'fire-bolt',
        'fireball',
        'magic-missile',
        'cure-wounds',
        'healing-word',
        'hold-person',
        'burning-hands',
      ],
    },
    ...over,
  });
const foe = (id: string, over: Partial<Creature> = {}) =>
  newCreature('monster', {
    id,
    name: id,
    ac: 12,
    hp: { max: 40, current: 40, temp: 0 },
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ...over,
  });

/** Maga em (0,0), goblins em (5,0) e (7,0), aliado em (1,0). Maga age primeiro. */
function scene(
  over: { mage?: Partial<Creature>; a?: Partial<Creature>; b?: Partial<Creature> } = {},
) {
  let s = newEncounter(map);
  const add = (c: Creature, x: number, y: number, init: number) => {
    s = run(s, { type: 'addCreature', creature: c, pos: { x, y } });
    s = run(s, { type: 'setInitiative', id: c.id, value: init });
  };
  add(mage(over.mage), 0, 0, 20);
  add(
    newCreature('pc', { id: 'ally', name: 'Aliado', hp: { max: 30, current: 10, temp: 0 } }),
    1,
    0,
    15,
  );
  add(foe('a', over.a), 5, 0, 10);
  add(foe('b', over.b), 7, 0, 5);
  return run(s, { type: 'startCombat' });
}
const cast = (
  over: Partial<Extract<Command, { type: 'cast' }>> & { spellId: string },
): Command => ({
  type: 'cast',
  actorId: 'mage',
  ...over,
});
const hp = (s: EncounterState, id: string) => s.creatures.find((c) => c.id === id)!.hp.current;

describe('escalonamento de magias', () => {
  it('scaleDice e truques', () => {
    expect(scaleDice('1d6', 3)).toBe('3d6');
    expect(scaleDice('d8', 2)).toBe('2d8');
    expect([1, 4, 5, 10, 11, 16, 17, 20].map(cantripTier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('dano por nível de espaço, truque e Mísseis Mágicos', () => {
    const fireball = getSpell('fireball')!;
    expect(damageExpression(fireball, 3, 5)).toBe('8d6');
    expect(damageExpression(fireball, 5, 5)).toBe('8d6+2d6');
    expect(damageExpression(getSpell('fire-bolt')!, 0, 5)).toBe('2d10');
    expect(damageExpression(getSpell('fire-bolt')!, 0, 17)).toBe('4d10');
    const missile = getSpell('magic-missile')!;
    expect(damageExpression(missile, 1, 5).split('+1d4+1').length).toBe(3); // 3 dardos
    expect(damageExpression(missile, 3, 5).split('1d4+1').length - 1).toBe(5); // 5 dardos
    expect(healExpression(getSpell('cure-wounds')!, 3)).toBe('1d8+2d8');
  });
});

describe('áreas', () => {
  it('esfera de 20 ft alcança 4 células em volta do ponto', () => {
    expect(inSphere({ x: 5, y: 2 }, 20, { x: 9, y: 2 }, 1)).toBe(true);
    expect(inSphere({ x: 5, y: 2 }, 20, { x: 10, y: 2 }, 1)).toBe(false);
    expect(inSphere({ x: 5, y: 2 }, 20, { x: 8, y: 5 }, 1)).toBe(false); // 4,2 células na diagonal
    expect(inSphere({ x: 5, y: 2 }, 20, { x: 5, y: 6 }, 1)).toBe(true); // 4 células em linha reta
    expect(inSphere({ x: 5, y: 2 }, 20, { x: 4, y: 6 }, 1)).toBe(false); // 4,12 células
  });

  it('cone de 15 ft: só à frente, não no próprio conjurador', () => {
    const o = { x: 0, y: 5 };
    expect(inCone(o, 1, { x: 5, y: 5 }, 15, { x: 3, y: 5 }, 1)).toBe(true);
    expect(inCone(o, 1, { x: 5, y: 5 }, 15, { x: 4, y: 5 }, 1)).toBe(false); // além do alcance
    expect(inCone(o, 1, { x: 5, y: 5 }, 15, { x: 2, y: 6 }, 1)).toBe(true);
    expect(inCone(o, 1, { x: 5, y: 5 }, 15, { x: 0, y: 8 }, 1)).toBe(false); // ao lado
    expect(inCone(o, 1, { x: 5, y: 5 }, 15, o, 1)).toBe(false);
  });
});

describe('conjuração', () => {
  it('truque de ataque: acerta, escala com o nível e não gasta espaço', () => {
    // d20 15 + 7 = 22 ≥ 12; 2d10 (nível 5) = 6 + 4 = 10
    const s = run(
      scene(),
      cast({ spellId: 'fire-bolt', targetId: 'a' }),
      dice([20, 15], [10, 6], [10, 4]),
    );
    expect(hp(s, 'a')).toBe(30);
    expect(s.creatures.find((c) => c.id === 'mage')!.spellSlots[1].used).toBe(0);
    expect(s.combat.turn?.action).toBe(false);
  });

  it('erra quando o total não alcança a CA', () => {
    const s = run(scene(), cast({ spellId: 'fire-bolt', targetId: 'a' }), dice([20, 2])); // 2 + 7 = 9 < 12
    expect(hp(s, 'a')).toBe(40);
    expect(s.log.at(-1)?.text).toContain('erro');
  });

  it('Bola de Fogo: um único dano, salvaguarda individual, metade para quem passa', () => {
    // CD 15. 8d6 = 8 × 4 = 32. Goblin A falha (d20 5), goblin B passa (d20 18) → 32 e 16
    const rolls: [number, number][] = [
      ...Array.from({ length: 8 }, () => [6, 4] as [number, number]),
      [20, 5],
      [20, 18],
    ];
    const s = run(
      scene(),
      cast({ spellId: 'fireball', slotLevel: 3, point: { x: 6, y: 0 } }),
      dice(...rolls),
    );
    expect(hp(s, 'a')).toBe(40 - 32);
    expect(hp(s, 'b')).toBe(40 - 16);
    expect(s.creatures.find((c) => c.id === 'mage')!.spellSlots[3].used).toBe(1);
    expect(hp(s, 'ally')).toBe(10); // fora da esfera
  });

  it('a área também atinge aliados dentro dela', () => {
    const s = run(
      scene(),
      cast({ spellId: 'fireball', slotLevel: 3, point: { x: 2, y: 0 } }),
      dice(),
    );
    expect(hp(s, 'ally')).toBeLessThan(10);
  });

  it('Mísseis Mágicos com espaço maior lança mais dardos', () => {
    // espaço de 2º nível = 4 dardos × (1d4+1); cada d4 = 3 → 4 × 4 = 16
    const s = run(
      scene(),
      cast({ spellId: 'magic-missile', slotLevel: 2, targetId: 'a' }),
      dice([4, 3], [4, 3], [4, 3], [4, 3]),
    );
    expect(hp(s, 'a')).toBe(24);
    expect(s.creatures.find((c) => c.id === 'mage')!.spellSlots[2].used).toBe(1);
  });

  it('Curar Ferimentos soma o modificador de conjuração', () => {
    const s = run(scene(), cast({ spellId: 'cure-wounds', targetId: 'ally' }), dice([8, 5]));
    expect(hp(s, 'ally')).toBe(10 + 5 + 4);
  });

  it('cone: Mãos Flamejantes atinge quem está à frente', () => {
    let s = scene();
    s = run(s, { type: 'placeToken', id: 'a', pos: { x: 2, y: 0 } });
    const rolls: [number, number][] = [
      ...Array.from({ length: 3 }, () => [6, 3] as [number, number]),
      [20, 4],
    ];
    s = run(s, cast({ spellId: 'burning-hands', point: { x: 4, y: 0 } }), dice(...rolls));
    expect(hp(s, 'a')).toBe(40 - 9);
  });

  it('Imobilizar Pessoa paralisa quem falha e prende a concentração; outra concentração a substitui', () => {
    let s = run(
      scene(),
      cast({ spellId: 'hold-person', slotLevel: 2, targetId: 'a' }),
      dice([20, 3]),
    );
    expect(s.creatures.find((c) => c.id === 'a')!.conditions[0]).toMatchObject({
      name: 'paralyzed',
      rounds: 10,
    });
    expect(s.creatures.find((c) => c.id === 'mage')!.concentration).toBe('Imobilizar Pessoa');

    s = run(s, { type: 'endTurn', actorId: 'mage' });
    for (const id of ['ally', 'a', 'b']) s = run(s, { type: 'endTurn', actorId: id });
    const r = run(s, cast({ spellId: 'hold-person', slotLevel: 2, targetId: 'b' }), dice([20, 3]));
    expect(r.log.some((e) => e.text.includes('deixa de se concentrar em Imobilizar Pessoa'))).toBe(
      true,
    );
  });

  it('quem passa na salvaguarda não fica paralisado', () => {
    const s = run(
      scene(),
      cast({ spellId: 'hold-person', slotLevel: 2, targetId: 'a' }),
      dice([20, 19]),
    );
    expect(s.creatures.find((c) => c.id === 'a')!.conditions).toEqual([]);
  });

  it('paralisado falha automaticamente em Destreza', () => {
    let s = run(scene(), { type: 'addCondition', targetId: 'a', condition: 'paralyzed' });
    const rolls: [number, number][] = [
      ...Array.from({ length: 8 }, () => [6, 4] as [number, number]),
      [20, 20],
    ];
    s = run(s, cast({ spellId: 'fireball', slotLevel: 3, point: { x: 5, y: 0 } }), dice(...rolls));
    expect(hp(s, 'a')).toBe(40 - 32); // mesmo com 20 natural, não passa
  });
});

describe('restrições da conjuração', () => {
  it('só magias que a criatura conhece', () => {
    expect(() => run(scene(), cast({ spellId: 'sacred-flame', targetId: 'a' }))).toThrow(
      /não conhece/,
    );
  });

  it('exige espaço disponível e nível válido', () => {
    let s = scene({ mage: { spellSlots: { 1: { max: 1, used: 1 } } } });
    expect(() => run(s, cast({ spellId: 'magic-missile', targetId: 'a' }))).toThrow(/Sem espaço/);
    s = scene();
    expect(() =>
      run(s, cast({ spellId: 'fireball', slotLevel: 2, point: { x: 5, y: 0 } })),
    ).toThrow(RuleError);
  });

  it('respeita o alcance de toque e o do ponto', () => {
    expect(() => run(scene(), cast({ spellId: 'cure-wounds', targetId: 'b' }))).toThrow(/alcance/);
    expect(() =>
      run(scene(), cast({ spellId: 'fireball', slotLevel: 3, point: { x: 9, y: 4 } })),
    ).not.toThrow();
  });

  it('uma ação por turno; a ação bônus é separada', () => {
    let s = run(scene(), cast({ spellId: 'fire-bolt', targetId: 'a' }), dice([20, 2]));
    expect(() => run(s, cast({ spellId: 'fire-bolt', targetId: 'a' }))).toThrow(/ação/);
    s = run(s, cast({ spellId: 'healing-word', targetId: 'ally' }), dice([4, 2]));
    expect(hp(s, 'ally')).toBe(10 + 2 + 4);
    expect(s.combat.turn).toMatchObject({ action: false, bonus: false });
  });

  it('jogador conjura pela sua criatura, não pela dos outros', () => {
    const player: Role = { kind: 'player', owns: ['mage'] };
    const s = scene();
    expect(() =>
      run(s, cast({ spellId: 'fire-bolt', targetId: 'a' }), dice([20, 15]), player),
    ).not.toThrow();
    expect(() =>
      run(s, cast({ actorId: 'ally', spellId: 'fire-bolt', targetId: 'a' }), dice(), player),
    ).toThrow(ForbiddenError);
  });

  it('jogador não mira criatura oculta', () => {
    const player: Role = { kind: 'player', owns: ['mage'] };
    const s = run(scene(), { type: 'setHidden', id: 'a', hidden: true });
    expect(() => run(s, cast({ spellId: 'fire-bolt', targetId: 'a' }), dice(), player)).toThrow(
      /visível/,
    );
  });

  it('atordoado não conjura', () => {
    const s = run(scene(), { type: 'addCondition', targetId: 'mage', condition: 'stunned' });
    expect(() => run(s, cast({ spellId: 'fire-bolt', targetId: 'a' }))).toThrow(/não pode agir/);
  });
});
