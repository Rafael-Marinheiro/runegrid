import { effect, Injectable, signal } from '@angular/core';
import { parseDice } from '@core/rules/dice';

const KEY = 'runegrid.macros.v1';

export interface Macro {
  name: string;
  expr: string;
}

const DEFAULTS: Macro[] = [
  { name: 'Espada longa', expr: '1d8+3' },
  { name: 'Bola de Fogo', expr: '8d6' },
];

/** Rolagens salvas (nome + expressão), guardadas no navegador. */
@Injectable({ providedIn: 'root' })
export class MacroStore {
  readonly macros = signal<Macro[]>(read());

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.macros()));
      } catch {
        /* sem armazenamento */
      }
    });
  }

  /** Salva ou substitui pelo nome; lança `DiceError` se a expressão for inválida. */
  save(name: string, expr: string): void {
    parseDice(expr);
    const n = name.trim().slice(0, 40) || expr;
    this.macros.update((l) => [...l.filter((m) => m.name !== n), { name: n, expr: expr.trim() }]);
  }

  remove(name: string): void {
    this.macros.update((l) => l.filter((m) => m.name !== name));
  }
}

function read(): Macro[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((m): m is Macro => typeof m?.name === 'string' && typeof m?.expr === 'string')
      : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
