import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { vaultRoot } from './campaign';
import { createServer } from './server';

// stdout carries the protocol; logs go to stderr.
await createServer().connect(new StdioServerTransport());
console.error(`runegrid-mcp-server ready — vault: ${vaultRoot()}`);
