/**
 * A campaign = one folder in the Obsidian vault.
 *  - `.runegrid/state.json` (hidden from Obsidian) is the engine state: the source of truth.
 *  - Everything else is Markdown for people: a generated dashboard and character sheets, plus the
 *    sessions, combats and notes the LLM writes as it runs the game.
 */
import type { GeneratedAdventure } from '@core/models/adventure';
import type { EncounterState } from '@core/models/encounter';
import { blankMap } from '@core/models/grid';
import { newEncounter } from '@core/rules/encounter';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { GameError, plain, stamp } from './util';
import { read, safeName, write } from './vault';

export type Ruleset = '2014' | '2024';

export interface SessionRecord {
  number: number;
  title: string;
  /** Path relative to the campaign folder. */
  file: string;
  started: string;
  ended?: string;
  summary?: string;
  hooks?: string[];
}

export interface CampaignData {
  version: 1;
  name: string;
  premise: string;
  tone: string;
  ruleset: Ruleset;
  created: string;
  /** Narrative clock and place, free text kept by the LLM. */
  gameTime: string;
  location: string;
  gold: number;
  /** XP by creature id. */
  xp: Record<string, number>;
  sessions: SessionRecord[];
  /** Number of the open session, if any. */
  currentSession: number | null;
  combats: number;
  /** Open combat note (relative path) while a combat is being logged. */
  combatNote: string | null;
  /** The engine state: party, map, tokens, combat. There is always exactly one scene. */
  scene: EncounterState;
  adventure: GeneratedAdventure | null;
  /** Scenes the party left (dungeon, town…), by name, with their fog, monsters and loot intact. */
  saved: Record<string, EncounterState>;
}

export interface Game extends CampaignData {
  dir: string;
}

export const FOLDERS = [
  'Sessões',
  'Personagens',
  'NPCs',
  'Locais',
  'Missões',
  'Itens',
  'Lore',
  'Combates',
  'Handouts',
  'Notas',
  'Mestre',
] as const;

const STATE = join('.runegrid', 'state.json');
const POINTER = '.runegrid-active.json';

export const vaultRoot = (): string =>
  process.env['RUNEGRID_VAULT'] ?? join(homedir(), 'RuneGrid-Vault');

// ponytail: one campaign per server process (the LLM works on one game at a time); a per-call
// `campaign` argument would lift this.
let current: Game | null = null;

/** The campaign all tools act on; restored from the vault after a server restart. */
export function activeGame(): Game {
  if (!current) {
    const saved = read(join(vaultRoot(), POINTER));
    const name = saved ? (JSON.parse(saved) as { name?: string }).name : undefined;
    if (name && listCampaigns().includes(name)) current = loadCampaign(name);
  }
  if (!current)
    throw new GameError(
      'No active campaign. Call rg_campaign_list, then rg_campaign_resume (existing) or rg_campaign_create (new).',
    );
  return current;
}

export const resetActive = (): void => {
  current = null;
};

export function listCampaigns(): string[] {
  const root = vaultRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, STATE)))
    .map((e) => e.name);
}

function setActive(g: Game): Game {
  current = g;
  write(join(vaultRoot(), POINTER), JSON.stringify({ name: g.name }), true);
  return g;
}

/**
 * Writes the engine state. Notes are synced separately (see `persist`).
 * ponytail: the whole state is rewritten on every mutation (a few hundred KB even for big maps);
 * switch to an append-only event log if campaigns ever grow to many MB.
 */
export function writeState(g: Game): void {
  const { dir, ...data } = g;
  write(join(dir, STATE), JSON.stringify(data), true);
}

export function createCampaign(input: {
  name: string;
  premise: string;
  tone: string;
  ruleset: Ruleset;
}): Game {
  const dir = join(vaultRoot(), safeName(input.name));
  if (existsSync(join(dir, STATE)))
    throw new GameError(`Campaign "${input.name}" already exists. Use rg_campaign_resume.`);
  for (const f of FOLDERS) mkdirSync(join(dir, f), { recursive: true });
  const g: Game = {
    dir,
    version: 1,
    ...input,
    created: stamp(),
    gameTime: '',
    location: '',
    gold: 0,
    xp: {},
    sessions: [],
    currentSession: null,
    combats: 0,
    combatNote: null,
    scene: newEncounter(blankMap(24, 16), 'Cena inicial'),
    adventure: null,
    saved: {},
  };
  write(
    join(dir, 'Mestre', 'LEIA-ME.md'),
    '# Mestre (spoilers)\n\nNotas secretas do Mestre (IA): segredos, aventuras geradas, rolagens secretas e o registro de eventos ocultos. **Jogadores: não abram esta pasta.**\n',
  );
  writeState(g);
  return setActive(g);
}

export function loadCampaign(name: string): Game {
  const folder = listCampaigns().find((f) => f === name || plain(f) === plain(name));
  if (!folder)
    throw new GameError(
      `No campaign "${name}" in ${vaultRoot()}. Available: ${listCampaigns().join(', ') || '(none)'}.`,
    );
  const dir = join(vaultRoot(), folder);
  const data = JSON.parse(read(join(dir, STATE)) ?? '') as CampaignData;
  return setActive({ ...data, saved: data.saved ?? {}, dir });
}
