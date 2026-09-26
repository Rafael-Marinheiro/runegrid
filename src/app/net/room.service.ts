import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { EncounterState } from '@core/models/encounter';
import { GridMap } from '@core/models/grid';
import { Command, project } from '@core/rules/encounter';
import { EncounterStore } from '@state/encounter.store';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { RoomStatusStore } from './room-status';
import {
  ClientMsg,
  HostMsg,
  isValidCode,
  normalizeCode,
  Outbox,
  parseClientMsg,
  PeerInfo,
  peerIdFor,
  randomCode,
} from './protocol';

/** STUN público + TURN aberto (melhor esforço) para redes restritivas. */
export const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export type { RoomStatus } from './room-status';

export interface ChatLine {
  from: string;
  text: string;
  whisper: boolean;
  at: number;
}

const JOIN_TIMEOUT_MS = 12000;
const CMD_TIMEOUT_MS = 8000;
const SESSION_KEY = 'runegrid.room';

/**
 * Sala multiplayer ponto a ponto. O Mestre (host) é a única fonte da verdade: recebe comandos,
 * valida com as regras e o papel do jogador, e devolve a cada um só a sua visão do encontro.
 */
@Injectable({ providedIn: 'root' })
export class RoomService {
  private readonly store = inject(EncounterStore);

  private readonly shared = inject(RoomStatusStore);
  readonly status = this.shared.status;
  readonly error = signal('');
  readonly code = this.shared.code;
  readonly myId = signal('');
  readonly name = signal('');
  readonly peers = this.shared.peers;
  readonly chat = signal<ChatLine[]>([]);
  /** Incrementa quando o Mestre pede para silenciar o microfone deste jogador. */
  readonly muteRequests = signal(0);
  readonly isHost = computed(() => this.status() === 'hosting');
  readonly online = this.shared.online;

  peer: Peer | null = null;
  private readonly conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private readonly outbox = new Outbox();
  private readonly assignments = new Map<string, string[]>();
  private readonly pending = new Map<number, (r: { ok: boolean; error?: string }) => void>();
  private nextCmd = 1;
  private clientMap: GridMap | null = null;

  constructor() {
    // Mestre: a cada mudança do encontro, cada jogador recebe a sua visão
    effect(() => {
      const state = this.store.state();
      if (this.status() === 'hosting') untracked(() => this.broadcast(state));
    });
  }

  // ---------- Mestre ----------

  async host(): Promise<void> {
    this.leave();
    this.status.set('connecting');
    try {
      let peer: Peer | null = null;
      let code = '';
      for (let attempt = 0; attempt < 5 && !peer; attempt++) {
        code = randomCode();
        try {
          peer = await this.open(peerIdFor(code));
        } catch (e) {
          if ((e as { type?: string }).type !== 'unavailable-id') throw e;
        }
      }
      if (!peer) throw new Error('Não foi possível reservar um código de sala.');
      this.peer = peer;
      this.code.set(code);
      this.myId.set(peer.id);
      this.name.set('Mestre');
      peer.on('connection', (c) => this.onHostConnection(c));
      peer.on('error', (e) => this.error.set(`Rede: ${e.type}`));
      this.status.set('hosting');
      this.saveSession({ host: true, code });
    } catch (e) {
      this.fail(e);
    }
  }

  private onHostConnection(conn: DataConnection): void {
    conn.on('data', (raw) => this.onHostData(conn, raw));
    conn.on('close', () => this.dropPeer(conn.peer));
    conn.on('error', () => this.dropPeer(conn.peer));
  }

