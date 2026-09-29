import { Injectable, signal } from '@angular/core';
import { SrdMonster, SrdSpell } from '@core/models/srd';
import { Ruleset } from './ui-prefs';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Conteúdo do SRD (JSON estático gerado por `scripts/import-srd.mjs` para o 2014 e
 * `scripts/import-srd-2024.mjs` para o 2024), carregado sob demanda e mantido em cache por versão.
 */
@Injectable({ providedIn: 'root' })
export class SrdStore {
  readonly monsters = signal<SrdMonster[]>([]);
  readonly monstersStatus = signal<Status>('idle');
  readonly spells = signal<SrdSpell[]>([]);
  readonly spellsStatus = signal<Status>('idle');

  private readonly monsterCache = new Map<Ruleset, SrdMonster[]>();
  private readonly spellCache = new Map<Ruleset, SrdSpell[]>();
  private loadedMonsters: Ruleset | null = null;
  private loadedSpells: Ruleset | null = null;

  loadMonsters(ruleset: Ruleset = '2014'): Promise<void> {
    if (this.loadedMonsters === ruleset) return Promise.resolve();
    return this.load(
      ruleset,
      ruleset === '2024' ? 'data/monsters-2024.json' : 'data/monsters.json',
      this.monsterCache,
      this.monsters,
      this.monstersStatus,
      (r) => (this.loadedMonsters = r),
    );
  }

  loadSpells(ruleset: Ruleset = '2014'): Promise<void> {
    if (this.loadedSpells === ruleset) return Promise.resolve();
    return this.load(
      ruleset,
      ruleset === '2024' ? 'data/spells-2024.json' : 'data/spells.json',
      this.spellCache,
      this.spells,
      this.spellsStatus,
      (r) => (this.loadedSpells = r),
    );
  }

  private async load<T>(
    ruleset: Ruleset,
    path: string,
    cache: Map<Ruleset, T[]>,
    data: { set(v: T[]): void },
    status: { set(s: Status): void },
    markLoaded: (r: Ruleset) => void,
  ): Promise<void> {
    const cached = cache.get(ruleset);
    if (cached) {
      data.set(cached);
      status.set('ready');
      markLoaded(ruleset);
      return;
    }
    status.set('loading');
    try {
      const res = await fetch(new URL(path, document.baseURI));
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      const rows = (await res.json()) as T[];
      cache.set(ruleset, rows);
      data.set(rows);
      status.set('ready');
      markLoaded(ruleset);
    } catch (e) {
      console.warn('Falha ao carregar o SRD', e);
      status.set('error');
    }
  }
}
