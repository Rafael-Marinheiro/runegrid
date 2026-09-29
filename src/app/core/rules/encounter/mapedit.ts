import { EncounterState } from '../../models/encounter';
import {
  GridMap,
  IMPASSABLE,
  inBounds,
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

const checkBounds = (map: GridMap, cells: Pos[]): void => {
  if (cells.some((c) => !inBounds(map, c))) throw new RuleError('Fora do mapa.');
};

/** Pinta um conjunto de células com um terreno (um traço do pincel). */
export function paint(state: EncounterState, cells: Pos[], terrain: Terrain): EncounterState {
  checkBounds(state.map, cells);
  if (terrain === 'unknown') throw new RuleError('Terreno inválido.');
  if (IMPASSABLE.includes(terrain)) {
    const occupied = occupiedCells(state);
    if (cells.some((c) => occupied.has(key(c))))
      throw new RuleError('Há uma criatura nessa célula.');
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
    throw new RuleError('Não é possível trocar o mapa durante o combate.');
  if (map.width < 1 || map.height < 1 || map.cells.length !== map.width * map.height) {
    throw new RuleError('Mapa inválido.');
  }
  const next: EncounterState = { ...state, map, tokens: [] };
  let s = next;
  for (const t of state.tokens) {
    const c = creatureOf(state, t.creatureId);
    const fits = footprint(t.pos, sizeOf(c)).every(
      (p) => inBounds(map, p) && !IMPASSABLE.includes(terrainAt(map, p)),
    );
    if (fits) s = { ...s, tokens: [...s.tokens, t] };
  }
  const dropped = state.tokens.length - s.tokens.length;
  return addLog(s, `Mapa carregado${dropped ? ` (${dropped} criatura(s) saíram do mapa)` : ''}.`);
}

const roomOk = (map: GridMap, r: Room): void => {
  if (
    r.w < 1 ||
    r.h < 1 ||
    !inBounds(map, { x: r.x, y: r.y }) ||
    !inBounds(map, { x: r.x + r.w - 1, y: r.y + r.h - 1 })
  ) {
    throw new RuleError('A sala precisa caber no mapa.');
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
  if (!room) throw new RuleError('Sala não encontrada.');
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
    throw new RuleError('A armadilha precisa ficar num piso.');
  try {
    parseDice(trap.damage);
  } catch {
    throw new RuleError('Dado de dano da armadilha inválido.');
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
    throw new RuleError('Item inválido.');
  if (IMPASSABLE.includes(terrainAt(state.map, item.pos)))
    throw new RuleError('O item precisa ficar num piso.');
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

/** Abre uma porta fechada adjacente (interação com objeto, sem custo de ação). */
export function openDoor(state: EncounterState, actorId: string, pos: Pos): EncounterState {
  const { actor } = actorTurn(state, actorId);
  checkBounds(state.map, [pos]);
  const from = tokenOf(state, actorId);
  if (!from) throw new RuleError(`${actor.name} não está no mapa.`);
  if (distanceFt(from.pos, sizeOf(actor), pos, 1, state.rule) > 5)
    throw new RuleError('A porta está longe demais.');
  const t = terrainAt(state.map, pos);
  if (t === 'door-locked') throw new RuleError('A porta está trancada.');
  if (t !== 'door-closed') throw new RuleError('Não há porta fechada aí.');
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
  const save = auto ? 'falha automática' : `d20 ${r.natural} = ${r.roll.total}`;
  s = addLog(
    s,
    `${c.name} dispara ${trap.name}: salvaguarda de ${trap.ability.toUpperCase()} ${save} vs CD ${trap.dc} — ${saved ? 'passou' : 'falhou'}: ${d.dealt} de dano ${dtype(trap.damageType)}${notes(d)}.`,
    [c.id],
  );
  return checkOutcome(aftermath(s, c.id, d.dealt, rng));
}
