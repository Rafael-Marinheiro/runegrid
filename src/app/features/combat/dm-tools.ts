import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Creature } from '@core/models/creature';
import { Adjustment } from '@core/rules/encounter';
import { EncounterStore } from '@state/encounter.store';
import { UiPrefs } from '@state/ui-prefs';

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/**
 * Ferramentas do Mestre para a criatura selecionada: ajuste livre (com descrição obrigatória que vai
 * para o registro), estaca, moradias e dispensar invocação. Tudo vira comando do motor.
 */
@Component({
  selector: 'app-dm-tools',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="tools">
      <summary>{{ ui.text('Ajuste livre do Mestre', 'GM free adjustment') }}</summary>
      <form class="adj" (submit)="$event.preventDefault(); apply(f)" #f>
        <p class="hint">
          {{
            ui.text(
              'Só o que for preenchido muda. Nada é gasto nem conferido; a descrição vai para o registro.',
              'Only filled fields change. Nothing is spent or checked; the description goes to the log.'
            )
          }}
        </p>
        <div class="grid">
          @for (k of numeric; track k.id) {
            <label class="field">
              {{ ui.text(k.pt, k.en) }}
              <input [name]="k.id" type="number" [placeholder]="current(k.id)" />
            </label>
          }
        </div>
        <div class="grid abil">
          @for (a of abilities; track a) {
            <label class="field">
              {{ a.toUpperCase() }}
              <input
                [name]="'ab_' + a"
                type="number"
                min="1"
                max="30"
                [placeholder]="'' + c().abilities[a]"
              />
            </label>
          }
        </div>
        <label class="field">
          {{ ui.text('Descrição (obrigatória)', 'Description (required)') }}
          <input name="note" required maxlength="500" autocomplete="off" />
        </label>
        <label class="toggle">
          <input name="public" type="checkbox" />
          {{ ui.text('Mostrar o ajuste aos jogadores', 'Show the adjustment to players') }}
        </label>
        <button type="submit" class="primary">
          {{ ui.text('Aplicar ajuste', 'Apply adjustment') }}
        </button>
      </form>
    </details>

    <div class="row">
      <button type="button" (click)="stake()">
        {{ ui.text('Estaca no coração', 'Stake through the heart') }}
      </button>
      @if (c().summon) {
        <button type="button" class="danger" (click)="dismiss()">
          {{ ui.text('Dispensar invocação', 'Dismiss summon') }}
        </button>
      }
    </div>

    @if (rooms().length) {
      <details class="tools">
        <summary>{{ ui.text('Moradias (Proibição)', 'Residences (Forbiddance)') }}</summary>
        @for (r of rooms(); track r.id) {
          <div class="room">
            <label class="toggle">
              <input
                type="checkbox"
                [checked]="r.residence === true"
                (change)="residence(r.id, $any($event.target).checked)"
              />
              {{ r.name }}
            </label>
            @if (r.residence) {
              <button type="button" (click)="invite(r.id, !isInvited(r.invited))">
                {{
                  isInvited(r.invited)
                    ? ui.text('Retirar convite', 'Withdraw invitation')
                    : ui.text('Convidar ', 'Invite ') + c().name
                }}
              </button>
            }
          </div>
        }
      </details>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: var(--space-2);
    }
    .tools {
      margin-bottom: var(--space-2);
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      gap: var(--space-2);
      margin: var(--space-2) 0;
    }
    .abil {
      grid-template-columns: repeat(3, 1fr);
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 44px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .toggle input {
      width: 20px;
      height: 20px;
      min-height: 0;
      padding: 0;
    }
    form button[type='submit'] {
      width: 100%;
    }
    .row,
    .room {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      margin-bottom: var(--space-2);
    }
    .hint {
      margin: var(--space-1) 0;
      font-size: 0.85em;
      opacity: 0.8;
    }
    .danger {
      color: var(--danger-text);
      border-color: var(--danger);
    }
  `,
})
export class DmTools {
  protected readonly ui = inject(UiPrefs);
  private readonly store = inject(EncounterStore);

  readonly c = input.required<Creature>();
  protected readonly abilities = ABILITY_KEYS;
  protected readonly numeric = [
    { id: 'ac', pt: 'CA', en: 'AC' },
    { id: 'speed', pt: 'Deslocamento (m)', en: 'Speed (ft)' },
    { id: 'hpMax', pt: 'PV máximos', en: 'Max HP' },
    { id: 'hpCurrent', pt: 'PV atuais', en: 'Current HP' },
    { id: 'hpTemp', pt: 'PV temporários', en: 'Temp HP' },
    { id: 'attackBonus', pt: 'Acerto (soma a todos)', en: 'To hit (added to all)' },
    { id: 'attacksPerAction', pt: 'Ataques por ação', en: 'Attacks per action' },
  ];
  protected readonly rooms = computed(() => this.store.view().map.rooms ?? []);

  protected current(id: string): string {
    const c = this.c();
    switch (id) {
      case 'ac':
        return `${c.ac}`;
      case 'speed':
        return `${this.ui.lenIn(c.speed)}`;
      case 'hpMax':
        return `${c.hp.max}`;
      case 'hpCurrent':
        return `${c.hp.current}`;
      case 'hpTemp':
        return `${c.hp.temp}`;
      case 'attacksPerAction':
        return `${c.attacksPerAction}`;
      default:
        return '0';
    }
  }

  protected apply(form: HTMLFormElement): void {
    const data = new FormData(form);
    const num = (k: string): number | undefined => {
      const v = (data.get(k) as string | null)?.trim();
      return v ? Number(v) : undefined;
    };
    const changes: Adjustment = {};
    for (const k of [
      'ac',
      'speed',
      'hpMax',
      'hpCurrent',
      'hpTemp',
      'attackBonus',
      'attacksPerAction',
    ] as const) {
      const v = num(k);
      if (v !== undefined) changes[k] = k === 'speed' ? this.ui.lenOut(v) : v;
    }
    for (const a of ABILITY_KEYS) {
      const v = num(`ab_${a}`);
      if (v !== undefined) (changes.abilities ??= {})[a] = v;
    }
    const ok = this.store.send({
      type: 'adjust',
      targetId: this.c().id,
      note: String(data.get('note') ?? ''),
      changes,
      secret: data.get('public') !== 'on',
    });
    if (ok) form.reset();
  }

  protected stake(): void {
    this.store.send({ type: 'stake', targetId: this.c().id });
  }

  protected dismiss(): void {
    const by = this.c().summon?.by;
    if (by) this.store.send({ type: 'dismissSummon', actorId: by, summonId: this.c().id });
  }

  protected residence(id: string, on: boolean): void {
    this.store.send({ type: 'setResidence', id, residence: on });
  }

  protected isInvited(list?: string[]): boolean {
    return !!list?.includes(this.c().id);
  }

  protected invite(id: string, on: boolean): void {
    this.store.send({
      type: 'setResidence',
      id,
      ...(on ? { invite: this.c().id } : { uninvite: this.c().id }),
    });
  }
}
