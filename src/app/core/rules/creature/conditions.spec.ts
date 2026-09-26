import { Creature } from '../../models/creature';
import { newCreature } from '../../models/creature-factory';
import {
  addCondition,
  attackModifiers,
  autoFailsSave,
  canAct,
  checkConcentration,
  effectiveSpeed,
  removeCondition,
  tickConditions,
} from './index';

const c = (over: Partial<Creature> = {}) => newCreature('pc', over);
const d20 = (v: number) => () => (v - 0.5) / 20;

describe('condições', () => {
  it('adiciona sem duplicar e mantém a duração mais longa', () => {
    let x = addCondition(c(), 'poisoned', 3);
    x = addCondition(x, 'poisoned', 1);
    expect(x.conditions).toEqual([{ name: 'poisoned', rounds: 3 }]);
    x = addCondition(x, 'poisoned', 5);
    expect(x.conditions).toEqual([{ name: 'poisoned', rounds: 5 }]);
    expect(removeCondition(x, 'poisoned').conditions).toEqual([]);
  });

  it('condição sem duração dura até ser removida', () => {
    const x = addCondition(addCondition(c(), 'prone', 2), 'prone');
    expect(x.conditions[0].rounds).toBeUndefined();
  });

  it('desconta rodadas no fim do turno e informa o que expirou', () => {
    let x = addCondition(addCondition(c(), 'stunned', 1), 'poisoned', 3);
    const t1 = tickConditions(x);
    expect(t1.expired).toEqual(['stunned']);
    expect(t1.creature.conditions).toEqual([{ name: 'poisoned', rounds: 2 }]);
    x = t1.creature;
    expect(tickConditions(x).expired).toEqual([]);
  });

  it('incapacitado, paralisado, atordoado etc. não agem', () => {
    expect(canAct(c())).toBe(true);
    for (const n of [
      'incapacitated',
      'paralyzed',
      'petrified',
      'stunned',
      'unconscious',
    ] as const) {
      expect(canAct(addCondition(c(), n))).toBe(false);
    }
    expect(canAct(addCondition(c(), 'poisoned'))).toBe(true);
  });

  it('agarrado e contido ficam sem deslocamento', () => {
    expect(effectiveSpeed(c({ speed: 30 }))).toBe(30);
    expect(effectiveSpeed(addCondition(c({ speed: 30 }), 'grappled'))).toBe(0);
    expect(effectiveSpeed(addCondition(c({ speed: 30 }), 'restrained'))).toBe(0);
    expect(effectiveSpeed(c({ speed: 30, status: 'dying' }))).toBe(0);
  });

  it('falha automática em salvaguardas de For/Des', () => {
    const p = addCondition(c(), 'paralyzed');
    expect(autoFailsSave(p, 'str')).toBe(true);
    expect(autoFailsSave(p, 'dex')).toBe(true);
    expect(autoFailsSave(p, 'wis')).toBe(false);
    expect(autoFailsSave(c(), 'dex')).toBe(false);
  });
});

describe('ataques e condições', () => {
  const a = () => c();

  it('sem condições não há modificador', () => {
    expect(attackModifiers(a(), c(), 5, false)).toEqual({ modes: [], autoCrit: false });
  });

  it('atacante envenenado ou amedrontado tem desvantagem; invisível, vantagem', () => {
    expect(attackModifiers(addCondition(a(), 'poisoned'), c(), 5, false).modes).toEqual([
      'disadvantage',
    ]);
    expect(attackModifiers(addCondition(a(), 'invisible'), c(), 5, false).modes).toEqual([
      'advantage',
    ]);
  });

  it('alvo cego, contido ou atordoado recebe ataques com vantagem', () => {
    for (const n of ['blinded', 'restrained', 'stunned'] as const) {
      expect(attackModifiers(a(), addCondition(c(), n), 5, false).modes).toEqual(['advantage']);
    }
  });

  it('alvo caído: vantagem corpo a corpo, desvantagem à distância', () => {
    const prone = addCondition(c(), 'prone');
    expect(attackModifiers(a(), prone, 5, false).modes).toEqual(['advantage']);
    expect(attackModifiers(a(), prone, 30, true).modes).toEqual(['disadvantage']);
  });

  it('paralisado a 5 ft: acerto crítico; longe, não', () => {
    const p = addCondition(c(), 'paralyzed');
    expect(attackModifiers(a(), p, 5, false).autoCrit).toBe(true);
    expect(attackModifiers(a(), p, 30, true).autoCrit).toBe(false);
  });

  it('criatura a 0 PV conta como inconsciente', () => {
    const down = c({ status: 'dying' });
    const r = attackModifiers(a(), down, 5, false);
    expect(r.modes).toEqual(['advantage']);
    expect(r.autoCrit).toBe(true);
  });
});

describe('concentração', () => {
  const caster = () =>
    c({
      concentration: 'Bênção',
      abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
    });

  it('só testa quem está concentrado e levou dano', () => {
    expect(checkConcentration(c(), 10, d20(1))).toBeNull();
    expect(checkConcentration(caster(), 0, d20(1))).toBeNull();
  });

  it('CD = 10 ou metade do dano (o maior)', () => {
    expect(checkConcentration(caster(), 8, d20(10))!.dc).toBe(10);
    expect(checkConcentration(caster(), 30, d20(10))!.dc).toBe(15);
  });

  it('falha perde a concentração; sucesso mantém', () => {
    // Con 14 = +2: d20 7 → 9 < 10 = falha; d20 8 → 10 = sucesso
    const fail = checkConcentration(caster(), 8, d20(7))!;
    expect(fail.broken).toBe(true);
    expect(fail.creature.concentration).toBeUndefined();
    const ok = checkConcentration(caster(), 8, d20(8))!;
    expect(ok.broken).toBe(false);
    expect(ok.creature.concentration).toBe('Bênção');
  });
});
