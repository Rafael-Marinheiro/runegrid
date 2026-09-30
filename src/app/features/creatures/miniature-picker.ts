import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { MiniatureQuery, MiniatureRace } from '@core/rules/srd/miniature';
import { MonsterArtStore } from '@state/monster-art.store';
import { UiPrefs } from '@state/ui-prefs';

const RACES: { id: MiniatureRace; pt: string; en: string }[] = [
  { id: 'humano', pt: 'Humanos', en: 'Humans' },
  { id: 'anao', pt: 'Anões', en: 'Dwarves' },
  { id: 'elfo', pt: 'Elfos', en: 'Elves' },
  { id: 'goblin', pt: 'Goblins', en: 'Goblins' },
  { id: 'hobgoblin', pt: 'Hobgoblins', en: 'Hobgoblins' },
];

/**
 * Escolha da miniatura do token: mostra primeiro as que combinam com a ficha (nome, papel, armas)
 * e, sob demanda, o catálogo inteiro com filtro por raça e busca. Emite o caminho escolhido
 * (`miniaturas/x.png`) ou `undefined` para remover.
 */
@Component({
  selector: 'app-miniature-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker" role="group" [attr.aria-label]="ui.text('Miniatura', 'Miniature')">
      @if (browsing()) {
        <div class="filters">
          <select
            #race
            [attr.aria-label]="ui.text('Raça', 'Race')"
            (change)="raceFilter.set(race.value)"
          >
            <option value="">{{ ui.text('Todas as raças', 'All races') }}</option>
            @for (r of races; track r.id) {
              <option [value]="r.id" [selected]="raceFilter() === r.id">
                {{ ui.text(r.pt, r.en) }}
              </option>
            }
          </select>
          <input
            #q
            type="search"
            [attr.aria-label]="ui.text('Buscar miniatura', 'Search miniature')"
            [placeholder]="ui.text('Buscar (ex.: arco, mago)', 'Search (e.g. bow, mage)')"
            (input)="text.set(q.value)"
          />
        </div>
      }
      <div class="grid">
        @for (m of shown(); track m.arquivo) {
          <button
            type="button"
            [class.on]="current() === m.arquivo"
            [attr.aria-pressed]="current() === m.arquivo"
            [attr.aria-label]="m.nome"
            [attr.title]="m.nome"
            (click)="pick.emit(m.arquivo)"
          >
            <img [src]="'data/' + m.arquivo" alt="" loading="lazy" width="64" height="64" />
          </button>
        } @empty {
          <p class="none">{{ ui.text('Nenhuma miniatura encontrada.', 'No miniature found.') }}</p>
        }
      </div>
      <div class="actions">
        @if (suggested().length) {
          <button type="button" (click)="all.set(!all())">
            {{
              all()
                ? ui.text('Só as sugeridas', 'Suggested only')
                : ui.text('Ver todas', 'Browse all')
            }}
          </button>
        }
        @if (current()) {
          <button type="button" (click)="pick.emit(undefined)">
            {{ ui.text('Remover miniatura', 'Remove miniature') }}
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .picker {
      display: grid;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
    .filters,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, 68px);
      gap: 4px;
      max-height: 232px;
      overflow-y: auto;
    }
    .grid button {
      padding: 2px;
      line-height: 0;
      background: var(--panel-2);
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .grid button.on {
      border-color: var(--gold);
      outline: 2px solid var(--gold);
    }
    .none {
      color: var(--muted);
      grid-column: 1 / -1;
    }
  `,
})
export class MiniaturePicker implements OnInit {
  protected readonly ui = inject(UiPrefs);
  private readonly art = inject(MonsterArtStore);

  readonly query = input.required<MiniatureQuery>();
  readonly current = input<string | undefined>();
  readonly pick = output<string | undefined>();

  protected readonly races = RACES;
  protected readonly all = signal(false);
  protected readonly raceFilter = signal('');
  protected readonly text = signal('');

  private readonly suggested = computed(() => this.art.suggest(this.query(), 12));
  /** Sem sugestão para a ficha (ex.: Ogro), abre direto o catálogo. */
  protected readonly browsing = computed(() => this.all() || !this.suggested().length);

  protected readonly shown = computed(() => {
    if (!this.browsing()) return this.suggested();
    const race = this.raceFilter();
    const t = this.text().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return this.art
      .catalog()
      .filter(
        (m) =>
          (!race || m.raca === race) &&
          (!t ||
            `${m.nome} ${m.arquivo}`
              .normalize('NFD')
              .replace(/[̀-ͯ]/g, '')
              .toLowerCase()
              .includes(t)),
      )
      .slice(0, 120);
  });

  ngOnInit(): void {
    void this.art.load();
  }
}
