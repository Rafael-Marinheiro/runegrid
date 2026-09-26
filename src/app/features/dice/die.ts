import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';

/** Contorno de cada dado no viewBox 100×100; o d20 ganha o triângulo interno. */
const SHAPES: Record<number, string> = {
  4: '50,8 94,88 6,88',
  6: '14,14 86,14 86,86 14,86',
  8: '50,4 92,50 50,96 8,50',
  10: '50,4 90,40 50,96 10,40',
  12: '50,5 95,38 78,92 22,92 5,38',
  20: '50,4 92,27 92,73 50,96 8,73 8,27',
};
const FALLBACK = '50,4 82,18 96,50 82,82 50,96 18,82 4,50 18,18';

export const ROLL_MS = 800;
const TICK_MS = 70;

/**
 * Um dado que rola e pousa em `value`. O valor vem pronto do motor de regras:
 * a animação é só apresentação (os números que piscam nunca vão para o resultado).
 */
@Component({
  selector: 'app-die',
  template: `
    <svg
      viewBox="0 0 100 100"
      width="64"
      height="64"
      role="img"
      [attr.aria-label]="'d' + sides() + ': ' + value()"
      [class.rolling]="rolling()"
      [class.dropped]="dropped()"
      [class.crit]="highlight() === 'crit'"
      [class.fumble]="highlight() === 'fumble'"
      [style.animation-delay.ms]="delay()"
    >
      <polygon [attr.points]="points()" />
      @if (sides() === 20) {
        <polygon class="facet" points="50,24 76,68 24,68" />
      }
      <text x="50" [attr.y]="sides() === 4 ? 72 : 60" text-anchor="middle">{{ shown() }}</text>
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    svg {
      display: block;
      overflow: visible;
    }
    polygon {
      fill: var(--panel-2);
      stroke: var(--gold);
      stroke-width: 3;
      stroke-linejoin: round;
    }
    .facet {
      fill: none;
      stroke-width: 1.5;
      opacity: 0.55;
    }
    text {
      fill: var(--text);
      font: 700 34px var(--font-display);
    }
    .crit polygon {
      stroke: var(--success);
    }
    .fumble polygon {
      stroke: var(--danger-text);
    }
    .dropped {
      opacity: 0.4;
    }
    .dropped text {
      text-decoration: line-through;
    }
    .rolling {
      animation: tumble 800ms cubic-bezier(0.22, 0.8, 0.3, 1) both;
    }
    @keyframes tumble {
      0% {
        transform: translateY(-70px) rotate(0) scale(0.6);
        opacity: 0;
      }
      15% {
        opacity: 1;
      }
      60% {
        transform: translateY(0) rotate(540deg) scale(1.12);
      }
      80% {
        transform: translateY(-9px) rotate(680deg) scale(1);
      }
      100% {
        transform: translateY(0) rotate(720deg) scale(1);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Die implements OnInit {
  readonly sides = input.required<number>();
  readonly value = input.required<number>();
  readonly dropped = input(false);
  readonly delay = input(0);
  readonly highlight = input<'crit' | 'fumble' | null>(null);

  protected readonly points = computed(() => SHAPES[this.sides()] ?? FALLBACK);
  protected readonly shown = signal(0);
  protected readonly rolling = signal(false);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      this.shown.set(this.value());
      return;
    }
    this.rolling.set(true);
    const end = Date.now() + this.delay() + ROLL_MS;
    const flicker = () => 1 + Math.floor(Math.random() * this.sides());
    this.shown.set(flicker());
    const timer = setInterval(() => {
      if (Date.now() >= end) {
        clearInterval(timer);
        this.shown.set(this.value());
      } else {
        this.shown.set(flicker());
      }
    }, TICK_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}
