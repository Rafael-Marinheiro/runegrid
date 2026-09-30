/**
 * End-to-end: an LLM-shaped client runs a whole game through the MCP tools — campaign, party,
 * generated dungeon, a full combat driven to its end, notes — and then "restarts" and resumes.
 */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetActive } from '../src/campaign';
import { caller, connect, newVault, readVault } from './harness';

const vault = newVault();
let client: Client;
const { call, ok } = caller(() => client);

const campaignDir = () => join(vault, 'Crônicas de Teste');
const read = (...p: string[]) => readVault(campaignDir(), ...p);

beforeAll(async () => {
  client = await connect();
});
afterAll(() => rmSync(vault, { recursive: true, force: true }));

describe('RuneGrid MCP — a complete game', () => {
  it('exposes the tools with descriptions and annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(25);
    for (const t of tools) {
      expect(t.name).toMatch(/^rg_/);
      expect(t.description?.length ?? 0).toBeGreaterThan(40);
      expect(t.annotations).toBeDefined();
    }
  });

  it('refuses to play without a campaign, with a fix-it message', async () => {
    const r = await call('rg_game_status');
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/rg_campaign_create/);
  });

  it('creates the campaign and the party (equipment drives AC and attacks)', async () => {
    await ok('rg_campaign_create', {
      name: 'Crônicas de Teste',
      premise: 'Uma vila tem medo da cripta.',
      tone: 'sombrio',
    });
    const fighter = await ok('rg_character_create', {
      name: 'Thordak',
      level: 3,
      hp: 28,
      abilities: { str: 17, dex: 12, con: 14 },
      save_proficiencies: ['str', 'con'],
      skills: { athletics: 'proficient' },
      equipment: ['longsword', 'chain-mail', 'shield'],
      background: 'Ex-soldado da guarda de Vharos.',
    });
    expect(fighter).toContain('Espada longa');
    expect(fighter).toMatch(/\*\*CA\*\* 18/); // chain mail 16 + shield 2
    await ok('rg_character_create', {
      name: 'Lyra',
      level: 3,
      hp: 18,
      abilities: { int: 16, dex: 14 },
      save_proficiencies: ['int', 'wis'],
      spellcasting: { ability: 'int', spells: ['fire-bolt', 'Magic Missile'] },
      full_caster: true,
      equipment: ['quarterstaff'],
    });
    expect(read('Personagens', 'Thordak.md')).toContain('Ex-soldado');
    expect(read('Personagens', 'Lyra.md')).toContain('Espaços de magia');
    expect(read('00 - Painel.md')).toContain('[[Thordak]]');
  });

  it('keeps the story in the vault: session, diary, notes, search', async () => {
    await ok('rg_session_start', { title: 'A cripta' });
    await ok('rg_journal_add', {
      entry: 'O grupo chega a Vharos sob chuva.',
      kind: 'narration',
      game_time: 'Dia 1, anoitecer',
    });
    await ok('rg_note_write', {
      kind: 'npc',
      title: 'Mestre Orn',
      content: 'Ferreiro manco; conhece o caminho da cripta.',
      status: 'vivo',
      tags: ['vharos'],
    });
    await ok('rg_note_write', {
      kind: 'quest',
      title: 'Silenciar a cripta',
      content: 'Descobrir o que desperta os mortos.',
      status: 'ativa',
    });
    await ok('rg_note_write', {
      kind: 'secret',
      title: 'Verdade da cripta',
      content: 'O ferreiro Orn é o necromante.',
    });
    const dup = await call('rg_note_write', { kind: 'npc', title: 'Mestre Orn', content: 'x' });
    expect(dup.error).toBe(true);
    await ok('rg_note_write', {
      kind: 'npc',
      title: 'Mestre Orn',
      mode: 'append',
      section: 'Histórico',
      content: 'Ofereceu uma lanterna ao grupo.',
    });

    const found = await ok('rg_note_search', { query: 'lanterna' });
    expect(found).toContain('[[Mestre Orn]]');
    expect(await ok('rg_note_search', { kind: 'quest', status: 'ativa' })).toContain(
      'Silenciar a cripta',
    );
    expect(await ok('rg_note_read', { title: 'orn' })).toContain('Ferreiro manco');
    expect(existsSync(join(campaignDir(), 'Mestre', 'Verdade da cripta.md'))).toBe(true);
    expect(read('00 - Painel.md')).toContain('[[Silenciar a cripta]]');
    expect(read('Sessões', 'Sessão 001 - A cripta.md')).toContain('Dia 1, anoitecer');
  });

  it('rolls with the real modifiers and explains bad calls', async () => {
    const check = await ok('rg_check', { who: 'Thordak', kind: 'skill', key: 'athletics', dc: 10 });
    expect(check).toMatch(/Atletismo: d20 \d+ \+5 = \*\*\d+\*\*/); // +3 STR, +2 proficiency (level 3)
    expect(await ok('rg_roll', { expr: '2d6+3' })).toMatch(/= \*\*\d+\*\*/);
    expect((await call('rg_roll', { expr: '2d6', mode: 'advantage' })).error).toBe(true);
    const bad = await call('rg_check', { who: 'Gandalf', kind: 'ability', key: 'str' });
    expect(bad.error).toBe(true);
    expect(bad.text).toContain('Thordak'); // lists who is in the scene
    expect(await ok('rg_srd_search', { kind: 'monster', query: 'goblin', limit: 3 })).toContain(
      'goblin',
    );
    expect(await ok('rg_srd_get', { kind: 'spell', id: 'fireball' })).toContain('Engine-resolved');
  });

  it('generates a dungeon and starts it with hidden monsters under fog', async () => {
    const plan = await ok('rg_adventure_generate', {
      theme: 'crypt',
      size: 'small',
      difficulty: 'easy',
      seed: 'teste-1',
    });
    expect(plan).toContain('## Rooms');
    expect(readdirSync(join(campaignDir(), 'Mestre')).some((f) => f.startsWith('Aventura -'))).toBe(
      true,
    );
    const started = await ok('rg_adventure_start');
    expect(started).toContain('hidden monsters');
    const player = await ok('rg_scene_view', { as: 'player' });
    const dm = await ok('rg_scene_view', { as: 'dm' });
    expect(player).toContain('PLAYER view');
    expect(dm).toMatch(/\(hidden\)/); // the DM sees the ambush, the players do not
    expect(player).not.toMatch(/\(hidden\)/);
    expect(dm.length).toBeGreaterThan(player.length / 2);
    expect(await ok('rg_scene_view', { as: 'player' })).not.toMatch(/r3: /); // still under fog
    await ok('rg_dm_command', { op: 'reveal_room', room: 'r3' });
    expect(await ok('rg_scene_view', { as: 'player' })).toMatch(/r3: /);
  });

  it('runs a whole combat to its end through rg_combat_act', async () => {
    await ok('rg_scene_new', {
      name: 'Emboscada na estrada',
      map_rows: Array.from({ length: 9 }, (_, y) =>
        y === 0 || y === 8 ? '#'.repeat(16) : `#${'.'.repeat(14)}#`,
      ),
      party_position: { x: 3, y: 4 },
    });
    const added = await ok('rg_scene_add_monsters', {
      monsters: [{ monster: 'goblin', count: 2, near: 'Thordak' }],
    });
    expect(added).toContain('Goblin 1');

    const start = await ok('rg_combat_start');
    expect(start).toContain('Initiative order');
    expect(existsSync(join(campaignDir(), 'Combates'))).toBe(true);

    let text = start;
    let turns = 0;
    const order = (t: string) =>
      [
        ...t.matchAll(
          /^[▶ ] (?:\d+|\?) \[(.)\] (.+?) \((pc|npc|monster[^)]*)\) (\d+)\/\d+ HP.*$/gm,
        ),
      ].map((m) => ({
        name: m[2],
        foe: m[3].startsWith('monster'),
        hp: Number(m[4]),
        dead: / DEAD/.test(m[0]),
      }));
    while (!/Fim do combate/.test(text) && turns++ < 80) {
      const actor = /turn of (.+)$/m.exec(text)?.[1];
      if (!actor) break;
      const me = order(text).find((c) => c.name === actor)!;
      const target = order(text).find((c) => c.foe !== me.foe && c.hp > 0 && !c.dead);
      const actions: Record<string, unknown>[] = [];
      if (/ dying /i.test(text.split('Budget')[0] ?? '') || /is DYING/.test(text))
        actions.push({ action: 'death_save' });
      else if (target)
        actions.push(
          { action: 'move', adjacent_to: target.name },
          { action: 'attack', target: target.name },
          { action: 'attack', target: target.name },
        );
      actions.push({ action: 'end_turn' });
      // every action is run in order; the ones that fail (already adjacent, no action left…) are reported, not fatal
      for (const a of actions) {
        const r = await call('rg_combat_act', { actor, actions: [a] });
        expect(r.text).not.toMatch(/^Error: (Unknown|No creature)/);
        text = r.text;
        if (/Fim do combate/.test(text)) break;
        const reaction = /PENDING REACTION: (.+?) may make/.exec(text);
        if (reaction && a.action === 'end_turn')
          text = (
            await call('rg_combat_act', {
              actor: reaction[1],
              actions: [{ action: 'reaction', use: false }],
            })
          ).text;
      }
    }
    expect(text).toMatch(/Fim do combate|📜/);
    const status = await ok('rg_game_status');
    expect(status).toMatch(/Combat: ended/);

    const note = readdirSync(join(campaignDir(), 'Combates')).find((f) =>
      f.startsWith('Combate 001'),
    )!;
    const combat = read('Combates', note);
    expect(combat).toContain('## Registro');
    expect(combat).toContain('atacou');
    expect(combat).toContain('## Resultado');
    expect(read('Sessões', 'Sessão 001 - A cripta.md')).toMatch(/Combate 001/);
    expect(read('Personagens', 'Thordak.md')).toMatch(/xp: [1-9]\d*/); // XP was awarded to the survivors
  }, 60_000);

  it('rests, updates the ledger and closes the session', async () => {
    await ok('rg_party_update', {
      gold_delta: 40,
      location: 'Estrada de Vharos',
      game_time: 'Dia 1, noite',
      reason: 'bolsa dos goblins',
    });
    await ok('rg_character_update', {
      name: 'Thordak',
      give_items: [{ item: 'potion-healing', qty: 2 }],
      patch: { level: 4, hp_max: 36 },
    });
    await ok('rg_character_rest', { kind: 'long' });
    expect(await ok('rg_character_get', { name: 'Thordak' })).toMatch(/\*\*PV\*\* 36\/36/);
    await ok('rg_scene_export');
    await ok('rg_session_end', {
      summary: 'Emboscada vencida; ouro recuperado.',
      next_hooks: ['Seguir a trilha até a cripta'],
    });
    expect(read('Sessões', 'Sessão 001 - A cripta.md')).toContain('Seguir a trilha até a cripta');
    expect(read('00 - Painel.md')).toContain('40 po');
  });

  it('survives a server restart: resume returns the briefing from the vault', async () => {
    resetActive();
    client = await connect(); // new process, no memory
    const back = await ok('rg_game_status'); // the active campaign is restored from the vault pointer
    expect(back).toContain('Thordak');
    const brief = await ok('rg_campaign_resume', { name: 'Crônicas de Teste' });
    expect(brief).toContain('Emboscada vencida');
    expect(brief).toContain('Seguir a trilha até a cripta');
    expect(brief).toContain('Mestre Orn');
    expect(brief).toContain('Silenciar a cripta');
    const dungeon = await ok('rg_scene_switch', { name: 'Ossuário' }); // partial name; the dungeon was kept when the party left it
    expect(dungeon).toContain('Back in');
    expect(await ok('rg_scene_view', { as: 'dm' })).toContain('(hidden)');
  });
});
