import { Size } from './creature';

export type Terrain = 'floor' | 'wall' | 'difficult' | 'door';

export interface Pos {
  x: number;
  y: number;
}

export interface GridMap {
  width: number;
  height: number;
  /** Terreno por célula, linha a linha. Cada célula mede 5 ft. */
  cells: Terrain[];
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

const CHAR: Record<string, Terrain> = { '.': 'floor', '#': 'wall', ',': 'difficult', D: 'door' };

/** Cria um mapa a partir de linhas de texto: `.` piso, `#` parede, `,` terreno difícil, `D` porta. */
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
