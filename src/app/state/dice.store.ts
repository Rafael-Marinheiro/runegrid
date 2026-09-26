import { computed, inject, Injectable, signal } from '@angular/core';
import { AdvMode, D20Result, roll, rollD20, RollResult } from '@core/rules/dice';
import { RNG } from './rng.token';

export interface RollEntry {
  id: number;
  at: Date;
  result: RollResult;
  /** Presente só em rolagens de d20 (crítico, vantagem...). */
  d20?: D20Result;
}

const MAX_HISTORY = 50;

@Injectable({ providedIn: 'root' })
export class DiceStore {
  private readonly rng = inject(RNG);
  private nextId = 1;

  readonly history = signal<RollEntry[]>([]);
  readonly last = computed(() => this.history()[0]);

  /** Lança `DiceError` se a notação for inválida. */
  roll(notation: string): void {
    this.push({ result: roll(notation, this.rng) });
  }

  rollD20(modifier: number, mode: AdvMode): void {
    const d20 = rollD20(modifier, mode, this.rng);
    this.push({ result: d20.roll, d20 });
  }

  clear(): void {
    this.history.set([]);
  }

  private push(entry: Pick<RollEntry, 'result' | 'd20'>): void {
    const full: RollEntry = { id: this.nextId++, at: new Date(), ...entry };
    this.history.update((h) => [full, ...h].slice(0, MAX_HISTORY));
  }
}
