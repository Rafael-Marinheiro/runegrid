import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Creature, CreatureKind, DamageType } from '@core/models/creature';
import { newCreature, sampleCreatures } from '@core/models/creature-factory';
import {
  addTempHp,
  applyDamage,
  DamageResult,
  DeathSaveResult,
  heal,
  rest,
  rollDeathSave,
  RuleError,
  spendResource,
  spendSlot,
  restoreSlot,
  stabilize,
} from '@core/rules/creature';
import { RNG } from './rng.token';

const KEY = 'runegrid.creatures.v3';

function load(): Creature[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const ok =
      Array.isArray(raw) &&
      raw.every(
        (c) => typeof c?.id === 'string' && typeof c?.name === 'string' && c.hp && c.abilities,
      );
    return ok && raw.length ? (raw as Creature[]) : null;
  } catch {
    return null; // armazenamento indisponível ou corrompido: começa do exemplo
  }
}

/** Criaturas do grupo/encontro. Toda mudança passa por regras puras de `core/rules`. */
@Injectable({ providedIn: 'root' })
export class PartyStore {
  private readonly rng = inject(RNG);

  readonly creatures = signal<Creature[]>(load() ?? sampleCreatures());
  readonly selectedId = signal<string | null>(this.creatures()[0]?.id ?? null);
  readonly selected = computed(() => this.creatures().find((c) => c.id === this.selectedId()));
  /** Última mensagem de regra (para um aria-live e feedback visual). */
  readonly message = signal('');

  constructor() {
    effect(() => {
      const data = JSON.stringify(this.creatures());
      try {
        localStorage.setItem(KEY, data);
      } catch {
        /* sem armazenamento: segue só em memória */
      }
    });
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.message.set('');
  }

  add(kind: CreatureKind): void {
    const c = newCreature(kind);
    this.creatures.update((list) => [...list, c]);
    this.select(c.id);
  }

  duplicate(id: string): void {
    const src = this.creatures().find((c) => c.id === id);
    if (!src) return;
    const copy = { ...structuredClone(src), id: crypto.randomUUID(), name: `${src.name} (cópia)` };
    this.creatures.update((list) => [...list, copy]);
    this.select(copy.id);
  }

  remove(id: string): void {
    const list = this.creatures().filter((c) => c.id !== id);
    this.creatures.set(list);
    if (this.selectedId() === id) this.selectedId.set(list[0]?.id ?? null);
  }

  update(id: string, fn: (c: Creature) => Creature): void {
    this.creatures.update((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  }

  patch(id: string, changes: Partial<Creature>): void {
    this.update(id, (c) => ({ ...c, ...changes }));
  }

  setMaxHp(id: string, max: number): void {
    const m = Math.max(1, Math.floor(max) || 1);
    this.update(id, (c) => ({ ...c, hp: { ...c.hp, max: m, current: Math.min(c.hp.current, m) } }));
  }

  damage(id: string, amount: number, type?: DamageType): DamageResult | undefined {
    return this.run(id, (c) => {
      const r = applyDamage(c, amount, { type });
      const parts = [`${c.name} sofreu ${r.dealt} de dano`];
      if (r.absorbedByTemp) parts.push(`(${r.absorbedByTemp} absorvido por PV temporários)`);
      if (r.instantDeath) parts.push('— morte instantânea!');
      else if (r.creature.status === 'dead') parts.push('— morreu.');
      else if (r.dropped) parts.push('— caiu a 0 PV.');
      return { next: r.creature, message: parts.join(' ') + '.', value: r };
    });
  }

  heal(id: string, amount: number): void {
    this.run(id, (c) => ({ next: heal(c, amount), message: `${c.name} recuperou PV.` }));
  }

  tempHp(id: string, amount: number): void {
    this.run(id, (c) => ({
      next: addTempHp(c, amount),
      message: `${c.name} recebeu PV temporários.`,
    }));
  }

  deathSave(id: string): DeathSaveResult | undefined {
    return this.run(id, (c) => {
      const r = rollDeathSave(c, this.rng);
      const text: Record<DeathSaveResult['outcome'], string> = {
        success: 'sucesso',
        failure: 'falha',
        'critical-failure': 'falha crítica (2 falhas)',
        revived: '20 natural: volta com 1 PV!',
        stable: 'estabilizou',
        dead: 'morreu',
      };
      return {
        next: r.creature,
        message: `${c.name}: d20 ${r.roll} — ${text[r.outcome]}.`,
        value: r,
      };
    });
  }

  stabilize(id: string): void {
    this.run(id, (c) => ({ next: stabilize(c), message: `${c.name} estabilizou.` }));
  }

  rest(id: string, kind: 'short' | 'long'): void {
    this.run(id, (c) => ({
      next: rest(c, kind),
      message: `${c.name} fez um descanso ${kind === 'short' ? 'curto' : 'longo'}.`,
    }));
  }

  /** Clique no espaço: gasta se disponível, senão devolve (correção do Mestre). */
  toggleSlot(id: string, level: number, spend: boolean): void {
    this.run(id, (c) => ({
      next: spend ? spendSlot(c, level) : restoreSlot(c, level),
      message: spend ? `${c.name} gastou um espaço de ${level}º nível.` : '',
    }));
  }

  setSlotMax(id: string, level: number, max: number): void {
    this.update(id, (c) => {
      const slots = { ...c.spellSlots };
      const m = Math.max(0, Math.min(9, Math.floor(max) || 0));
      if (m === 0) delete slots[level];
      else slots[level] = { max: m, used: Math.min(slots[level]?.used ?? 0, m) };
      return { ...c, spellSlots: slots };
    });
  }

  addResource(id: string, name: string, max: number, recharge: 'short' | 'long'): void {
    const n = name.trim();
    if (!n) return;
    this.update(id, (c) =>
      c.resources.some((r) => r.name === n)
        ? c
        : {
            ...c,
            resources: [...c.resources, { name: n, max: Math.max(1, max || 1), used: 0, recharge }],
          },
    );
  }

  removeResource(id: string, name: string): void {
    this.update(id, (c) => ({ ...c, resources: c.resources.filter((r) => r.name !== name) }));
  }

  useResource(id: string, name: string): void {
    this.run(id, (c) => ({ next: spendResource(c, name), message: `${c.name} usou ${name}.` }));
  }

  /** Aplica uma regra; erros de regra viram mensagem em vez de quebrar a tela. */
  private run<T>(
    id: string,
    fn: (c: Creature) => { next: Creature; message: string; value?: T },
  ): T | undefined {
    const c = this.creatures().find((x) => x.id === id);
    if (!c) return undefined;
    try {
      const { next, message, value } = fn(c);
      this.update(id, () => next);
      this.message.set(message);
      return value;
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      this.message.set(e.message);
      return undefined;
    }
  }
}
