/**
 * Glue between the LLM-facing tools and the app's rules engine (`@core/rules/encounter`).
 * The LLM speaks in names ("Thordak", "Goblin 2"); the engine speaks in ids and commands.
 */
import type { Creature } from '@core/models/creature';
import type { EncounterState } from '@core/models/encounter';
import type { SrdMonster } from '@core/models/srd';
import { inBounds, type Pos } from '@core/models/grid';
import {
  dispatch,
  moveQuery,
  occupiedCells,
  sizeOf,
  tokenOf,
  type Command,
} from '@core/rules/encounter';
import type { AdvMode } from '@core/rules/dice';
import { canStand, distanceFt, reachable } from '@core/rules/grid/movement';
import { getItem } from '@core/rules/inventory/catalog';
import { SPELLS } from '@core/rules/spells/data';
import { monsterNamePt } from '@core/rules/srd/names-pt';
import type { Game, Ruleset } from './campaign';
import { monstersOf } from './data';
import { closeCombatNote, openCombatNote, writeLog } from './journal';
import { persist } from './sheets';
import { GameError, plain } from './util';

// ---------- lookup by name ----------

export function who(g: Game, ref: string): Creature {
  const all = g.scene.creatures;
  const byId = all.find((c) => c.id === ref);
  if (byId) return byId;
  const r = plain(ref);
  const exact = all.filter((c) => plain(c.name) === r);
  const pool = exact.length ? exact : all.filter((c) => plain(c.name).includes(r));
  if (pool.length === 1) return pool[0];
  throw new GameError(
    pool.length
      ? `"${ref}" matches several creatures (${pool.map((c) => c.name).join(', ')}). Use the full name.`
      : `No creature "${ref}" in the scene. Present: ${all.map((c) => c.name).join(', ') || '(nobody)'}.`,
  );
}

export function findMonster(ruleset: Ruleset, ref: string): SrdMonster {
  const list = monstersOf(ruleset);
  const r = plain(ref);
  const slug = r.replace(/\s+/g, '-');
  const name = (m: SrdMonster) => [plain(m.name), plain(monsterNamePt(m.name))];
  const exact = list.find((m) => m.id === slug || name(m).includes(r));
  if (exact) return exact;
  const pool = list.filter((m) => name(m).some((n) => n.includes(r)));
  if (pool.length === 1) return pool[0];
  throw new GameError(
    pool.length
      ? `"${ref}" is ambiguous. Candidates (use the id): ${pool
          .slice(0, 12)
          .map((m) => `${m.id} (CR ${m.cr})`)
          .join(', ')}.`
      : `No SRD monster "${ref}" (${ruleset}). Use rg_srd_search to find the id.`,
  );
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Goblin 1", "Goblin 2"… continuing after any already in the scene; a lone creature keeps its plain name. */
export function nameSeries(s: EncounterState, base: string, count: number): string[] {
  const re = new RegExp(`^${escapeRe(base)}(?: (\\d+))?$`);
  const used = s.creatures.flatMap((c) => {
    const m = re.exec(c.name);
    return m ? [m[1] ? Number(m[1]) : 1] : [];
  });
  if (!used.length && count === 1) return [base];
  const from = used.length ? Math.max(...used) : 0;
  return Array.from({ length: count }, (_, i) => `${base} ${from + i + 1}`);
}

// ---------- placement ----------

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Nearest free cell where a creature of `size` fits, searching rings outward from `near`. */
export function freeCell(
  s: EncounterState,
  size: number,
  near: Pos,
  opts: { min?: number; max?: number; within?: Rect } = {},
): Pos | null {
  const taken = occupiedCells(s);
  const { min = 0, max = 20, within } = opts;
  for (let r = min; r <= max; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const p = { x: near.x + dx, y: near.y + dy };
        if (!inBounds(s.map, p) || !canStand(s.map, p, size, taken)) continue;
        if (
          within &&
          (p.x < within.x ||
            p.y < within.y ||
            p.x + size > within.x + within.w ||
            p.y + size > within.y + within.h)
        )
          continue;
        return p;
      }
  return null;
}

export const roomOf = (s: EncounterState, ref: string) => {
  const r = plain(ref);
  const room = (s.map.rooms ?? []).find((x) => x.id === ref || plain(x.name) === r);
  if (!room)
    throw new GameError(
      `No room "${ref}". Rooms: ${(s.map.rooms ?? []).map((x) => `${x.id} (${x.name})`).join(', ') || '(none)'}.`,
    );
  return room;
};

export interface Placement {
  pos?: Pos;
  /** A creature name: land on the nearest free cell beside it. */
  near?: string;
  /** A room id or name: any free cell inside it. */
  room?: string;
}

/** Turns a placement request into a concrete cell, or `undefined` if none was asked for. */
export function place(g: Game, size: number, p: Placement): Pos | undefined {
  if (p.pos) return p.pos;
  const s = g.scene;
  if (p.near) {
    const t = tokenOf(s, who(g, p.near).id);
    if (!t) throw new GameError(`${p.near} is not on the map.`);
    const cell = freeCell(s, size, t.pos, { min: 1 });
    if (!cell) throw new GameError(`No free cell near ${p.near}.`);
    return cell;
  }
  if (p.room) {
    const room = roomOf(s, p.room);
    const cell = freeCell(
      s,
      size,
      { x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) },
      { within: room, max: Math.max(room.w, room.h) },
    );
    if (!cell) throw new GameError(`Room ${room.name} has no free cell.`);
    return cell;
  }
  return undefined;
}

