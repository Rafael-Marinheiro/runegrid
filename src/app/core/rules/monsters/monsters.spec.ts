import monsterRules from '../../../../../public/data/monster-rules.json';
import monsters from '../../../../../public/data/monsters.json';
import { newCreature } from '../../models/creature-factory';
import { mapFromAscii } from '../../models/grid';
import { SrdMonster } from '../../models/srd';
import { RuleError } from '../creature';
import { Command, dispatch, newEncounter } from '../encounter';
import { monsterToCreature } from '../srd/convert';
import { buildMonsterAbilities, MonsterRules } from './build';
import { abilitiesOf, registerMonsterAbilities } from './registry';

const srd = (id: string) => (monsters as unknown as SrdMonster[]).find((m) => m.id === id)!;
const dm = { kind: 'dm' } as const;
const map = mapFromAscii(Array.from({ length: 12 }, () => '....................'));

beforeAll(() =>
  registerMonsterAbilities(
    '2014',
    buildMonsterAbilities('2014', monsterRules as unknown as MonsterRules),
  ),
);

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
