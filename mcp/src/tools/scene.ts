import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  DIFFICULTIES,
  EMPHASES,
  SIZES as ADVENTURE_SIZES,
  THEMES,
  type GeneratedAdventure,
} from '@core/models/adventure';
import type { EncounterState } from '@core/models/encounter';
import { blankMap, mapFromAscii } from '@core/models/grid';
import { adventureToEncounter, generateAdventure } from '@core/rules/generator';
import { dispatch, newEncounter, sizeOf } from '@core/rules/encounter';
import { monsterToCreature } from '@core/rules/srd/convert';
import { pickMiniature, queryFromMonster } from '@core/rules/srd/miniature';
import { monsterNamePt } from '@core/rules/srd/names-pt';
import { join } from 'node:path';
import { z } from 'zod';
import { activeGame, type Game } from '../campaign';
import { ART_BY_MONSTER, MINIATURES, monstersOf } from '../data';
import { exec, findMonster, freeCell, nameSeries, place, tx } from '../game';
import { journal } from '../journal';
import { renderMap } from '../render';
import { isPartyMember } from '../sheets';
import { GameError, OVERWRITE, READ, WRITE, plain, reply, stamp } from '../util';
import { frontmatter, safeName, write } from '../vault';
import { PosSchema } from './schemas';

const ctx = { rng: Math.random, role: { kind: 'dm' } } as const;

const notRunning = (g: Game): void => {
  if (g.scene.combat.phase === 'running')
    throw new GameError('A combat is running. Finish it (or rg_dm_command end_combat) first.');
};

/** Puts the party's current creatures (HP, slots, conditions…) into `target`; tokens of those already there are kept. */
function carryParty(g: Game, target: EncounterState): EncounterState {
  let s = target;
  for (const c of g.scene.creatures.filter(isPartyMember)) {
    s = s.creatures.some((x) => x.id === c.id)
      ? { ...s, creatures: s.creatures.map((x) => (x.id === c.id ? c : x)) }
      : dispatch(s, { type: 'addCreature', creature: c }, ctx);
  }
  return s;
}

/** Leaves the current scene (kept by name, so the party can come back to it) and enters `next`. */
function enter(g: Game, next: EncounterState): void {
  g.saved[g.scene.name] = g.scene;
  delete g.saved[next.name];
  g.scene = next;
  g.combatNote = null;
}

/** Drops the party on free cells around `near` (or around the map centre). */
function placeParty(s: EncounterState, near?: { x: number; y: number }): EncounterState {
  let out = s;
  const at = near ?? { x: s.map.width >> 1, y: s.map.height >> 1 };
  for (const c of s.creatures.filter(isPartyMember)) {
    if (out.tokens.some((t) => t.creatureId === c.id)) continue;
    const pos = freeCell(out, sizeOf(c), at);
    if (pos) out = dispatch(out, { type: 'placeToken', id: c.id, pos }, ctx);
  }
  return out;
}

const partyInfo = (g: Game): { level: number; size: number } => {
  const party = g.scene.creatures.filter((c) => isPartyMember(c) && c.status !== 'dead');
  return {
    level: party.length ? Math.round(party.reduce((n, c) => n + c.level, 0) / party.length) : 1,
    size: party.length || 4,
  };
};

function overview(adv: GeneratedAdventure): string {
  const room = (id: string) => adv.rooms.find((r) => r.id === id);
  return [
    `# ${adv.name}`,
    `Theme ${adv.params.theme} · size ${adv.params.size} · ${adv.params.difficulty} · party level ${adv.params.partyLevel}×${adv.params.partySize} · seed "${adv.params.seed}" · total adjusted XP ${adv.totalXp}`,
    `Map ${adv.map.width}×${adv.map.height}; party enters at (${adv.entrance.x},${adv.entrance.y}).`,
    `\n**Hook:** ${adv.hook}`,
    '\n## Rooms (DM eyes only)',
    ...adv.rooms.map(
      (r) =>
        `- ${r.id} · ${r.name} · ${r.role} · [x${r.x} y${r.y} ${r.w}×${r.h}] — ${r.description}`,
    ),
    '\n## Encounters',
    ...adv.encounters.map(
      (e) =>
        `- ${room(e.roomId)?.name ?? e.roomId} (${e.roomId}): ${e.groups.map((g) => `${g.count}× ${monsterNamePt(g.name)} (CR ${g.cr})`).join(', ')} — ${e.adjustedXp} XP`,
    ),
    '\n## Traps',
    ...(adv.traps.length
      ? adv.traps.map(
          (t) =>
            `- ${t.name} at (${t.pos.x},${t.pos.y})${t.roomId ? ` in ${t.roomId}` : ''}: DC ${t.dc} ${t.ability.toUpperCase()} save, ${t.damage} ${t.damageType}`,
        )
      : ['- none']),
    '\n## Treasure',
    ...(adv.treasures.length
      ? adv.treasures.map(
          (t) =>
            `- ${room(t.roomId)?.name ?? t.roomId}: ${t.gp} gp${t.items.length ? `, ${t.items.join(', ')}` : ''}`,
        )
      : ['- none']),
  ].join('\n');
}

