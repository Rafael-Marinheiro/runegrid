import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Creature } from '@core/models/creature';
import { RuleError } from '@core/rules/creature';
import { CATALOG, getItem } from '@core/rules/inventory/catalog';
import {
  addItem,
  carriedWeight,
  carryCapacity,
  removeItem,
  toggleEquip,
} from '@core/rules/inventory/inventory';
import { PartyStore } from '@state/party.store';

const GROUPS: { kind: string; label: string }[] = [
  { kind: 'weapon', label: 'Armas' },
  { kind: 'armor', label: 'Armaduras' },
  { kind: 'shield', label: 'Escudos' },
  { kind: 'consumable', label: 'Consumíveis' },
  { kind: 'gear', label: 'Equipamento' },
];

@Component({
  selector: 'app-inventory-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = creature();
    <section class="panel" aria-labelledby="inv-title">
      <h2 id="inv-title">Inventário</h2>
      <p class="hint" [class.over]="weight() > capacity()">
        Carga: {{ weight() }} / {{ capacity() }} lb
        @if (weight() > capacity()) {
          (sobrecarregado)
        }
      </p>

      <ul class="items">
        @for (i of c.inventory ?? []; track i.id) {
          @let d = def(i.ref);
          <li>
            <span class="name"
              >{{ d?.name }}
              @if (i.qty > 1) {
                ×{{ i.qty }}
              }
            </span>
            @if (d?.kind === 'weapon' || d?.kind === 'armor' || d?.kind === 'shield') {
              <button
                type="button"
                [class.active]="i.equipped"
                [attr.aria-pressed]="i.equipped"
                (click)="equip(i.id)"
              >
                {{ i.equipped ? 'Equipado' : 'Equipar' }}
              </button>
            }
            <button type="button" [attr.aria-label]="'Remover ' + d?.name" (click)="remove(i.id)">
              ×
            </button>
          </li>
        } @empty {
          <li class="hint">Nada por aqui.</li>
        }
      </ul>

      <label class="field">
        Adicionar item
        <select #pick (change)="add(pick.value); pick.value = ''">
          <option value="">Escolha…</option>
          @for (g of groups; track g.kind) {
            <optgroup [label]="g.label">
              @for (d of catalog; track d.id) {
                @if (d.kind === g.kind) {
                  <option [value]="d.id">{{ d.name }}</option>
                }
              }
            </optgroup>
          }
        </select>
      </label>
      <p class="hint" role="status" aria-live="polite">{{ error() }}</p>
    </section>
  `,
  styles: `
    .items {
      list-style: none;
      margin: 0 0 var(--space-3, 0.75rem);
      padding: 0;
      display: grid;
      gap: 0.35rem;
    }
    li {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .name {
      flex: 1;
    }
    .over {
      color: var(--danger, #c0392b);
    }
  `,
})
export class InventoryPanel {
  readonly creature = input.required<Creature>();
  private readonly store = inject(PartyStore);

  protected readonly catalog = CATALOG;
  protected readonly groups = GROUPS;
  protected readonly def = getItem;
  protected readonly weight = computed(() => carriedWeight(this.creature()));
  protected readonly capacity = computed(() => carryCapacity(this.creature()));
  protected readonly error = signal('');

  private edit(fn: (c: Creature) => Creature): void {
    try {
      const next = fn(this.creature());
      this.store.patch(this.creature().id, {
        inventory: next.inventory,
        attacks: next.attacks,
        ac: next.ac,
      });
      this.error.set('');
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      this.error.set(e.message);
    }
  }

  protected add(ref: string): void {
    if (ref) this.edit((c) => addItem(c, ref));
  }
  protected remove(id: string): void {
    this.edit((c) => removeItem(c, id));
  }
  protected equip(id: string): void {
    this.edit((c) => toggleEquip(c, id));
  }
}
