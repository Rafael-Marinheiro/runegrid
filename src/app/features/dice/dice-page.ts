import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AdvMode, DiceError, formatDice } from '@core/rules/dice';
import { DiceStore } from '@state/dice.store';
import { MacroStore } from '@state/macros.store';
import { DiceTray3d } from './dice-3d/dice-tray-3d';
import { Die, ROLL_MS } from './die';

@Component({
  selector: 'app-dice-page',
  imports: [Die, DiceTray3d],
  templateUrl: './dice-page.html',
  styleUrl: './dice-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DicePage {
  protected readonly store = inject(DiceStore);
  protected readonly macroStore = inject(MacroStore);
  protected readonly format = formatDice;

  protected readonly quickDice = [4, 6, 8, 10, 12, 20, 100];
  protected readonly modes: { value: AdvMode; label: string }[] = [
    { value: 'normal', label: 'Normal' },
    { value: 'advantage', label: 'Vantagem' },
    { value: 'disadvantage', label: 'Desvantagem' },
  ];

  /** Dados da última rolagem, com atraso escalonado para cair um após o outro. */
  protected readonly dice = computed(() => {
    const last = this.store.last();
    if (!last) return [];
    const { d20 } = last;
    const flat = last.result.terms.flatMap(({ term, dice }) =>
      term.kind === 'dice' ? dice.map((d) => ({ ...d, sides: term.sides })) : [],
    );
    return flat.map((d, i) => {
      const highlight: 'crit' | 'fumble' | null =
        !d20 || d.dropped || d.sides !== 20
          ? null
          : d20.crit
            ? 'crit'
            : d20.fumble
              ? 'fumble'
              : null;
      return { key: `${last.id}-${i}`, ...d, delay: Math.min(i * 90, 900), highlight };
    });
  });
  /** O total só aparece depois que o último dado pousa. */
  protected readonly settleMs = computed(() => Math.min(this.dice().length * 90, 900) + ROLL_MS);

  protected readonly use3d = this.store.use3d;
  private readonly webgl = signal(true);
  private readonly still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  /** 3D só com WebGL, sem "reduzir movimento" e se o usuário não desligou. */
  protected readonly show3d = computed(() => this.use3d() && this.webgl() && !this.still);
  /** O total só aparece depois que os dados param. */
  protected readonly revealed = signal(true);
  protected readonly seed = computed(() => ((this.store.last()?.id ?? 0) * 0x9e3779b1) >>> 0);
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly error = signal('');
  protected readonly mode = signal<AdvMode>('normal');

  constructor() {
    effect(() => {
      const last = this.store.last();
      const threeD = this.show3d();
      if (!last) return;
      untracked(() => {
        clearTimeout(this.timer);
        if (threeD) return this.revealed.set(false); // libera em (settled)
        if (this.still) return this.revealed.set(true);
        this.revealed.set(false);
        this.timer = setTimeout(() => this.revealed.set(true), this.settleMs());
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected onSettled(): void {
    this.revealed.set(true);
  }

  protected onFailed(): void {
    this.webgl.set(false);
  }

  protected rollNotation(notation: string): void {
    try {
      this.store.roll(notation);
      this.error.set('');
    } catch (e) {
      if (!(e instanceof DiceError)) throw e;
      this.error.set(e.message);
    }
  }

  protected saveMacro(name: string, expr: string): void {
    try {
      this.macroStore.save(name, expr);
      this.error.set('');
    } catch (e) {
      if (!(e instanceof DiceError)) throw e;
      this.error.set(e.message);
    }
  }

  protected rollD20(modifier: string): void {
    this.error.set('');
    this.store.rollD20(Number(modifier) || 0, this.mode());
  }
}
