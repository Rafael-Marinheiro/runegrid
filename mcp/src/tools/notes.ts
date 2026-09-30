import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { join } from 'node:path';
import { z } from 'zod';
import { activeGame, type Game } from '../campaign';
import { tx } from '../game';
import { JOURNAL_KINDS, journal, type JournalKind } from '../journal';
import { GameError, OVERWRITE, READ, WRITE, plain, reply, stamp } from '../util';
import {
  appendToSection,
  frontmatter,
  mergeFrontmatter,
  parseNote,
  read,
  safeName,
  stem,
  walk,
  write,
} from '../vault';

/** Where each kind of note lives. Only `secret` goes to the DM-only folder. */
const FOLDER = {
  npc: 'NPCs',
  location: 'Locais',
  quest: 'Missões',
  item: 'Itens',
  lore: 'Lore',
  faction: 'Lore',
  handout: 'Handouts',
  note: 'Notas',
  secret: 'Mestre',
} as const;
type Kind = keyof typeof FOLDER;

const allNotes = (g: Game): string[] => [...walk(g.dir)];

function findNote(g: Game, title: string): string {
  const t = plain(title);
  const all = allNotes(g);
  const exact = all.filter((f) => plain(stem(f)) === t);
  const pool = exact.length ? exact : all.filter((f) => plain(stem(f)).includes(t));
  if (pool.length === 1) return pool[0];
  throw new GameError(
    pool.length
      ? `"${title}" matches several notes: ${pool.map(stem).join(', ')}.`
      : `No note titled "${title}". Use rg_note_search to list what exists.`,
  );
}

