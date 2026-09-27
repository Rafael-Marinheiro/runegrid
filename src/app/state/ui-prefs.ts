import { effect, Injectable, signal } from '@angular/core';

const KEY = 'runegrid.prefs.v1';
export type Locale = 'pt-BR' | 'en';

interface Prefs {
  highContrast: boolean;
  locale: Locale;
}

/** Preferências de interface guardadas no navegador. */
@Injectable({ providedIn: 'root' })
export class UiPrefs {
  private readonly saved = read();
  /** Sem texturas de piso e com anéis de token mais grossos (leitura mais fácil). */
  readonly highContrast = signal(this.saved.highContrast);
  readonly locale = signal<Locale>(this.saved.locale);

  constructor() {
    effect(() => {
      document.documentElement.lang = this.locale();
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ highContrast: this.highContrast(), locale: this.locale() }),
        );
      } catch {
        /* sem armazenamento */
      }
    });
  }

  text(pt: string, en: string): string {
    return this.locale() === 'en' ? en : pt;
  }
}

function read(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return {
      highContrast: saved.highContrast === true,
      locale: saved.locale === 'en' ? 'en' : 'pt-BR',
    };
  } catch {
    return { highContrast: false, locale: 'pt-BR' };
  }
}
