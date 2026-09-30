import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CONDITION_LABEL, CONDITIONS, ConditionName, Creature } from '@core/models/creature';
import { Pos } from '@core/models/grid';
import { Spell } from '@core/models/spell';
import { fmtBonus } from '@core/rules/creature';
import {
  moveQuery,
  occupiedCells,
  sizeOf,
  summarizeCombat,
  teamOf,
  tokenOf,
} from '@core/rules/encounter';
import { inCone, inSphere } from '@core/rules/grid/area';
import { canStand, distanceFt, findPath, reachable } from '@core/rules/grid/movement';
import { DiceTray3d } from '@features/dice/dice-3d/dice-tray-3d';
import type { StageDie } from '@features/dice/dice-3d/dice-stage';
import { DiceStore } from '@state/dice.store';
import { EncounterStore } from '@state/encounter.store';
import { getItem } from '@core/rules/inventory/catalog';
import { RoomService } from '@net/room.service';
import { PartyStore } from '@state/party.store';
import { UiPrefs } from '@state/ui-prefs';
import { FxView } from './fx-layer';
import { AreaPreview, MapView, TokenView } from './map-view';
import { BonusAction, bonusActionsOf } from '@core/rules/creature/features';
import { MiniatureQuery, queryFromCreature } from '@core/rules/srd/miniature';
import { MiniaturePicker } from '@features/creatures/miniature-picker';
import { iconFor, tokenImageFor } from './token-icons';
import { SpellPanel } from './spell-panel';

type Mode =
  | { kind: 'move' }
  | { kind: 'attack'; index: number }
  | { kind: 'help' }
  | { kind: 'cast'; spell: Spell; slot: number };

