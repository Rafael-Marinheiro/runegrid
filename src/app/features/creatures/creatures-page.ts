import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CreatureKind, SIZE_LABEL } from '@core/models/creature';
import { PartyStore } from '@state/party.store';
import { UiPrefs } from '@state/ui-prefs';
import { CreatureSheet } from './creature-sheet';

const KIND_LABEL: Record<CreatureKind, string> = { pc: 'PJ', npc: 'PNJ', monster: 'Monstro' };

@Component({
  selector: 'app-creatures-page',
  imports: [CreatureSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './creatures-page.html',
  styleUrl: './creatures-page.scss',
})
export class CreaturesPage {
  protected readonly store = inject(PartyStore);
  protected readonly ui = inject(UiPrefs);
  protected readonly kindLabel = KIND_LABEL;
  protected readonly sizeLabel = SIZE_LABEL;
  /** Exclusão em duas etapas: o 1º clique só pede confirmação. */
  protected readonly confirming = signal(false);

  protected kindName(kind: CreatureKind): string {
    const labels: Record<CreatureKind, string> = { pc: 'PC', npc: 'NPC', monster: 'Monster' };
    return this.ui.locale() === 'en' ? labels[kind] : this.kindLabel[kind];
  }

  protected remove(id: string): void {
    if (!this.confirming()) return this.confirming.set(true);
    this.store.remove(id);
    this.confirming.set(false);
  }

  protected pct(hp: { current: number; max: number }): number {
    return Math.max(0, Math.min(100, (hp.current / hp.max) * 100));
  }
}
