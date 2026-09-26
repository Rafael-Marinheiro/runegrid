import { effect, Injectable, signal } from '@angular/core';
import { GridMap, isGridMap } from '@core/models/grid';

export interface SavedDungeon {
  id: string;
  name: string;
  savedAt: number;
  map: GridMap;
}

const KEY = 'runegrid.dungeons.v1';

function load(): SavedDungeon[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((d) => typeof d?.name === 'string' && isGridMap(d.map))
      : [];
  } catch {
    return [];
  }
}

/** Biblioteca de dungeons do Mestre (armazenamento local + exportar/importar JSON). */
@Injectable({ providedIn: 'root' })
export class DungeonLibrary {
  readonly items = signal<SavedDungeon[]>(load());

  constructor() {
    effect(() => {
      const data = JSON.stringify(this.items());
      try {
        localStorage.setItem(KEY, data);
      } catch {
        /* sem armazenamento: segue só em memória */
      }
    });
  }

  /** Salva (ou atualiza, se já existir um com o mesmo nome). */
  save(name: string, map: GridMap): void {
    const n = name.trim() || 'Dungeon sem nome';
    const entry: SavedDungeon = {
      id: crypto.randomUUID(),
      name: n,
      savedAt: Date.now(),
      map: structuredClone(map),
    };
    this.items.update((list) => {
      const i = list.findIndex((d) => d.name === n);
      return i >= 0 ? list.map((d, k) => (k === i ? { ...entry, id: d.id } : d)) : [...list, entry];
    });
  }

  remove(id: string): void {
    this.items.update((list) => list.filter((d) => d.id !== id));
  }

  /** Lê um JSON exportado; devolve o mapa ou `null` se o arquivo não for válido. */
  parse(text: string): { name: string; map: GridMap } | null {
    try {
      const raw = JSON.parse(text);
      const map = raw?.map ?? raw;
      return isGridMap(map)
        ? { name: typeof raw?.name === 'string' ? raw.name : 'Importado', map }
        : null;
    } catch {
      return null;
    }
  }

  serialize(d: { name: string; map: GridMap }): string {
    return JSON.stringify(
      { format: 'runegrid-dungeon', version: 1, name: d.name, map: d.map },
      null,
      1,
    );
  }
}
