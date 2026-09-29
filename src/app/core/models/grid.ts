import { DamageType, Size } from './creature';

export type Terrain =
  | 'floor'
  | 'wall'
  | 'difficult'
  | 'water'
  /** Porta aberta: passável. */
  | 'door'
  | 'door-closed'
  | 'door-locked'
  /** Célula que o jogador ainda não descobriu (névoa): só existe na visão do jogador. */
  | 'unknown';

/** Terrenos em que não se pode estar nem passar. */
export const IMPASSABLE: readonly Terrain[] = ['wall', 'door-closed', 'door-locked', 'unknown'];

/** Terrenos que custam o dobro de deslocamento. */
export const DIFFICULT: readonly Terrain[] = ['difficult', 'water'];

export interface Room {
  id: string;
  name: string;
  /** Texto para ler aos jogadores quando a sala é revelada. */
  description: string;
  /** Anotações secretas do Mestre. */
  notes: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Trap {
  id: string;
  name: string;
  pos: Pos;
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  dc: number;
  /** Dado de dano, ex.: "2d10". */
  damage: string;
  damageType: DamageType;
  /** Escondida dos jogadores até disparar (ou o Mestre revelar). */
  hidden: boolean;
  triggered: boolean;
}

/** Item solto no mapa; não entra no inventário até o Mestre entregá-lo. */
export interface PlacedItem {
  id: string;
  ref: string;
  name: string;
  qty: number;
  pos: Pos;
  hidden: boolean;
}

export interface Pos {
  x: number;
  y: number;
}

export const TEXTURES = ['none', 'stone', 'cave', 'grass', 'mud', 'ice', 'sand', 'wood'] as const;
export type Texture = (typeof TEXTURES)[number];

export interface MapBackground {
  /** Imagem persistente (data URL). */
  src: string;
  widthPx: number;
  heightPx: number;
  /** Quantos pixels da imagem correspondem a uma célula do grid. */
  pixelsPerCell: number;
  /** Deslocamento da imagem em células. */
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface MapVision {
  enabled: boolean;
  /** Sem iluminação, cada criatura enxerga somente até sua visão no escuro. */
  darkness: boolean;
}

export interface Portal {
  id: string;
  name: string;
  pos: Pos;
  targetFloorId: string;
  target: Pos;
}

export interface GridMap {
  width: number;
  height: number;
  /** Terreno por célula, linha a linha. Cada célula mede 5 ft. */
  cells: Terrain[];
  /** `true` = célula sob névoa (oculta aos jogadores). Ausente = tudo visível. */
  fog?: boolean[];
  rooms?: Room[];
  traps?: Trap[];
  items?: PlacedItem[];
  /** Textura do piso (só aparência; nunca muda regras). */
  texture?: Texture;
  background?: MapBackground;
  vision?: MapVision;
  /** Escadas, alçapões ou portais que levam a outro andar. */
  portals?: Portal[];
}

/** Regra de diagonal: simples (5 ft) ou alternada 5-10-5 (variante do DMG). */
export type DiagonalRule = 'simple' | 'alternate';

export const CELL_FT = 5;

/** Quantas células de lado o dado ocupa. */
export const SIZE_CELLS: Record<Size, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

const CHAR: Record<string, Terrain> = {
  '.': 'floor',
  '#': 'wall',
  ',': 'difficult',
  '~': 'water',
  D: 'door',
  d: 'door-closed',
  L: 'door-locked',
};

/** Cria um mapa a partir de linhas de texto: `.` piso, `#` parede, `,` difícil, `~` água, `D` porta aberta, `d` fechada, `L` trancada. */
export function mapFromAscii(rows: string[]): GridMap {
  const width = rows[0]?.length ?? 0;
  if (!rows.every((r) => r.length === width))
    throw new Error('Todas as linhas do mapa devem ter o mesmo tamanho.');
  const cells = rows.flatMap((r) =>
    [...r].map((ch) => {
      const t = CHAR[ch];
      if (!t) throw new Error(`Caractere de terreno inválido: "${ch}"`);
      return t;
    }),
  );
  return { width, height: rows.length, cells };
}

export const inBounds = (m: GridMap, p: Pos): boolean =>
  p.x >= 0 && p.y >= 0 && p.x < m.width && p.y < m.height;
export const terrainAt = (m: GridMap, p: Pos): Terrain => m.cells[p.y * m.width + p.x];

/** Mapa novo: piso com borda de parede. */
export function blankMap(width: number, height: number): GridMap {
  const w = Math.max(3, Math.min(60, Math.floor(width)));
  const h = Math.max(3, Math.min(60, Math.floor(height)));
  const cells: Terrain[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++)
      cells.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 'wall' : 'floor');
  }
  return { width: w, height: h, cells };
}

/** Confere se um valor (por exemplo, um JSON importado) tem a forma de um mapa. */
export function isGridMap(v: unknown): v is GridMap {
  const m = v as GridMap | null;
  return (
    !!m &&
    Number.isInteger(m.width) &&
    Number.isInteger(m.height) &&
    m.width > 0 &&
    m.height > 0 &&
    m.width <= 100 &&
    m.height <= 100 &&
    Array.isArray(m.cells) &&
    m.cells.length === m.width * m.height &&
    m.cells.every((c) => typeof c === 'string') &&
    (m.fog === undefined || (Array.isArray(m.fog) && m.fog.length === m.cells.length)) &&
    isMapBackground(m.background) &&
    (m.vision === undefined ||
      (typeof m.vision.enabled === 'boolean' && typeof m.vision.darkness === 'boolean')) &&
    (m.items === undefined ||
      (Array.isArray(m.items) &&
        m.items.every(
          (item) =>
            typeof item.id === 'string' &&
            typeof item.ref === 'string' &&
            typeof item.name === 'string' &&
            Number.isInteger(item.qty) &&
            item.qty > 0 &&
            typeof item.hidden === 'boolean' &&
            inBounds(m, item.pos),
        ))) &&
    (m.portals === undefined ||
      (Array.isArray(m.portals) &&
        m.portals.every(
          (portal) =>
            typeof portal.id === 'string' &&
            typeof portal.name === 'string' &&
            typeof portal.targetFloorId === 'string' &&
            inBounds(m, portal.pos) &&
            Number.isInteger(portal.target.x) &&
            Number.isInteger(portal.target.y),
        )))
  );
}

export function isMapBackground(background: GridMap['background']): boolean {
  if (background === undefined) return true;
  return (
    typeof background.src === 'string' &&
    background.src.length <= 3 * 1024 * 1024 &&
    /^data:image\/(?:png|jpeg|webp|gif);base64,/.test(background.src) &&
    background.widthPx > 0 &&
    background.heightPx > 0 &&
    background.pixelsPerCell > 0 &&
    Number.isFinite(background.offsetX) &&
    Number.isFinite(background.offsetY) &&
    background.opacity >= 0 &&
    background.opacity <= 1
  );
}
