import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { RoomStatusStore } from '@net/room-status';
import { UiPrefs } from '@state/ui-prefs';
import { filter } from 'rxjs';

interface AppCommand {
  label: string;
  shortcut?: string;
  run: () => void;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly room = inject(RoomStatusStore);
  private readonly router = inject(Router);
  protected readonly ui = inject(UiPrefs);
  private readonly palette = viewChild.required<ElementRef<HTMLDialogElement>>('palette');
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('commandSearch');
  protected readonly query = signal('');
  protected readonly commands = computed<AppCommand[]>(() => [
    ...[
      [this.ui.text('Criaturas', 'Creatures'), '/criaturas'],
      [this.ui.text('Combate', 'Combat'), '/combate'],
      [this.ui.text('Gerador', 'Generator'), '/gerador'],
      [this.ui.text('Estúdio', 'Studio'), '/estudio'],
      [this.ui.text('Bestiário', 'Bestiary'), '/bestiario'],
      [this.ui.text('Magias', 'Spells'), '/magias'],
      [this.ui.text('Dados', 'Dice'), '/dados'],
      [this.ui.text('Mesa online', 'Online table'), '/mesa'],
    ].map(([label, path], index) => ({
      label: `${this.ui.text('Ir para', 'Go to')} ${label}`,
      shortcut: `Alt+${index + 1}`,
      run: () => void this.router.navigateByUrl(path),
    })),
    {
      label: this.ui.text('Alternar alto contraste', 'Toggle high contrast'),
      run: () => this.ui.highContrast.update((value) => !value),
    },
  ]);
  protected readonly filteredCommands = computed(() => {
    const query = normalize(this.query());
    return query
      ? this.commands().filter((command) => normalize(command.label).includes(query))
      : this.commands();
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe(() => this.updateTitle());
    effect(() => {
      this.ui.locale();
      this.updateTitle();
    });
  }

  protected onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      return this.palette().nativeElement.open ? this.closePalette() : this.openPalette();
    }
    if (e.altKey && /^Digit[1-8]$/.test(e.code)) {
      e.preventDefault();
      this.run(this.commands()[Number(e.code.at(-1)) - 1]);
    }
  }

  protected openPalette(): void {
    this.query.set('');
    this.palette().nativeElement.showModal();
    queueMicrotask(() => this.search().nativeElement.focus());
  }

  protected closePalette(): void {
    this.palette().nativeElement.close();
  }

  protected run(command: AppCommand | undefined): void {
    if (!command) return;
    command.run();
    this.closePalette();
  }

  protected onSearchKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.run(this.filteredCommands()[0]);
    }
  }

  private updateTitle(): void {
    const path = this.router.url.split(/[?#]/)[0].replace(/^\//, '') || 'criaturas';
    const titles: Record<string, [string, string]> = {
      criaturas: ['Criaturas', 'Creatures'],
      combate: ['Combate', 'Combat'],
      gerador: ['Gerador', 'Generator'],
      estudio: ['Estúdio', 'Studio'],
      bestiario: ['Bestiário', 'Bestiary'],
      magias: ['Magias', 'Spells'],
      dados: ['Dados', 'Dice'],
      mesa: ['Mesa online', 'Online table'],
    };
    const title = titles[path] ?? ['Runegrid', 'Runegrid'];
    document.title = `${this.ui.text(title[0], title[1])} · Runegrid`;
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