  private onHostData(conn: DataConnection, raw: unknown): void {
    const msg = parseClientMsg(raw);
    if (!msg) return; // inválida ou comando de Mestre: descartada
    const me = () => this.peers().find((p) => p.id === conn.peer);

    if (msg.t === 'hello') {
      // reconexão: quem volta com o mesmo nome recupera os seus personagens
      const owns = this.assignments.get(msg.name) ?? [];
      const info: PeerInfo = { id: conn.peer, name: msg.name, owns };
      this.conns.set(conn.peer, conn);
      this.peers.update((l) => [...l.filter((p) => p.id !== conn.peer), info]);
      this.send(conn, { t: 'welcome', id: conn.peer, owns, peers: this.peers() });
      this.broadcastPeers();
      this.broadcast(this.store.state());
    } else if (msg.t === 'cmd') {
      const p = me();
      if (!p) return;
      const result = this.store.sendAs(msg.cmd, { kind: 'player', owns: p.owns });
      this.send(conn, { t: 'ack', id: msg.id, ...result });
    } else if (msg.t === 'chat') {
      const p = me();
      if (p) this.relayChat(p.name, msg.text, msg.to);
    }
  }

  /** O Mestre atribui personagens a um jogador (o que ele controla e o que enxerga). */
  assign(peerId: string, owns: string[]): void {
    const p = this.peers().find((x) => x.id === peerId);
    if (!p) return;
    this.assignments.set(p.name, owns);
    this.peers.update((l) => l.map((x) => (x.id === peerId ? { ...x, owns } : x)));
    const conn = this.conns.get(peerId);
    if (conn) this.send(conn, { t: 'role', owns });
    this.broadcastPeers();
    this.broadcast(this.store.state());
  }

  kick(peerId: string): void {
    const conn = this.conns.get(peerId);
    if (conn) {
      this.send(conn, { t: 'kick', reason: 'O Mestre removeu você da sala.' });
      setTimeout(() => conn.close(), 200);
    }
    this.dropPeer(peerId);
  }

  requestMute(peerId: string): void {
    const conn = this.conns.get(peerId);
    if (conn) this.send(conn, { t: 'mute' });
  }

  private dropPeer(id: string): void {
    this.conns.delete(id);
    this.outbox.forget(id);
    if (!this.peers().some((p) => p.id === id)) return;
    this.peers.update((l) => l.filter((p) => p.id !== id));
    this.broadcastPeers();
  }

  private broadcast(state: EncounterState): void {
    for (const [id, conn] of this.conns) {
      const p = this.peers().find((x) => x.id === id);
      if (!p || !conn.open) continue;
      for (const m of this.outbox.messagesFor(
        id,
        project(state, { kind: 'player', owns: p.owns }),
      )) {
        this.send(conn, m);
      }
    }
  }

  private broadcastPeers(): void {
    for (const conn of this.conns.values()) this.send(conn, { t: 'peers', peers: this.peers() });
  }

  private relayChat(from: string, text: string, to?: string): void {
    const line: ChatLine = { from, text, whisper: !!to, at: Date.now() };
    if (to) {
      // sussurro: só o destinatário e o Mestre
      const conn = this.conns.get(to);
      if (conn) this.send(conn, { t: 'chat', from, text, whisper: true });
      this.chat.update((l) => [...l, line]);
      return;
    }
    for (const conn of this.conns.values()) this.send(conn, { t: 'chat', from, text });
    this.chat.update((l) => [...l, line]);
  }

  /** Mensagem de chat enviada por este navegador (Mestre ou jogador). */
  sendChat(text: string, to?: string): void {
    const t = text.trim();
    if (!t) return;
    if (this.isHost()) return this.relayChat('Mestre', t, to);
    this.hostConn?.send({ t: 'chat', text: t, to } satisfies ClientMsg);
  }

  // ---------- jogador ----------