// ---------- running commands ----------

/**
 * Applies one engine command as the DM, writes its log lines to the vault and returns them.
 * Combat notes open/close on the matching phase transitions; XP is awarded when a combat ends.
 */
export function exec(g: Game, cmd: Command): string[] {
  const before = g.scene;
  const after = dispatch(before, cmd, { rng: Math.random, role: { kind: 'dm' } });
  g.scene = after;
  const fresh = after.log.filter((e) => e.id >= before.seq);
  if (!g.combatNote && (cmd.type === 'rollInitiative' || cmd.type === 'startCombat'))
    openCombatNote(g);
  writeLog(g, fresh);
  const lines = fresh.map((e) => (e.secret ? `🔒 ${e.text}` : e.text));
  if (before.combat.phase === 'running' && after.combat.phase !== 'running' && g.combatNote)
    lines.push(`📜 ${closeCombatNote(g).replace(/\n/g, ' ')}`);
  return lines;
}

/** Runs `fn` and always persists afterwards, so a half-finished sequence is never lost. */
export function tx<T>(g: Game, fn: () => T): T {
  try {
    return fn();
  } finally {
    persist(g);
  }
}

// ---------- LLM action → engine command ----------

export interface Act {
  action: string;
  target?: string;
  attack?: string | number;
  mode?: AdvMode;
  knock_out?: boolean;
  spell?: string;
  slot_level?: number;
  to?: Pos;
  adjacent_to?: string;
  at?: string;
  point?: Pos;
  item?: string;
  use?: boolean;
}

const need = <T>(v: T | undefined, field: string, action: string): T => {
  if (v === undefined) throw new GameError(`Action "${action}" needs "${field}".`);
  return v;
};

function attackIndex(actor: Creature, ref: string | number | undefined): number {
  if (ref === undefined) return 0;
  if (typeof ref === 'number') return ref;
  const r = plain(ref);
  const i = actor.attacks.findIndex((a) => plain(a.name) === r || plain(a.name).includes(r));
  if (i < 0)
    throw new GameError(
      `${actor.name} has no attack "${ref}". Attacks: ${actor.attacks.map((a, k) => `[${k}] ${a.name}`).join(', ') || '(none)'}.`,
    );
  return i;
}

