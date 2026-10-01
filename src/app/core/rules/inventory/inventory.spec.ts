import { newCreature } from '../../models/creature-factory';
import { mapFromAscii } from '../../models/grid';
import { RuleError } from '../creature';
import { dispatch, newEncounter } from '../encounter';
import { addItem, carriedWeight, consume, corrode, toggleEquip } from './inventory';

const hero = () =>
  newCreature('pc', {
    id: 'h',
    name: 'Herói',
    level: 1,
    ac: 10,
    abilities: { str: 16, dex: 14, con: 10, int: 10, wis: 10, cha: 10 },
    hp: { max: 20, current: 5, temp: 0 },
    attacks: [],
  });
const idOf = (c: ReturnType<typeof hero>, ref: string) =>
  c.inventory!.find((i) => i.ref === ref)!.id;

describe('inventário', () => {
  it('armadura recalcula a CA (Des limitada) e escudo soma', () => {
    let c = addItem(addItem(addItem(hero(), 'chain-shirt'), 'shield'), 'plate');
    c = toggleEquip(c, idOf(c, 'chain-shirt'));
    expect(c.ac).toBe(15); // 13 + Des(+2)
    c = toggleEquip(c, idOf(c, 'shield'));
    expect(c.ac).toBe(17);
    c = toggleEquip(c, idOf(c, 'plate')); // troca a armadura
    expect(c.ac).toBe(20);
    expect(c.inventory!.find((i) => i.ref === 'chain-shirt')!.equipped).toBe(false);
  });

  it('arma equipada vira ataque (acuidade usa o melhor atributo)', () => {
    let c = addItem(addItem(hero(), 'rapier'), 'longsword');
    c = toggleEquip(toggleEquip(c, idOf(c, 'rapier')), idOf(c, 'longsword'));
    const atk = (n: string) => c.attacks.find((a) => a.name === n)!;
    expect(atk('Espada longa').bonus).toBe(5); // prof 2 + For 3
    expect(atk('Espada longa').damage).toBe('1d10+3'); // versátil, sem escudo
    c = toggleEquip(c, idOf(c, 'longsword'));
    expect(c.attacks.map((a) => a.name)).toEqual(['Rapieira']);
  });

  it('arma versátil usa o dano maior sem escudo', () => {
    let c = addItem(addItem(hero(), 'longsword'), 'shield');
    c = toggleEquip(c, idOf(c, 'longsword'));
    expect(c.attacks[0].damage).toBe('1d10+3');
    c = toggleEquip(c, idOf(c, 'shield'));
    expect(c.attacks[0].damage).toBe('1d8+3');
  });

  it('consumíveis empilham, gastam e somem; peso soma', () => {
    let c = addItem(addItem(hero(), 'potion-healing', 2), 'potion-healing');
    expect(c.inventory).toHaveLength(1);
    expect(carriedWeight(c)).toBe(1.5);
    c = consume(consume(c, c.inventory![0].id), c.inventory![0].id);
    expect(c.inventory![0].qty).toBe(1);
    c = consume(c, c.inventory![0].id);
    expect(c.inventory).toHaveLength(0);
  });

  it('não equipa consumível', () => {
    const c = addItem(hero(), 'antidote');
    expect(() => toggleEquip(c, c.inventory![0].id)).toThrow(RuleError);
  });

  it('useItem: poção cura pelo motor, gasta a ação e o item', () => {
    const c = addItem(hero(), 'potion-healing');
    let s = newEncounter(mapFromAscii(['....', '....']));
    s = dispatch(
      s,
      { type: 'addCreature', creature: c, pos: { x: 0, y: 0 } },
      { rng: () => 0.5, role: { kind: 'dm' } },
    );
    s = dispatch(
      s,
      { type: 'setInitiative', id: 'h', value: 10 },
      { rng: () => 0.5, role: { kind: 'dm' } },
    );
    s = dispatch(s, { type: 'startCombat' }, { rng: () => 0.5, role: { kind: 'dm' } });
    const use = { type: 'useItem', actorId: 'h', itemId: c.inventory![0].id } as const;
    s = dispatch(s, use, { rng: () => 0.5, role: { kind: 'player', owns: ['h'] } });
    const h = s.creatures[0];
    expect(h.hp.current).toBeGreaterThan(5);
    expect(h.inventory).toHaveLength(0);
    expect(() => dispatch(s, use, { rng: () => 0.5, role: { kind: 'dm' } })).toThrow(RuleError);
  });
});

describe('ferrugem', () => {
  const equip = (ref: string) => {
    const c = addItem(hero(), ref);
    return toggleEquip(c, c.inventory![0].id);
  };

  it('a arma de metal perde 1 de dano por toque e some em −5', () => {
    let c = equip('longsword');
    for (let i = 1; i <= 4; i++) {
      const r = corrode(c, 'weapon', 'damage')!;
      expect(r.destroyed).toBe(false);
      c = r.creature;
    }
    expect(c.inventory![0].corrosion?.n).toBe(4);
    const dmg = (x: typeof c) => x.attacks.find((a) => a.name === 'Espada longa')!.damage;
    const base = dmg(toggleEquip(toggleEquip(c, c.inventory![0].id), c.inventory![0].id));
    expect(base).toBe(dmg(c));
    const last = corrode(c, 'weapon', 'damage')!;
    expect(last.destroyed).toBe(true);
    expect(last.creature.inventory).toHaveLength(0);
  });

  it('o escudo some ao chegar a +0 e o que não é de metal não enferruja', () => {
    let c = equip('shield');
    c = corrode(c, 'shield', 'damage')!.creature;
    expect(corrode(c, 'shield', 'damage')!.destroyed).toBe(true);
    expect(corrode(equip('leather'), 'armor', 'damage')).toBeNull();
    expect(corrode(equip('quarterstaff'), 'weapon', 'damage')).toBeNull();
  });
});
