import { Injectable, signal } from '@angular/core';
import {
  MiniatureEntry,
  MiniatureQuery,
  pickMiniature,
  suggestMiniatures,
} from '@core/rules/srd/miniature';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Miniaturas de monstro/NPC (PNG, geradas fora do app). Dois índices, carregados sob demanda:
 * - `monster-art-map.json`: id do SRD → arte (2014 e 2024 compartilham arquivo quando a criatura
 *   é a mesma);
 * - `miniatura-catalogo.json`: biblioteca de variantes (humanos, anões, elfos, goblins) para
 *   escolher pela ficha. As imagens só são buscadas pelo navegador quando um `<img>` as referencia.
 */
@Injectable({ providedIn: 'root' })
export class MonsterArtStore {
  private readonly map = signal<Record<string, string>>({});
  readonly catalog = signal<MiniatureEntry[]>([]);
  private readonly status = signal<Status>('idle');

  async load(): Promise<void> {
    if (this.status() === 'loading' || this.status() === 'ready') return;
    this.status.set('loading');
    try {
      const [map, cat] = await Promise.all(
        ['monster-art-map.json', 'miniatura-catalogo.json'].map(async (f) => {
          const res = await fetch(new URL(`data/${f}`, document.baseURI));
          if (!res.ok) throw new Error(`${f}: ${res.status}`);
          return (await res.json()) as unknown;
        }),
      );
      this.map.set(map as Record<string, string>);
      this.catalog.set(Array.isArray(cat) ? (cat as MiniatureEntry[]) : []);
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

  /** Arquivo da arte do id do SRD (`miniaturas/x.png`), se houver. */
  fileFor(monsterId: string): string | undefined {
    return this.map()[monsterId];
  }

  /** Miniaturas que combinam com a ficha, da melhor para a pior (seletor manual e Bestiário). */
  suggest(q: MiniatureQuery, limit = 24): MiniatureEntry[] {
    return suggestMiniatures(q, this.catalog(), limit);
  }

  /**
   * Escolha automática para um monstro do SRD (Gerador, Mestre MCP): a variante que mais casa
   * com a ficha; sem correspondência, a arte do id; sem nenhuma, `undefined`.
   * `variant` reveza entre empates (1º, 2º… goblin do mesmo tipo).
   */
  pickFor(monsterId: string, q: MiniatureQuery, variant = 0): string | undefined {
    return pickMiniature(q, this.catalog(), this.map()[monsterId], variant);
  }
}
