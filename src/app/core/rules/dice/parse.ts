import { DiceError, DiceExpr, Sign, Term } from './types';

const MAX_COUNT = 100;
const MAX_SIDES = 1000;

// [sinal] (NdM[kh|klK] | N) — `d%` vale d100, `kh`/`kl` sem número mantém 1.
const TERM = /([+-]?)(?:(\d*)d(\d+|%)(?:k([hl])(\d*))?|(\d+))/y;

export function parseDice(source: string): DiceExpr {
  const s = source.toLowerCase().replace(/\s+/g, '');
  if (!s) throw new DiceError('Expressão vazia.');

  const terms: Term[] = [];
  let pos = 0;
  while (pos < s.length) {
    TERM.lastIndex = pos;
    const m = TERM.exec(s);
    if (!m || (pos > 0 && !m[1])) {
      throw new DiceError(`Expressão inválida perto de "${s.slice(pos)}".`);
    }
    pos = TERM.lastIndex;
    const sign: Sign = m[1] === '-' ? -1 : 1;

    if (m[3] === undefined) {
      terms.push({ kind: 'const', value: Number(m[6]), sign });
      continue;
    }
    const count = m[2] === '' ? 1 : Number(m[2]);
    const sides = m[3] === '%' ? 100 : Number(m[3]);
    if (count < 1 || count > MAX_COUNT) {
      throw new DiceError(`Quantidade de dados deve ficar entre 1 e ${MAX_COUNT}.`);
    }
    if (sides < 2 || sides > MAX_SIDES) {
      throw new DiceError(`Lados do dado devem ficar entre 2 e ${MAX_SIDES}.`);
    }
    let keep: { mode: 'h' | 'l'; n: number } | undefined;
    if (m[4]) {
      const n = m[5] === '' ? 1 : Number(m[5]);
      if (n < 1 || n > count) throw new DiceError('Quantidade mantida inválida.');
      keep = { mode: m[4] as 'h' | 'l', n };
    }
    terms.push({ kind: 'dice', count, sides, keep, sign });
  }
  return { terms };
}

export function formatDice(expr: DiceExpr): string {
  return expr.terms
    .map((t, i) => {
      const sign = t.sign === -1 ? '-' : i === 0 ? '' : '+';
      if (t.kind === 'const') return `${sign}${t.value}`;
      const keep = t.keep ? `k${t.keep.mode}${t.keep.n}` : '';
      return `${sign}${t.count}d${t.sides}${keep}`;
    })
    .join('');
}

/** Crítico: dobra a quantidade de dados (constantes ficam como estão). */
export function criticalExpr(expr: DiceExpr): DiceExpr {
  return {
    terms: expr.terms.map((t) =>
      t.kind === 'dice' ? { ...t, count: t.count * 2, keep: undefined } : t,
    ),
  };
}
