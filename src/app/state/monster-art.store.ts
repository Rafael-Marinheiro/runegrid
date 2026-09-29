import { Injectable, signal } from '@angular/core';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Miniaturas de monstro (PNG, geradas fora do app) indexadas por id do SRD — mesmo id usado em
 * `SrdMonster.id` (2014 e 2024 compartilham arquivo quando a criatura é a mesma). Carregado sob
 * demanda: o índice é leve (JSON), as imagens em si só são buscadas pelo navegador quando um
 * `<img>` de fato as referencia.
 */
@Injectable({ providedIn: 'root' })
export class MonsterArtStore {
  private readonly map = signal<Record<string, string>>({});
  private readonly status = signal<Status>('idle');

  async load(): Promise<void> {
    if (this.status() === 'loading' || this.status() === 'ready') return;
    this.status.set('loading');
    try {
      const res = await fetch(new URL('data/monster-art-map.json', document.baseURI));
      if (!res.ok) throw new Error(`monster-art-map.json: ${res.status}`);
      this.map.set((await res.json()) as Record<string, string>);
      this.status.set('ready');
    } catch (e) {
      console.warn('Falha ao carregar o índice de miniaturas', e);
      this.status.set('error');
    }
  }

  /** URL da miniatura do monstro (relativa a `data/`), ou `null` se não houver arte para o id. */
  urlFor(monsterId: string): string | null {
    const file = this.map()[monsterId];
    return file ? `data/${file}` : null;
  }
}
