import { newCreature } from '../../models/creature-factory';
import { EncounterState, Role } from '../../models/encounter';
import { GridMap, Terrain } from '../../models/grid';
import { dispatch, newEncounter, sizeOf, teamOf } from '../encounter';

const FORMAT_VERSION = 1;
const DEFAULT_GRID = 100;
const DM: Role = { kind: 'dm' };
const TERRAINS: readonly Terrain[] = [
  'floor',
  'wall',
  'difficult',
  'water',
  'door',
  'door-closed',
  'door-locked',
  'unknown',
];

type Json = Record<string, unknown>;

const record = (value: unknown): value is Json => typeof value === 'object' && value !== null;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const terrain = (value: unknown): value is Terrain =>
  typeof value === 'string' && TERRAINS.includes(value as Terrain);

function wallSegments(map: GridMap, grid: number): Json[] {
  const segments = new Map<string, Json>();
  const add = (c: number[], door = 0, ds = 0) => {
    const key = `${c.join(',')}:${door}:${ds}`;
    segments.set(key, { _id: null, c, door, ds, move: 1, sight: 1, sound: 1, dir: 0, flags: {} });
  };
  const at = (x: number, y: number) => map.cells[y * map.width + x];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = at(x, y);
      if (cell === 'wall') {
        const x0 = x * grid;
        const y0 = y * grid;
        add([x0, y0, x0 + grid, y0]);
        add([x0 + grid, y0, x0 + grid, y0 + grid]);
        add([x0, y0 + grid, x0 + grid, y0 + grid]);
        add([x0, y0, x0, y0 + grid]);
      } else if (cell === 'door' || cell === 'door-closed' || cell === 'door-locked') {
        const horizontal =
          ['wall', 'door', 'door-closed', 'door-locked'].includes(at(x - 1, y)) ||
          ['wall', 'door', 'door-closed', 'door-locked'].includes(at(x + 1, y));
        const c = horizontal
          ? [x * grid, y * grid, (x + 1) * grid, y * grid]
          : [x * grid, y * grid, x * grid, (y + 1) * grid];
        add(c, 1, cell === 'door' ? 1 : cell === 'door-locked' ? 2 : 0);
      }
    }
  }
  return [...segments.values()];
}

/** Exporta uma Scene compatível com o importador JSON do Foundry VTT v13. */
export function exportFoundryScene(state: EncounterState): string {
  const grid = DEFAULT_GRID;
  const tokens = state.tokens.flatMap((token) => {
    const creature = state.creatures.find((item) => item.id === token.creatureId);
    if (!creature) return [];
    const size = sizeOf(creature);
    return [
      {
        _id: null,
        name: creature.name,
        x: token.pos.x * grid,
        y: token.pos.y * grid,
        width: size,
        height: size,
        hidden: !!token.hidden,
        disposition: teamOf(creature) === 'party' ? 1 : -1,
        actorId: null,
        actorLink: false,
        texture: { src: creature.tokenImage || 'icons/svg/mystery-man.svg' },
        flags: {},
      },
    ];
  });
  const background = state.map.background;
  return JSON.stringify(
    {
      _id: null,
      name: state.name,
      width: state.map.width * grid,
      height: state.map.height * grid,
      padding: 0,
      background: background ? { src: background.src } : null,
      backgroundColor: '#111111',
      grid: { type: 1, size: grid, distance: 5, units: 'ft' },
      tokenVision: state.map.vision?.enabled ?? false,
      fog: {
        exploration: true,
        overlay: null,
        reset: null,
        colors: { explored: null, unexplored: null },
      },
      walls: wallSegments(state.map, grid),
      tokens,
      flags: {
        runegrid: {
          version: FORMAT_VERSION,
          width: state.map.width,
          height: state.map.height,
          cells: state.map.cells,
        },
      },
    },
    null,
    1,
  );
}

