import { Creature } from '../../models/creature';
import { Combat, EncounterState, LogEntry, Role, Token } from '../../models/encounter';
import { DiagonalRule, GridMap, SIZE_CELLS } from '../../models/grid';
import { RuleError } from '../creature';
import { footprint, key } from '../grid/movement';
import { expand, isBilingual } from '../i18n';
import { T } from '../i18n';

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
  if (!c)
    throw new RuleError(
      T('Criatura não encontrada no encontro.', 'Creature not found in the encounter.'),
    );
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
    text: expand(text, 'pt'),
    ...(isBilingual(text) ? { en: expand(text, 'en') } : {}),
    ...(secret ? { secret } : {}),
  };
  return { ...state, seq: state.seq + 1, log: [...state.log, entry].slice(-MAX_LOG) };
}

/** O jogador controla as próprias criaturas e as que invocou (o Mestre controla tudo). */
export function ownsCreature(state: EncounterState, role: Role, id: string): boolean {
  if (role.kind === 'dm' || role.owns.includes(id)) return true;
  const sm = state.creatures.find((c) => c.id === id);
  return sm?.kind === 'npc' && !!sm.summon && role.owns.includes(sm.summon.by);
}

/** Papel com os ids das invocações somados aos que o jogador já controla. */
export function withSummons(
  state: EncounterState,
  role: Extract<Role, { kind: 'player' }>,
): Extract<Role, { kind: 'player' }> {
  const extra = state.creatures.filter(
    (c) => !role.owns.includes(c.id) && ownsCreature(state, role, c.id),
  );
  return extra.length ? { kind: 'player', owns: [...role.owns, ...extra.map((c) => c.id)] } : role;
}
