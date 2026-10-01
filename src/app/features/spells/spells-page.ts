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
import { spellNamePt } from '@core/rules/srd/names-pt';
import { SpellStore } from '@state/spell.store';
import { SrdStore } from '@state/srd.store';
import { UiPrefs } from '@state/ui-prefs';

const PAGE = 60;

@Component({
  selector: 'app-spells-page',
  templateUrl: './spells-page.html',
  styleUrl: './spells-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpellsPage implements OnInit {
  protected readonly srd = inject(SrdStore);
  protected readonly ui = inject(UiPrefs);
  private readonly spellStore = inject(SpellStore);

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
    void this.srd.loadSpells(this.ui.ruleset());
    void this.spellStore.ensure(this.ui.ruleset());
  }

  protected setRuleset(value: string): void {
    const ruleset = value === '2024' ? '2024' : '2014';
    this.ui.ruleset.set(ruleset);
    void this.srd.loadSpells(ruleset);
    void this.spellStore.ensure(ruleset);
  }

  /** Nome da magia em pt-BR se a interface estiver nesse idioma (glossário próprio, F11-6). */
  protected name(s: SrdSpell): string {
    return this.ui.text(spellNamePt(s.name), s.name);
  }

  protected setLevel(value: string): void {
    this.level.set(value === '' ? null : Number(value));
    this.shown.set(PAGE);
  }

  protected reset(): void {
    this.shown.set(PAGE);
  }

  protected levelLabel(s: SrdSpell): string {
    return s.level === 0
      ? this.ui.text('Truque', 'Cantrip')
      : this.ui.text(`${s.level}º nível`, `Level ${s.level}`);
  }

  /** Como o motor trata a magia: resolvida (`engine`), só narrativa (`narrative`) ou ainda sem regra. */
  protected kind(s: SrdSpell): 'engine' | 'narrative' | null {
    this.spellStore.version();
    const spell = getSpell(s.id, this.ui.ruleset());
    return !spell ? null : spell.narrative ? 'narrative' : 'engine';
  }

  /** Parte que o Mestre resolve à mão, se a magia a declara. */
  protected manual(s: SrdSpell): string | undefined {
    const spell = getSpell(s.id, this.ui.ruleset());
    return this.ui.text(spell?.manual ?? '', spell?.manualEn ?? spell?.manual ?? '') || undefined;
  }
}
