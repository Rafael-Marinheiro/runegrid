import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { normalizeCode } from '@net/protocol';
import { RoomService } from '@net/room.service';
import { EncounterStore } from '@state/encounter.store';
import { UiPrefs } from '@state/ui-prefs';
import { VoicePanel } from './voice-panel';

@Component({
  selector: 'app-lobby-page',
  imports: [VoicePanel],
  templateUrl: './lobby-page.html',
  styleUrl: './lobby-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LobbyPage implements OnInit {
  protected readonly room = inject(RoomService);
  protected readonly ui = inject(UiPrefs);
  private readonly store = inject(EncounterStore);
  private readonly route = inject(ActivatedRoute);

  protected readonly prefill = signal('');
  protected readonly notice = signal('');
  protected readonly saved = computed(() => (this.room.online() ? null : this.room.savedSession()));

  /** Personagens que o Mestre pode entregar aos jogadores. */
  protected readonly characters = computed(() =>
    this.store.state().creatures.filter((c) => c.kind !== 'monster'),
  );

  protected readonly link = computed(() => `${location.origin}/mesa?sala=${this.room.code()}`);

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('sala');
    if (code) this.prefill.set(normalizeCode(code));
  }

  protected ownerOf(creatureId: string): string {
    return this.room.peers().find((p) => p.owns.includes(creatureId))?.name ?? '';
  }

  protected assignValue(owns: string[]): string {
    return owns[0] ?? '';
  }

  protected assign(peerId: string, creatureId: string): void {
    this.room.assign(peerId, creatureId ? [creatureId] : []);
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.notice.set(this.ui.text('Copiado.', 'Copied.'));
    } catch {
      this.notice.set(text);
    }
  }

  protected send(input: HTMLInputElement, to: HTMLSelectElement): void {
    this.room.sendChat(input.value, this.room.isHost() ? to.value || undefined : undefined);
    input.value = '';
  }

  protected time(at: number): string {
    return new Date(at).toLocaleTimeString(this.ui.locale(), {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
