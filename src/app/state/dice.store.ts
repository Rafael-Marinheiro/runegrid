import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AdvMode, D20Result, roll, rollD20, RollResult } from '@core/rules/dice';
import { RNG } from './rng.token';

export interface RollEntry {
  id: number;
  at: Date;
  result: RollResult;
  /** Presente só em rolagens de d20 (crítico, vantagem...). */
  d20?: D20Result;
}

const MAX_HISTORY = 50;
const SOUND_KEY = 'runegrid.dice-sound.v1';

@Injectable({ providedIn: 'root' })
export class DiceStore {
  private readonly rng = inject(RNG);
  private readonly savedSound = readSound();
  private nextId = 1;
  private audio?: AudioContext;

  /** Dados 3D ligados (vale para a tela de dados e para o combate). */
  readonly use3d = signal(true);
  readonly soundOn = signal(this.savedSound.on);
  readonly soundVolume = signal(this.savedSound.volume);
  readonly history = signal<RollEntry[]>([]);
  readonly last = computed(() => this.history()[0]);

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(
          SOUND_KEY,
          JSON.stringify({ on: this.soundOn(), volume: this.soundVolume() }),
        );
      } catch {
        /* sem armazenamento */
      }
    });
  }

  /** Lança `DiceError` se a notação for inválida. */
  roll(notation: string): void {
    this.push({ result: roll(notation, this.rng) });
  }

  rollD20(modifier: number, mode: AdvMode): void {
    const d20 = rollD20(modifier, mode, this.rng);
    this.push({ result: d20.roll, d20 });
  }

  clear(): void {
    this.history.set([]);
  }

  /** Toca impactos curtos sem carregar áudio ou biblioteca adicional. */
  playSound(dice = 1): void {
    if (!this.soundOn() || typeof AudioContext === 'undefined') return;
    const audio = (this.audio ??= new AudioContext());
    const play = () => this.scheduleSound(audio, dice);
    if (audio.state === 'suspended')
      void audio
        .resume()
        .then(play)
        .catch(() => undefined);
    else play();
  }

  private push(entry: Pick<RollEntry, 'result' | 'd20'>): void {
    const full: RollEntry = { id: this.nextId++, at: new Date(), ...entry };
    this.history.update((h) => [full, ...h].slice(0, MAX_HISTORY));
    this.playSound(
      entry.result.terms.reduce((n, t) => n + (t.term.kind === 'dice' ? t.dice.length : 0), 0),
    );
  }

  private scheduleSound(audio: AudioContext, dice: number): void {
    const volume = Math.max(0, Math.min(1, this.soundVolume()));
    const hits = Math.max(1, Math.min(4, dice));
    for (let i = 0; i < hits; i++) {
      const at = audio.currentTime + i * 0.055;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(150 + ((dice * 47 + i * 61) % 180), at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.16), at + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.055);
    }
  }
}

function readSound(): { on: boolean; volume: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(SOUND_KEY) ?? '{}') as {
      on?: unknown;
      volume?: unknown;
    };
    return {
      on: saved.on === true,
      volume: typeof saved.volume === 'number' ? Math.max(0, Math.min(1, saved.volume)) : 0.55,
    };
  } catch {
    return { on: false, volume: 0.55 };
  }
}
