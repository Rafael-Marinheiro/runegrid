import { effect, Injectable, signal } from '@angular/core';
import { GridMap, isGridMap } from '@core/models/grid';

export interface SavedFloor {
  id: string;
  name: string;
  map: GridMap;
}

export interface SavedDungeon {
  id: string;
  name: string;
  savedAt: number;
  map: GridMap;
  floorId?: string;
  floorName?: string;
  floors?: SavedFloor[];
}

const KEY = 'runegrid.dungeons.v1';

const isSavedFloor = (floor: unknown): floor is SavedFloor => {
  const value = floor as SavedFloor | null;
  return (
    !!value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isGridMap(value.map)
  );
};

const hasValidFloors = (value: { floors?: unknown }): boolean =>
  value.floors === undefined || (Array.isArray(value.floors) && value.floors.every(isSavedFloor));

function load(): SavedDungeon[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((d) => typeof d?.name === 'string' && isGridMap(d.map) && hasValidFloors(d))
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
  save(
    name: string,
    map: GridMap,
    floors: SavedFloor[] = [],
    floorId = 'floor-1',
    floorName = 'Térreo',
  ): void {
    const n = name.trim() || 'Dungeon sem nome';
    const entry: SavedDungeon = {
      id: crypto.randomUUID(),
      name: n,
      savedAt: Date.now(),
      map: structuredClone(map),
      floorId,
      floorName,
      floors: structuredClone(floors),
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
  parse(text: string): Omit<SavedDungeon, 'id' | 'savedAt'> | null {
    try {
      const raw = JSON.parse(text);
      const map = raw?.map ?? raw;
      const floors = raw?.floors ?? [];
      if (!isGridMap(map) || !Array.isArray(floors) || !floors.every(isSavedFloor)) return null;
      return {
        name: typeof raw?.name === 'string' ? raw.name : 'Importado',
        map,
        floorId: typeof raw?.floorId === 'string' ? raw.floorId : 'floor-1',
        floorName: typeof raw?.floorName === 'string' ? raw.floorName : 'Térreo',
        floors,
      };
    } catch {
      return null;
    }
  }

  serialize(d: Omit<SavedDungeon, 'id' | 'savedAt'>): string {
    return JSON.stringify({ format: 'runegrid-dungeon', version: 2, ...d }, null, 1);
  }
}
