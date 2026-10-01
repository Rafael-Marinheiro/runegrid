/** Mestre-LLM: ajuste livre, ação lendária de magia e dispensar invocação, pelo MCP. */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { caller, connect, newVault } from './harness';

const vault = newVault();
let client: Client;
const { call, ok } = caller(() => client);

const arena = Array.from({ length: 9 }, (_, y) =>
  y === 0 || y === 8 ? '#'.repeat(14) : `#${'.'.repeat(12)}#`,
);

beforeAll(async () => {
  client = await connect();
  await ok('rg_campaign_create', { name: 'Novos comandos', premise: 'Arena de testes.' });
  await ok('rg_character_create', { name: 'Brann', level: 5, hp: 40, abilities: { str: 16 } });
  await ok('rg_session_start');
  await ok('rg_scene_new', { name: 'Arena', map_rows: arena, party_position: { x: 3, y: 4 } });
  await ok('rg_scene_add_monsters', { monsters: [{ monster: 'androsphinx', count: 1 }] });
  await ok('rg_dm_command', {
    op: 'place_token',
    target: 'Androesfinge',
    position: { x: 9, y: 4 },
  });
  await ok('rg_combat_start');
});
afterAll(() => rmSync(vault, { recursive: true, force: true }));

describe('ajuste livre', () => {
  it('exige a descrição e informa o que mudou', async () => {
    const semNota = await call('rg_dm_command', {
      op: 'adjust',
      target: 'Androesfinge',
      changes: { ac: 10 },
    });
    expect(semNota.error).toBe(true);
    const r = await ok('rg_dm_command', {
      op: 'adjust',
      target: 'Androesfinge',
      note: 'a armadura foi corroída',
      changes: { ac: 10, hp_current: 100 },
    });
    expect(r).toMatch(/AC \d+ → 10|CA \d+ → 10/);
    expect(r).toMatch(/corro[ií]da/);
  });

  it('não aceita um ajuste vazio', async () => {
    const r = await call('rg_dm_command', {
      op: 'adjust',
      target: 'Androesfinge',
      note: 'nada',
      changes: {},
    });
    expect(r.error).toBe(true);
  });
});

describe('ação lendária de magia', () => {
  it('a esfinge conjura uma magia fora do turno e paga as ações lendárias', async () => {
    const status = await ok('rg_game_status');
    const turn = /turn of (.+)$/m.exec(status)?.[1];
    // fora do turno da esfinge
    if (turn === 'Androesfinge')
      await ok('rg_combat_act', { actor: 'Androesfinge', actions: [{ action: 'end_turn' }] });
    const r = await call('rg_combat_act', {
      actor: 'Androesfinge',
      actions: [{ action: 'cast', spell: 'sacred-flame', target: 'Brann' }],
    });
    expect(r.text).not.toMatch(/não conhece|does not know/i);
    expect((await ok('rg_game_status')).toLowerCase()).toMatch(/legendary/);
  });
});
