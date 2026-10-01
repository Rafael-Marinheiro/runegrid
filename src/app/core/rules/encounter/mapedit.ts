import { EncounterState } from '../../models/encounter';
import {
  blocksMovementAt,
  GridMap,
  IMPASSABLE,
  inBounds,
  MapObject,
  MAP_OBJECT_KINDS,
  MAP_OBJECT_TEXTURES,
  PlacedItem,
  Pos,
  Room,
  Terrain,
  terrainAt,
  Trap,
} from '../../models/grid';
import { applyDamage, autoFailsSave, RuleError, saveBonus } from '../creature';
import { parseDice, roll, rollD20, Rng } from '../dice';
import { distanceFt, footprint, key } from '../grid/movement';
import { actorTurn, aftermath, checkOutcome, dtype, notes } from './helpers';
import { addLog, creatureOf, occupiedCells, sizeOf, tokenOf, withCreature } from './state';
import { T } from '../i18n';

const checkBounds = (map: GridMap, cells: Pos[]): void => {
  if (cells.some((c) => !inBounds(map, c))) throw new RuleError(T('Fora do mapa.', 'Off the map.'));
};

/** Pinta um conjunto de células com um terreno (um traço do pincel). */
export function paint(state: EncounterState, cells: Pos[], terrain: Terrain): EncounterState {
  checkBounds(state.map, cells);
  if (terrain === 'unknown') throw new RuleError(T('Terreno inválido.', 'Invalid terrain.'));
  if (IMPASSABLE.includes(terrain)) {
    const occupied = occupiedCells(state);
    if (cells.some((c) => occupied.has(key(c))))
      throw new RuleError(T('Há uma criatura nessa célula.', 'There is a creature in that cell.'));
    if (
      cells.some((cell) =>
        (state.map.objects ?? []).some(
          (object) => object.pos.x === cell.x && object.pos.y === cell.y,
        ),
      )
    )
      throw new RuleError(T('Há um objeto nessa célula.', 'There is an object in that cell.'));
  }
  const next = [...state.map.cells];
  for (const c of cells) next[c.y * state.map.width + c.x] = terrain;
  return { ...state, map: { ...state.map, cells: next } };
}

export function setFog(state: EncounterState, cells: Pos[], hidden: boolean): EncounterState {
  checkBounds(state.map, cells);
  const fog = state.map.fog ? [...state.map.fog] : state.map.cells.map(() => false);
  for (const c of cells) fog[c.y * state.map.width + c.x] = hidden;
  return { ...state, map: { ...state.map, fog } };
}

/** Troca o mapa (só na montagem): criaturas que não cabem mais saem do mapa. */
export function setMap(state: EncounterState, map: GridMap): EncounterState {
  if (state.combat.phase === 'running')
    throw new RuleError(
      T(
        'Não é possível trocar o mapa durante o combate.',
        'The map cannot be changed during combat.',
      ),
    );
  if (map.width < 1 || map.height < 1 || map.cells.length !== map.width * map.height) {
    throw new RuleError(T('Mapa inválido.', 'Invalid map.'));
  }
  const next: EncounterState = { ...state, map, tokens: [] };
  let s = next;
  for (const t of state.tokens) {
    const c = creatureOf(state, t.creatureId);
    const fits = footprint(t.pos, sizeOf(c)).every(
      (p) => inBounds(map, p) && !blocksMovementAt(map, p),
    );
    if (fits) s = { ...s, tokens: [...s.tokens, t] };
  }
  const dropped = state.tokens.length - s.tokens.length;
  return addLog(
    s,
    T(
      `Mapa carregado${dropped ? ` (${dropped} criatura(s) saíram do mapa)` : ''}.`,
      `Map loaded${dropped ? ` (${dropped} creature(s) left the map)` : ''}.`,
    ),
  );
}

const roomOk = (map: GridMap, r: Room): void => {
  if (
    r.w < 1 ||
    r.h < 1 ||
    !inBounds(map, { x: r.x, y: r.y }) ||
    !inBounds(map, { x: r.x + r.w - 1, y: r.y + r.h - 1 })
  ) {
    throw new RuleError(T('A sala precisa caber no mapa.', 'The room must fit on the map.'));
  }
};

