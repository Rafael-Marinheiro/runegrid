import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdvMode, DiceError, formatDice } from '@core/rules/dice';
import { DiceStore } from '@state/dice.store';
import { Die, ROLL_MS } from './die';

@Component({
  selector: 'app-dice-page',
  imports: [Die],
  templateUrl: './dice-page.html',
  styleUrl: './dice-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DicePage {
  protected readonly store = inject(DiceStore);
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

  protected readonly error = signal('');
  protected readonly mode = signal<AdvMode>('normal');

  protected rollNotation(notation: string): void {
    try {
      this.store.roll(notation);
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
