import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { SrdSpell } from '@core/models/srd';
import { getSpell } from '@core/rules/spells/data';
import { SrdStore } from '@state/srd.store';

const PAGE = 60;

@Component({
  selector: 'app-spells-page',
  templateUrl: './spells-page.html',
  styleUrl: './spells-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpellsPage implements OnInit {
  protected readonly srd = inject(SrdStore);

  protected readonly levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  protected readonly query = signal('');
  protected readonly level = signal<number | null>(null);
  protected readonly school = signal('');
  protected readonly klass = signal('');
  protected readonly shown = signal(PAGE);
  protected readonly selectedId = signal<string | null>(null);

  protected readonly schools = computed(() =>
    [...new Set(this.srd.spells().map((s) => s.school))].sort(),
  );
  protected readonly classes = computed(() =>
    [...new Set(this.srd.spells().flatMap((s) => s.classes))].sort(),
  );

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const lv = this.level();
    return this.srd
      .spells()
      .filter(
        (s) =>
          (lv === null || s.level === lv) &&
          (!this.school() || s.school === this.school()) &&
          (!this.klass() || s.classes.includes(this.klass())) &&
          (!q || s.name.toLowerCase().includes(q)),
      );
  });
  protected readonly visible = computed(() => this.filtered().slice(0, this.shown()));
  protected readonly selected = computed(() =>
    this.srd.spells().find((s) => s.id === this.selectedId()),
  );

  ngOnInit(): void {
    void this.srd.loadSpells();
  }

  protected setLevel(value: string): void {
    this.level.set(value === '' ? null : Number(value));
    this.shown.set(PAGE);
  }

  protected reset(): void {
    this.shown.set(PAGE);
  }

  protected levelLabel(s: SrdSpell): string {
    return s.level === 0 ? 'Truque' : `${s.level}º nível`;
  }

  /** O motor de combate já resolve esta magia por completo? */
  protected inCombat(s: SrdSpell): boolean {
    return !!getSpell(s.id);
  }
}
