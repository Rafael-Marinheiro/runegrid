import { EncounterState, MapFloor } from '../../models/encounter';
import { GridMap, IMPASSABLE, inBounds, isGridMap, Portal, terrainAt } from '../../models/grid';
import { RuleError } from '../creature';
import { canStand, footprint, key } from '../grid/movement';
import { addLog, sizeOf, teamOf } from './state';
import { T } from '../i18n';

const activeId = (state: EncounterState): string => state.floorId ?? 'floor-1';
const activeName = (state: EncounterState): string => state.floorName ?? 'Térreo';
const savedFloors = (state: EncounterState): MapFloor[] => state.floors ?? [];

function requireSetup(state: EncounterState): void {
  if (state.combat.phase === 'running')
    throw new RuleError(
      T('Encerre o combate antes de trocar de andar.', 'End combat before changing floors.'),
    );
}

function floorOf(state: EncounterState, id: string): MapFloor {
  const floor = savedFloors(state).find((item) => item.id === id);
  if (!floor) throw new RuleError(T('Andar não encontrado.', 'Floor not found.'));
  return floor;
}

function activeFloor(state: EncounterState, tokens = state.tokens): MapFloor {
  return { id: activeId(state), name: activeName(state), map: state.map, tokens };
}

function activate(state: EncounterState, target: MapFloor, current: MapFloor): EncounterState {
  return {
    ...state,
    floorId: target.id,
    floorName: target.name,
    map: target.map,
    tokens: target.tokens,
    floors: savedFloors(state).map((floor) => (floor.id === target.id ? current : floor)),
  };
}

export function addFloor(
  state: EncounterState,
  floor: Pick<MapFloor, 'id' | 'name' | 'map'>,
): EncounterState {
  requireSetup(state);
  if (!floor.id || !floor.name.trim() || !isGridMap(floor.map))
    throw new RuleError(T('Informe um andar válido.', 'Enter a valid floor.'));
  if (floor.id === activeId(state) || savedFloors(state).some((item) => item.id === floor.id))
    throw new RuleError(T('Este andar já existe.', 'This floor already exists.'));
  return {
    ...state,
    floors: [...savedFloors(state), { ...floor, name: floor.name.trim(), tokens: [] }],
  };
}

export function removeFloor(state: EncounterState, id: string): EncounterState {
  requireSetup(state);
  floorOf(state, id);
  const clean = (map: GridMap): GridMap => ({
    ...map,
    portals: (map.portals ?? []).filter((portal) => portal.targetFloorId !== id),
  });
  return {
    ...state,
    map: clean(state.map),
    floors: savedFloors(state)
      .filter((floor) => floor.id !== id)
      .map((floor) => ({ ...floor, map: clean(floor.map) })),
  };
}

export function switchFloor(state: EncounterState, id: string): EncounterState {
  requireSetup(state);
  if (id === activeId(state)) return state;
  return activate(state, floorOf(state, id), activeFloor(state));
}

export function setFloors(
  state: EncounterState,
  floorId: string,
  floorName: string,
  floors: Pick<MapFloor, 'id' | 'name' | 'map'>[],
): EncounterState {
  requireSetup(state);
  if (!floorId || !floorName.trim())
    throw new RuleError(T('Andar ativo inválido.', 'Invalid active floor.'));
  const ids = new Set([floorId]);
  for (const floor of floors) {
    if (!floor.id || !floor.name.trim() || ids.has(floor.id) || !isGridMap(floor.map))
      throw new RuleError(T('Lista de andares inválida.', 'Invalid floor list.'));
    ids.add(floor.id);
  }
  return {
    ...state,
    floorId,
    floorName: floorName.trim(),
    floors: floors.map((floor) => ({ ...floor, name: floor.name.trim(), tokens: [] })),
  };
}

export function upsertPortal(state: EncounterState, portal: Portal): EncounterState {
  requireSetup(state);
  if (!portal.name.trim())
    throw new RuleError(T('Informe o nome do portal.', 'Enter the portal name.'));
  if (!inBounds(state.map, portal.pos) || IMPASSABLE.includes(terrainAt(state.map, portal.pos)))
    throw new RuleError(
      T('O portal precisa ficar em uma célula livre.', 'The portal needs a free cell.'),
    );
  const target = floorOf(state, portal.targetFloorId);
  if (
    !inBounds(target.map, portal.target) ||
    IMPASSABLE.includes(terrainAt(target.map, portal.target))
  )
    throw new RuleError(
      T(
        'O destino do portal precisa ser uma célula livre.',
        'The portal destination needs a free cell.',
      ),
    );
  const portals = state.map.portals ?? [];
  const next = portals.some((item) => item.id === portal.id)
    ? portals.map((item) =>
        item.id === portal.id ? { ...portal, name: portal.name.trim() } : item,
      )
    : [...portals, { ...portal, name: portal.name.trim() }];
  return { ...state, map: { ...state.map, portals: next } };
}

export function removePortal(state: EncounterState, id: string): EncounterState {
  requireSetup(state);
  return {
    ...state,
    map: { ...state.map, portals: (state.map.portals ?? []).filter((portal) => portal.id !== id) },
  };
}

export function travelPortal(state: EncounterState, id: string): EncounterState {
  requireSetup(state);
  const portal = (state.map.portals ?? []).find((item) => item.id === id);
  if (!portal) throw new RuleError(T('Portal não encontrado.', 'Portal not found.'));
  const target = floorOf(state, portal.targetFloorId);
  const partyIds = new Set(state.creatures.filter((c) => teamOf(c) === 'party').map((c) => c.id));
  const moving = state.tokens.filter((token) => partyIds.has(token.creatureId));
  if (!moving.length)
    throw new RuleError(T('Não há grupo neste andar.', 'There is no party on this floor.'));
  const destination = [...target.tokens];
  const occupied = new Set<string>();
  for (const token of destination) {
    const creature = state.creatures.find((c) => c.id === token.creatureId);
    if (creature)
      for (const cell of footprint(token.pos, sizeOf(creature))) occupied.add(key(cell));
  }
  for (const token of moving) {
    const creature = state.creatures.find((c) => c.id === token.creatureId)!;
    const pos = nearestFree(target.map, portal.target, sizeOf(creature), occupied);
    if (!pos)
      throw new RuleError(
        T(
          `Não há espaço para ${creature.name} no andar de destino.`,
          `There is no room for ${creature.name} on the destination floor.`,
        ),
      );
    destination.push({ ...token, pos });
    for (const cell of footprint(pos, sizeOf(creature))) occupied.add(key(cell));
  }
  const current = activeFloor(
    state,
    state.tokens.filter((token) => !partyIds.has(token.creatureId)),
  );
  return addLog(
    activate(state, { ...target, tokens: destination }, current),
    T(`O grupo foi para ${target.name}.`, `The party moved to ${target.name}.`),
  );
}

function nearestFree(
  map: GridMap,
  target: { x: number; y: number },
  size: number,
  occupied: ReadonlySet<string>,
): { x: number; y: number } | null {
  const cells = Array.from({ length: map.width * map.height }, (_, i) => ({
    x: i % map.width,
    y: Math.floor(i / map.width),
  })).sort(
    (a, b) =>
      Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
  );
  return cells.find((pos) => canStand(map, pos, size, occupied)) ?? null;
}
