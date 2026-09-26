import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Creature } from '@core/models/creature';
import { Pos } from '@core/models/grid';
import { fmtBonus } from '@core/rules/creature';
import { moveQuery, occupiedCells, sizeOf, teamOf, tokenOf } from '@core/rules/encounter';
import { canStand, distanceFt, reachable } from '@core/rules/grid/movement';
import { EncounterStore } from '@state/encounter.store';
import { PartyStore } from '@state/party.store';
import { MapView, TokenView } from './map-view';

type Mode = { kind: 'move' } | { kind: 'attack'; index: number };

@Component({
  selector: 'app-combat-page',
  imports: [MapView],
  templateUrl: './combat-page.html',
  styleUrl: './combat-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatPage {
  protected readonly store = inject(EncounterStore);
  protected readonly party = inject(PartyStore);
  protected readonly fmt = fmtBonus;
  protected readonly pips = [0, 1, 2];

  /** O que este papel enxerga do encontro. */
  protected readonly s = this.store.view;
  protected readonly combat = computed(() => this.s().combat);
  protected readonly isDm = computed(() => this.store.role().kind === 'dm');
  protected readonly running = computed(() => this.combat().phase === 'running');

  protected readonly selectedId = signal<string | null>(null);
  protected readonly mode = signal<Mode>({ kind: 'move' });

  protected readonly active = computed(() => this.creature(this.combat().turn?.actorId));
  /** Quem está na vez é controlado por quem está usando? */
  protected readonly canAct = computed(() => {
    const a = this.active();
    const role = this.store.role();
    return !!a && this.running() && (role.kind === 'dm' || role.owns.includes(a.id));
  });
  protected readonly selected = computed(() =>
    this.creature(this.selectedId() ?? this.active()?.id),
  );

  /** Personagens que podem ser "vistos como" (visão de jogador). */
  protected readonly playable = computed(() =>
    this.store.state().creatures.filter((c) => c.kind !== 'monster'),
  );
  protected readonly roleValue = computed(() => {
    const r = this.store.role();
    return r.kind === 'dm' ? 'dm' : r.owns[0];
  });

  protected readonly order = computed(() => {
    const st = this.s();
    const ids =
      this.running() || this.combat().phase === 'ended'
        ? this.combat().order
        : st.tokens.map((t) => t.creatureId);
    return ids.map((id) => this.creature(id)).filter((c): c is Creature => !!c);
  });

  protected readonly tokens = computed<TokenView[]>(() => {
    const st = this.s();
    const active = this.combat().turn?.actorId;
    const sel = this.selected()?.id;
    const targets = this.targetIds();
    return st.tokens.flatMap((t) => {
      const c = st.creatures.find((x) => x.id === t.creatureId);
      if (!c) return [];
      return [
        {
          id: c.id,
          name: c.name,
          letter: c.name.trim().charAt(0).toUpperCase(),
          pos: t.pos,
          size: sizeOf(c),
          team: teamOf(c),
          hpPct: this.hpPct(c),
          hidden: !!t.hidden,
          dead: c.status === 'dead',
          active: c.id === active,
          selected: c.id === sel,
          targetable: targets.has(c.id),
        },
      ];
    });
  });

  /** Células que a criatura na vez pode alcançar (as mesmas que o reducer aceita). */
  protected readonly reach = computed<Pos[]>(() => {
    const a = this.active();
    if (!a || !this.canAct() || this.mode().kind !== 'move') return [];
    const st = this.s();
    try {
      const q = moveQuery(st, a.id);
      const others = occupiedCells(st, (o) => o.id !== a.id);
      return reachable(q)
        .filter((r) => canStand(st.map, r.pos, q.size, others))
        .map((r) => r.pos);
    } catch {
      return []; // sem deslocamento restante
    }
  });

  protected readonly targetIds = computed(() => {
    const m = this.mode();
    const a = this.active();
    const out = new Set<string>();
    if (m.kind !== 'attack' || !a || !this.canAct()) return out;
    const weapon = a.attacks[m.index];
    const from = tokenOf(this.s(), a.id);
    if (!weapon || !from) return out;
    for (const t of this.s().tokens) {
      const o = this.creature(t.creatureId);
      if (!o || o.id === a.id || teamOf(o) === teamOf(a) || o.status === 'dead') continue;
      if (distanceFt(from.pos, sizeOf(a), t.pos, sizeOf(o), this.s().rule) <= weapon.range)
        out.add(o.id);
    }
    return out;
  });

  protected readonly logView = computed(() => [...this.s().log].reverse().slice(0, 60));

  protected creature(id?: string | null): Creature | undefined {
    return id ? this.s().creatures.find((c) => c.id === id) : undefined;
  }

  protected hpPct(c: Creature): number {
    return c.hp.max ? Math.max(0, Math.min(100, (c.hp.current / c.hp.max) * 100)) : 0;
  }

  /** Jogador vê só a porcentagem de PV dos inimigos. */
  protected hpLabel(c: Creature): string {
    const role = this.store.role();
    const hiddenExact = role.kind === 'player' && teamOf(c) === 'foes' && !role.owns.includes(c.id);
    return hiddenExact ? `${c.hp.current}%` : `${c.hp.current}/${c.hp.max}`;
  }

  protected teamLabel(c: Creature): string {
    return teamOf(c) === 'foes' ? 'Inimigo' : 'Grupo';
  }

  protected setRole(value: string): void {
    this.store.role.set(value === 'dm' ? { kind: 'dm' } : { kind: 'player', owns: [value] });
    this.mode.set({ kind: 'move' });
  }

  // ---------- interação com o mapa ----------

  protected onCell(pos: Pos): void {
    this.tryMove(this.running() ? this.active()?.id : this.selected()?.id, pos);
  }

  protected onToken(id: string): void {
    const m = this.mode();
    const a = this.active();
    if (m.kind === 'attack' && a && id !== a.id) {
      if (this.store.send({ type: 'attack', actorId: a.id, targetId: id, attackIndex: m.index })) {
        // depois do ataque volta ao modo de movimento
        this.mode.set({ kind: 'move' });
      }
      return;
    }
    this.selectedId.set(id);
  }

  protected onTokenMove(e: { id: string; pos: Pos }): void {
    this.selectedId.set(e.id);
    this.tryMove(e.id, e.pos);
  }

  protected onNudge(e: { id: string; dx: number; dy: number }): void {
    const t = tokenOf(this.s(), e.id);
    if (t) this.tryMove(e.id, { x: t.pos.x + e.dx, y: t.pos.y + e.dy });
  }

  /** Em montagem o Mestre posiciona livremente; em combate só se move a criatura na vez. */
  private tryMove(id: string | undefined, pos: Pos): void {
    if (!id) return;
    if (this.running()) this.store.send({ type: 'move', actorId: id, to: pos });
    else this.store.send({ type: 'placeToken', id, pos });
  }

  // ---------- ações ----------

  protected attackIndex(): number {
    const m = this.mode();
    return m.kind === 'attack' ? m.index : -1;
  }

  protected chooseAttack(index: number): void {
    const m = this.mode();
    this.mode.set(
      m.kind === 'attack' && m.index === index ? { kind: 'move' } : { kind: 'attack', index },
    );
  }

  protected act(type: 'dash' | 'dodge' | 'disengage' | 'deathSave' | 'endTurn'): void {
    const a = this.active();
    if (!a) return;
    this.store.send({ type, actorId: a.id });
    this.mode.set({ kind: 'move' });
  }

  protected setInitiative(id: string, value: string): void {
    const n = Number(value);
    if (Number.isFinite(n)) this.store.send({ type: 'setInitiative', id, value: Math.floor(n) });
  }

  protected damage(id: string, amount: string): void {
    this.store.send({ type: 'damage', targetId: id, amount: Number(amount) || 0 });
  }

  protected heal(id: string, amount: string): void {
    this.store.send({ type: 'heal', targetId: id, amount: Number(amount) || 0 });
  }

  protected hasToken(id: string): boolean {
    return !!tokenOf(this.s(), id);
  }

  protected isHidden(id: string): boolean {
    return !!tokenOf(this.s(), id)?.hidden;
  }

  protected budget(): { moved: number; max: number } {
    const a = this.active();
    const t = this.combat().turn;
    return a && t ? { moved: t.movedFt, max: a.speed * (t.dashed ? 2 : 1) } : { moved: 0, max: 0 };
  }
}
