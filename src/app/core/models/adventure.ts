import { DamageType } from './creature';
import { GridMap, Pos } from './grid';

export const THEMES = ['crypt', 'cave', 'ruins', 'forest', 'swamp', 'fortress', 'sewer'] as const;
export type ThemeId = (typeof THEMES)[number];

export const SIZES = ['small', 'medium', 'large'] as const;
export type SizeId = (typeof SIZES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'deadly'] as const;
export type DifficultyId = (typeof DIFFICULTIES)[number];

export const EMPHASES = ['combat', 'traps', 'exploration', 'mixed'] as const;
export type EmphasisId = (typeof EMPHASES)[number];

export interface GeneratorParams {
  theme: ThemeId;
  size: SizeId;
  difficulty: DifficultyId;
  emphasis: EmphasisId;
  partyLevel: number;
  partySize: number;
  /** Mesma semente + mesmos parâmetros = mesma aventura. */
  seed: string;
}

export type RoomRole = 'entrance' | 'empty' | 'encounter' | 'trap' | 'treasure' | 'boss';

export interface GeneratedRoom {
  id: string;
  name: string;
  description: string;
  role: RoomRole;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EncounterGroup {
  /** Slug do monstro no SRD. */
  monsterId: string;
  name: string;
  cr: number;
  count: number;
}

export interface GeneratedEncounter {
  roomId: string;
  groups: EncounterGroup[];
  /** XP ajustado pelo multiplicador do DMG. */
  adjustedXp: number;
}

export interface Treasure {
  roomId: string;
  gp: number;
  items: string[];
}

export interface GeneratedTrap {
  roomId: string | null;
  name: string;
  pos: Pos;
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  dc: number;
  damage: string;
  damageType: DamageType;
}

export interface GeneratedAdventure {
  params: GeneratorParams;
  name: string;
  hook: string;
  /** Mapa completo: terreno, portas, salas, armadilhas e névoa (só a entrada revelada). */
  map: GridMap;
  rooms: GeneratedRoom[];
  encounters: GeneratedEncounter[];
  treasures: Treasure[];
  traps: GeneratedTrap[];
  entrance: Pos;
  /** XP ajustado somado de todos os encontros. */
  totalXp: number;
}
