import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Creature } from '@core/models/creature';
import { Spell } from '@core/models/spell';
import { getSpell } from '@core/rules/spells/data';

/** Escolha da magia e do espaço de magia; o alvo/área é escolhido depois, no mapa. */
@Component({
  selector: 'app-spell-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = caster();
    <div class="spells" role="group" aria-label="Magias">
      @for (sp of known(); track sp.id) {
        <button
          type="button"
          class="spell"
          [class.active]="picked()?.id === sp.id"
          [disabled]="!available(sp).length"
          [attr.title]="sp.description"
          (click)="pick(sp)"
        >
          <span class="name">{{ sp.name }}</span>
          <span class="meta">{{ sp.level === 0 ? 'Truque' : sp.level + 'º' }}</span>
        </button>
      } @empty {
        <p class="none">{{ c.name }} não conhece magias.</p>
      }
    </div>
    @if (picked(); as sp) {
      <div class="detail">
        <p>{{ sp.description }}</p>
        @if (sp.level > 0) {
          <label class="slot">
            Espaço
            <select #sel (change)="setSlot(+sel.value)">
              @for (l of available(sp); track l) {
                <option [value]="l" [selected]="l === slot()">{{ l }}º nível</option>
              }
            </select>
          </label>
        }
        <p class="hint">
          {{
            sp.target.kind === 'creature'
              ? 'Clique no alvo no mapa.'
              : sp.target.kind === 'sphere'
                ? 'Clique no ponto central da esfera.'
                : 'Clique na direção do cone.'
          }}
        </p>
      </div>
    }
  `,
  styles: `
    .spells {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
    .spell {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }
    .spell.active {
      color: var(--gold);
      border-color: var(--gold);
      background: var(--panel-2);
    }
    .meta {
      font-size: 0.75rem;
      color: var(--info-text);
    }
    .detail {
      margin-top: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius);
    }
    .detail p {
      margin: 0 0 var(--space-2);
      font-size: 0.9rem;
    }
    .slot {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.85rem;
      color: var(--muted);
    }
    .hint,
    .none {
      color: var(--muted);
    }
  `,
})
export class SpellPanel {
  readonly caster = input.required<Creature>();
  readonly picked = signal<Spell | null>(null);
  readonly slot = signal(0);
  readonly chosen = output<{ spell: Spell; slot: number } | null>();

  protected readonly known = computed(() =>
    (this.caster().spellcasting?.spells ?? [])
      .map(getSpell)
      .filter((s): s is Spell => !!s)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
  );

  /** Níveis de espaço disponíveis para a magia (truques não usam espaço). */
  protected available(sp: Spell): number[] {
    if (sp.level === 0) return [0];
    return Object.entries(this.caster().spellSlots)
      .filter(([lv, s]) => Number(lv) >= sp.level && s.used < s.max)
      .map(([lv]) => Number(lv))
      .sort((a, b) => a - b);
  }

  protected pick(sp: Spell): void {
    if (this.picked()?.id === sp.id) {
      this.picked.set(null);
      this.chosen.emit(null);
      return;
    }
    const slots = this.available(sp);
    this.picked.set(sp);
    this.slot.set(slots[0]);
    this.chosen.emit({ spell: sp, slot: slots[0] });
  }

  protected setSlot(level: number): void {
    const sp = this.picked();
    if (!sp) return;
    this.slot.set(level);
    this.chosen.emit({ spell: sp, slot: level });
  }
}
