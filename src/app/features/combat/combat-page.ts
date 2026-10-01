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
import { FEATURE_RESOURCE, featureUses, fmtBonus, LimitedFeature } from '@core/rules/creature';
import { abilitiesOf, legendaryActionsOf } from '@core/rules/monsters/registry';
import { spellNameEn } from '@core/rules/srd/names-pt';
import {
  defaultMoveKind,
  moveQuery,
  type MoveKind,
  ownsCreature,
  occupiedCells,
  sizeOf,
  summarizeCombat,
  teamOf,
  tokenOf,
} from '@core/rules/encounter';
import { inArea } from '@core/rules/encounter/zones';
import { attackAllowed } from '@core/rules/encounter/forms';
import { reactionSpells, redirectAllies } from '@core/rules/encounter/reactions';
import { getSpell } from '@core/rules/spells/data';
import { canStand, distanceFt, findPath, reachable } from '@core/rules/grid/movement';
import { DiceTray3d } from '@features/dice/dice-3d/dice-tray-3d';
import type { StageDie } from '@features/dice/dice-3d/dice-stage';
import { DiceStore } from '@state/dice.store';
import { EncounterStore } from '@state/encounter.store';
import { getItem } from '@core/rules/inventory/catalog';
import { RoomService } from '@net/room.service';
import { PartyStore } from '@state/party.store';
import { SpellStore } from '@state/spell.store';
import { UiPrefs } from '@state/ui-prefs';
import { FxView } from './fx-layer';
import { AreaPreview, MapView, TokenView } from './map-view';
import { ZoneView } from './zone-layer';
import { BonusAction, bonusActionsOf } from '@core/rules/creature/features';
import { MiniatureQuery, queryFromCreature } from '@core/rules/srd/miniature';
import { MiniaturePicker } from '@features/creatures/miniature-picker';
import { iconFor, tokenImageFor } from './token-icons';
import { SpellPanel } from './spell-panel';
import { DmTools } from './dm-tools';

type Mode =
  | { kind: 'move' }
  | { kind: 'attack'; index: number }
  | { kind: 'help' }
  | {
      kind: 'cast';
      spell: Spell;
      slot: number;
      sustain?: boolean;
      option?: string;
      picked: string[];
    };

