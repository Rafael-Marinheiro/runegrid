/** Helpers shared by every tool: text replies, errors, name matching. */

/** Lower-case, accent-free: "Esquiva" and "esquiva" and "ESQUIVÁ" compare equal. */
export const plain = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** A failure the LLM can fix by calling the tool differently; the message says how. */
export class GameError extends Error {}

export const CHARACTER_LIMIT = 25_000;

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export const clip = (text: string): string =>
  text.length <= CHARACTER_LIMIT
    ? text
    : `${text.slice(0, CHARACTER_LIMIT)}\n\n…[truncated at ${CHARACTER_LIMIT} characters — narrow the request]`;

/** Runs a tool body; any thrown error (engine RuleError included) becomes an actionable `isError` reply. */
export async function reply(body: () => string | Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: clip(await body()) }] };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

export const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
export const OVERWRITE = { ...WRITE, destructiveHint: true } as const;

/** Local wall-clock time as "YYYY-MM-DD HH:mm". */
export const stamp = (): string => new Date().toLocaleString('sv-SE').slice(0, 16);

export const pad = (n: number, width = 3): string => String(n).padStart(width, '0');

export const fmt = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
