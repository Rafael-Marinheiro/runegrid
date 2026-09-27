import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { RoomStatusStore } from '@net/room-status';
import { UiPrefs } from '@state/ui-prefs';

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
  private readonly ui = inject(UiPrefs);
  private readonly palette = viewChild.required<ElementRef<HTMLDialogElement>>('palette');
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('commandSearch');
  protected readonly query = signal('');
  protected readonly commands: AppCommand[] = [
    ...[
      ['Criaturas', '/criaturas'],
      ['Combate', '/combate'],
      ['Gerador', '/gerador'],
      ['Estúdio', '/estudio'],
      ['Bestiário', '/bestiario'],
      ['Magias', '/magias'],
      ['Dados', '/dados'],
      ['Mesa online', '/mesa'],
    ].map(([label, path], index) => ({
      label: `Ir para ${label}`,
      shortcut: `Alt+${index + 1}`,
      run: () => void this.router.navigateByUrl(path),
    })),
    {
      label: 'Alternar alto contraste',
      run: () => this.ui.highContrast.update((value) => !value),
    },
  ];
  protected readonly filteredCommands = computed(() => {
    const query = normalize(this.query());
    return query
      ? this.commands.filter((command) => normalize(command.label).includes(query))
      : this.commands;
  });

  protected onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      return this.palette().nativeElement.open ? this.closePalette() : this.openPalette();
    }
    if (e.altKey && /^Digit[1-8]$/.test(e.code)) {
      e.preventDefault();
      this.run(this.commands[Number(e.code.at(-1)) - 1]);
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
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
