import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Creature } from '@core/models/creature';
import { Spell } from '@core/models/spell';
import { getSpell } from '@core/rules/spells/data';
import { SpellStore } from '@state/spell.store';
import { UiPrefs } from '@state/ui-prefs';

/** Escolha da magia e do espaço de magia; o alvo/área é escolhido depois, no mapa. */
@Component({
  selector: 'app-spell-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = caster();
    <div class="spells" role="group" [attr.aria-label]="ui.text('Magias', 'Spells')">
      @for (sp of known(); track sp.id) {
        <button
          type="button"
          class="spell"
          [class.active]="picked()?.id === sp.id"
          [disabled]="!available(sp).length || !!sp.react || sp.castTime === 'long'"
          [attr.title]="sp.description"
          (click)="pick(sp)"
        >
          <span class="name">{{ sp.name }}</span>
          <span class="meta">{{
            sp.level === 0
              ? ui.text('Truque', 'Cantrip')
              : ui.text(sp.level + 'º', 'Level ' + sp.level)
          }}</span>
          @if (sp.narrative) {
            <span
              class="tag"
              [attr.title]="
                ui.text('Efeito narrativo: o Mestre conduz', 'Narrative effect: the DM runs it')
              "
              >{{ ui.text('narrativa', 'narrative') }}</span
            >
          } @else if (sp.castTime === 'reaction') {
            <span class="tag">{{ ui.text('reação', 'reaction') }}</span>
          } @else if (sp.castTime === 'bonus') {
            <span class="tag">{{ ui.text('bônus', 'bonus') }}</span>
          }
        </button>
      } @empty {
        <p class="none">
          {{ c.name }} {{ ui.text('não conhece magias.', 'does not know any spells.') }}
        </p>
      }
      @for (x of kept(); track x.spellId) {
        <button
          type="button"
          class="spell"
          [class.active]="picked()?.id === x.spell.id && sustainPick()"
          (click)="pickSustained(x.spell, x.slotLevel)"
        >
          <span class="name">↻ {{ x.spell.name }}</span>
          <span class="tag">{{
            x.spell.sustain?.cost === 'bonus'
              ? ui.text('bônus', 'bonus')
              : ui.text('ação', 'action')
          }}</span>
        </button>
      }
    </div>
    @if (picked(); as sp) {
      <div class="detail">
        <p class="desc">{{ sp.description }}</p>
        @if (sp.manual) {
          <p class="note">{{ sp.manual }}</p>
        }
        @if (sp.castTime === 'reaction') {
          <p class="note">
            {{
              ui.text(
                'Reação: aparece como pergunta quando o gatilho acontece.',
                'Reaction: you are asked when the trigger happens.'
              )
            }}
          </p>
        }
        @if (sp.level > 0 && !sustainPick()) {
          <label class="slot">
            {{ ui.text('Espaço', 'Slot') }}
            <select #sel (change)="setSlot(+sel.value)">
              @for (l of available(sp); track l) {
                <option [value]="l" [selected]="l === slot()">
                  {{ ui.text(l + 'º nível', 'Level ' + l) }}
                </option>
              }
            </select>
          </label>
        }
        <p class="hint">{{ hint(sp) }}</p>
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
    .tag {
      font-size: 0.7rem;
      padding: 0 var(--space-2);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius);
      color: var(--info-text);
    }
    .note {
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
  protected readonly ui = inject(UiPrefs);
  readonly caster = input.required<Creature>();
  readonly picked = signal<Spell | null>(null);
  readonly slot = signal(0);
  readonly sustainPick = signal(false);
  readonly chosen = output<{ spell: Spell; slot: number; sustain?: boolean } | null>();
  private readonly spellStore = inject(SpellStore);

  protected readonly known = computed(() => {
    this.spellStore.version(); // recalcula quando a mecânica do SRD termina de carregar
    const rs = this.ui.ruleset();
    return (this.caster().spellcasting?.spells ?? [])
      .map((id) => getSpell(id, rs))
      .filter((s): s is Spell => !!s)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  });

  /** Magias mantidas (Arma Espiritual…) que dão uma ação a cada turno. */
  protected readonly kept = computed(() => {
    this.spellStore.version();
    const rs = this.ui.ruleset();
    return (this.caster().sustained ?? []).flatMap((x) => {
      const spell = getSpell(x.spellId, rs);
      return spell?.sustain ? [{ ...x, spell }] : [];
    });
  });

  protected hint(sp: Spell): string {
    const t = sp.target;
    const kind =
      this.sustainPick() && sp.sustain?.use?.target ? sp.sustain.use.target.kind : t.kind;
    const max =
      t.kind === 'creature'
        ? (t.max ?? 1) + (t.perLevel ?? 0) * Math.max(0, this.slot() - sp.level)
        : 1;
    switch (kind) {
      case 'creature':
        return max > 1
          ? this.ui.text(
              `Clique em até ${max} alvos e confirme em "Conjurar".`,
              `Click up to ${max} targets, then press "Cast".`,
            )
          : this.ui.text('Clique no alvo no mapa.', 'Click the target on the map.');
      case 'self':
        return this.ui.text('Afeta você: use "Conjurar".', 'Affects you: press "Cast".');
      case 'sphere':
        return t.kind === 'sphere' && t.self
          ? this.ui.text('Nasce em você: use "Conjurar".', 'Starts on you: press "Cast".')
          : this.ui.text('Clique no ponto central da esfera.', 'Click the center of the sphere.');
      case 'cube':
        return t.kind === 'cube' && t.self
          ? this.ui.text('Clique na direção do cubo.', 'Click the cube direction.')
          : this.ui.text('Clique no centro do cubo.', 'Click the center of the cube.');
      case 'point':
        return this.ui.text('Clique no ponto de destino.', 'Click the destination.');
      case 'line':
        return this.ui.text('Clique na direção da linha.', 'Click the line direction.');
      default:
        return this.ui.text('Clique na direção do cone.', 'Click the cone direction.');
    }
  }

  /** Níveis de espaço disponíveis para a magia (truques não usam espaço). */
  protected available(sp: Spell): number[] {
    if (sp.level === 0) return [0];
    return Object.entries(this.caster().spellSlots)
      .filter(([lv, s]) => Number(lv) >= sp.level && s.used < s.max)
      .map(([lv]) => Number(lv))
      .sort((a, b) => a - b);
  }

  protected pickSustained(sp: Spell, slotLevel: number): void {
    if (this.picked()?.id === sp.id && this.sustainPick()) {
      this.picked.set(null);
      this.sustainPick.set(false);
      this.chosen.emit(null);
      return;
    }
    this.sustainPick.set(true);
    this.picked.set(sp);
    this.slot.set(slotLevel);
    this.chosen.emit({ spell: sp, slot: slotLevel, sustain: true });
  }

  protected pick(sp: Spell): void {
    this.sustainPick.set(false);
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
