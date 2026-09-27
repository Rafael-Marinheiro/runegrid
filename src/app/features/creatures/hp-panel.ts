import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  Creature,
  DAMAGE_LABEL,
  DAMAGE_TYPES,
  DamageType,
  LifeStatus,
} from '@core/models/creature';
import { PartyStore } from '@state/party.store';
import { UiPrefs } from '@state/ui-prefs';

const STATUS: Record<LifeStatus, string> = {
  alive: 'Vivo',
  dying: 'Morrendo',
  stable: 'Estável',
  dead: 'Morto',
};

@Component({
  selector: 'app-hp-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = creature();
    <section class="panel" [attr.aria-labelledby]="'hp-' + c.id">
      <div class="head">
        <h2 [id]="'hp-' + c.id">{{ ui.text('Pontos de vida', 'Hit points') }}</h2>
        <span class="chip" [class]="'status ' + c.status">{{ statusLabel() }}</span>
      </div>

      <div
        class="bar"
        role="meter"
        [attr.aria-label]="ui.text('Pontos de vida', 'Hit points')"
        aria-valuemin="0"
        [attr.aria-valuenow]="c.hp.current"
        [attr.aria-valuemax]="c.hp.max"
      >
        <div class="fill" [class.low]="pct() <= 25" [style.width.%]="pct()"></div>
      </div>
      <p class="numbers">
        <b>{{ c.hp.current }}</b> / {{ c.hp.max }}
        @if (c.hp.temp > 0) {
          <span class="chip temp">+{{ c.hp.temp }} {{ ui.text('temporários', 'temporary') }}</span>
        }
      </p>

      <div class="apply">
        <label class="field">
          {{ ui.text('Valor', 'Amount') }}
          <input #amt type="number" min="0" value="1" inputmode="numeric" />
        </label>
        <label class="field">
          {{ ui.text('Tipo de dano', 'Damage type') }}
          <select #typ>
            <option value="">{{ ui.text('Sem tipo', 'Untyped') }}</option>
            @for (t of types; track t) {
              <option [value]="t">{{ damageName(t) }}</option>
            }
          </select>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="danger" (click)="damage(amt.value, typ.value)">
          {{ ui.text('Dano', 'Damage') }}
        </button>
        <button type="button" (click)="store.heal(c.id, amt.valueAsNumber || 0)">
          {{ ui.text('Cura', 'Heal') }}
        </button>
        <button type="button" (click)="store.tempHp(c.id, amt.valueAsNumber || 0)">
          {{ ui.text('PV temp.', 'Temp HP') }}
        </button>
      </div>

      <label class="field max">
        {{ ui.text('PV máximos', 'Maximum HP') }}
        <input
          #mx
          type="number"
          min="1"
          [value]="c.hp.max"
          (change)="store.setMaxHp(c.id, mx.valueAsNumber)"
        />
      </label>

      @if (c.status === 'dying') {
        <div
          class="death"
          role="group"
          [attr.aria-label]="ui.text('Salvaguardas contra a morte', 'Death saving throws')"
        >
          <div class="pips">
            <span>{{ ui.text('Sucessos', 'Successes') }}</span>
            @for (i of three; track i) {
              <span
                class="pip ok"
                [class.on]="i < c.deathSaves.successes"
                aria-hidden="true"
              ></span>
            }
            <span class="sr"
              >{{ c.deathSaves.successes }} {{ ui.text('de 3 sucessos', 'of 3 successes') }}</span
            >
          </div>
          <div class="pips">
            <span>{{ ui.text('Falhas', 'Failures') }}</span>
            @for (i of three; track i) {
              <span
                class="pip bad"
                [class.on]="i < c.deathSaves.failures"
                aria-hidden="true"
              ></span>
            }
            <span class="sr"
              >{{ c.deathSaves.failures }} {{ ui.text('de 3 falhas', 'of 3 failures') }}</span
            >
          </div>
          <div class="actions">
            <button type="button" class="primary" (click)="store.deathSave(c.id)">
              {{ ui.text('Rolar salvaguarda', 'Roll saving throw') }}
            </button>
            <button type="button" (click)="store.stabilize(c.id)">
              {{ ui.text('Estabilizar', 'Stabilize') }}
            </button>
          </div>
        </div>
      }

      <div class="actions rest">
        <button type="button" (click)="store.rest(c.id, 'short')">
          {{ ui.text('Descanso curto', 'Short rest') }}
        </button>
        <button type="button" (click)="store.rest(c.id, 'long')">
          {{ ui.text('Descanso longo', 'Long rest') }}
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .status.dying {
      color: var(--warning);
      border-color: var(--warning);
    }
    .status.dead {
      color: var(--danger-text);
      border-color: var(--danger);
    }
    .status.stable,
    .status.alive {
      color: var(--success);
    }
    .bar {
      height: 14px;
      margin-top: var(--space-2);
      background: #0d0906;
      border: 1px solid var(--border);
      border-radius: 4px;
      overflow: hidden;
    }
    .fill {
      height: 100%;
      background: var(--success);
      transition: width 200ms;
    }
    .fill.low {
      background: var(--danger);
    }
    .numbers {
      margin: var(--space-2) 0;
      font-size: 1.4rem;
      font-family: var(--font-num);
    }
    .numbers b {
      color: var(--gold);
    }
    .temp {
      margin-left: var(--space-2);
      color: var(--info-text);
      border-color: var(--info);
      font-size: 0.8rem;
    }
    .apply {
      display: grid;
      grid-template-columns: 90px 1fr;
      gap: var(--space-2);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }
    .actions button {
      flex: 1 1 auto;
    }
    .danger {
      color: var(--danger-text);
      border-color: var(--danger);
    }
    .max {
      max-width: 140px;
      margin-top: var(--space-3);
    }
    .death {
      margin-top: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--warning);
      border-radius: var(--radius);
    }
    .pips {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 28px;
    }
    .pips > span:first-child {
      width: 70px;
      color: var(--muted);
      font-size: 0.85rem;
    }
    .pip {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid var(--success);
    }
    .pip.bad {
      border-color: var(--danger);
    }
    .pip.ok.on {
      background: var(--success);
    }
    .pip.bad.on {
      background: var(--danger);
    }
    .rest {
      margin-top: var(--space-3);
    }
    .sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
  `,
})
export class HpPanel {
  readonly creature = input.required<Creature>();
  protected readonly store = inject(PartyStore);
  protected readonly ui = inject(UiPrefs);
  protected readonly types = DAMAGE_TYPES;
  protected readonly label = DAMAGE_LABEL;
  protected readonly three = [0, 1, 2];

  protected readonly pct = computed(() => {
    const { current, max } = this.creature().hp;
    return Math.max(0, Math.min(100, (current / max) * 100));
  });
  protected readonly statusLabel = computed(() => {
    const labels: Record<LifeStatus, string> = {
      alive: 'Alive',
      dying: 'Dying',
      stable: 'Stable',
      dead: 'Dead',
    };
    return this.ui.locale() === 'en'
      ? labels[this.creature().status]
      : STATUS[this.creature().status];
  });

  protected damageName(type: DamageType): string {
    return this.ui.locale() === 'en' ? type : this.label[type];
  }

  protected damage(amount: string, type: string): void {
    this.store.damage(this.creature().id, Number(amount) || 0, (type as DamageType) || undefined);
  }
}
