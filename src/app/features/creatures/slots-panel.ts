import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Creature } from '@core/models/creature';
import { fullCasterSlots } from '@core/rules/creature';
import { PartyStore } from '@state/party.store';

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

@Component({
  selector: 'app-slots-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = creature();
    <section class="panel" [attr.aria-labelledby]="'slots-' + c.id">
      <h2 [id]="'slots-' + c.id">Espaços de magia</h2>

      @for (row of rows(); track row.level) {
        <div class="row">
          <span class="lv">Nível {{ row.level }}</span>
          <div class="pips">
            @for (i of row.pips; track i) {
              <button
                type="button"
                class="slot"
                [class.used]="i >= row.max - row.used"
                [attr.aria-label]="
                  row.level +
                  'º nível, espaço ' +
                  (i + 1) +
                  ': ' +
                  (i < row.max - row.used
                    ? 'disponível, clique para gastar'
                    : 'gasto, clique para devolver')
                "
                (click)="store.toggleSlot(c.id, row.level, i < row.max - row.used)"
              ></button>
            }
          </div>
          <span class="count">{{ row.max - row.used }}/{{ row.max }}</span>
          <button
            type="button"
            class="step"
            aria-label="Menos um espaço"
            (click)="store.setSlotMax(c.id, row.level, row.max - 1)"
          >
            −
          </button>
          <button
            type="button"
            class="step"
            aria-label="Mais um espaço"
            (click)="store.setSlotMax(c.id, row.level, row.max + 1)"
          >
            +
          </button>
        </div>
      } @empty {
        <p class="help">Sem espaços de magia.</p>
      }
      <div class="actions">
        <button type="button" (click)="fill()">Conjurador completo (nível {{ c.level }})</button>
        <button type="button" (click)="store.setSlotMax(c.id, nextLevel(), 1)">
          Adicionar nível
        </button>
      </div>

      <h2 class="res">Recursos</h2>
      @for (r of c.resources; track r.name) {
        <div class="row">
          <span class="lv">{{ r.name }}</span>
          <div class="pips">
            @for (i of pips(r.max); track i) {
              <button
                type="button"
                class="slot round"
                [class.used]="i >= r.max - r.used"
                [attr.aria-label]="
                  r.name +
                  ', uso ' +
                  (i + 1) +
                  (i < r.max - r.used ? ': disponível, clique para gastar' : ': gasto')
                "
                [disabled]="i >= r.max - r.used"
                (click)="store.useResource(c.id, r.name)"
              ></button>
            }
          </div>
          <span class="count">{{ r.recharge === 'short' ? 'curto' : 'longo' }}</span>
          <button
            type="button"
            class="step"
            [attr.aria-label]="'Remover ' + r.name"
            (click)="store.removeResource(c.id, r.name)"
          >
            ×
          </button>
        </div>
      }
      <form class="add" (submit)="$event.preventDefault(); add(rn, rm, rr)">
        <label class="field">Novo recurso<input #rn placeholder="Fúria, Ki…" /></label>
        <label class="field">Usos<input #rm type="number" min="1" value="1" /></label>
        <label class="field">
          Recarrega
          <select #rr>
            <option value="short">Descanso curto</option>
            <option value="long">Descanso longo</option>
          </select>
        </label>
        <button type="submit">Adicionar</button>
      </form>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 44px;
    }
    .lv {
      flex: 0 0 72px;
    }
    .pips {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .slot {
      width: 24px;
      min-height: 24px;
      height: 24px;
      padding: 0;
      background: var(--info);
      border: 2px solid var(--info);
      transform: rotate(45deg);
      border-radius: 3px;
    }
    .slot.round {
      transform: none;
      border-radius: 50%;
      background: var(--gold);
      border-color: var(--gold);
    }
    .slot.used {
      background: transparent;
    }
    .slot:disabled {
      opacity: 1;
    }
    .count {
      min-width: 44px;
      text-align: right;
      color: var(--muted);
      font-size: 0.85rem;
    }
    .step {
      min-width: 36px;
      padding: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
    .res {
      margin-top: var(--space-4);
    }
    .help {
      color: var(--muted);
    }
    .add {
      display: grid;
      grid-template-columns: 1fr 70px 1fr auto;
      gap: var(--space-2);
      align-items: end;
      margin-top: var(--space-3);
    }
  `,
})
export class SlotsPanel {
  readonly creature = input.required<Creature>();
  protected readonly store = inject(PartyStore);
  protected readonly pips = range;

  protected readonly rows = computed(() =>
    Object.entries(this.creature().spellSlots)
      .map(([level, s]) => ({ level: Number(level), ...s, pips: range(s.max) }))
      .sort((a, b) => a.level - b.level),
  );

  protected nextLevel(): number {
    const levels = this.rows().map((r) => r.level);
    return Math.min(9, (levels.length ? Math.max(...levels) : 0) + 1);
  }

  protected fill(): void {
    const c = this.creature();
    this.store.patch(c.id, { spellSlots: fullCasterSlots(c.level) });
  }

  protected add(name: HTMLInputElement, max: HTMLInputElement, recharge: HTMLSelectElement): void {
    this.store.addResource(
      this.creature().id,
      name.value,
      max.valueAsNumber,
      recharge.value as 'short' | 'long',
    );
    name.value = '';
  }
}
