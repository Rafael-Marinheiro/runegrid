import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Pos } from '@core/models/grid';
import { inBounds, terrainAt } from '@core/models/grid';
import { sizeOf, tokenOf } from '@core/rules/encounter';
import { z } from 'zod';
import { activeGame, type Game } from '../campaign';
import { exec, place, roomOf, toCommand, tx, who, type Act } from '../game';
import { afterAction } from '../render';
import { GameError, WRITE, reply } from '../util';
import { AreaSchema, ConditionSchema, DamageTypeSchema, ModeSchema, PosSchema } from './schemas';

const cellsOf = (g: Game, a: { x: number; y: number; w: number; h: number }): Pos[] => {
  if (a.w * a.h > 2500) throw new GameError('Area too large (max 2500 cells).');
  const cells: Pos[] = [];
  for (let y = a.y; y < a.y + a.h; y++)
    for (let x = a.x; x < a.x + a.w; x++) if (inBounds(g.scene.map, { x, y })) cells.push({ x, y });
  return cells;
};

const need = <T>(v: T | undefined, field: string, op: string): T => {
  if (v === undefined) throw new GameError(`Op "${op}" needs "${field}".`);
  return v;
};

const ActionSchema = z.object({
  action: z.enum([
    'move',
    'attack',
    'cast',
    'dash',
    'dodge',
    'second_wind',
    'action_surge',
    'rage',
    'disengage',
    'hide',
    'help',
    'use_item',
    'stand_up',
    'open_door',
    'death_save',
    'reaction',
    'end_turn',
  ]),
  target: z.string().optional().describe('Creature name (attack, help, single-target cast)'),
  attack: z
    .union([z.string(), z.number().int().min(0)])
    .optional()
    .describe('Attack name or index from the status (default: the first)'),
  mode: ModeSchema.optional().describe(
    'Extra advantage/disadvantage you grant (e.g. from a feature); the engine already applies conditions, cover, Dodge, Help, hidden attackers…',
  ),
  knock_out: z
    .boolean()
    .optional()
    .describe(
      'SRD 2024: a melee hit that would drop the target to 0 HP leaves it at 1 HP unconscious instead',
    ),
  spell: z
    .string()
    .optional()
    .describe('Spell id or name (see rg_srd_get); every SRD spell is in the engine'),
  targets: z
    .array(z.string())
    .optional()
    .describe(
      'cast/reaction: several targets (Bless, Scorching Ray, Magic Missile…); darts/rays are split among them',
    ),
  option: z
    .string()
    .optional()
    .describe(
      'cast: the spell choice when it has one (e.g. Protection from Energy: fire|acid|cold|lightning|thunder; Bestow Curse: attack|ability|turns|necrotic)',
    ),
  sustain: z
    .boolean()
    .optional()
    .describe(
      'cast: use again a spell you are sustaining (Spiritual Weapon…) — no slot, costs its action/bonus action',
    ),
  slot_level: z
    .number()
    .int()
    .min(1)
    .max(9)
    .optional()
    .describe("Spell slot level to spend (upcasting); default: the spell's level"),
  to: PosSchema.optional().describe('move: destination cell'),
  adjacent_to: z
    .string()
    .optional()
    .describe(
      'move: creature to close in on — goes to the cheapest reachable cell beside it (or as close as movement allows)',
    ),
  at: z.string().optional().describe('cast: centre an area spell on this creature'),
  point: PosSchema.optional().describe(
    'cast: centre/direction cell of an area spell; open_door: the door cell',
  ),
  item: z.string().optional().describe('use_item: inventory item name/ref'),
  use: z
    .boolean()
    .optional()
    .describe(
      'reaction: true = react (opportunity attack, or cast the reaction spell named in "spell": Shield, Counterspell, Hellish Rebuke…), false = decline',
    ),
});

