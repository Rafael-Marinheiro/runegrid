import { parseDice } from './parse';
import {
  AdvMode,
  D20Result,
  DiceExpr,
  DiceTerm,
  Rng,
  RollResult,
  Term,
  TermResult,
  DiceRecorder,
} from './types';

export function roll(input: string | DiceExpr, rng: Rng = Math.random): RollResult {
  const expr = typeof input === 'string' ? parseDice(input) : input;
  const terms = expr.terms.map((t) => rollTerm(t, rng));
  return { expr, terms, total: terms.reduce((sum, t) => sum + t.subtotal, 0) };
}

function rollTerm(term: Term, rng: Rng): TermResult {
  if (term.kind === 'const') return { term, dice: [], subtotal: term.sign * term.value };

  const dice = Array.from({ length: term.count }, () => ({
    value: 1 + Math.floor(rng() * term.sides),
    dropped: false,
  }));
  if (term.keep) markDropped(dice, term.keep);
  (rng as Partial<DiceRecorder>).record?.(term.sides, dice);
  const sum = dice.reduce((acc, d) => acc + (d.dropped ? 0 : d.value), 0);
  return { term, dice, subtotal: term.sign * sum };
}

function markDropped(
  dice: { value: number; dropped: boolean }[],
  keep: NonNullable<DiceTerm['keep']>,
) {
  const best = keep.mode === 'h' ? 1 : -1;
  dice
    .map((_, i) => i)
    .sort((a, b) => best * (dice[b].value - dice[a].value))
    .slice(keep.n)
    .forEach((i) => (dice[i].dropped = true));
}

/** d20 + modificador, com vantagem/desvantagem (2d20 mantendo o maior/menor). */
export function rollD20(modifier = 0, mode: AdvMode = 'normal', rng: Rng = Math.random): D20Result {
  const die: DiceTerm = {
    kind: 'dice',
    count: mode === 'normal' ? 1 : 2,
    sides: 20,
    sign: 1,
    keep: mode === 'normal' ? undefined : { mode: mode === 'advantage' ? 'h' : 'l', n: 1 },
  };
  const terms: Term[] = [die];
  if (modifier !== 0) {
    terms.push({ kind: 'const', value: Math.abs(modifier), sign: modifier < 0 ? -1 : 1 });
  }
  const result = roll({ terms }, rng);
  const natural = result.terms[0].dice.find((d) => !d.dropped)!.value;
  return { roll: result, natural, crit: natural === 20, fumble: natural === 1, mode };
}
