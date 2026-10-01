/** Mestre-LLM: duas reações ao mesmo golpe (Aparar do cavaleiro + Escudo do Guardião) pelo MCP. */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { caller, connect, newVault } from './harness';

const vault = newVault();
let client: Client;
const { call, ok } = caller(() => client);

const arena = Array.from({ length: 9 }, (_, y) =>
  y === 0 || y === 8 ? '#'.repeat(14) : `#${'.'.repeat(12)}#`,
);

beforeAll(async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 = 11, sempre
  client = await connect();
  await ok('rg_campaign_create', { name: 'Duas reações', premise: 'Arena de testes.' });
  await ok('rg_character_create', {
    name: 'Brann',
    level: 5,
    hp: 40,
    abilities: { str: 16 },
    equipment: ['mace'],
  });
  await ok('rg_session_start');
  await ok('rg_scene_new', { name: 'Arena', map_rows: arena, party_position: { x: 2, y: 4 } });
  await ok('rg_scene_add_monsters', {
    monsters: [
      { monster: 'knight', count: 1 },
      { monster: 'shield-guardian', count: 1 },
    ],
  });
});
afterAll(() => {
  vi.restoreAllMocks();
  rmSync(vault, { recursive: true, force: true });
});

describe('duas reações aceitas', () => {
  it('as duas aparecem como pendentes e somam o bônus: o golpe erra', async () => {
    const names = (await ok('rg_game_status')).match(/(Cavaleiro|Knight)[^\n(]*/)?.[0].trim();
    const knight = names ?? 'Cavaleiro';
    const guardian =
      (await ok('rg_game_status')).match(/(Guardi[ãa]o[^\n(]*|Shield Guardian)/)?.[0].trim() ??
      'Guardião Escudo';
    await ok('rg_dm_command', { op: 'place_token', target: knight, position: { x: 3, y: 4 } });
    await ok('rg_dm_command', { op: 'place_token', target: guardian, position: { x: 4, y: 3 } });
    await ok('rg_dm_command', {
      op: 'adjust',
      target: knight,
      note: 'CA baixa para o teste',
      changes: { ac: 14 },
    });
    await ok('rg_combat_start');
    // a vez é de Brann? senão passa os turnos até ela
    for (let i = 0; i < 12; i++) {
      const st = await ok('rg_game_status');
      const actor = /turn of (.+)$/m.exec(st)?.[1];
      if (actor === 'Brann') break;
      await call('rg_combat_act', { actor: actor!, actions: [{ action: 'end_turn' }] });
    }
    const r = await ok('rg_combat_act', {
      actor: 'Brann',
      actions: [{ action: 'attack', target: knight }],
    });
    const pendings = r.match(/PENDING REACTION/g) ?? [];
    expect(pendings.length, r).toBe(2);
    // aceitar as duas
    const spells = r.match(/spell:"[^"]+"/g);
    expect(spells).not.toBeNull();
    const knightAbility = 'Parry';
    const guardAbility = 'Shield';
    const rep = await ok('rg_combat_act', {
      actor: knight,
      actions: [{ action: 'reaction', use: true, spell: knightAbility }],
    });
    const mid = await ok('rg_game_status');
    expect((mid.match(/PENDING REACTION/g) ?? []).length).toBe(1);
    const fim = await ok('rg_combat_act', {
      actor: guardian,
      actions: [{ action: 'reaction', use: true, spell: guardAbility }],
    });
    expect(fim).not.toMatch(/PENDING REACTION/);
    expect(fim).toMatch(/miss|erro/i);
  });
});