@Component({
  selector: 'app-combat-page',
  imports: [MapView, MiniaturePicker, SpellPanel, DiceTray3d],
  templateUrl: './combat-page.html',
  styleUrl: './combat-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatPage {
  protected readonly store = inject(EncounterStore);
  protected readonly party = inject(PartyStore);
  protected readonly diceStore = inject(DiceStore);
  protected readonly ui = inject(UiPrefs);
  protected readonly room = inject(RoomService);

  /** Régua: mede a distância entre dois pontos arrastando no mapa. */
  protected readonly rulerOn = signal(false);
  protected readonly rulerA = signal<Pos | null>(null);
  protected readonly rulerB = signal<Pos | null>(null);

  /** Rolagem em exibição sobre o mapa (a mesma para todos da mesa: vem do registro). */
  protected readonly roll = signal<{ dice: StageDie[]; seed: number; label: string } | null>(null);
  private lastSeq = this.store.state().seq;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  protected readonly fmt = fmtBonus;
  protected readonly conditions = CONDITIONS;
  protected readonly condLabel = CONDITION_LABEL;

  constructor() {
    // entradas novas do registro com dados → animação 3D (igual em todos os navegadores)
    effect(() => {
      const st = this.store.view();
      const from = this.lastSeq;
      this.lastSeq = st.seq;
      const fresh = st.log.filter((e) => e.id >= from && e.dice?.length);
      if (fresh.length)
        untracked(() =>
          this.diceStore.playSound(fresh.reduce((n, e) => n + (e.dice?.length ?? 0), 0)),
        );
      if (!this.diceStore.use3d() || this.still) return;
      if (fresh.length)
        untracked(() =>
          this.showRoll(
            fresh.flatMap((e) => e.dice ?? []),
            fresh,
          ),
        );
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.hideTimer));
  }

  private showRoll(
    dice: { sides: number; value: number; dropped: boolean }[],
    entries: { id: number; text: string }[],
  ): void {
    clearTimeout(this.hideTimer);
    const stage: StageDie[] = dice.slice(0, 12).map((d) => ({
      ...d,
      highlight:
        d.sides === 20 && !d.dropped
          ? d.value === 20
            ? 'crit'
            : d.value === 1
              ? 'fumble'
              : null
          : null,
    }));
    this.roll.set({
      dice: stage,
      seed: (entries[entries.length - 1].id * 2654435761) >>> 0,
      label: entries[0].text,
    });
  }

  /** Os dados pararam: some depois de um instante. */
  protected onRollSettled(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.roll.set(null), 2600);
  }

  /** O que este papel enxerga do encontro. */
  protected readonly s = this.store.view;

  /** Efeitos visuais em cartaz: as entradas novas do registro que trazem `fx`. */
  protected readonly effects = signal<FxView[]>([]);
  private readonly destroyRef = inject(DestroyRef);
  private fxSeen: number | null = null;
  private readonly fxWatch = effect(() => {
    const log = this.s().log;
    const top = log.length ? log[log.length - 1].id : -1;
    untracked(() => {
      if (this.fxSeen === null || top < this.fxSeen) {
        this.fxSeen = top; // primeira leitura ou encontro trocado: não reexibe o histórico
        return;
      }
      const seen = this.fxSeen;
      this.fxSeen = top;
      const fresh = log.filter((e) => e.id > seen && e.fx?.length);
      if (!fresh.length) return;
      const views = fresh.flatMap((e) => e.fx!.map((fx, i) => ({ key: `${e.id}-${i}`, fx })));
      this.effects.update((l) => [...l, ...views]);
      const keys = new Set(views.map((v) => v.key));
      const timer = setTimeout(
        () => this.effects.update((l) => l.filter((v) => !keys.has(v.key))),
        2400,
      );
      this.destroyRef.onDestroy(() => clearTimeout(timer));
    });
  });
  protected readonly combat = computed(() => this.s().combat);
  protected readonly isRemote = computed(() => !!this.store.remote());
  protected readonly isDm = computed(() => this.store.role().kind === 'dm');
  protected readonly running = computed(() => this.combat().phase === 'running');
  protected readonly summary = computed(() => summarizeCombat(this.s()));
  protected readonly showXp = signal(false);

  protected readonly selectedId = signal<string | null>(null);
  /** Criatura cujo seletor de miniatura está aberto. */
  protected readonly artFor = signal<string | null>(null);
  protected readonly mode = signal<Mode>({ kind: 'move' });
  protected readonly spellsOpen = signal(false);
  /** Célula sob o cursor (para a prévia de área). */
  protected readonly hover = signal<Pos | null>(null);
  /** Nocaute (SRD 2024): declarado junto com o próximo ataque corpo a corpo. */
  protected readonly knockOut = signal(false);

  protected readonly active = computed(() => this.creature(this.combat().turn?.actorId));
  /** SRD 2024 e a arma escolhida é corpo a corpo: dá para oferecer o nocaute. */
  protected readonly canKnockOut = computed(() => {
    const weapon = this.active()?.attacks[this.attackIndex()];
    return this.ui.ruleset() === '2024' && !!weapon && weapon.range <= 5;
  });
  /** Quem está na vez é controlado por quem está usando? */
  protected readonly canAct = computed(() => {
    const a = this.active();
    const role = this.store.role();
    return !!a && this.running() && (role.kind === 'dm' || role.owns.includes(a.id));
  });
  protected readonly selected = computed(() =>
    this.creature(this.selectedId() ?? this.active()?.id),
  );
  protected artQuery(c: Creature): MiniatureQuery {
    return queryFromCreature(c);
  }

  /** Ao posicionar um NPC/monstro à mão, já oferece as miniaturas que combinam com a ficha. */
  protected openArt(c: Creature): void {
    if (c.kind !== 'pc' && !c.tokenArt) this.artFor.set(c.id);
  }

  protected names(creatures: Creature[]): string {
    return creatures.map((c) => c.name).join(', ');
  }
  protected resetCombat(): void {
    if (this.store.send({ type: 'resetCombat' })) this.showXp.set(false);
  }

  protected exportSession(): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([this.store.exportSession()], { type: 'application/json' }),
    );
    a.download = `${this.store.state().name.replace(/[^\w-]+/g, '-') || 'sessao'}.runegrid-session.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  protected async importSession(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!this.store.importSession(await file.text())) {
      this.store.message.set(
        this.ui.text(
          'Arquivo inválido ou versão de sessão incompatível.',
          'Invalid file or incompatible session version.',
        ),
      );
      return;
    }
    this.selectedId.set(null);
    this.showXp.set(false);
    this.store.message.set(this.ui.text('Sessão importada.', 'Session imported.'));
  }
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
          icon: iconFor(c),
          image: tokenImageFor(c),
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

  /** Caminho até a célula sob o cursor (custo em pés), só no modo de movimento. */
  protected readonly path = computed(() => {
    const a = this.active();
    const h = this.hover();
    if (!a || !h || !this.canAct() || this.mode().kind !== 'move' || this.rulerOn()) return null;
    if (!this.reach().some((c) => c.x === h.x && c.y === h.y)) return null;
    try {
      const found = findPath(moveQuery(this.s(), a.id), h);
      const start = tokenOf(this.s(), a.id)?.pos;
      return found && start ? { cells: [start, ...found.path], label: `${found.costFt} ft` } : null;
    } catch {
      return null;
    }
  });

  protected readonly ruler = computed(() => {
    const a = this.rulerA();
    const b = this.rulerB();
    if (!a || !b) return null;
    return { a, b, label: `${distanceFt(a, 1, b, 1, this.s().rule)} ft` };
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

    if (m.kind === 'attack' || m.kind === 'help') {
      const reach = m.kind === 'help' ? 5 : a.attacks[m.index]?.range;
      if (!reach) return out;
      for (const t of st.tokens) {
        const o = this.creature(t.creatureId);
        if (!o || o.id === a.id || teamOf(o) === teamOf(a) || o.status === 'dead') continue;
        if (distanceFt(from.pos, sizeOf(a), t.pos, sizeOf(o), st.rule) <= reach) out.add(o.id);
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

  /** Reações à espera: o Mestre vê todas; o jogador, as dos seus personagens (a projeção já filtra). */
  protected readonly reactions = computed(() => this.combat().pending ?? []);

  protected readonly logView = computed(() => [...this.s().log].reverse().slice(0, 60));

  protected secretRoll(expr: string): void {
    if (expr.trim()) this.store.send({ type: 'secretRoll', expr: expr.trim() });
  }

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
    return teamOf(c) === 'foes' ? this.ui.text('Inimigo', 'Enemy') : this.ui.text('Grupo', 'Party');
  }

  protected conditionName(condition: ConditionName): string {
    return this.ui.locale() === 'en'
      ? condition.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
      : this.condLabel[condition];
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

  protected toggleRuler(): void {
    this.rulerOn.update((v) => !v);
    this.rulerA.set(null);
    this.rulerB.set(null);
  }

  protected rulerStart(pos: Pos): void {
    this.rulerA.set(pos);
    this.rulerB.set(pos);
  }

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
      if (
        this.store.send({
          type: 'attack',
          actorId: a.id,
          targetId: id,
          attackIndex: m.index,
          knockOut: this.canKnockOut() && this.knockOut(),
        })
      ) {
        this.mode.set({ kind: 'move' });
        this.knockOut.set(false);
      }
      return;
    }
    if (m.kind === 'help' && a && id !== a.id) {
      if (this.store.send({ type: 'help', actorId: a.id, targetId: id })) {
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

  protected toggleHelp(): void {
    this.mode.update((m) => (m.kind === 'help' ? { kind: 'move' } : { kind: 'help' }));
  }

  /** Ações que o personagem ativo pode fazer como ação bônus (Ação Astuta, Fuga Ágil). */
  protected readonly bonusActions = computed(() => bonusActionsOf(this.active() ?? {}));

  protected bonusAct(type: BonusAction): void {
    const a = this.active();
    if (!a) return;
    this.store.send({ type, actorId: a.id, bonus: true });
    this.resetMode();
  }

  protected act(
    type: 'dash' | 'dodge' | 'disengage' | 'hide' | 'deathSave' | 'endTurn' | 'standUp',
  ): void {
    const a = this.active();
    if (!a) return;
    this.store.send({ type, actorId: a.id });
    this.resetMode();
  }

  /** Consumíveis do personagem ativo (poções etc.). */
  protected readonly consumables = computed(() =>
    (this.active()?.inventory ?? []).flatMap((i) => {
      const d = getItem(i.ref);
      return d?.consume ? [{ id: i.id, name: `${d.name}${i.qty > 1 ? ' ×' + i.qty : ''}` }] : [];
    }),
  );

  protected useItem(itemId: string): void {
    const a = this.active();
    if (a) this.store.send({ type: 'useItem', actorId: a.id, itemId });
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

  protected react(actorId: string, use: boolean): void {
    this.store.send({ type: 'reaction', actorId, use });
  }

  protected nameOf(id: string): string {
    return this.store.state().creatures.find((c) => c.id === id)?.name ?? '?';
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