  async join(rawCode: string, name: string): Promise<void> {
    const code = normalizeCode(rawCode);
    const who = name.trim();
    if (!isValidCode(code)) return this.fail(new Error('Código inválido: são 6 letras e números.'));
    if (!who) return this.fail(new Error('Diga o seu nome.'));
    this.leave();
    this.status.set('connecting');
    try {
      const peer = await this.open();
      this.peer = peer;
      this.myId.set(peer.id);
      this.name.set(who);
      this.code.set(code);
      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable')
          this.fail(new Error('Sala não encontrada. Confira o código.'));
      });
      const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'json' });
      this.hostConn = conn;
      conn.on('open', () => conn.send({ t: 'hello', name: who } satisfies ClientMsg));
      conn.on('data', (raw) => this.onClientData(raw as HostMsg));
      conn.on('close', () => {
        if (this.status() === 'joined')
          this.fail(new Error('A conexão com o Mestre foi encerrada.'));
      });
      setTimeout(() => {
        if (this.status() === 'connecting')
          this.fail(new Error('Sala não encontrada. O Mestre está online?'));
      }, JOIN_TIMEOUT_MS);
    } catch (e) {
      this.fail(e);
    }
  }

  private onClientData(m: HostMsg): void {
    switch (m.t) {
      case 'welcome':
        this.status.set('joined');
        this.myId.set(m.id);
        this.peers.set(m.peers);
        this.store.role.set({ kind: 'player', owns: m.owns });
        this.store.remote.set({ send: (cmd) => this.sendCommand(cmd) });
        this.saveSession({ host: false, code: this.code(), name: this.name() });
        break;
      case 'map':
        this.clientMap = m.map;
        break;
      case 'state':
        if (this.clientMap) this.store.applyRemote({ ...m.state, map: this.clientMap });
        break;
      case 'ack':
        this.pending.get(m.id)?.({ ok: m.ok, error: m.error });
        this.pending.delete(m.id);
        break;
      case 'peers':
        this.peers.set(m.peers);
        break;
      case 'role':
        this.store.role.set({ kind: 'player', owns: m.owns });
        break;
      case 'chat':
        this.chat.update((l) => [
          ...l,
          { from: m.from, text: m.text, whisper: !!m.whisper, at: Date.now() },
        ]);
        break;
      case 'mute':
        this.muteRequests.update((n) => n + 1);
        break;
      case 'kick':
        this.fail(new Error(m.reason));
        break;
    }
  }

  private sendCommand(cmd: Command): Promise<{ ok: boolean; error?: string }> {
    const conn = this.hostConn;
    if (!conn?.open) return Promise.resolve({ ok: false, error: 'Sem conexão com o Mestre.' });
    const id = this.nextCmd++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      conn.send({ t: 'cmd', id, cmd } satisfies ClientMsg);
      setTimeout(() => {
        if (this.pending.delete(id)) resolve({ ok: false, error: 'O Mestre não respondeu.' });
      }, CMD_TIMEOUT_MS);
    });
  }

  // ---------- comum ----------

  leave(): void {
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.hostConn?.close();
    this.hostConn = null;
    this.peer?.destroy();
    this.peer = null;
    this.pending.clear();
    this.peers.set([]);
    this.clientMap = null;
    this.status.set('offline');
    this.code.set('');
    this.myId.set('');
    this.error.set('');
    this.store.remote.set(null);
    this.store.role.set({ kind: 'dm' });
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* sem armazenamento */
    }
  }

  /** Última sala deste navegador (para reconectar depois de recarregar a página). */
  savedSession(): { host: boolean; code: string; name?: string } | null {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  private saveSession(s: { host: boolean; code: string; name?: string }): void {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    } catch {
      /* sem armazenamento */
    }
  }

  /** O PeerJS só é baixado quando alguém abre ou entra numa sala. */
  private async open(id?: string): Promise<Peer> {
    const { default: PeerClass } = await import('peerjs');
    return new Promise((resolve, reject) => {
      const peer = id
        ? new PeerClass(id, { config: ICE_CONFIG })
        : new PeerClass({ config: ICE_CONFIG });
      peer.on('open', () => resolve(peer));
      peer.on('error', (e) => {
        peer.destroy();
        reject(e);
      });
    });
  }

  private send(conn: DataConnection, msg: HostMsg): void {
    if (conn.open) conn.send(msg);
  }

  private fail(e: unknown): void {
    const message =
      e instanceof Error ? e.message : ((e as { type?: string })?.type ?? 'Erro de rede');
    this.leave();
    this.status.set('error');
    this.error.set(message);
  }
}
