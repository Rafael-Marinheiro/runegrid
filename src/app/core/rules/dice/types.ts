export type Rng = () => number;

/**
 * Um `Rng` pode ter um gravador ligado: cada rolagem informa os dados (lados e valores). O reducer usa
 * isso para mostrar os mesmos dados na tela de todos, sem tocar em cada ponto de rolagem.
 */
export interface DiceRecorder {
  record(sides: number, dice: { value: number; dropped: boolean }[]): void;
}
export type Sign = 1 | -1;
export type AdvMode = 'normal' | 'advantage' | 'disadvantage';

export interface DiceTerm {
  kind: 'dice';
  count: number;
  sides: number;
  keep?: { mode: 'h' | 'l'; n: number };
  sign: Sign;
}
export interface ConstTerm {
  kind: 'const';
  value: number;
  sign: Sign;
}
export type Term = DiceTerm | ConstTerm;

export interface DiceExpr {
  terms: Term[];
}

export interface DieResult {
  value: number;
  dropped: boolean;
}
export interface TermResult {
  term: Term;
  dice: DieResult[];
  /** Já com o sinal aplicado. */
  subtotal: number;
}
export interface RollResult {
  expr: DiceExpr;
  terms: TermResult[];
  total: number;
}

export interface D20Result {
  roll: RollResult;
  natural: number;
  crit: boolean;
  fumble: boolean;
  mode: AdvMode;
}

export class DiceError extends Error {}
