import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RoomService } from '@net/room.service';
import { VoiceService } from '@net/voice.service';

@Component({
  selector: 'app-voice-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" aria-label="Chat de voz">
      <h2>Voz</h2>
      <div class="row">
        @if (!voice.enabled()) {
          <button type="button" class="primary" (click)="voice.enable()">Ligar microfone</button>
        } @else {
          <button
            type="button"
            (click)="voice.setMuted(!voice.muted())"
            [attr.aria-pressed]="voice.muted()"
          >
            {{ voice.muted() ? 'Desmutar' : 'Mutar' }}
          </button>
          <button type="button" (click)="voice.disable()">Desligar</button>
        }
        <label class="ptt">
          <input
            #ptt
            type="checkbox"
            [checked]="voice.pushToTalk()"
            (change)="voice.setPushToTalk(ptt.checked)"
          />
          Push-to-talk (segure V)
        </label>
      </div>
      <p class="me" [class.on]="voice.meSpeaking()">
        <span class="dot" aria-hidden="true"></span>
        {{
          !voice.enabled()
            ? 'Microfone desligado (você ainda ouve os outros)'
            : voice.muted()
              ? 'Mutado'
              : voice.pushToTalk() && !voice.talking()
                ? 'Segure V para falar'
                : voice.meSpeaking()
                  ? 'Você está falando'
                  : 'Microfone aberto'
        }}
      </p>
      @if (voice.error()) {
        <p class="error" role="alert">{{ voice.error() }}</p>
      }
      <ul class="voices">
        @for (v of voice.voices(); track v.id) {
          <li [class.speaking]="v.speaking">
            <span class="dot" aria-hidden="true"></span>
            <span class="name">{{ v.name }}</span>
            <span class="state">{{
              v.connected ? (v.speaking ? 'falando' : 'conectado') : 'sem áudio'
            }}</span>
            <label class="vol">
              <span class="sr">Volume de {{ v.name }}</span>
              <input
                #vol
                type="range"
                min="0"
                max="1"
                step="0.05"
                [value]="v.volume"
                (input)="voice.setVolume(v.id, +vol.value)"
              />
            </label>
            @if (room.isHost()) {
              <button
                type="button"
                class="small"
                [attr.aria-label]="'Silenciar ' + v.name"
                (click)="room.requestMute(v.id)"
              >
                Silenciar
              </button>
            }
          </li>
        } @empty {
          <li class="muted">Ninguém mais na sala.</li>
        }
      </ul>
      <p class="hint">O áudio vai direto entre os navegadores e nunca é gravado.</p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    h2 {
      margin-bottom: var(--space-2);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .ptt {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 44px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .me {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--muted);
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid var(--muted);
      display: inline-block;
    }
    .me.on .dot,
    li.speaking .dot {
      background: var(--success);
      border-color: var(--success);
      box-shadow: 0 0 8px var(--success);
    }
    .voices {
      margin: var(--space-2) 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 6px 0;
      border-bottom: 1px solid var(--border-soft);
    }
    .name {
      flex: 1;
      font-weight: 700;
    }
    .state {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .vol input {
      width: 90px;
    }
    .small {
      min-height: 36px;
    }
    .error {
      color: var(--danger-text);
    }
    .hint,
    .muted {
      color: var(--muted);
      font-size: 0.85rem;
    }
    .sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  `,
})
export class VoicePanel {
  protected readonly voice = inject(VoiceService);
  protected readonly room = inject(RoomService);
}
