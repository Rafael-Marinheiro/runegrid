import { EncounterState } from '@core/models/encounter';
import { GridMap } from '@core/models/grid';
import { Command, PLAYER_COMMANDS } from '@core/rules/encounter';

/** Sem letras e números que se confundem (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(rng: () => number = Math.random, length = 6): string {
  return Array.from({ length }, () => ALPHABET[Math.floor(rng() * ALPHABET.length)]).join('');
}

export const normalizeCode = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isValidCode = (code: string): boolean =>
  code.length === 6 && [...code].every((c) => ALPHABET.includes(c));

/** ID do host no servidor de sinalização. */
export const peerIdFor = (code: string): string => `runegrid-${normalizeCode(code)}`;

export interface PeerInfo {
  id: string;
  name: string;
  /** Criaturas que este jogador controla. */
  owns: string[];
}

/** Jogador → Mestre. */
export type ClientMsg =
  | { t: 'hello'; name: string }
  | { t: 'cmd'; id: number; cmd: Command }
  | { t: 'chat'; text: string; to?: string };

/** Mestre → jogador. */
export type HostMsg =
  | { t: 'welcome'; id: string; owns: string[]; peers: PeerInfo[] }
  | { t: 'map'; map: GridMap }
  | { t: 'state'; state: Omit<EncounterState, 'map'> }
  | { t: 'ack'; id: number; ok: boolean; error?: string }
  | { t: 'peers'; peers: PeerInfo[] }
  | { t: 'role'; owns: string[] }
  | { t: 'chat'; from: string; text: string; whisper?: boolean }
  | { t: 'mute' }
  | { t: 'kick'; reason: string };

const MAX_TEXT = 500;
const MAX_NAME = 24;

/**
 * Valida uma mensagem que chegou de um jogador. O jogador só pode mandar comandos de turno:
 * qualquer outra coisa (inclusive comandos de Mestre) é descartada aqui, antes do reducer.
 */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m['t']) {
    case 'hello': {
      const name = typeof m['name'] === 'string' ? m['name'].trim().slice(0, MAX_NAME) : '';
      return name ? { t: 'hello', name } : null;
    }
    case 'cmd': {
      const cmd = m['cmd'] as { type?: unknown } | null;
      if (typeof m['id'] !== 'number' || !cmd || typeof cmd.type !== 'string') return null;
      if (!(PLAYER_COMMANDS as readonly string[]).includes(cmd.type)) return null;
      return { t: 'cmd', id: m['id'], cmd: cmd as Command };
    }
    case 'chat': {
      if (typeof m['text'] !== 'string' || !m['text'].trim()) return null;
      return {
        t: 'chat',
        text: m['text'].trim().slice(0, MAX_TEXT),
        to: typeof m['to'] === 'string' ? m['to'] : undefined,
      };
    }
    default:
      return null;
  }
}

/**
 * Controla o que já foi enviado a cada jogador: o mapa (pesado) só viaja quando muda;
 * o resto do estado vai a cada alteração. A ordem é garantida pelo canal (confiável e ordenado).
 */
export class Outbox {
  private readonly sentMap = new Map<string, string>();

  messagesFor(peerId: string, view: EncounterState): HostMsg[] {
    const { map, ...state } = view;
    const key = JSON.stringify(map);
    const out: HostMsg[] = [];
    if (this.sentMap.get(peerId) !== key) {
      this.sentMap.set(peerId, key);
      out.push({ t: 'map', map });
    }
    out.push({ t: 'state', state });
    return out;
  }

  forget(peerId: string): void {
    this.sentMap.delete(peerId);
  }
}