export function registerScene(server: McpServer): void {
  server.registerTool(
    'rg_adventure_generate',
    {
      title: 'Generate adventure (dungeon)',
      description: `Use the app's adventure generator: a complete dungeon map with rooms, doors, themed SRD monster encounters balanced by XP budget, traps and treasure. Same seed + params = same adventure. It is only PLANNED here (stored as the campaign's current adventure, with a DM-only note in Mestre/); nothing changes on the table until rg_adventure_start.
Read the overview, then use the hook and room descriptions as raw material — rewrite them in your own words when you narrate.
Args: theme (crypt|cave|ruins|forest|swamp|fortress|sewer); size (small ~5 rooms|medium ~10|large ~20); difficulty (easy|medium|hard|deadly); emphasis (combat|traps|exploration|mixed); party_level & party_size (default: from the current party); seed (default random).`,
      inputSchema: {
        theme: z.enum(THEMES),
        size: z.enum(ADVENTURE_SIZES).default('small'),
        difficulty: z.enum(DIFFICULTIES).default('medium'),
        emphasis: z.enum(EMPHASES).default('mixed'),
        party_level: z.number().int().min(1).max(20).optional(),
        party_size: z.number().int().min(1).max(10).optional(),
        seed: z.string().max(40).optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      reply(() => {
        const g = activeGame();
        const p = partyInfo(g);
        const adv = generateAdventure(
          {
            theme: a.theme,
            size: a.size,
            difficulty: a.difficulty,
            emphasis: a.emphasis,
            partyLevel: a.party_level ?? p.level,
            partySize: a.party_size ?? p.size,
            seed: a.seed ?? Math.random().toString(36).slice(2, 8),
          },
          monstersOf(g.ruleset),
        );
        const text = overview(adv);
        return tx(g, () => {
          g.adventure = adv;
          write(
            join(g.dir, 'Mestre', `Aventura - ${safeName(adv.name)}.md`),
            `${frontmatter({ tipo: 'secret', titulo: `Aventura - ${adv.name}`, seed: adv.params.seed, criado: stamp() })}\n${text}\n`,
          );
          return `${text}\n\nPlanned only. rg_adventure_start puts the party at the entrance with the monsters hidden under fog.`;
        });
      }),
  );

  server.registerTool(
    'rg_adventure_start',
    {
      title: 'Start the generated adventure',
      description:
        'Make the generated dungeon the active scene: the party (all pc/npc creatures) appears in the entrance room, every monster is placed hidden in its room, the rest of the map is under fog. The previous scene is kept and can be returned to with rg_scene_switch. Then explore: rg_scene_view as "player", rg_dm_command place_token / reveal_room, rg_check, rg_combat_start when a fight breaks out. Needs at least one party member and no combat running.',
      annotations: WRITE,
    },
    () =>
      reply(() => {
        const g = activeGame();
        notRunning(g);
        if (!g.adventure)
          throw new GameError('No generated adventure. Call rg_adventure_generate first.');
        const party = g.scene.creatures.filter(isPartyMember);
        if (!party.length)
          throw new GameError('Create at least one character first (rg_character_create).');
        const enc = adventureToEncounter(g.adventure, party, monstersOf(g.ruleset), (m, variant) =>
          pickMiniature(queryFromMonster(m), MINIATURES, ART_BY_MONSTER[m.id], variant),
        );
        // the campaign is in Portuguese: "Ghoul 2" → "Carniçal 2"
        enc.creatures = enc.creatures.map((c) => {
          if (c.kind !== 'monster') return c;
          const m = /^(.*?)( \d+)?$/.exec(c.name)!;
          return { ...c, name: `${monsterNamePt(m[1])}${m[2] ?? ''}` };
        });
        const adv = g.adventure;
        return tx(g, () => {
          enter(g, enc);
          journal(g, 'event', `Começa a aventura **${adv.name}** (${adv.params.theme}).`);
          const entrance = adv.map.rooms?.find((r) => r.id === adv.rooms[0].id);
          return `Adventure "${adv.name}" started. Party at the entrance ${adv.entrance.x},${adv.entrance.y}; ${enc.creatures.filter((c) => c.kind === 'monster').length} hidden monsters.\nEntrance: ${entrance?.description ?? adv.rooms[0].description}\nNext: rg_scene_view {as:"player"} to see what the party sees.`;
        });
      }),
  );

  server.registerTool(
    'rg_scene_new',
    {
      title: 'New scene / battle map',
      description: `Start a new scene on a fresh map (town square, tavern brawl, ambush on the road, boss arena…). The party comes along with its current HP/slots/conditions; monsters are left behind. The previous scene is kept by name (rg_scene_switch returns to it).
Draw the map yourself as ASCII rows of equal length, 1 char = 1 cell = 5 ft: "." floor · "#" wall · "," difficult terrain · "~" water (difficult) · "D" open door · "d" closed door · "L" locked door. Example 12×5: ["############","#..........#","#....,,....#","#..........D","############"]. Or give width/height for an empty walled room. Keep battle maps compact (≈15–30 cells wide) — every cell costs 5 ft of movement.
Then add enemies with rg_scene_add_monsters / rg_character_create and rg_combat_start.
Args: name; map_rows OR width+height; party_position {x,y} (the party is placed on free cells around it; default map centre).`,
      inputSchema: {
        name: z.string().min(1).max(60),
        map_rows: z.array(z.string().min(3).max(80)).min(3).max(60).optional(),
        width: z.number().int().min(3).max(60).optional(),
        height: z.number().int().min(3).max(60).optional(),
        party_position: PosSchema.optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      reply(() => {
        const g = activeGame();
        notRunning(g);
        if (!a.map_rows && !(a.width && a.height))
          throw new GameError('Give map_rows (ASCII) or width and height.');
        const map = a.map_rows ? mapFromAscii(a.map_rows) : blankMap(a.width!, a.height!);
        const next = placeParty(carryParty(g, newEncounter(map, a.name)), a.party_position);
        return tx(g, () => {
          enter(g, next);
          journal(g, 'event', `Nova cena: **${a.name}**.`);
          return `Scene "${a.name}" ready (${map.width}×${map.height}); party placed. Saved scenes: ${Object.keys(g.saved).join(', ') || 'none'}.`;
        });
      }),
  );

  server.registerTool(
    'rg_scene_switch',
    {
      title: 'Return to a saved scene',
      description:
        'Go back to a scene the party left earlier (e.g. the dungeon after a trip to town), with its fog, monsters, traps and loot as they were. The party comes along with current HP/slots/conditions. Args: name (exact scene name; the error lists the saved ones).',
      inputSchema: { name: z.string() },
      annotations: WRITE,
    },
    ({ name }) =>
      reply(() => {
        const g = activeGame();
        notRunning(g);
        const r = plain(name);
        const keys = Object.keys(g.saved);
        const hit = keys.filter((k) => plain(k) === r);
        const pool = hit.length ? hit : keys.filter((k) => plain(k).includes(r));
        if (pool.length !== 1)
          throw new GameError(
            `${pool.length ? `"${name}" matches several saved scenes` : `No saved scene "${name}"`}. Saved: ${keys.join(', ') || '(none)'}.`,
          );
        const saved = g.saved[pool[0]];
        const next = placeParty(carryParty(g, saved));
        return tx(g, () => {
          enter(g, next);
          journal(g, 'event', `O grupo volta à cena **${next.name}**.`);
          return `Back in "${next.name}". Use rg_scene_view and rg_game_status.`;
        });
      }),
  );

  server.registerTool(
    'rg_scene_add_monsters',
    {
      title: 'Add SRD monsters to the scene',
      description: `Drop SRD monsters into the scene with full stat blocks (HP, AC, attacks) and an automatic miniature. Names are numbered ("Goblin 1", "Goblin 2") — use those names afterwards. Find ids with rg_srd_search (names in English or Portuguese also work when unambiguous). Place each group with position {x,y} (exact cell; extra copies take neighbouring free cells), near (a creature name) or room (room id/name from the map); omit to add off-map. hidden=true keeps them invisible to the players (ambush).
Args: monsters [{monster, count (1-20), name (override base name), position|near|room, hidden}].`,
      inputSchema: {
        monsters: z
          .array(
            z.object({
              monster: z.string(),
              count: z.number().int().min(1).max(20).default(1),
              name: z.string().max(60).optional(),
              position: PosSchema.optional(),
              near: z.string().optional(),
              room: z.string().optional(),
              hidden: z.boolean().default(false),
            }),
          )
          .min(1)
          .max(12),
      },
      annotations: WRITE,
    },
    ({ monsters }) =>
      reply(() => {
        const g = activeGame();
        return tx(g, () => {
          const out: string[] = [];
          for (const e of monsters) {
            const m = findMonster(g.ruleset, e.monster);
            const names = nameSeries(g.scene, e.name ?? monsterNamePt(m.name), e.count);
            names.forEach((name, i) => {
              const art = pickMiniature(queryFromMonster(m), MINIATURES, ART_BY_MONSTER[m.id], i);
              const creature = monsterToCreature(m, name, art);
              const size = sizeOf(creature);
              const exact =
                i === 0 ? e.position : e.position && freeCell(g.scene, size, e.position);
              const pos = place(g, size, { pos: exact || undefined, near: e.near, room: e.room });
              exec(g, { type: 'addCreature', creature, ...(pos ? { pos, hidden: e.hidden } : {}) });
              out.push(
                `${name} (CR ${m.cr}, ${m.hp} HP, AC ${m.ac})${pos ? ` at (${pos.x},${pos.y})` : ' off-map'}${e.hidden && pos ? ' hidden' : ''}`,
              );
            });
          }
          return `Added:\n${out.map((l) => `- ${l}`).join('\n')}`;
        });
      }),
  );

  server.registerTool(
    'rg_scene_view',
    {
      title: 'View scene map',
      description: `ASCII map of the current scene with coordinates, creature symbols (A,B… party; 1,2… opposition; † dead), doors, traps, items and rooms. Use it to reason about positions, distances and line of sight.
Args: as ('dm' = everything, incl. hidden monsters/traps and fog — default; 'player' = exactly what the party can see now: use it to check what you may narrate); x,y,width,height pan a window on big maps (default 60×40 around the active creature).`,
      inputSchema: {
        as: z.enum(['dm', 'player']).default('dm'),
        x: z.number().int().min(0).optional(),
        y: z.number().int().min(0).optional(),
        width: z.number().int().min(5).max(100).optional(),
        height: z.number().int().min(5).max(80).optional(),
      },
      annotations: READ,
    },
    ({ as, ...win }) => reply(() => renderMap(activeGame(), as, win)),
  );

  server.registerTool(
    'rg_scene_export',
    {
      title: 'Export scene for the RuneGrid web app',
      description:
        'Write the current scene as a RuneGrid session file (.json) that the web app imports (Combate → "Importar sessão"), so the human can SEE the map, tokens and combat in the real UI. Returns the path.',
      annotations: OVERWRITE,
    },
    () =>
      reply(() => {
        const g = activeGame();
        const file = join(
          g.dir,
          '.runegrid',
          'export',
          `cena-${stamp().replace(/[: ]/g, '-')}.json`,
        );
        write(
          file,
          JSON.stringify(
            {
              format: 'runegrid-session',
              version: 1,
              exportedAt: new Date().toISOString(),
              state: g.scene,
            },
            null,
            1,
          ),
        );
        return `Exported to ${file}. In the web app, import this file as a session.`;
      }),
  );
}
