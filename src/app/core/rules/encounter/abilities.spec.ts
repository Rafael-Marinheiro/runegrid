import { Attack, Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import { EncounterState } from '../../models/encounter';
import { mapFromAscii } from '../../models/grid';
import { RuleError } from '../creature';
import { fullCasterSlots } from '../creature/rest';
import { Command, dispatch, newEncounter } from './index';

const dm = { kind: 'dm' } as const;
const rng = () => 0.5; // d20 = 11, d10 = 6, d6 = 4, d8 = 5
const map = mapFromAscii(Array.from({ length: 5 }, () => '..........'));
const run = (s: EncounterState, cmd: Command) => dispatch(s, cmd, { rng, role: dm });

const sword: Attack = { name: 'Espada', bonus: 5, damage: '1d8+3', type: 'slashing', range: 5 };
const dagger: Attack = {
  ...sword,
  name: 'Adaga',
  damage: '1d4+3',
  type: 'piercing',
  finesse: true,
};

function scene(hero: Partial<Creature>, extra: Creature[] = []) {
  let s = newEncounter(map);
  const add = (c: Creature, x: number, y: number, init: number) => {
    s = run(s, { type: 'addCreature', creature: c, pos: { x, y } });
    s = run(s, { type: 'setInitiative', id: c.id, value: init });
  };
  add(
    newCreature('pc', {
      id: 'hero',
      name: 'Herói',
      level: 5,
      hp: { max: 40, current: 20, temp: 0 },
      attacks: [sword],
      ...hero,
    }),
    2,
    2,
    20,
  );
  add(
    newCreature('monster', {
      id: 'foe',
      name: 'Goblin',
      ac: 8,
      hp: { max: 200, current: 200, temp: 0 },
      attacks: [{ ...sword, name: 'Garra' }],
    }),
    3,
    2,
    10,
  );
  extra.forEach((c, i) => add(c, 4, 1 + i, 5 - i));
  return run(s, { type: 'startCombat' });
}

const hero = (s: EncounterState) => s.creatures.find((c) => c.id === 'hero')!;
const foe = (s: EncounterState) => s.creatures.find((c) => c.id === 'foe')!;
const feature = (f: 'second-wind' | 'action-surge' | 'rage'): Command => ({
  type: 'feature',
  actorId: 'hero',
  feature: f,
});
const hit = (): Command => ({ type: 'attack', actorId: 'hero', attackIndex: 0, targetId: 'foe' });

describe('Retomar o Fôlego', () => {
  it('cura 1d10 + nível com ação bônus, uma vez por descanso curto', () => {
    let s = scene({ features: ['second-wind'] });
    s = run(s, feature('second-wind'));
    expect(hero(s).hp.current).toBe(20 + 6 + 5);
    expect(s.combat.turn?.bonus).toBe(false);
    expect(s.log.at(-1)?.en).toContain('regains 11 HP');
    expect(() => run(s, feature('second-wind'))).toThrow(RuleError);
  });

  it('exige a característica', () => {
    expect(() => run(scene({}), feature('second-wind'))).toThrow(/não tem essa habilidade/);
  });
});

describe('Surto de Ação', () => {
  it('devolve a ação gasta e só vale uma vez por turno', () => {
    let s = scene({ features: ['action-surge'] });
    s = run(s, { type: 'dash', actorId: 'hero' });
    expect(s.combat.turn?.action).toBe(false);
    s = run(s, feature('action-surge'));
    expect(s.combat.turn?.action).toBe(true);
    expect(() => run(s, feature('action-surge'))).toThrow(/já foi usado/);
  });

  it('só do 2º nível em diante', () => {
    expect(() =>
      run(scene({ level: 1, features: ['action-surge'] }), feature('action-surge')),
    ).toThrow(RuleError);
  });

  it('descanso curto devolve o uso', () => {
    let s = scene({ features: ['action-surge'] });
    s = run(s, feature('action-surge'));
    const r = hero(s).resources.find((x) => x.name === 'Surto de Ação')!;
    expect([r.used, r.max, r.recharge]).toEqual([1, 1, 'short']);
  });
});

describe('Fúria', () => {
  const raging = () =>
    run(scene({ features: ['rage'], spellSlots: fullCasterSlots(5) }), feature('rage'));

  it('gasta a ação bônus e um uso e dá resistência e +2 de dano corpo a corpo', () => {
    const s = raging();
    expect(s.combat.turn?.bonus).toBe(false);
    expect(hero(s).resources.find((r) => r.name === 'Fúria')).toMatchObject({ max: 3, used: 1 });
    expect(hero(s).effects?.[0].mods).toMatchObject({ rage: true, meleeDamage: 2 });
    // d20 11 + 5 = 16 vs CA 8; 1d8 (5) + 3 + 2 = 10
    const after = run(s, hit());
    expect(foe(after).hp.current).toBe(200 - 10);
  });

  it('resiste a dano de arma', () => {
    const s = run(raging(), {
      type: 'damage',
      targetId: 'hero',
      amount: 10,
      damageType: 'slashing',
    });
    expect(hero(s).hp.current).toBe(20 - 5);
    const fire = run(raging(), {
      type: 'damage',
      targetId: 'hero',
      amount: 10,
      damageType: 'fire',
    });
    expect(hero(fire).hp.current).toBe(20 - 10);
  });

  it('impede conjurar', () => {
    const s = raging();
    const caster = {
      ...hero(s),
      spellcasting: { ability: 'int' as const, spells: ['magic-missile'] },
    };
    const withSpell = { ...s, creatures: s.creatures.map((c) => (c.id === 'hero' ? caster : c)) };
    expect(() =>
      run(withSpell, {
        type: 'cast',
        actorId: 'hero',
        spellId: 'magic-missile',
        slotLevel: 1,
        targetIds: ['foe'],
      }),
    ).toThrow(/fúria/);
  });

  it('acaba no fim do turno se não atacou nem sofreu dano', () => {
    let s = raging();
    s = run(s, { type: 'endTurn', actorId: 'hero' }); // ativar já conta como mantida neste turno
    expect(isRagingNow(s)).toBe(true);
    s = run(s, { type: 'endTurn', actorId: 'foe' });
    expect(s.combat.turn?.actorId).toBe('hero');
    s = run(s, { type: 'endTurn', actorId: 'hero' }); // turno inteiro sem atacar
    expect(isRagingNow(s)).toBe(false);
    expect(s.log.some((e) => /sem atacar nem sofrer dano/.test(e.text))).toBe(true);
  });

  it('continua se atacou no turno', () => {
    let s = raging();
    s = run(s, { type: 'endTurn', actorId: 'hero' });
    s = run(s, { type: 'endTurn', actorId: 'foe' });
    s = run(s, hit());
    s = run(s, { type: 'endTurn', actorId: 'hero' });
    expect(isRagingNow(s)).toBe(true);
  });

  it('usar de novo encerra, sem custo', () => {
    const s = run(raging(), feature('rage'));
    expect(isRagingNow(s)).toBe(false);
    expect(hero(s).resources.find((r) => r.name === 'Fúria')?.used).toBe(1);
  });

  const isRagingNow = (s: EncounterState) => !!hero(s).effects?.some((e) => e.mods.rage);
});

describe('Ataque Furtivo', () => {
  const ally = newCreature('pc', {
    id: 'ally',
    name: 'Aliado',
    hp: { max: 30, current: 30, temp: 0 },
  });

  it('com aliado ao lado do alvo: +3d6 (nível 5) uma vez por turno', () => {
    const base = { features: ['sneak-attack' as const], attacks: [dagger] };
    // aliado em (4,1) é adjacente ao alvo em (3,2)
    let s = scene(base, [ally]);
    s = run(s, { type: 'attack', actorId: 'hero', attackIndex: 0, targetId: 'foe' });
    // 1d4 (3) + 3 + 3d6 (4+4+4)
    expect(foe(s).hp.current).toBe(200 - (3 + 3 + 12));
    expect(s.log.some((e) => /Sneak Attack 3d6/.test(e.en ?? ''))).toBe(true);
  });

  it('só uma vez por turno', () => {
    const base = {
      features: ['sneak-attack' as const],
      attacks: [dagger],
      attacksPerAction: 2,
    };
    let s = scene(base, [ally]);
    s = run(s, { type: 'attack', actorId: 'hero', attackIndex: 0, targetId: 'foe' });
    const first = 200 - foe(s).hp.current;
    s = run(s, { type: 'attack', actorId: 'hero', attackIndex: 0, targetId: 'foe' });
    expect(200 - foe(s).hp.current - first).toBe(6);
  });

  it('sem vantagem nem aliado ao lado, não há furtivo', () => {
    let s = scene({ features: ['sneak-attack'], attacks: [dagger] });
    s = run(s, { type: 'attack', actorId: 'hero', attackIndex: 0, targetId: 'foe' });
    expect(foe(s).hp.current).toBe(200 - 6);
  });

  it('vantagem basta; desvantagem anula', () => {
    const base = { features: ['sneak-attack' as const], attacks: [dagger] };
    let s = scene(base);
    s = run(s, {
      type: 'attack',
      actorId: 'hero',
      attackIndex: 0,
      targetId: 'foe',
      mode: 'advantage',
    });
    expect(foe(s).hp.current).toBe(200 - (6 + 12));
    s = scene(base, [ally]);
    s = run(s, {
      type: 'attack',
      actorId: 'hero',
      attackIndex: 0,
      targetId: 'foe',
      mode: 'disadvantage',
    });
    expect(foe(s).hp.current).toBe(200 - 6);
  });

  it('arma sem acuidade e corpo a corpo não vale', () => {
    let s = scene({ features: ['sneak-attack'], attacks: [sword] }, [ally]);
    s = run(s, hit());
    expect(foe(s).hp.current).toBe(200 - 8);
  });
});
