import { Creature } from '../../models/creature';
import { Combat, EncounterState, LogEntry, Token } from '../../models/encounter';
import { DiagonalRule, GridMap, SIZE_CELLS } from '../../models/grid';
import { RuleError } from '../creature';
import { footprint, key } from '../grid/movement';

export class ForbiddenError extends RuleError {}

export const emptyCombat = (): Combat => ({
  phase: 'setup',
  round: 0,
  order: [],
  turnIndex: 0,
  initiative: {},
  turn: null,
  dodging: [],
  pending: [],
  reactionUsed: [],
});

export function newEncounter(
  map: GridMap,
  name = 'Encontro',
  rule: DiagonalRule = 'simple',
): EncounterState {
  return {
    name,
    map,
    rule,
    creatures: [],
    tokens: [],
    combat: emptyCombat(),
    log: [],
    seq: 1,
    floorId: 'floor-1',
    floorName: 'Térreo',
    floors: [],
  };
}

export const sizeOf = (c: Creature): number => SIZE_CELLS[c.size];
export const teamOf = (c: Creature): 'party' | 'foes' => (c.kind === 'monster' ? 'foes' : 'party');

export function creatureOf(state: EncounterState, id: string): Creature {
  const c = state.creatures.find((x) => x.id === id);
  if (!c) throw new RuleError('Criatura não encontrada no encontro.');
  return c;
}

export const tokenOf = (state: EncounterState, id: string): Token | undefined =>
  state.tokens.find((t) => t.creatureId === id);

/** Células ocupadas pelos tokens (opcionalmente só os que passam no filtro). */
export function occupiedCells(
  state: EncounterState,
  filter: (c: Creature) => boolean = () => true,
): Set<string> {
  const cells = new Set<string>();
  for (const t of state.tokens) {
    const c = state.creatures.find((x) => x.id === t.creatureId);
    if (!c || !filter(c)) continue;
    for (const cell of footprint(t.pos, sizeOf(c))) cells.add(key(cell));
  }
  return cells;
}

export function withCreature(state: EncounterState, c: Creature): EncounterState {
  return { ...state, creatures: state.creatures.map((x) => (x.id === c.id ? c : x)) };
}

const MAX_LOG = 300;

/** Acrescenta uma linha ao registro. Marca como secreta se envolver uma criatura oculta. */
export function addLog(
  state: EncounterState,
  text: string,
  involved: string[] = [],
): EncounterState {
  const secret = involved.some((id) => tokenOf(state, id)?.hidden);
  const entry: LogEntry = {
    id: state.seq,
    round: state.combat.round,
    text,
    ...(secret ? { secret } : {}),
  };
  return { ...state, seq: state.seq + 1, log: [...state.log, entry].slice(-MAX_LOG) };
}
