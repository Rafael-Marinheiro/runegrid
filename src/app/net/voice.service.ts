import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { MediaConnection } from 'peerjs';
import { peerIdFor } from './protocol';
import { RoomService } from './room.service';

export interface VoicePeer {
  id: string;
  name: string;
  /** 0–1. */
  volume: number;
  speaking: boolean;
  /** O áudio dessa pessoa já está chegando. */
  connected: boolean;
}

const SPEAK_THRESHOLD = 0.02;
const POLL_MS = 120;

/**
 * Chat de voz em malha (áudio WebRTC entre todos da sala). Funciona só com áudio; quem não liga o
 * microfone ainda ouve os outros. Nada é gravado: o áudio só passa entre os navegadores.
 */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  private readonly room = inject(RoomService);

  readonly enabled = signal(false);
  readonly muted = signal(false);
  readonly pushToTalk = signal(false);
  readonly talking = signal(false);
  readonly error = signal('');
  readonly meSpeaking = signal(false);

  private readonly volumes = signal<Record<string, number>>({});
  private readonly speakingIds = signal<ReadonlySet<string>>(new Set());
  private readonly connectedIds = signal<ReadonlySet<string>>(new Set());

  /** Todos os outros da sala, com o estado da voz de cada um. */
  readonly voices = computed<VoicePeer[]>(() => {
    const me = this.room.myId();
    const list = this.room.peers().map((p) => ({ id: p.id, name: p.name }));
    if (!this.room.isHost() && this.room.code())
      list.unshift({ id: peerIdFor(this.room.code()), name: 'Mestre' });
    return list
      .filter((p) => p.id !== me)
      .map((p) => ({
        ...p,
        volume: this.volumes()[p.id] ?? 1,
        speaking: this.speakingIds().has(p.id),
        connected: this.connectedIds().has(p.id),
      }));
  });

  private local: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private attached: unknown = null;
  private readonly calls = new Map<string, MediaConnection>();
  private readonly active = new Map<string, MediaConnection>();
  /** Para quem já mandamos o nosso áudio (chamada nossa, ou resposta com stream) — evita ficar mudo pro outro lado. */
  private readonly sentTo = new Set<string>();
  private readonly audios = new Map<string, HTMLAudioElement>();
  private readonly analysers = new Map<string, AnalyserNode>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // liga os ouvintes de chamada quando a sala abre; desliga tudo quando fecha
    effect(() => {
      const peer = this.room.peer;
      const online = this.room.online();
      untracked(() => {
        if (!online) return this.teardown();
        if (peer && this.attached !== peer) this.attach(peer);
      });
    });
    // entrou alguém e o microfone está ligado: chama a pessoa
    effect(() => {
      const ids = this.room.peers().map((p) => p.id);
      if (this.enabled()) untracked(() => this.callAll(ids));
    });
    // o Mestre pediu para silenciar
    effect(() => {
      if (this.room.muteRequests() > 0) untracked(() => this.setMuted(true));
    });
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }

  private attach(peer: NonNullable<RoomService['peer']>): void {
    this.attached = peer;
    peer.on('call', (call) => {
      call.answer(this.local ?? undefined); // sem microfone, só ouve
      this.watch(call);
      // Respondida com o nosso stream: já mandamos o áudio, não precisa de uma chamada extra depois.
      if (this.local) this.sentTo.add(call.peer);
    });
  }

  /** Liga o microfone e chama todo mundo. */
  async enable(): Promise<void> {
    this.error.set('');
    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.error.set('Sem acesso ao microfone. Você ainda ouve os outros.');
      return;
    }
    this.enabled.set(true);
    this.applyMic();
    this.watchLocal();
    this.callAll(this.voices().map((v) => v.id));
  }

  disable(): void {
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.sentTo.clear();
    this.analysers.delete('me');
    this.enabled.set(false);
    this.meSpeaking.set(false);
  }

  setMuted(m: boolean): void {
    this.muted.set(m);
    this.applyMic();
  }

  setPushToTalk(on: boolean): void {
    this.pushToTalk.set(on);
    this.talking.set(false);
    this.applyMic();
  }

  setVolume(id: string, v: number): void {
    this.volumes.update((m) => ({ ...m, [id]: v }));
    const a = this.audios.get(id);
    if (a) a.volume = v;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (e.key.toLowerCase() !== 'v' || !this.pushToTalk() || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && /^(input|textarea|select)$/i.test(t.tagName)) return; // digitando
    this.talking.set(down);
    this.applyMic();
  }

  /** O microfone só transmite ligado, sem silêncio e (se for push-to-talk) com a tecla V pressionada. */
  private applyMic(): void {
    const open = this.enabled() && !this.muted() && (!this.pushToTalk() || this.talking());
    this.local?.getAudioTracks().forEach((t) => (t.enabled = open));
  }

  private callAll(ids: string[]): void {
    const peer = this.room.peer;
    if (!peer || !this.local) return;
    const me = this.room.myId();
    const targets = new Set(ids);
    if (!this.room.isHost() && this.room.code()) targets.add(peerIdFor(this.room.code()));
    for (const id of targets) {
      if (id === me || this.sentTo.has(id)) continue;
      this.watch(peer.call(id, this.local));
      this.sentTo.add(id);
    }
  }

  private watch(call: MediaConnection): void {
    this.calls.set(call.peer, call);
    call.on('stream', (stream) => this.play(call, stream));
    call.on('close', () => {
      if (this.calls.get(call.peer) === call) this.calls.delete(call.peer);
      if (this.active.get(call.peer) === call) this.detach(call.peer);
    });
    call.on('error', () => this.detach(call.peer));
  }

  private audioContext(): AudioContext {
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    return this.ctx;
  }

  /** Toca o áudio de quem chegou; chamadas repetidas da mesma pessoa não dobram o som. */
  private play(call: MediaConnection, stream: MediaStream): void {
    const id = call.peer;
    let audio = this.audios.get(id);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      this.audios.set(id, audio);
    }
    audio.srcObject = stream;
    audio.volume = this.volumes()[id] ?? 1;
    void audio.play().catch(() => this.error.set('Toque na página para liberar o áudio.'));
    this.active.set(id, call);

    const ctx = this.audioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    this.analysers.set(id, analyser);
    this.connectedIds.update((s) => new Set(s).add(id));
    this.startPolling();
  }

  private detach(id: string): void {
    const audio = this.audios.get(id);
    if (audio) audio.srcObject = null;
    this.audios.delete(id);
    this.analysers.delete(id);
    this.active.delete(id);
    this.connectedIds.update((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  private watchLocal(): void {
    if (!this.local) return;
    const ctx = this.audioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(this.local).connect(analyser);
    this.analysers.set('me', analyser);
    this.startPolling();
  }

  private startPolling(): void {
    this.timer ??= setInterval(() => this.poll(), POLL_MS);
  }

  private poll(): void {
    const speaking = new Set<string>();
    const buf = new Uint8Array(256);
    for (const [id, a] of this.analysers) {
      a.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      if (Math.sqrt(sum / buf.length) > SPEAK_THRESHOLD) speaking.add(id);
    }
    const me = speaking.delete('me') && this.enabled() && !this.muted();
    this.meSpeaking.set(me);
    const prev = this.speakingIds();
    if (prev.size !== speaking.size || [...speaking].some((i) => !prev.has(i)))
      this.speakingIds.set(speaking);
  }

  private teardown(): void {
    for (const c of this.calls.values()) c.close();
    this.calls.clear();
    for (const id of [...this.audios.keys()]) this.detach(id);
    this.disable();
    this.attached = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.speakingIds.set(new Set());
  }
}
