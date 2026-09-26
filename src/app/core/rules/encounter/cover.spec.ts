import { newCreature } from '../../models/creature-factory';
import { mapFromAscii } from '../../models/grid';
import { RuleError } from '../creature';
import { dispatch, newEncounter } from './index';
import { coverBonus } from './cover';

const DM = { kind: 'dm' } as const;
const rng = (v: number) => () => (v - 0.5) / 20; // d20 = v

function scene(rows: string[], bx: number, reach = 30) {
  let s = newEncounter(mapFromAscii(rows));
  const add = (id: string, kind: 'pc' | 'monster', x: number, y: number, init: number, ac = 12) => {
    s = dispatch(
      s,
      {
        type: 'addCreature',
        creature: newCreature(kind, {
          id,
          name: id,
          ac,
          attacks: [{ name: 'Espada', bonus: 0, damage: '1', type: 'slashing', range: reach }],
        }),
        pos: { x, y },
      },
      { rng: rng(10), role: DM },
    );
    s = dispatch(s, { type: 'setInitiative', id, value: init }, { rng: rng(10), role: DM });
  };
  add('a', 'pc', 0, 0, 20);
  add('b', 'pc', 1, 1, 15);
  add('foe', 'monster', bx, 0, 10);
  return dispatch(s, { type: 'startCombat' }, { rng: rng(10), role: DM });
}

describe('cobertura', () => {
  it('0, +2 (um obstáculo) e +5 (dois)', () => {
    const s = scene(['..#.#.', '......'], 5);
    expect(coverBonus(s, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(coverBonus(s, { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(2);
    expect(coverBonus(s, { x: 0, y: 0 }, { x: 5, y: 0 })).toBe(5);
  });

  it('cobertura sobe a CA efetiva: 11 acerta na CA 12 sem cobertura só com d20 alto', () => {
    const s = scene(['..#...', '......'], 3);
    const hit = dispatch(
      s,
      { type: 'attack', actorId: 'a', targetId: 'foe', attackIndex: 0 },
      { rng: rng(12), role: DM },
    );
    expect(hit.log.at(-1)!.text).toContain('erro'); // 12 < 12+2
    expect(hit.log.at(-1)!.text).toContain('cobertura +2');
  });
});

describe('Ajudar', () => {
  it('dá vantagem ao próximo ataque contra o alvo e é gasta', () => {
    let s = scene(['......', '......'], 1, 5);
    s = dispatch(s, { type: 'help', actorId: 'a', targetId: 'foe' }, { rng: rng(10), role: DM });
    expect(s.combat.helped).toEqual([{ targetId: 'foe', by: 'a' }]);
    s = dispatch(s, { type: 'endTurn', actorId: 'a' }, { rng: rng(10), role: DM });
    s = dispatch(
      s,
      { type: 'attack', actorId: 'b', targetId: 'foe', attackIndex: 0 },
      { rng: rng(10), role: DM },
    );
    expect(s.log.at(-1)!.text).toContain('vantagem');
    expect(s.combat.helped).toEqual([]);
  });

  it('exige inimigo adjacente', () => {
    const s = scene(['......', '......'], 4);
    expect(() =>
      dispatch(s, { type: 'help', actorId: 'a', targetId: 'foe' }, { rng: rng(10), role: DM }),
    ).toThrow(RuleError);
  });
});