export function registerCombat(server: McpServer): void {
  server.registerTool(
    'rg_combat_start',
    {
      title: 'Start combat',
      description: `Roll initiative (d20 + DEX for everyone on the map, hidden monsters included) and begin the first round. A combat note "Combates/Combate NNN" is opened in the vault and every action is logged there. Every living creature must have a map token first (rg_dm_command place_token with position/near, or placement when created) unless ignore_off_map=true. Returns the initiative order and whose turn it is.
The fight then runs: rg_game_status → rg_combat_act for the creature whose turn it is (you play monsters and NPCs; ask the human what their PCs do) → narrate → repeat; the combat ends by itself when one side has no one left standing (XP is awarded and logged automatically).`,
      inputSchema: {
        ignore_off_map: z
          .boolean()
          .default(false)
          .describe('Start even though some creatures have no token (they sit this combat out)'),
      },
      annotations: WRITE,
    },
    ({ ignore_off_map }) =>
      reply(() => {
        const g = activeGame();
        return tx(g, () => {
          if (g.scene.combat.phase === 'running')
            throw new GameError('A combat is already running. See rg_game_status.');
          const off = g.scene.creatures.filter(
            (c) => c.status !== 'dead' && !tokenOf(g.scene, c.id),
          );
          if (off.length && !ignore_off_map)
            throw new GameError(
              `These creatures have no map token: ${off.map((c) => c.name).join(', ')}. Place them (rg_dm_command place_token) or pass ignore_off_map=true.`,
            );
          if (g.scene.combat.phase === 'ended') exec(g, { type: 'resetCombat' });
          const lines = [
            ...exec(g, { type: 'rollInitiative' }),
            ...exec(g, { type: 'startCombat' }),
          ];
          return `${lines.join('\n')}\n\n${afterAction(g)}`;
        });
      }),
  );

  server.registerTool(
    'rg_combat_act',
    {
      title: 'Take combat actions for a creature',
      description: `Perform one or several actions for ONE creature, in order, through the rules engine: it checks that it is that creature's turn, range, action economy, movement cost/terrain/doors, opportunity attacks, cover, advantage/disadvantage from conditions, rolls the dice, applies damage/resistances/concentration/death saves and writes everything to the combat log. You never roll or compute damage yourself.
Actions (one object each): move {to:{x,y}} or {adjacent_to:"Goblin 1"} · attack {target, attack?, mode?, knock_out?} · cast {spell (a spell OR the monster's own ability, see Abilities in the status), target? | targets? | at? | point?, slot_level?} · dash · dodge · second_wind · action_surge · rage (again = end it; needs the feature on the sheet; sneak attack is automatic) · disengage · hide · help {target} · use_item {item} · stand_up · open_door {point} · death_save · reaction {use:true|false, spell?, slot_level?} (the actor is then the REACTOR, see pending reactions in the status; Shield/Counterspell/Hellish Rebuke offer themselves as pending reactions) · end_turn.
Batch a whole turn in one call, e.g. actions:[{move adjacent_to "Thordak"},{attack target "Thordak"},{attack target "Thordak"},{end_turn}]. Execution stops at the first failing action (earlier ones stay applied) and reports why; fix and call again.
Always end a turn with end_turn (also when dying, after death_save). If a move provoked an opportunity attack the turn cannot end until each pending reaction is answered with reaction use:true|false.
Args: actor (creature name); actions (1–8).`,
      inputSchema: {
        actor: z.string().describe('Creature name, e.g. "Thordak" or "Goblin 2"'),
        actions: z.array(ActionSchema).min(1).max(8),
      },
      annotations: WRITE,
    },
    ({ actor, actions }) =>
      reply(() => {
        const g = activeGame();
        return tx(g, () => {
          who(g, actor); // fail early with the list of names
          const out: string[] = [];
          let failed = false;
          actions.forEach((a, i) => {
            if (failed) return;
            try {
              const lines = exec(g, toCommand(g, actor, a as Act));
              out.push(
                `${i + 1}. ${a.action}${a.target ? ` → ${a.target}` : ''}:\n   ${lines.join('\n   ') || '(done)'}`,
              );
            } catch (e) {
              failed = true;
              out.push(
                `${i + 1}. ${a.action} ✘ ${e instanceof Error ? e.message : String(e)}\n   Stopped here; ${actions.length - i - 1} later action(s) not run.`,
              );
            }
          });
          return `${out.join('\n')}\n\n${afterAction(g)}`;
        });
      }),
  );

  server.registerTool(
    'rg_dm_command',
    {
      title: "DM command (world changes outside a creature's turn)",
      description: `The DM's hands on the world, all through the rules engine and logged. Ops:
• damage {target, amount, damage_type?} — applies resistances/vulnerabilities/temp HP/death rules/concentration checks; heal {target, amount}
• add_condition {target, condition, rounds?} / remove_condition {target, condition}
• place_token {target, position | near | room} — move anything without spending movement (exploration, teleports, reinforcements); set_hidden {target, hidden}
• remove_creature {target}; remove_defeated {} (clears dead monsters from the map)
• reveal_room {room} / hide_room {room} — lifts the fog over a room and logs its read-aloud text; reveal_area / hide_area {area}
• open_door {position} — opens a closed/locked door (outside a creature's turn); set_terrain {area, terrain}
• secret_roll {expr} — a roll the players never see (logged to Mestre/)
• set_initiative {target, value} (before combat starts), join_combat {target} (late arrival), end_combat {}
Use it for traps you adjudicate, environmental damage, spells the engine does not automate, and moving the party while exploring. Exploration movement has no cost or limit: you decide what is reasonable.`,
      inputSchema: {
        op: z.enum([
          'damage',
          'heal',
          'add_condition',
          'remove_condition',
          'place_token',
          'set_hidden',
          'remove_creature',
          'remove_defeated',
          'reveal_room',
          'hide_room',
          'reveal_area',
          'hide_area',
          'open_door',
          'set_terrain',
          'secret_roll',
          'set_initiative',
          'join_combat',
          'end_combat',
        ]),
        target: z.string().optional().describe('Creature name'),
        amount: z.number().int().min(0).max(999).optional(),
        damage_type: DamageTypeSchema.optional(),
        condition: ConditionSchema.optional(),
        rounds: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Condition duration in rounds; omit = until removed'),
        position: PosSchema.optional(),
        near: z.string().optional().describe('Creature name to land beside'),
        room: z.string().optional().describe('Room id or name'),
        hidden: z.boolean().optional(),
        area: AreaSchema.optional(),
        terrain: z
          .enum(['floor', 'wall', 'difficult', 'water', 'door', 'door-closed', 'door-locked'])
          .optional(),
        expr: z.string().max(40).optional().describe('Dice expression, e.g. "1d20+4"'),
        value: z.number().int().min(-10).max(60).optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      reply(() => {
        const g = activeGame();
        return tx(g, () => {
          const t = () => who(g, need(a.target, 'target', a.op));
          const lines: string[] = [];
          switch (a.op) {
            case 'damage':
              lines.push(
                ...exec(g, {
                  type: 'damage',
                  targetId: t().id,
                  amount: need(a.amount, 'amount', a.op),
                  ...(a.damage_type ? { damageType: a.damage_type } : {}),
                }),
              );
              break;
            case 'heal':
              lines.push(
                ...exec(g, {
                  type: 'heal',
                  targetId: t().id,
                  amount: need(a.amount, 'amount', a.op),
                }),
              );
              break;
            case 'add_condition':
              lines.push(
                ...exec(g, {
                  type: 'addCondition',
                  targetId: t().id,
                  condition: need(a.condition, 'condition', a.op),
                  ...(a.rounds ? { rounds: a.rounds } : {}),
                }),
              );
              break;
            case 'remove_condition':
              lines.push(
                ...exec(g, {
                  type: 'removeCondition',
                  targetId: t().id,
                  condition: need(a.condition, 'condition', a.op),
                }),
              );
              break;
            case 'place_token': {
              const c = t();
              const pos = place(g, sizeOf(c), { pos: a.position, near: a.near, room: a.room });
              lines.push(
                ...exec(g, {
                  type: 'placeToken',
                  id: c.id,
                  pos: need(pos, 'position, near or room', a.op),
                }),
              );
              lines.push(`${c.name} is now at (${pos!.x},${pos!.y}).`);
              break;
            }
            case 'set_hidden':
              lines.push(...exec(g, { type: 'setHidden', id: t().id, hidden: a.hidden ?? true }));
              break;
            case 'remove_creature':
              lines.push(...exec(g, { type: 'removeCreature', id: t().id }));
              break;
            case 'remove_defeated':
              for (const c of g.scene.creatures.filter(
                (x) => x.kind === 'monster' && x.status === 'dead',
              ))
                lines.push(...exec(g, { type: 'removeCreature', id: c.id }));
              if (!lines.length) lines.push('No defeated monsters to remove.');
              break;
            case 'reveal_room':
            case 'hide_room':
              lines.push(
                ...exec(g, {
                  type: 'revealRoom',
                  id: roomOf(g.scene, need(a.room, 'room', a.op)).id,
                  hidden: a.op === 'hide_room',
                }),
              );
              break;
            case 'reveal_area':
            case 'hide_area':
              lines.push(
                ...exec(g, {
                  type: 'setFog',
                  cells: cellsOf(g, need(a.area, 'area', a.op)),
                  hidden: a.op === 'hide_area',
                }),
              );
              lines.push(`Fog ${a.op === 'hide_area' ? 'restored over' : 'lifted from'} the area.`);
              break;
            case 'open_door': {
              const pos = need(a.position, 'position', a.op);
              if (
                !inBounds(g.scene.map, pos) ||
                !['door-closed', 'door-locked'].includes(terrainAt(g.scene.map, pos))
              )
                throw new GameError(`No closed door at (${pos.x},${pos.y}).`);
              lines.push(
                ...exec(g, { type: 'setTerrain', pos, terrain: 'door' }),
                `Door at (${pos.x},${pos.y}) is open.`,
              );
              break;
            }
            case 'set_terrain':
              lines.push(
                ...exec(g, {
                  type: 'paint',
                  cells: cellsOf(g, need(a.area, 'area', a.op)),
                  terrain: need(a.terrain, 'terrain', a.op),
                }),
                'Terrain changed.',
              );
              break;
            case 'secret_roll':
              lines.push(...exec(g, { type: 'secretRoll', expr: need(a.expr, 'expr', a.op) }));
              break;
            case 'set_initiative':
              lines.push(
                ...exec(g, {
                  type: 'setInitiative',
                  id: t().id,
                  value: need(a.value, 'value', a.op),
                }),
                'Initiative set.',
              );
              break;
            case 'join_combat':
              lines.push(...exec(g, { type: 'joinCombat', id: t().id }));
              break;
            case 'end_combat':
              lines.push(...exec(g, { type: 'endCombat' }));
              break;
          }
          return `${lines.join('\n') || 'Done.'}\n\n${afterAction(g)}`;
        });
      }),
  );
}