export function spellOf(ref: string) {
  const r = plain(ref);
  const s = SPELLS.find((x) => x.id === r.replace(/\s+/g, '-') || plain(x.name) === r);
  if (!s)
    throw new GameError(
      `Spell "${ref}" is not implemented by the engine. Engine spells: ${SPELLS.map((x) => x.id).join(', ')}. Adjudicate others by hand (rg_dm_command damage/heal/add_condition) and spend the slot with rg_character_update.`,
    );
  return s;
}

/** The cell to step to so `actor` ends beside `target`, or as close as the turn's movement allows. */
function approach(g: Game, actor: Creature, targetRef: string): Pos {
  const s = g.scene;
  const t = who(g, targetRef);
  const at = tokenOf(s, t.id);
  const from = tokenOf(s, actor.id);
  if (!at || !from) throw new GameError('Both creatures must be on the map.');
  const size = sizeOf(actor);
  const gap = (p: Pos) => distanceFt(p, size, at.pos, sizeOf(t), s.rule);
  if (gap(from.pos) <= 5) throw new GameError(`${actor.name} is already adjacent to ${t.name}.`);
  const free = occupiedCells(s, (o) => o.id !== actor.id);
  const options = reachable(moveQuery(s, actor.id)).filter((r) =>
    canStand(s.map, r.pos, size, free),
  );
  if (!options.length) throw new GameError('No cell reachable with the movement left.');
  options.sort((a, b) => gap(a.pos) - gap(b.pos) || a.costFt - b.costFt);
  return options[0].pos;
}

export function toCommand(g: Game, actorRef: string, a: Act): Command {
  const actor = who(g, actorRef);
  const actorId = actor.id;
  const target = () => who(g, need(a.target, 'target', a.action)).id;
  switch (a.action) {
    case 'move': {
      if (!a.to && !a.adjacent_to)
        throw new GameError('Action "move" needs "to" or "adjacent_to".');
      return { type: 'move', actorId, to: a.to ?? approach(g, actor, a.adjacent_to!) };
    }
    case 'attack':
      return {
        type: 'attack',
        actorId,
        targetId: target(),
        attackIndex: attackIndex(actor, a.attack),
        ...(a.mode ? { mode: a.mode } : {}),
        ...(a.knock_out ? { knockOut: true } : {}),
      };
    case 'cast': {
      const spell = spellOf(need(a.spell, 'spell', 'cast'));
      const point = a.point ?? (a.at ? tokenOf(g.scene, who(g, a.at).id)?.pos : undefined);
      return {
        type: 'cast',
        actorId,
        spellId: spell.id,
        ...(a.slot_level ? { slotLevel: a.slot_level } : {}),
        ...(a.target ? { targetId: target() } : {}),
        ...(point ? { point } : {}),
      };
    }
    case 'help':
      return { type: 'help', actorId, targetId: target() };
    case 'use_item': {
      const ref = plain(need(a.item, 'item', 'use_item'));
      const item = (actor.inventory ?? []).find(
        (i) => i.id === a.item || plain(i.ref) === ref || plain(itemName(i.ref)).includes(ref),
      );
      if (!item)
        throw new GameError(
          `${actor.name} has no item "${a.item}". Inventory: ${(actor.inventory ?? []).map((i) => i.ref).join(', ') || '(empty)'}.`,
        );
      return { type: 'useItem', actorId, itemId: item.id };
    }
    case 'open_door':
      return { type: 'openDoor', actorId, pos: need(a.point ?? a.to, 'point', 'open_door') };
    case 'reaction':
      return { type: 'reaction', actorId, use: a.use ?? true };
    case 'stand_up':
      return { type: 'standUp', actorId };
    case 'death_save':
      return { type: 'deathSave', actorId };
    case 'end_turn':
      return { type: 'endTurn', actorId };
    case 'dash':
    case 'dodge':
    case 'disengage':
    case 'hide':
      return { type: a.action, actorId };
    default:
      throw new GameError(`Unknown action "${a.action}".`);
  }
}

const itemName = (ref: string): string => getItem(ref)?.name ?? ref;
