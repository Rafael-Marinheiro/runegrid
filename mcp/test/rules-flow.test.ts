/** The engine-facing edge cases an LLM Game Master will hit: reactions, dying, secrecy, bad input. */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { caller, connect, newVault, readVault } from './harness';

const vault = newVault();
let client: Client;
const { call, ok } = caller(() => client);

const arena = Array.from({ length: 9 }, (_, y) =>
  y === 0 || y === 8 ? '#'.repeat(14) : `#${'.'.repeat(12)}#`,
);

/** Ends other creatures' turns until it is `name`'s; fails the test if the fight ends first. */
async function untilTurnOf(name: string): Promise<string> {
  let text = await ok('rg_game_status');
  for (let i = 0; i < 30; i++) {
    const actor = /turn of (.+)$/m.exec(text)?.[1];
    if (actor === name) return text;
    expect(actor, `combat ended before ${name}'s turn:\n${text}`).toBeDefined();
    text = (await call('rg_combat_act', { actor: actor!, actions: [{ action: 'end_turn' }] })).text;
    const pending = /PENDING REACTION: (.+?) may make/.exec(text)?.[1];
    if (pending)
      text = (
        await call('rg_combat_act', {
          actor: pending,
          actions: [{ action: 'reaction', use: false }, { action: 'end_turn' }],
        })
      ).text;
  }
  throw new Error(`never reached ${name}'s turn`);
}

beforeAll(async () => {
  client = await connect();
  await ok('rg_campaign_create', { name: 'Regras', premise: 'Arena de testes.' });
  await ok('rg_character_create', {
    name: 'Brann',
    level: 3,
    hp: 30,
    abilities: { str: 16, dex: 10 },
    equipment: ['mace', 'chain-mail'],
  });
  await ok('rg_session_start');
  await ok('rg_scene_new', { name: 'Arena', map_rows: arena, party_position: { x: 3, y: 4 } });
});
afterAll(() => rmSync(vault, { recursive: true, force: true }));

describe('combat edge cases', () => {
  it('needs tokens before combat and says who is missing', async () => {
    await ok('rg_scene_add_monsters', { monsters: [{ monster: 'goblin', count: 2 }] }); // off-map
    const r = await call('rg_combat_start');
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/Goblin 1, Goblin 2/);
    await ok('rg_dm_command', { op: 'place_token', target: 'Goblin 1', near: 'Brann' });
    await ok('rg_dm_command', { op: 'place_token', target: 'Goblin 2', position: { x: 10, y: 4 } });
  });

  it('numbers monsters and resolves names strictly', async () => {
    expect((await call('rg_character_get', { name: 'goblin' })).text).toMatch(
      /several creatures.*Goblin 1.*Goblin 2/,
    );
    expect(await ok('rg_character_get', { name: 'goblin 2' })).toContain('Goblin 2');
    expect((await call('rg_character_create', { name: 'brann', hp: 5 })).error).toBe(true); // duplicate name
  });

  it('makes an opportunity attack block end_turn until answered', async () => {
    await ok('rg_combat_start');
    await untilTurnOf('Brann');
    // Goblin 1 started next to Brann; walking away provokes it
    const moved = await ok('rg_combat_act', {
      actor: 'Brann',
      actions: [{ action: 'move', to: { x: 3, y: 7 } }],
    });
    expect(moved).toMatch(/PENDING REACTION: Goblin 1 may make an opportunity attack/);
    const blocked = await ok('rg_combat_act', {
      actor: 'Brann',
      actions: [{ action: 'end_turn' }],
    });
    expect(blocked).toMatch(/end_turn ✘ .*reações pendentes/);
    const answered = await ok('rg_combat_act', {
      actor: 'Goblin 1',
      actions: [{ action: 'reaction', use: true }],
    });
    expect(answered).toMatch(/ataque de oportunidade/);
    expect(
      await ok('rg_combat_act', { actor: 'Brann', actions: [{ action: 'end_turn' }] }),
    ).not.toMatch(/✘/);
  });

  it('runs a dying character through death saves', async () => {
    await ok('rg_dm_command', { op: 'damage', target: 'Brann', amount: 200 });
    const status = await ok('rg_game_status');
    expect(status).toMatch(/Brann \(pc\) 0\/30/);
    expect(status).toMatch(/DEAD/); // 200 damage at 30 max HP: massive damage kills outright
  });

  it('refuses engine-illegal actions with the engine message and keeps earlier steps', async () => {
    const text = (
      await call('rg_combat_act', {
        actor: 'Goblin 2',
        actions: [{ action: 'attack', target: 'Goblin 1' }, { action: 'end_turn' }],
      })
    ).text;
    expect(text).toMatch(/✘/);
    expect(text).toMatch(/later action\(s\) not run/);
  });
});

describe('secrecy and guidance', () => {
  it('never shows hidden monsters in the player view', async () => {
    await ok('rg_character_create', { name: 'Vigia', level: 1, hp: 10, kind: 'npc' });
    expect(await ok('rg_game_status')).toMatch(/Combat: ended \(party defeated\)/); // Brann was the whole party
    await ok('rg_scene_add_monsters', {
      monsters: [{ monster: 'wolf', name: 'Fera Oculta', position: { x: 11, y: 6 }, hidden: true }],
    });
    expect(await ok('rg_scene_view', { as: 'dm' })).toContain('Fera Oculta');
    expect(await ok('rg_scene_view', { as: 'player' })).not.toContain('Fera Oculta');
    // and its creature lines in the secret log, not the public combat/session log
    expect(readVault(vault, 'Regras', 'Mestre', 'Registro secreto.md')).toContain('Fera Oculta');
  });

  it('explains unsupported spells and bad items instead of failing silently', async () => {
    await ok('rg_character_create', {
      name: 'Mago',
      level: 3,
      hp: 12,
      spellcasting: { ability: 'int', spells: ['fire-bolt', 'Bless'] },
      full_caster: true,
    });
    const sheet = await ok('rg_character_get', { name: 'Mago' });
    expect(sheet).toContain('bless');
    const item = await call('rg_character_update', {
      name: 'Mago',
      give_items: [{ item: 'vorpal sword' }],
    });
    expect(item.error).toBe(true);
    expect(item.text).toMatch(/Catalog ids/);
  });

  it('will not rest mid-combat and reports the state', async () => {
    await ok('rg_dm_command', { op: 'place_token', target: 'Mago', position: { x: 6, y: 2 } });
    await ok('rg_dm_command', { op: 'place_token', target: 'Vigia', position: { x: 6, y: 3 } });
    await ok('rg_dm_command', {
      op: 'place_token',
      target: 'Fera Oculta',
      position: { x: 11, y: 6 },
    });
    await ok('rg_combat_start', { ignore_off_map: true });
    const r = await call('rg_character_rest', { kind: 'long' });
    expect(r.error).toBe(true);
    expect(r.text).toMatch(/during combat/);
  });

  it('replaces and appends notes without losing properties', async () => {
    await ok('rg_note_write', {
      kind: 'location',
      title: 'Vharos',
      content: 'Vila na encosta.',
      props: { regiao: 'Norte' },
    });
    await ok('rg_note_write', {
      kind: 'location',
      title: 'Vharos',
      mode: 'replace',
      content: 'Vila reconstruída.',
      status: 'segura',
    });
    const note = await ok('rg_note_read', { title: 'Vharos' });
    expect(note).toContain('Vila reconstruída.');
    expect(note).not.toContain('encosta');
    expect(note).toContain('regiao: "Norte"');
    expect(note).toContain('status: "segura"');
  });
});