export function upsertRoom(state: EncounterState, room: Room): EncounterState {
  roomOk(state.map, room);
  const rooms = state.map.rooms ?? [];
  const next = rooms.some((r) => r.id === room.id)
    ? rooms.map((r) => (r.id === room.id ? room : r))
    : [...rooms, room];
  return { ...state, map: { ...state.map, rooms: next } };
}

export function removeRoom(state: EncounterState, id: string): EncounterState {
  return {
    ...state,
    map: { ...state.map, rooms: (state.map.rooms ?? []).filter((r) => r.id !== id) },
  };
}

export function revealRoom(state: EncounterState, id: string, hidden = false): EncounterState {
  const room = (state.map.rooms ?? []).find((r) => r.id === id);
  if (!room) throw new RuleError(T('Sala não encontrada.', 'Room not found.'));
  const cells: Pos[] = [];
  for (let y = room.y; y < room.y + room.h; y++)
    for (let x = room.x; x < room.x + room.w; x++) cells.push({ x, y });
  const s = setFog(state, cells, hidden);
  if (hidden) return s;
  return addLog(
    s,
    room.description ? `${room.name}: ${room.description}` : `${room.name} foi revelada.`,
  );
}

export function upsertTrap(state: EncounterState, trap: Trap): EncounterState {
  checkBounds(state.map, [trap.pos]);
  if (IMPASSABLE.includes(terrainAt(state.map, trap.pos)))
    throw new RuleError(
      T('A armadilha precisa ficar num piso.', 'The trap must sit on a floor tile.'),
    );
  try {
    parseDice(trap.damage);
  } catch {
    throw new RuleError(T('Dado de dano da armadilha inválido.', 'Invalid trap damage die.'));
  }
  const traps = state.map.traps ?? [];
  const next = traps.some((t) => t.id === trap.id)
    ? traps.map((t) => (t.id === trap.id ? trap : t))
    : [...traps, trap];
  return { ...state, map: { ...state.map, traps: next } };
}

export function removeTrap(state: EncounterState, id: string): EncounterState {
  return {
    ...state,
    map: { ...state.map, traps: (state.map.traps ?? []).filter((t) => t.id !== id) },
  };
}

export function upsertItem(state: EncounterState, item: PlacedItem): EncounterState {
  checkBounds(state.map, [item.pos]);
  if (!item.name.trim() || item.qty < 1 || !Number.isInteger(item.qty))
    throw new RuleError(T('Item inválido.', 'Invalid item.'));
  if (IMPASSABLE.includes(terrainAt(state.map, item.pos)))
    throw new RuleError(T('O item precisa ficar num piso.', 'The item must sit on a floor tile.'));
  const items = state.map.items ?? [];
  const next = items.some((placed) => placed.id === item.id)
    ? items.map((placed) => (placed.id === item.id ? item : placed))
    : [...items, item];
  return { ...state, map: { ...state.map, items: next } };
}

export function removeItem(state: EncounterState, id: string): EncounterState {
  return {
    ...state,
    map: { ...state.map, items: (state.map.items ?? []).filter((item) => item.id !== id) },
  };
}

export function upsertMapObject(state: EncounterState, object: MapObject): EncounterState {
  const normalized = {
    ...object,
    rotation: object.rotation ?? 0,
    texture: object.texture ?? 'wood',
  };
  checkBounds(state.map, [normalized.pos]);
  if (
    !MAP_OBJECT_KINDS.includes(normalized.kind) ||
    !MAP_OBJECT_TEXTURES.includes(normalized.texture) ||
    !Number.isInteger(normalized.rotation) ||
    normalized.rotation < 0 ||
    normalized.rotation >= 360 ||
    normalized.rotation % 45 !== 0
  )
    throw new RuleError(T('Objeto inválido.', 'Invalid object.'));
  if (IMPASSABLE.includes(terrainAt(state.map, normalized.pos)))
    throw new RuleError(
      T('O objeto precisa ficar num piso.', 'The object must sit on a floor tile.'),
    );
  if (normalized.blocksMovement && occupiedCells(state).has(key(normalized.pos)))
    throw new RuleError(T('Há uma criatura nessa célula.', 'There is a creature in that cell.'));
  const objects = state.map.objects ?? [];
  if (
    objects.some(
      (placed) =>
        placed.id !== normalized.id &&
        placed.pos.x === normalized.pos.x &&
        placed.pos.y === normalized.pos.y,
    )
  )
    throw new RuleError(
      T('Já existe um objeto nessa célula.', 'There is already an object in that cell.'),
    );
  const next = objects.some((placed) => placed.id === normalized.id)
    ? objects.map((placed) => (placed.id === normalized.id ? normalized : placed))
    : [...objects, normalized];
  return { ...state, map: { ...state.map, objects: next } };
}

