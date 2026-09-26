import { Injectable, signal } from '@angular/core';
import { SrdMonster, SrdSpell } from '@core/models/srd';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/** Conteúdo do SRD 5.1 (JSON estático gerado por `scripts/import-srd.mjs`), carregado sob demanda. */
@Injectable({ providedIn: 'root' })
export class SrdStore {
  readonly monsters = signal<SrdMonster[]>([]);
  readonly monstersStatus = signal<Status>('idle');
  readonly spells = signal<SrdSpell[]>([]);
  readonly spellsStatus = signal<Status>('idle');

  loadMonsters(): Promise<void> {
    return this.load('data/monsters.json', this.monsters, this.monstersStatus);
  }

  loadSpells(): Promise<void> {
    return this.load('data/spells.json', this.spells, this.spellsStatus);
  }

  private async load<T>(
    path: string,
    data: { set(v: T[]): void },
    status: { (): Status; set(s: Status): void },
  ): Promise<void> {
    if (status() === 'loading' || status() === 'ready') return;
    status.set('loading');
    try {
      const res = await fetch(new URL(path, document.baseURI));
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      data.set((await res.json()) as T[]);
      status.set('ready');
    } catch (e) {
      console.warn('Falha ao carregar o SRD', e);
      status.set('error');
    }
  }
}