@Component({
  selector: 'app-combat-page',
  imports: [MapView, MiniaturePicker, SpellPanel, DiceTray3d, DmTools],
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
  private readonly spellStore = inject(SpellStore);

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
  protected readonly spellEn = spellNameEn;

  constructor() {
    effect(() => void this.spellStore.ensure(this.ui.ruleset()));
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
  /** Como a criatura se move agora (voo, natação…); `null` = o padrão do motor. */
  protected readonly moveKindSig = signal<MoveKind | null>(null);
  protected moveKind(): MoveKind {
    const a = this.active();
    const want = this.moveKindSig();
    return a && want && this.moveKinds(a).includes(want) ? want : a ? defaultMoveKind(a) : 'walk';
  }
  /** Modos de deslocamento da criatura; só aparecem quando há mais de um. */
  protected moveKinds(c: Creature): MoveKind[] {
    const sp = c.speeds ?? {};
    const all: MoveKind[] = ['walk'];
    if (sp.fly) all.push('fly');
    if (sp.swim) all.push('swim');
    if (sp.climb) all.push('climb');
    if (sp.burrow) all.push('burrow');
    return all.length > 1 ? all : [];
  }
  protected moveLabel(k: MoveKind): string {
    return {
      walk: this.ui.text('Andar', 'Walk'),
      fly: this.ui.text('Voar', 'Fly'),
      swim: this.ui.text('Nadar', 'Swim'),
      climb: this.ui.text('Escalar', 'Climb'),
      burrow: this.ui.text('Escavar', 'Burrow'),
    }[k];
  }
  /** Célula sob o cursor (para a prévia de área). */
  protected readonly hover = signal<Pos | null>(null);
  /** Nocaute (SRD 2024): declarado junto com o próximo ataque corpo a corpo. */
  protected readonly knockOut = signal(false);

  protected readonly active = computed(() => this.creature(this.combat().turn?.actorId));
  /** Monstro que usa uma ação lendária fora do turno dele (senão, quem está na vez). */
  protected readonly legendActorId = signal<string | null>(null);
  protected readonly castActor = computed(() =>
    this.legendActorId() ? this.creature(this.legendActorId()!) : this.active(),
  );
  /** Monstros com ações lendárias sobrando que podem agir agora (fora do próprio turno). */
  protected readonly legendary = computed(() => {
    this.spellStore.version();
    if (!this.running() || this.combat().pending?.length) return [];
    const turn = this.combat().turn?.actorId;
    return this.s().creatures.flatMap((c) => {
      if (c.id === turn || c.status !== 'alive' || !this.combat().order.includes(c.id)) return [];
      const max = legendaryActionsOf(c);
      if (!max) return [];
      const left = c.legendary?.left ?? max;
      const acts = abilitiesOf(c).filter(
        (a) => a.ability?.cost === 'legendary' && (a.ability.legendary ?? 1) <= left,
      );
      return acts.length && left > 0 ? [{ c, left, max, acts }] : [];
    });
  });
  /** SRD 2024 e a arma escolhida é corpo a corpo: dá para oferecer o nocaute. */
  protected readonly canKnockOut = computed(() => {
    const weapon = this.active()?.attacks[this.attackIndex()];
    return this.ui.ruleset() === '2024' && !!weapon && weapon.range <= 5;
  });
  /** Quem está na vez é controlado por quem está usando? */
  protected readonly canAct = computed(() => {
    const a = this.active();
    const role = this.store.role();
    return !!a && this.running() && ownsCreature(this.s(), role, a.id);
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
  protected setEnvironment(e: { sunlight?: boolean; runningWater?: boolean }): void {
    this.store.send({ type: 'setEnvironment', ...e });
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

  /** Alvo efetivo da magia em preparo (a repetição pode mudar o alvo). */
  protected castTarget(m: Extract<Mode, { kind: 'cast' }>): Spell['target'] {
    return m.sustain && m.spell.sustain?.use?.target ? m.spell.sustain.use.target : m.spell.target;
  }

  /** O alvo dispensa clique no mapa (afeta o conjurador ou nasce nele): basta confirmar. */
  protected selfOnly(m: Extract<Mode, { kind: 'cast' }>): boolean {
    const t = this.castTarget(m);
    return t.kind === 'self' || (t.kind === 'sphere' && !!t.self);
  }

  /** Quantos alvos o clique escolhe (1 = conjura logo no primeiro clique). */
  protected maxTargets(m: Extract<Mode, { kind: 'cast' }>): number {
    const t = this.castTarget(m);
    if (t.kind !== 'creature') return 1;
    return (t.max ?? 1) + (t.perLevel ?? 0) * Math.max(0, m.slot - m.spell.level);
  }

  /** Prévia da área da magia em preparo (esfera no cursor, cone na direção do cursor). */
  protected readonly preview = computed<AreaPreview | null>(() => {
    const m = this.mode();
    const a = this.castActor();
    const h = this.hover();
    if (m.kind !== 'cast' || !a) return null;
    const from = tokenOf(this.s(), a.id);
    if (!from) return null;
    const t = this.castTarget(m);
    if (t.kind === 'sphere' && t.self)
      return { kind: 'sphere', center: from.pos, radiusFt: t.radius };
    if (!h) return null;
    if (t.kind === 'sphere') return { kind: 'sphere', center: h, radiusFt: t.radius };
    if (t.kind === 'cube' && !t.self) return { kind: 'cube', center: h, sizeFt: t.size };
    if (t.kind === 'cone' || (t.kind === 'cube' && t.self)) {
      return {
        kind: 'cone',
        origin: from.pos,
        originSize: sizeOf(a),
        toward: h,
        lengthFt: t.kind === 'cone' ? t.length : t.size,
      };
    }
    if (t.kind === 'line') {
      return {
        kind: 'line',
        origin: from.pos,
        originSize: sizeOf(a),
        toward: h,
        lengthFt: t.length,
        widthFt: t.width,
      };
    }
    return null;
  });

  /** Áreas de magia ativas, em pixels do mapa (48 px por célula). */
  protected readonly zoneViews = computed<ZoneView[]>(() => {
    const st = this.s();
    const C = 48;
    return (st.zones ?? []).flatMap((z): ZoneView[] => {
      const caster = tokenOf(st, z.casterId);
      const origin = z.aura && caster ? caster.pos : z.center;
      const size = caster ? sizeOf(st.creatures.find((c) => c.id === z.casterId)!) : 1;
      const color = z.color ?? 'arcane';
      const base = { id: z.id, name: z.name, color, obscures: z.obscures };
      const sh = z.shape;
      if (sh.kind === 'sphere') {
        const c = z.aura
          ? { x: origin.x + size / 2, y: origin.y + size / 2 }
          : { x: origin.x + 0.5, y: origin.y + 0.5 };
        return [
          { ...base, shape: { kind: 'circle', cx: c.x * C, cy: c.y * C, r: (sh.radius / 5) * C } },
        ];
      }
      if (sh.kind === 'cube' && !sh.self) {
        const h = (sh.size / 10) * C;
        return [
          {
            ...base,
            shape: {
              kind: 'rect',
              x: (origin.x + 0.5) * C - h,
              y: (origin.y + 0.5) * C - h,
              w: 2 * h,
              h: 2 * h,
            },
          },
        ];
      }
      const toward = z.toward ?? origin;
      const ox = (origin.x + size / 2) * C;
      const oy = (origin.y + size / 2) * C;
      const ang = Math.atan2((toward.y + 0.5) * C - oy, (toward.x + 0.5) * C - ox);
      if (sh.kind === 'line') {
        const len = (sh.length / 5) * C;
        const w = (sh.width / 10) * C;
        const [cs, sn] = [Math.cos(ang), Math.sin(ang)];
        const pt = (a: number, b: number) => `${ox + a * cs - b * sn},${oy + a * sn + b * cs}`;
        return [
          {
            ...base,
            shape: {
              kind: 'poly',
              points: `${pt(0, -w)} ${pt(len, -w)} ${pt(len, w)} ${pt(0, w)}`,
            },
          },
        ];
      }
      const len = ((sh.kind === 'cone' ? sh.length : sh.kind === 'cube' ? sh.size : 0) / 5) * C;
      const half = Math.atan(0.5);
      const pt = (a: number) => `${ox + len * Math.cos(a)},${oy + len * Math.sin(a)}`;
      return [
        {
          ...base,
          shape: { kind: 'poly', points: `${ox},${oy} ${pt(ang - half)} ${pt(ang + half)}` },
        },
      ];
    });
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
          ethereal: c.plane === 'ethereal',
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
      const q = moveQuery(st, a.id, this.moveKind());
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
      const found = findPath(moveQuery(this.s(), a.id, this.moveKind()), h);
      const start = tokenOf(this.s(), a.id)?.pos;
      return found && start
        ? { cells: [start, ...found.path], label: this.ui.dist(found.costFt) }
        : null;
    } catch {
      return null;
    }
  });

  protected readonly ruler = computed(() => {
    const a = this.rulerA();
    const b = this.rulerB();
    if (!a || !b) return null;
    return { a, b, label: this.ui.dist(distanceFt(a, 1, b, 1, this.s().rule)) };
  });

  /** Criaturas destacadas: alvos válidos do ataque/magia ou atingidas pela área em prévia. */
  protected readonly targetIds = computed(() => {
    const m = this.mode();
    const a = this.castActor();
    const out = new Set<string>();
    if (m.kind === 'move' || !a || !(this.canAct() || this.legendActorId())) return out;
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

    const target = this.castTarget(m);
    if (this.selfOnly(m)) {
      if (target.kind === 'self') out.add(a.id);
    }
    for (const id of m.picked) out.add(id);
    for (const t of st.tokens) {
      const o = this.creature(t.creatureId);
      if (!o) continue;
      if (target.kind === 'creature') {
        const ok = o.status !== 'dead' || !!m.spell.heal;
        if (ok && distanceFt(from.pos, sizeOf(a), t.pos, sizeOf(o), st.rule) <= m.spell.range)
          out.add(o.id);
      } else if (target.kind === 'sphere' && target.self) {
        if (
          o.id !== a.id &&
          o.status !== 'dead' &&
          inArea(null, target, from.pos, sizeOf(a), from.pos, t.pos, sizeOf(o))
        )
          out.add(o.id);
      } else if (target.kind !== 'self' && target.kind !== 'point') {
        const h = this.hover();
        if (!h || o.status === 'dead') continue;
        const hit = inArea(null, target, from.pos, sizeOf(a), h, t.pos, sizeOf(o));
        const selfOrigin =
          target.kind === 'cone' ||
          target.kind === 'line' ||
          (target.kind === 'cube' && target.self);
        if (hit && !(selfOrigin && o.id === a.id)) out.add(o.id);
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
  protected attackOk(c: Creature, name: string): boolean {
    return attackAllowed(c, name);
  }

  /** Jogador vê só a porcentagem de PV dos inimigos. */
  protected hpLabel(c: Creature): string {
    const role = this.store.role();
    const hiddenExact =
      role.kind === 'player' && teamOf(c) === 'foes' && !ownsCreature(this.s(), role, c.id);
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
    this.legendActorId.set(null);
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

  /** Cão Fiel (2024): quem o conjurou o move com a ação Magia; o próximo clique no mapa é o destino. */
  protected readonly movingSummon = signal<string | null>(null);

  /** Invocações da criatura da vez que ela pode mover com a ação (Cão Fiel 2024). */
  protected movableSummons = computed(() => {
    const a = this.active();
    return a && this.running()
      ? this.s().creatures.filter((c) => c.summon?.by === a.id && c.summon.guard?.movable)
      : [];
  });

  /** Quem pode dispensar: o Mestre, ou o dono da invocação. */
  protected canDismiss(c: Creature): boolean {
    return !!c.summon && (this.isDm() || this.store.role().kind === 'player');
  }

  protected dismissSummon(c: Creature): void {
    if (c.summon) this.store.send({ type: 'dismissSummon', actorId: c.summon.by, summonId: c.id });
  }

  /** Aliados que podem tomar o lugar de quem usa Redirecionar Ataque. */
  protected redirectChoices(reactorId: string): Creature[] {
    const r = this.creature(reactorId);
    return r ? redirectAllies(this.s(), r) : [];
  }

  protected redirectTo(reactorId: string, spellId: string, allyId: string): void {
    this.store.send({
      type: 'reaction',
      actorId: reactorId,
      use: true,
      spellId,
      targetId: allyId,
      ruleset: this.ui.ruleset(),
    });
  }

  /** Reação com deslocamento (Tinta do Polvo): o próximo clique no mapa é o destino da natação. */
  protected readonly reactionMove = signal<{ reactorId: string; spellId: string } | null>(null);

  protected needsPoint(spell: Spell): boolean {
    return spell.moveAfter === 'swim';
  }

  /** Magias que a criatura pode lançar como ação lendária (Lançar Magia: qualquer; Truque: nível 0). */
  protected legendarySpells(c: Creature, sp: Spell): Spell[] {
    const only0 = sp.ability?.legendaryCast === 'cantrip';
    return (c.spellcasting?.spells ?? []).flatMap((id) => {
      const s = getSpell(id, this.ui.ruleset());
      return s && s.castTime !== 'reaction' && (!only0 || s.level === 0) ? [s] : [];
    });
  }

  protected castLegendary(c: Creature, spellId: string): void {
    const s = getSpell(spellId, this.ui.ruleset());
    if (s) this.pickLegendary(c, s);
  }

  protected onCell(pos: Pos): void {
    const rm = this.reactionMove();
    if (rm) {
      this.store.send({
        type: 'reaction',
        actorId: rm.reactorId,
        use: true,
        spellId: rm.spellId,
        point: pos,
        ruleset: this.ui.ruleset(),
      });
      this.reactionMove.set(null);
      return;
    }
    const moving = this.movingSummon();
    const actor = this.active();
    if (moving && actor) {
      this.store.send({ type: 'moveSummon', actorId: actor.id, summonId: moving, to: pos });
      this.movingSummon.set(null);
      return;
    }
    const m = this.mode();
    const a = this.castActor();
    if (m.kind === 'cast' && a && this.castTarget(m).kind !== 'creature' && !this.selfOnly(m)) {
      // magia de área: o clique define o ponto (esfera) ou a direção (cone)
      if (this.sendCast(m, a.id, { point: pos })) this.resetMode();
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
    const ca = this.castActor();
    if (m.kind === 'cast' && ca) {
      if (this.selfOnly(m)) return;
      if (this.castTarget(m).kind !== 'creature') {
        if (this.sendCast(m, ca.id, { point: tokenOf(this.s(), id)?.pos })) this.resetMode();
        return;
      }
      if (this.maxTargets(m) <= 1) {
        if (this.sendCast(m, ca.id, { targetId: id })) this.resetMode();
        return;
      }
      // vários alvos: marca/desmarca e confirma em "Conjurar"
      const picked = m.picked.includes(id)
        ? m.picked.filter((x) => x !== id)
        : m.picked.length < this.maxTargets(m)
          ? [...m.picked, id]
          : m.picked;
      this.mode.set({ ...m, picked });
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
    if (this.running()) {
      const a = this.active();
      const mode = a && a.id === id && this.moveKinds(a).length ? this.moveKind() : undefined;
      this.store.send({ type: 'move', actorId: id, to: pos, ...(mode ? { mode } : {}) });
    } else this.store.send({ type: 'placeToken', id, pos });
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
  /** Envia a conjuração com o conjunto de regras da tela; reações avulsas saem como `reaction`. */
  private sendCast(
    m: Extract<Mode, { kind: 'cast' }>,
    actorId: string,
    over: { targetId?: string; targetIds?: string[]; point?: Pos },
  ): boolean {
    const common = {
      actorId,
      spellId: m.spell.id,
      slotLevel: m.slot,
      ruleset: this.ui.ruleset(),
      ...(m.option ? { option: m.option } : {}),
      ...over,
    };
    return m.spell.castTime === 'reaction'
      ? this.store.send({ type: 'reaction', use: true, ...common })
      : this.store.send({ type: 'cast', ...common, ...(m.sustain ? { sustain: true } : {}) });
  }

  /** "Conjurar": magia sem alvo a clicar (em você, aura) ou com vários alvos já marcados. */
  protected confirmCast(): void {
    const m = this.mode();
    const a = this.castActor();
    if (m.kind !== 'cast' || !a) return;
    const over = m.picked.length ? { targetIds: m.picked } : {};
    if (this.sendCast(m, a.id, over)) this.resetMode();
  }

  protected castReady(): boolean {
    const m = this.mode();
    if (m.kind !== 'cast') return false;
    return this.selfOnly(m) || (this.maxTargets(m) > 1 && m.picked.length > 0);
  }

  protected onSpell(
    pick: { spell: Spell; slot: number; sustain?: boolean; option?: string } | null,
  ): void {
    this.mode.set(
      pick
        ? {
            kind: 'cast',
            spell: pick.spell,
            slot: pick.slot,
            sustain: pick.sustain,
            option: pick.option,
            picked: [],
          }
        : { kind: 'move' },
    );
  }

  protected toggleHelp(): void {
    this.mode.update((m) => (m.kind === 'help' ? { kind: 'move' } : { kind: 'help' }));
  }

  /** Ações que o personagem ativo pode fazer como ação bônus (Ação Astuta, Fuga Ágil). */
  protected readonly bonusActions = computed(() => bonusActionsOf(this.active() ?? {}));

  /** Habilidades de classe de uso ativo do personagem da vez (Retomar o Fôlego, Surto de Ação, Fúria). */
  protected readonly classActions = computed(() => {
    const a = this.active();
    if (!a) return [];
    const raging = !!a.effects?.some((e) => e.mods.rage);
    const row = (id: LimitedFeature, pt: string, en: string, cost: 'bonus' | 'free') => {
      const res = a.resources.find((r) => r.name === FEATURE_RESOURCE[id].name);
      const left = res ? res.max - res.used : featureUses(id, a.level);
      return { id, pt, en, cost, left, raging: id === 'rage' && raging };
    };
    const has = (id: LimitedFeature) => a.features?.includes(id);
    return [
      ...(has('second-wind')
        ? [row('second-wind', 'Retomar o Fôlego', 'Second Wind', 'bonus')]
        : []),
      ...(has('action-surge')
        ? [row('action-surge', 'Surto de Ação', 'Action Surge', 'free')]
        : []),
      ...(has('rage') ? [row('rage', 'Fúria', 'Rage', 'bonus')] : []),
    ];
  });

  protected useFeature(feature: LimitedFeature): void {
    const a = this.active();
    if (!a) return;
    this.store.send({ type: 'feature', actorId: a.id, feature });
    this.resetMode();
  }

  /** Escolhe uma ação lendária de um monstro (fora do turno dele): o alvo é escolhido no mapa. */
  protected pickLegendary(c: Creature, spell: Spell): void {
    this.legendActorId.set(c.id);
    this.mode.set({ kind: 'cast', spell, slot: 0, picked: [] });
  }

  protected hasAbilities(c: Creature): boolean {
    this.spellStore.version(); // as regras dos monstros chegam junto com as das magias
    return abilitiesOf(c).length > 0;
  }

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

  protected react(
    actorId: string,
    use: boolean,
    spellId?: string,
    slotLevel?: number,
    redirect = false,
  ): void {
    // Redirecionar Ataque: o aliado que toma o lugar é o primeiro elegível (o Mestre-LLM escolhe pelo MCP)
    const reactor = this.creature(actorId);
    const ally = redirect && reactor ? redirectAllies(this.store.state(), reactor)[0] : undefined;
    this.store.send({
      type: 'reaction',
      actorId,
      use,
      ...(spellId ? { spellId, slotLevel, ruleset: this.ui.ruleset() } : {}),
      ...(ally ? { targetId: ally.id } : {}),
    });
  }

  /** Magias de reação que quem reage pode usar agora, conforme o gatilho pendente. */
  protected reactionOptions(r: {
    reactorId: string;
    spell?: { trigger: 'hit' | 'damaged' | 'cast' | 'moved' | 'turnEnd' | 'turnStart' };
  }) {
    const c = this.creature(r.reactorId);
    if (!c || !r.spell) return [];
    return reactionSpells(c, r.spell.trigger);
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
