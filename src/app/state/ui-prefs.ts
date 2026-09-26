import { effect, Injectable, signal } from '@angular/core';

const KEY = 'runegrid.prefs.v1';

/** Preferências de interface guardadas no navegador. */
@Injectable({ providedIn: 'root' })
export class UiPrefs {
  /** Sem texturas de piso e com anéis de token mais grossos (leitura mais fácil). */
  readonly highContrast = signal(read());

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ highContrast: this.highContrast() }));
      } catch {
        /* sem armazenamento */
      }
    });
  }
}

function read(): boolean {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}').highContrast === true;
  } catch {
    return false;
  }
}
