import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { createServer } from '../src/server';

/** A fresh vault for this test file (the server reads RUNEGRID_VAULT on every call). */
export function newVault(): string {
  const vault = mkdtempSync(join(tmpdir(), 'rg-vault-'));
  process.env['RUNEGRID_VAULT'] = vault;
  return vault;
}

/** A client wired to a brand-new server instance, like a fresh conversation. */
export async function connect(): Promise<Client> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(b);
  const c = new Client({ name: 'test', version: '1' });
  await c.connect(a);
  return c;
}

export interface Reply {
  text: string;
  error: boolean;
}

export const caller = (client: () => Client) => ({
  call: async (name: string, args: Record<string, unknown> = {}): Promise<Reply> => {
    const r = (await client().callTool({ name, arguments: args })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    return { text: r.content.map((c) => c.text).join('\n'), error: r.isError === true };
  },
  /** Calls a tool and fails the test with the tool's own message if it errors. */
  ok: async (name: string, args: Record<string, unknown> = {}): Promise<string> => {
    const r = (await client().callTool({ name, arguments: args })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    const text = r.content.map((c) => c.text).join('\n');
    expect(r.isError === true, `${name}: ${text}`).toBe(false);
    return text;
  },
});

export const readVault = (vault: string, ...parts: string[]): string =>
  readFileSync(join(vault, ...parts), 'utf8');
