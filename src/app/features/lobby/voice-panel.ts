import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RoomService } from '@net/room.service';
import { VoiceService } from '@net/voice.service';
import { UiPrefs } from '@state/ui-prefs';

@Component({
  selector: 'app-voice-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" [attr.aria-label]="ui.text('Chat de voz', 'Voice chat')">
      <h2>{{ ui.text('Voz', 'Voice') }}</h2>
      <div class="row">
        @if (!voice.enabled()) {
          <button type="button" class="primary" (click)="voice.enable()">
            {{ ui.text('Ligar microfone', 'Turn on microphone') }}
          </button>
        } @else {
          <button
            type="button"
            (click)="voice.setMuted(!voice.muted())"
            [attr.aria-pressed]="voice.muted()"
          >
            {{ voice.muted() ? ui.text('Desmutar', 'Unmute') : ui.text('Mutar', 'Mute') }}
          </button>
          <button type="button" (click)="voice.disable()">
            {{ ui.text('Desligar', 'Turn off') }}
          </button>
        }
        <label class="ptt">
          <input
            #ptt
            type="checkbox"
            [checked]="voice.pushToTalk()"
            (change)="voice.setPushToTalk(ptt.checked)"
          />
          {{ ui.text('Push-to-talk (segure V)', 'Push-to-talk (hold V)') }}
        </label>
      </div>
      <p class="me" [class.on]="voice.meSpeaking()">
        <span class="dot" aria-hidden="true"></span>
        {{
          !voice.enabled()
            ? ui.text(
                'Microfone desligado (você ainda ouve os outros)',
                'Microphone off (you can still hear others)'
              )
            : voice.muted()
              ? ui.text('Mutado', 'Muted')
              : voice.pushToTalk() && !voice.talking()
                ? ui.text('Segure V para falar', 'Hold V to talk')
                : voice.meSpeaking()
                  ? ui.text('Você está falando', 'You are speaking')
                  : ui.text('Microfone aberto', 'Microphone open')
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
              v.connected
                ? v.speaking
                  ? ui.text('falando', 'speaking')
                  : ui.text('conectado', 'connected')
                : ui.text('sem áudio', 'no audio')
            }}</span>
            <label class="vol">
              <span class="sr">{{ ui.text('Volume de', 'Volume for') }} {{ v.name }}</span>
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
                [attr.aria-label]="ui.text('Silenciar ', 'Mute ') + v.name"
                (click)="room.requestMute(v.id)"
              >
                {{ ui.text('Silenciar', 'Mute') }}
              </button>
            }
          </li>
        } @empty {
          <li class="muted">{{ ui.text('Ninguém mais na sala.', 'No one else in the room.') }}</li>
        }
      </ul>
      <p class="hint">
        {{
          ui.text(
            'O áudio vai direto entre os navegadores e nunca é gravado.',
            'Audio goes directly between browsers and is never recorded.'
          )
        }}
      </p>
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
  protected readonly ui = inject(UiPrefs);
}
