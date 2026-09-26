import { InjectionToken } from '@angular/core';
import { Rng } from '@core/rules/dice';

/** Fonte de aleatoriedade injetável: testes e o gerador (semente) trocam por um RNG determinístico. */
export const RNG = new InjectionToken<Rng>('RNG', {
  providedIn: 'root',
  factory: () => Math.random,
});