export function registerNotes(server: McpServer): void {
  server.registerTool(
    'rg_journal_add',
    {
      title: 'Add diary entry',
      description: `Record a beat of the story in the open session's diary (the campaign's permanent memory — a future conversation only knows what you wrote down). Call it after every meaningful moment: a scene, a decision, a discovery, an NPC conversation, a ruling. Mechanical results of combat actions are logged automatically; you write the story around them. Use [[Note Title]] wikilinks to NPC/location/quest notes.
Args: entry (markdown, a few sentences); kind (narration|dialogue|event|decision|discovery|rules|combat|rest|loot); game_time (optional in-game clock, e.g. "Dia 2, manhã"; it is remembered).`,
      inputSchema: {
        entry: z.string().min(1).max(4000),
        kind: z
          .enum(Object.keys(JOURNAL_KINDS) as [JournalKind, ...JournalKind[]])
          .default('narration'),
        game_time: z.string().max(100).optional(),
      },
      annotations: WRITE,
    },
    ({ entry, kind, game_time }) =>
      reply(() => {
        const g = activeGame();
        tx(g, () => journal(g, kind, entry, game_time, true));
        return 'Recorded.';
      }),
  );

  server.registerTool(
    'rg_note_write',
    {
      title: 'Write vault note',
      description: `Create or update a note in the Obsidian vault. Use one note per NPC, location, quest, item, faction/lore topic and handout, and link them with [[Title]] wikilinks. Put anything the players must NOT know (true motives, traps, plot twists) in kind "secret" (DM-only folder) — the vault is readable by the human players.
Kinds → folders: npc→NPCs, location→Locais, quest→Missões (give status: ativa|concluída|falhou; active quests appear on the dashboard), item→Itens, lore/faction→Lore, handout→Handouts (player-facing documents), secret→Mestre, note→Notas.
Modes: "create" (error if the title exists), "append" (adds to the end, or to "## section" if given; creates the note if missing), "replace" (overwrites the body; destructive).
Args: kind; title (file name; keep it stable so links keep working); content (markdown); mode (default create); section (append only); status; tags (no #); props (extra frontmatter, e.g. {"papel":"ferreiro","local":"[[Vila Brumosa]]"}).`,
      inputSchema: {
        kind: z.enum(Object.keys(FOLDER) as [Kind, ...Kind[]]),
        title: z.string().min(1).max(80),
        content: z.string().max(20000),
        mode: z.enum(['create', 'append', 'replace']).default('create'),
        section: z.string().max(80).optional(),
        status: z.string().max(40).optional(),
        tags: z.array(z.string().max(40)).max(12).optional(),
        props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      },
      annotations: OVERWRITE,
    },
    (a) =>
      reply(() => {
        const g = activeGame();
        const file = join(g.dir, FOLDER[a.kind], `${safeName(a.title)}.md`);
        const before = read(file);
        if (a.mode === 'create' && before !== null)
          throw new GameError(
            `Note "${a.title}" already exists. Use mode "append" to add to it or "replace" to rewrite it.`,
          );
        const fm = {
          tipo: a.kind,
          titulo: a.title,
          ...(a.status ? { status: a.status } : {}),
          ...(a.tags ? { tags: a.tags } : {}),
          ...a.props,
        };
        let next: string;
        if (before === null)
          next = `${frontmatter({ ...fm, criado: stamp() })}\n# ${a.title}\n\n${a.content.trim()}\n`;
        else if (a.mode === 'replace')
          next = `${frontmatter({ ...parseNote(before).data, ...fm, atualizado: stamp() })}\n# ${a.title}\n\n${a.content.trim()}\n`;
        else {
          const body = a.section
            ? appendToSection(before, a.section, a.content.trim())
            : `${before.trimEnd()}\n\n${a.content.trim()}\n`;
          next = mergeFrontmatter(body, {
            ...(a.status ? { status: a.status } : {}),
            ...a.props,
            atualizado: stamp(),
          });
        }
        tx(g, () => write(file, next)); // persist() refreshes the dashboard (active quests)
        return `${before === null ? 'Created' : a.mode === 'replace' ? 'Replaced' : 'Updated'} ${FOLDER[a.kind]}/${safeName(a.title)}.md`;
      }),
  );

  server.registerTool(
    'rg_note_read',
    {
      title: 'Read vault note',
      description:
        'Read a note from the campaign vault by title (exact, or unique partial match): NPCs, locations, quests, sessions, combat logs, character sheets, secrets. Use it to recall details before writing new ones.',
      inputSchema: {
        title: z.string().min(1).describe('Note title without .md, e.g. "Mestre Orn"'),
      },
      annotations: READ,
    },
    ({ title }) =>
      reply(() => {
        const g = activeGame();
        const file = findNote(g, title);
        return `${file.slice(g.dir.length + 1)}\n\n${read(file)}`;
      }),
  );

  server.registerTool(
    'rg_note_search',
    {
      title: 'Search vault notes',
      description: `Search the campaign vault by text, kind, status or tag; with no filters it lists every note. Returns kind · title · status · path plus a matching line.
Args: query (case/accent-insensitive, searched in titles and bodies); kind (the "tipo" property: npc, location, quest, sessao, combate, personagem…); status; tag; limit (default 25).`,
      inputSchema: {
        query: z.string().optional(),
        kind: z.string().optional(),
        status: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: READ,
    },
    ({ query, kind, status, tag, limit }) =>
      reply(() => {
        const g = activeGame();
        const q = query ? plain(query) : '';
        const hits: string[] = [];
        let total = 0;
        for (const f of allNotes(g)) {
          const { data, body } = parseNote(read(f) ?? '');
          if (kind && plain(String(data['tipo'] ?? '')) !== plain(kind)) continue;
          if (status && plain(String(data['status'] ?? '')) !== plain(status)) continue;
          if (
            tag &&
            !([] as unknown[])
              .concat(data['tags'] ?? [])
              .some((t) => plain(String(t)) === plain(tag))
          )
            continue;
          const snippet = q ? body.split('\n').find((l) => plain(l).includes(q)) : '';
          if (q && !snippet && !plain(stem(f)).includes(q)) continue;
          total++;
          if (hits.length < limit)
            hits.push(
              `- ${String(data['tipo'] ?? '?')} · [[${stem(f)}]]${data['status'] ? ` · ${String(data['status'])}` : ''} · ${f.slice(g.dir.length + 1)}${snippet ? `\n    …${snippet.trim().slice(0, 160)}` : ''}`,
            );
        }
        return hits.length
          ? `${total} note(s)${total > hits.length ? `, showing ${hits.length}` : ''}:\n${hits.join('\n')}`
          : 'No matching notes.';
      }),
  );
}
