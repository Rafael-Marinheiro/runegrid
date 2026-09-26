import {
  criticalExpr,
  DiceError,
  formatDice,
  mulberry32,
  parseDice,
  roll,
  rollD20,
  seedFromString,
} from './index';

/** RNG que devolve, em ordem, os valores de face pedidos (todos de dados com `sides` lados). */
const faces = (sides: number, ...values: number[]) => {
  let i = 0;
  return () => (values[i++] - 1 + 0.5) / sides;
};

describe('parseDice', () => {
  it.each([
    ['2d6+3', '2d6+3'],
    [' D20 ', '1d20'],
    ['1d20+5-2', '1d20+5-2'],
    ['4d6kh3', '4d6kh3'],
    ['2d20kl', '2d20kl1'],
    ['d%', '1d100'],
    ['-1d4+10', '-1d4+10'],
    ['7', '7'],
  ])('aceita %s', (input, expected) => {
    expect(formatDice(parseDice(input))).toBe(expected);
  });

  it.each(['', 'abc', '2d', 'd1', '0d6', '101d6', '2d6++3', '2d6k', '3d6kh4', '1d1001'])(
    'rejeita "%s"',
    (input) => {
      expect(() => parseDice(input)).toThrow(DiceError);
    },
  );
});

describe('roll', () => {
  it('soma dados e modificador', () => {
    const r = roll('2d6+3', faces(6, 4, 5));
    expect(r.total).toBe(12);
    expect(r.terms[0].dice.map((d) => d.value)).toEqual([4, 5]);
  });

  it('subtrai termos negativos', () => {
    expect(roll('1d20-2', faces(20, 10)).total).toBe(8);
  });

  it('mantém os maiores e marca os descartados (4d6kh3)', () => {
    const r = roll('4d6kh3', faces(6, 1, 6, 5, 4));
    expect(r.total).toBe(15);
    expect(r.terms[0].dice.filter((d) => d.dropped).map((d) => d.value)).toEqual([1]);
  });

  it('mantém o menor (2d20kl1)', () => {
    expect(roll('2d20kl1', faces(20, 17, 4)).total).toBe(4);
  });

  it('nunca sai do intervalo e a média é coerente (2d6)', () => {
    const rng = mulberry32(42);
    const totals = Array.from({ length: 5000 }, () => roll('2d6', rng).total);
    expect(Math.min(...totals)).toBe(2);
    expect(Math.max(...totals)).toBe(12);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(avg).toBeGreaterThan(6.8);
    expect(avg).toBeLessThan(7.2);
  });
});

describe('rng com semente', () => {
  it('mesma semente, mesma sequência', () => {
    const a = Array.from({ length: 10 }, mulberry32(seedFromString('vharos-7f3a')));
    const b = Array.from({ length: 10 }, mulberry32(seedFromString('vharos-7f3a')));
    expect(a).toEqual(b);
  });

  it('sementes diferentes divergem', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('rollD20', () => {
  it('normal: um d20 + modificador', () => {
    const r = rollD20(5, 'normal', faces(20, 12));
    expect(r.roll.total).toBe(17);
    expect(r.natural).toBe(12);
  });

  it('vantagem fica com o maior, desvantagem com o menor', () => {
    expect(rollD20(0, 'advantage', faces(20, 7, 15)).natural).toBe(15);
    expect(rollD20(0, 'disadvantage', faces(20, 7, 15)).natural).toBe(7);
  });

  it('detecta crítico e falha crítica pelo dado mantido', () => {
    expect(rollD20(0, 'normal', faces(20, 20)).crit).toBe(true);
    expect(rollD20(0, 'normal', faces(20, 1)).fumble).toBe(true);
    // vantagem com 1 e 20: mantém o 20
    const r = rollD20(0, 'advantage', faces(20, 1, 20));
    expect(r.crit).toBe(true);
    expect(r.fumble).toBe(false);
  });

  it('modificador negativo', () => {
    expect(rollD20(-1, 'normal', faces(20, 10)).roll.total).toBe(9);
  });
});

describe('criticalExpr', () => {
  it('dobra os dados e mantém as constantes', () => {
    expect(formatDice(criticalExpr(parseDice('1d8+4')))).toBe('2d8+4');
  });
});