export function removeMapObject(state: EncounterState, id: string): EncounterState {
  return {
    ...state,
    map: { ...state.map, objects: (state.map.objects ?? []).filter((object) => object.id !== id) },
  };
}

/** Abre uma porta fechada adjacente (interação com objeto, sem custo de ação). */
export function openDoor(state: EncounterState, actorId: string, pos: Pos): EncounterState {
  const { actor } = actorTurn(state, actorId);
  checkBounds(state.map, [pos]);
  const from = tokenOf(state, actorId);
  if (!from)
    throw new RuleError(T(`${actor.name} não está no mapa.`, `${actor.name} is not on the map.`));
  if (distanceFt(from.pos, sizeOf(actor), pos, 1, state.rule) > 5)
    throw new RuleError(T('A porta está longe demais.', 'The door is too far away.'));
  const t = terrainAt(state.map, pos);
  if (t === 'door-locked') throw new RuleError(T('A porta está trancada.', 'The door is locked.'));
  if (t !== 'door-closed')
    throw new RuleError(T('Não há porta fechada aí.', 'There is no closed door there.'));
  const s = paint(state, [pos], 'door');
  return addLog(s, `${actor.name} abre a porta.`, [actorId]);
}

/** Primeira armadilha ainda armada dentro do caminho (a criatura para nela). */
export function firstTrapOnPath(
  state: EncounterState,
  path: Pos[],
  size: number,
): { index: number; trap: Trap } | null {
  const armed = (state.map.traps ?? []).filter((t) => !t.triggered);
  if (!armed.length) return null;
  for (let i = 0; i < path.length; i++) {
    const cells = new Set(footprint(path[i], size).map(key));
    const trap = armed.find((t) => cells.has(key(t.pos)));
    if (trap) return { index: i, trap };
  }
  return null;
}

/** Dispara a armadilha: salvaguarda contra a CD; dano inteiro se falhar, metade se passar. */
export function triggerTrap(
  state: EncounterState,
  creatureId: string,
  trapId: string,
  rng: Rng,
): EncounterState {
  const trap = (state.map.traps ?? []).find((t) => t.id === trapId);
  if (!trap) return state;
  const c = creatureOf(state, creatureId);
  const auto = autoFailsSave(c, trap.ability);
  const r = rollD20(saveBonus(c, trap.ability), 'normal', rng);
  const saved = !auto && r.roll.total >= trap.dc;
  const total = Math.max(0, roll(trap.damage, rng).total);
  const d = applyDamage(c, saved ? Math.floor(total / 2) : total, { type: trap.damageType });

  let s: EncounterState = {
    ...state,
    map: {
      ...state.map,
      traps: (state.map.traps ?? []).map((t) =>
        t.id === trapId ? { ...t, triggered: true, hidden: false } : t,
      ),
    },
  };
  s = withCreature(s, d.creature);
  const save = auto
    ? T('falha automática', 'automatic failure')
    : `d20 ${r.natural} = ${r.roll.total}`;
  s = addLog(
    s,
    T(
      `${c.name} dispara ${trap.name}: salvaguarda de ${trap.ability.toUpperCase()} ${save} vs CD ${trap.dc} — ${saved ? 'passou' : 'falhou'}: ${d.dealt} de dano ${dtype(trap.damageType)}${notes(d)}.`,
      `${c.name} triggers ${trap.name}: ${trap.ability.toUpperCase()} saving throw ${save} vs DC ${trap.dc} — ${saved ? 'passed' : 'failed'}: ${d.dealt} ${dtype(trap.damageType)} damage${notes(d)}.`,
    ),
    [c.id],
  );
  return checkOutcome(aftermath(s, c.id, d.dealt, rng));
}