function rasterizeWalls(map: GridMap, walls: unknown[], grid: number): void {
  const set = (x: number, y: number, value: Terrain) => {
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) map.cells[y * map.width + x] = value;
  };
  for (const raw of walls) {
    if (
      !record(raw) ||
      !Array.isArray(raw['c']) ||
      raw['c'].length !== 4 ||
      !raw['c'].every(finite)
    )
      continue;
    const [x0, y0, x1, y1] = raw['c'] as number[];
    const door = raw['door'] === 1;
    const value: Terrain = door
      ? raw['ds'] === 1
        ? 'door'
        : raw['ds'] === 2
          ? 'door-locked'
          : 'door-closed'
      : 'wall';
    if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) {
      const y = Math.round(y0 / grid) - 1;
      for (let x = Math.floor(Math.min(x0, x1) / grid); x < Math.ceil(Math.max(x0, x1) / grid); x++)
        set(x, y, value);
    } else {
      const x = Math.round(x0 / grid) - 1;
      for (let y = Math.floor(Math.min(y0, y1) / grid); y < Math.ceil(Math.max(y0, y1) / grid); y++)
        set(x, y, value);
    }
  }
}

/** Importa o subconjunto de Scene usado pelo Runegrid; devolve `null` sem alterar estado em erro. */
export function importFoundryScene(text: string): EncounterState | null {
  try {
    const scene: unknown = JSON.parse(text);
    if (!record(scene) || !record(scene['grid'])) return null;
    const grid = scene['grid']['size'];
    if (!finite(grid) || grid <= 0 || !finite(scene['width']) || !finite(scene['height']))
      return null;
    const flags =
      record(scene['flags']) && record(scene['flags']['runegrid'])
        ? scene['flags']['runegrid']
        : null;
    const flaggedCells = flags?.['cells'];
    const width =
      flags && finite(flags['width']) ? flags['width'] : Math.round(scene['width'] / grid);
    const height =
      flags && finite(flags['height']) ? flags['height'] : Math.round(scene['height'] / grid);
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 100 ||
      height > 100
    )
      return null;
    const hasFlaggedCells =
      Array.isArray(flaggedCells) &&
      flaggedCells.length === width * height &&
      flaggedCells.every(terrain);
    const cells = hasFlaggedCells
      ? [...flaggedCells]
      : Array<Terrain>(width * height).fill('floor');
    const map: GridMap = { width, height, cells };
    if (!hasFlaggedCells)
      rasterizeWalls(map, Array.isArray(scene['walls']) ? scene['walls'] : [], grid);
    if (record(scene['background']) && typeof scene['background']['src'] === 'string') {
      map.background = {
        src: scene['background']['src'],
        widthPx: scene['width'],
        heightPx: scene['height'],
        pixelsPerCell: grid,
        offsetX: 0,
        offsetY: 0,
        opacity: 1,
      };
    }
    let state = newEncounter(
      map,
      typeof scene['name'] === 'string' ? scene['name'] : 'Cena Foundry',
    );
    const tokens = Array.isArray(scene['tokens']) ? scene['tokens'] : [];
    for (const [index, token] of tokens.entries()) {
      if (!record(token) || !finite(token['x']) || !finite(token['y'])) continue;
      const side = finite(token['width']) ? Math.max(1, Math.round(token['width'])) : 1;
      const size = side >= 4 ? 'gargantuan' : side === 3 ? 'huge' : side === 2 ? 'large' : 'medium';
      const texture =
        record(token['texture']) && typeof token['texture']['src'] === 'string'
          ? token['texture']['src']
          : undefined;
      const creature = newCreature(token['disposition'] === -1 ? 'monster' : 'npc', {
        id: `foundry-${index}`,
        name: typeof token['name'] === 'string' ? token['name'] : `Token ${index + 1}`,
        size,
        tokenImage: texture,
      });
      try {
        state = dispatch(
          state,
          {
            type: 'addCreature',
            creature,
            pos: { x: Math.round(token['x'] / grid), y: Math.round(token['y'] / grid) },
            hidden: token['hidden'] === true,
          },
          { rng: Math.random, role: DM },
        );
      } catch {
        // Token externo inválido ou sobreposto: mantém o restante da cena importável.
      }
    }
    return state;
  } catch {
    return null;
  }
}
