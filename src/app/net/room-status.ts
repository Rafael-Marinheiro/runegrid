import { computed, Injectable, signal } from '@angular/core';
import { PeerInfo } from './protocol';

export type RoomStatus = 'offline' | 'connecting' | 'hosting' | 'joined' | 'paused' | 'error';

/**
 * Estado observável da sala (só signals). O cabeçalho usa este arquivo e não o `RoomService`,
 * para não carregar o motor de regras e a rede no pacote inicial.
 */
@Injectable({ providedIn: 'root' })
export class RoomStatusStore {
  readonly status = signal<RoomStatus>('offline');
  readonly code = signal('');
  readonly peers = signal<PeerInfo[]>([]);
  readonly online = computed(() => this.status() === 'hosting' || this.status() === 'joined');
}
