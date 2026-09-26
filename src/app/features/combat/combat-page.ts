import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CONDITION_LABEL, CONDITIONS, ConditionName, Creature } from '@core/models/creature';
import { Pos } from '@core/models/grid';
import { Spell } from '@core/models/spell';
import { fmtBonus } from '@core/rules/creature';
import { moveQuery, occupiedCells, sizeOf, teamOf, tokenOf } from '@core/rules/encounter';
import { inCone, inSphere } from '@core/rules/grid/area';
import { canStand, distanceFt, reachable } from '@core/rules/grid/movement';
import { EncounterStore } from '@state/encounter.store';
import { PartyStore } from '@state/party.store';
import { AreaPreview, MapView, TokenView } from './map-view';
import { SpellPanel } from './spell-panel';

type Mode =
  | { kind: 'move' }
  | { kind: 'attack'; index: number }
  | { kind: 'cast'; spell: Spell; slot: number };

@Component({
  selector: 'app-combat-page',
  imports: [MapView, SpellPanel],
  templateUrl: './combat-page.html',
  styleUrl: './combat-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatPage {
  protected readonly store = inject(EncounterStore);
  protected readonly party = inject(PartyStore);
  protected readonly fmt = fmtBonus;
  protected readonly conditions = CONDITIONS;
  protected readonly condLabel = CONDITION_LABEL;

  /** O que este papel enxerga do encontro. */
  protected readonly s = this.store.view;
  protected readonly combat = computed(() => this.s().combat);
  protected readonly isDm = computed(() => this.store.role().kind === 'dm');
  protected readonly running = computed(() => this.combat().phase === 'running');

  protected readonly selectedId = signal<string | null>(null);
  protected readonly mode = signal<Mode>({ kind: 'move' });
  protected readonly spellsOpen = signal(false);
  /** Célula sob o cursor (para a prévia de área). */
  protected readonly hover = signal<Pos | null>(null);

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
  protected readonly isProne = computed(
    () => !!this.active()?.conditions.some((c) => c.name === 'prone'),
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

  /** Prévia da área da magia em preparo (esfera no cursor, cone na direção do cursor). */
  protected readonly preview = computed<AreaPreview | null>(() => {
    const m = this.mode();
    const a = this.active();
    const h = this.hover();
    if (m.kind !== 'cast' || !a || !h) return null;
    const from = tokenOf(this.s(), a.id);
    if (!from) return null;
    const t = m.spell.target;
    if (t.kind === 'sphere') return { kind: 'sphere', center: h, radiusFt: t.radius };
    if (t.kind === 'cone') {
      return {
        kind: 'cone',
        origin: from.pos,
        originSize: sizeOf(a),
        toward: h,
        lengthFt: t.length,
      };
    }
    return null;
  });

  /** Criaturas do encontro que ainda não estão no mapa (só o Mestre vê). */
  protected readonly unplaced = computed(() =>
    this.store.state().creatures.filter((c) => !tokenOf(this.store.state(), c.id)),
  );

  /** Com o combate em andamento: criaturas no mapa que ainda não estão na iniciativa. */
  protected readonly outside = computed(() => {
    const st = this.store.state();
    if (st.combat.phase !== 'running') return [];
    return st.creatures.filter((c) => tokenOf(st, c.id) && !st.combat.order.includes(c.id));
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
          conditions: c.conditions.length,
          concentrating: !!c.concentration,
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

  /** Criaturas destacadas: alvos válidos do ataque/magia ou atingidas pela área em prévia. */
  protected readonly targetIds = computed(() => {
    const m = this.mode();
    const a = this.active();
    const out = new Set<string>();
    if (m.kind === 'move' || !a || !this.canAct()) return out;
    const st = this.s();
    const from = tokenOf(st, a.id);
    if (!from) return out;

    if (m.kind === 'attack') {
      const weapon = a.attacks[m.index];
      if (!weapon) return out;
      for (const t of st.tokens) {
        const o = this.creature(t.creatureId);
        if (!o || o.id === a.id || teamOf(o) === teamOf(a) || o.status === 'dead') continue;
        if (distanceFt(from.pos, sizeOf(a), t.pos, sizeOf(o), st.rule) <= weapon.range)
          out.add(o.id);
      }
      return out;
    }

    const target = m.spell.target;
    for (const t of st.tokens) {
      const o = this.creature(t.creatureId);
      if (!o) continue;
      if (target.kind === 'creature') {
        const ok = o.status !== 'dead' || !!m.spell.heal;
        if (ok && distanceFt(from.pos, sizeOf(a), t.pos, sizeOf(o), st.rule) <= m.spell.range)
          out.add(o.id);
      } else {
        const h = this.hover();
        if (!h || o.status === 'dead') continue;
        const hit =
          target.kind === 'sphere'
            ? inSphere(h, target.radius, t.pos, sizeOf(o))
            : inCone(from.pos, sizeOf(a), h, target.length, t.pos, sizeOf(o));
        if (hit && !(target.kind === 'cone' && o.id === a.id)) out.add(o.id);
      }
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
    this.resetMode();
  }

  private resetMode(): void {
    this.mode.set({ kind: 'move' });
    this.spellsOpen.set(false);
    this.hover.set(null);
  }

  // ---------- interação com o mapa ----------

  protected onCell(pos: Pos): void {
    const m = this.mode();
    const a = this.active();
    if (m.kind === 'cast' && a && m.spell.target.kind !== 'creature') {
      // magia de área: o clique define o ponto (esfera) ou a direção (cone)
      if (
        this.store.send({
          type: 'cast',
          actorId: a.id,
          spellId: m.spell.id,
          slotLevel: m.slot,
          point: pos,
        })
      ) {
        this.resetMode();
      }
      return;
    }
    this.tryMove(this.running() ? a?.id : this.selected()?.id, pos);
  }

  protected onToken(id: string): void {
    const m = this.mode();
    const a = this.active();
    if (m.kind === 'attack' && a && id !== a.id) {
      if (this.store.send({ type: 'attack', actorId: a.id, targetId: id, attackIndex: m.index })) {
        this.mode.set({ kind: 'move' });
      }
      return;
    }
    if (m.kind === 'cast' && a) {
      const ok =
        m.spell.target.kind === 'creature'
          ? this.store.send({
              type: 'cast',
              actorId: a.id,
              spellId: m.spell.id,
              slotLevel: m.slot,
              targetId: id,
            })
          : this.store.send({
              type: 'cast',
              actorId: a.id,
              spellId: m.spell.id,
              slotLevel: m.slot,
              point: tokenOf(this.s(), id)?.pos,
            });
      if (ok) this.resetMode();
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
    this.spellsOpen.set(false);
    this.mode.set(
      m.kind === 'attack' && m.index === index ? { kind: 'move' } : { kind: 'attack', index },
    );
  }

  protected toggleSpells(): void {
    const open = !this.spellsOpen();
    this.spellsOpen.set(open);
    if (!open) this.mode.set({ kind: 'move' });
  }

  /** O painel de magias escolheu uma magia e um espaço (ou limpou a escolha). */
  protected onSpell(pick: { spell: Spell; slot: number } | null): void {
    this.mode.set(pick ? { kind: 'cast', spell: pick.spell, slot: pick.slot } : { kind: 'move' });
  }

  protected act(type: 'dash' | 'dodge' | 'disengage' | 'deathSave' | 'endTurn' | 'standUp'): void {
    const a = this.active();
    if (!a) return;
    this.store.send({ type, actorId: a.id });
    this.resetMode();
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

  protected addCondition(id: string, name: string, rounds: string): void {
    const n = Number(rounds);
    this.store.send({
      type: 'addCondition',
      targetId: id,
      condition: name as ConditionName,
      rounds: n > 0 ? Math.floor(n) : undefined,
    });
  }

  protected removeCondition(id: string, name: ConditionName): void {
    this.store.send({ type: 'removeCondition', targetId: id, condition: name });
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
