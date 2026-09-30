import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { join } from 'node:path';
import { z } from 'zod';
import {
  activeGame,
  createCampaign,
  listCampaigns,
  loadCampaign,
  vaultRoot,
  type Game,
} from '../campaign';
import { tx } from '../game';
import { currentSession, endSession, journal, startSession } from '../journal';
import { isPartyMember, persist } from '../sheets';
import { statusText } from '../render';
import { OVERWRITE, READ, WRITE, reply } from '../util';
import { getSection, parseNote, read, stem, walk } from '../vault';

/** Titles of the notes in a vault folder, so the LLM reuses names (and [[wikilinks]]) instead of duplicating notes. */
function titles(
  g: Game,
  folder: string,
  only?: (fm: Record<string, unknown>) => boolean,
): string[] {
  return [...walk(join(g.dir, folder))]
    .filter((f) => !only || only(parseNote(read(f) ?? '').data))
    .map(stem);
}

function briefing(g: Game): string {
  const open = currentSession(g);
  const last = g.sessions.filter((s) => s.ended).at(-1);
  const src = open ?? g.sessions.at(-1);
  const diary = src
    ? getSection(read(join(g.dir, src.file)) ?? '', 'Diário')
        .split('\n')
        .slice(-12)
        .join('\n')
    : '';
  const list = (label: string, xs: string[]) =>
    xs.length ? `- ${label}: ${xs.slice(0, 40).join(', ')}` : `- ${label}: (none yet)`;
  return [
    `# Campaign "${g.name}" — ${g.ruleset === '2024' ? 'SRD 5.2 (2024)' : 'SRD 5.1 (2014)'} rules`,
    `Vault folder: ${g.dir}`,
    `Premise: ${g.premise || '—'}`,
    `Tone: ${g.tone || '—'}`,
    '',
    `## Story so far (${g.sessions.length} session(s))`,
    last
      ? `Last session "${last.title}" (${last.ended}): ${last.summary}`
      : 'No finished session yet.',
    last?.hooks?.length ? `Hooks left open:\n${last.hooks.map((h) => `- ${h}`).join('\n')}` : '',
    open
      ? `⚠ Session ${open.number} ("${open.title}") is still open since ${open.started}: keep playing in it, or rg_session_end it first.`
      : 'No session open: call rg_session_start when play begins.',
    diary ? `\nLatest diary entries:\n${diary}` : '',
    '',
    '## Known notes (reuse these exact titles as [[wikilinks]])',
    list('NPCs', titles(g, 'NPCs')),
    list('Locations', titles(g, 'Locais')),
    list(
      'Active quests',
      titles(g, 'Missões', (fm) => String(fm['status'] ?? 'ativa') === 'ativa'),
    ),
    list('Lore/factions', titles(g, 'Lore')),
    list('Items', titles(g, 'Itens')),
    '',
    statusText(g),
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function registerCampaign(server: McpServer): void {
  server.registerTool(
    'rg_campaign_create',
    {
      title: 'Create campaign',
      description: `Start a brand-new campaign: creates its folder in the Obsidian vault (${'`RUNEGRID_VAULT`'} env var, default ~/RuneGrid-Vault) with sessions, characters, NPCs, locations, quests, combats and a DM-only folder, plus the engine state. The new campaign becomes the active one.
Next steps: rg_character_create for each player character, then rg_session_start.
Args: name; premise (the pitch, shown on the dashboard); tone (e.g. "dark fantasy, gritty"); ruleset ('2014' = SRD 5.1 default, '2024' = SRD 5.2).`,
      inputSchema: {
        name: z.string().min(1).max(80).describe('Campaign name; becomes the folder name'),
        premise: z
          .string()
          .min(1)
          .max(2000)
          .describe('One or two paragraphs: setting and starting situation'),
        tone: z.string().max(200).default('').describe('Mood/style of the game'),
        ruleset: z
          .enum(['2014', '2024'])
          .default('2014')
          .describe('Which SRD bestiary/spell list to use'),
      },
      annotations: WRITE,
    },
    (a) =>
      reply(() => {
        const g = createCampaign(a);
        persist(g);
        return `Campaign "${g.name}" created in ${g.dir}.\nOpen that folder (or its parent) as an Obsidian vault. Next: rg_character_create for each PC, then rg_session_start.`;
      }),
  );

  server.registerTool(
    'rg_campaign_list',
    {
      title: 'List campaigns',
      description:
        'List the campaigns that exist in the Obsidian vault. Call this first when you do not know whether a campaign already exists.',
      annotations: READ,
    },
    () =>
      reply(() => {
        const names = listCampaigns();
        return names.length
          ? `Campaigns in ${vaultRoot()}:\n${names.map((n) => `- ${n}`).join('\n')}\nResume one with rg_campaign_resume.`
          : `No campaigns in ${vaultRoot()}. Create one with rg_campaign_create.`;
      }),
  );

  server.registerTool(
    'rg_campaign_resume',
    {
      title: 'Resume campaign (briefing)',
      description: `Load a campaign and get the full briefing you need to continue it: premise, the last session's summary and open hooks, the latest diary entries, which NPC/location/quest notes already exist, party status and the scene. ALWAYS call this at the start of a conversation about an existing campaign — you have no other memory of it.
Args: name (optional; defaults to the currently active campaign).`,
      inputSchema: { name: z.string().optional().describe('Campaign name (see rg_campaign_list)') },
      annotations: { ...READ, readOnlyHint: false },
    },
    ({ name }) => reply(() => briefing(name ? loadCampaign(name) : activeGame())),
  );

  server.registerTool(
    'rg_game_status',
    {
      title: 'Game status',
      description:
        "Current state at a glance: party (HP, AC, conditions, positions), opposition, and — in combat — round, whose turn it is, that creature's remaining action/bonus/reaction/movement, its attacks and spells, pending reactions, initiative order and distances. Call it before deciding any action and whenever unsure what is going on.",
      annotations: READ,
    },
    () => reply(() => statusText(activeGame())),
  );

  server.registerTool(
    'rg_session_start',
    {
      title: 'Start session',
      description:
        'Open a new play session: creates "Sessões/Sessão NNN.md" (recap of the previous session, diary, mechanical log). All journal entries and engine log lines go into the open session. Fails if one is already open (continue it or end it first).',
      inputSchema: {
        title: z
          .string()
          .max(80)
          .optional()
          .describe('Short session title, e.g. "A cripta dos sussurros"'),
        recap: z
          .string()
          .max(3000)
          .optional()
          .describe(
            'Override the automatic "previously on…" (defaults to the last session summary)',
          ),
      },
      annotations: WRITE,
    },
    ({ title, recap }) =>
      reply(() => {
        const g = activeGame();
        const rec = tx(g, () => startSession(g, title, recap));
        return `Session ${rec.number} started (${rec.file}).`;
      }),
  );

  server.registerTool(
    'rg_session_end',
    {
      title: 'End session',
      description:
        'Close the open session with a summary and the hooks left open. The summary is what rg_campaign_resume shows next time, so make it good: what happened, what changed, where the party is and what they intend.',
      inputSchema: {
        summary: z
          .string()
          .min(1)
          .max(4000)
          .describe('What happened this session (past tense, spoilers allowed — it is for the DM)'),
        next_hooks: z
          .array(z.string().max(300))
          .max(12)
          .default([])
          .describe('Open threads / what to do next'),
      },
      annotations: OVERWRITE,
    },
    ({ summary, next_hooks }) =>
      reply(() => {
        const g = activeGame();
        const rec = tx(g, () => endSession(g, summary, next_hooks));
        return `Session ${rec.number} closed (${rec.file}).`;
      }),
  );

  server.registerTool(
    'rg_party_update',
    {
      title: 'Update party ledger',
      description: `Campaign-level bookkeeping that is not on a character sheet: party gold, XP awards, current location and in-game time. Every change is written to the session diary.
Args: gold_delta (+ loot / − spending, in gp); xp_each (XP added to every living party member, e.g. quest rewards — combat XP is automatic); location; game_time (e.g. "Dia 3, anoitecer"); reason (shown in the diary).`,
      inputSchema: {
        gold_delta: z.number().int().optional(),
        xp_each: z.number().int().min(0).optional(),
        location: z.string().max(200).optional(),
        game_time: z.string().max(100).optional(),
        reason: z.string().max(300).optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      reply(() => {
        const g = activeGame();
        return tx(g, () => {
          const notes: string[] = [];
          if (a.gold_delta) {
            g.gold = Math.max(0, g.gold + a.gold_delta);
            notes.push(`ouro ${a.gold_delta > 0 ? '+' : ''}${a.gold_delta} po (total ${g.gold})`);
          }
          if (a.xp_each) {
            for (const c of g.scene.creatures.filter(
              (x) => isPartyMember(x) && x.status !== 'dead',
            ))
              g.xp[c.id] = (g.xp[c.id] ?? 0) + a.xp_each;
            notes.push(`+${a.xp_each} XP para cada personagem`);
          }
          if (a.location) {
            g.location = a.location;
            notes.push(`local: ${a.location}`);
          }
          if (a.game_time) g.gameTime = a.game_time;
          if (a.game_time) notes.push(`hora: ${a.game_time}`);
          if (!notes.length) return 'Nothing to change.';
          journal(g, 'event', `${notes.join('; ')}${a.reason ? ` — ${a.reason}` : ''}`);
          return `Updated: ${notes.join('; ')}.`;
        });
      }),
  );
}
