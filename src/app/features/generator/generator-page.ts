import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  DIFFICULTIES,
  DifficultyId,
  EMPHASES,
  EmphasisId,
  GeneratedAdventure,
  GeneratedRoom,
  GeneratorParams,
  RoomRole,
  SIZES,
  SizeId,
  THEMES,
  ThemeId,
} from '@core/models/adventure';
import {
  adventureToEncounter,
  DEFAULT_PARAMS,
  generateAdventure,
  generateQuickEncounter,
  regenerate,
  THEME_DATA,
} from '@core/rules/generator';
import { teamOf } from '@core/rules/encounter';
import { monsterToCreature } from '@core/rules/srd/convert';
import { DIFFICULTY_LABEL } from '@core/rules/srd/xp';
import { MapView, TokenView } from '@features/combat/map-view';
import { iconFor } from '@features/combat/token-icons';
import { enhanceAdventureText } from '@net/ai-text';
import { UiPrefs } from '@state/ui-prefs';
import { EncounterStore } from '@state/encounter.store';
import { PartyStore } from '@state/party.store';
import { SrdStore } from '@state/srd.store';

const SIZE_LABEL: Record<SizeId, string> = {
  small: 'Pequeno · 5 salas',
  medium: 'Médio · 10',
  large: 'Grande · 20',
};
const EMPHASIS_LABEL: Record<EmphasisId, string> = {
  combat: 'Combate',
  traps: 'Armadilhas',
  exploration: 'Exploração',
  mixed: 'Mista',
};
const ROLE_LABEL: Record<RoomRole, string> = {
  entrance: 'Entrada',
  empty: 'Vazia',
  encounter: 'Encontro',
  trap: 'Armadilha',
  treasure: 'Tesouro',
  boss: 'Chefe',
};

const rnd = () => Math.random().toString(36).slice(2, 8);

@Component({
  selector: 'app-generator-page',
  imports: [MapView],
  templateUrl: './generator-page.html',
  styleUrl: './generator-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeneratorPage implements OnInit {
  private readonly srd = inject(SrdStore);
  protected readonly ui = inject(UiPrefs);
  private readonly encounter = inject(EncounterStore);
  private readonly party = inject(PartyStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly themes = THEMES;
  protected readonly themeLabel = (t: ThemeId) =>
    this.ui.locale() === 'en'
      ? (
          {
            crypt: 'Crypt',
            cave: 'Cave',
            ruins: 'Ruins',
            forest: 'Forest',
            swamp: 'Swamp',
            fortress: 'Fortress',
            sewer: 'Sewer',
          } as const
        )[t]
      : THEME_DATA[t].label;
  protected readonly sizes = SIZES;
  protected readonly sizeLabel = SIZE_LABEL;
  protected readonly difficulties = DIFFICULTIES;
  protected readonly difficultyLabel = DIFFICULTY_LABEL;
  protected readonly emphases = EMPHASES;
  protected readonly emphasisLabel = EMPHASIS_LABEL;
  protected readonly roleLabel = ROLE_LABEL;

  protected sizeName(value: SizeId): string {
    const labels: Record<SizeId, string> = {
      small: 'Small · 5 rooms',
      medium: 'Medium · 10',
      large: 'Large · 20',
    };
    return this.ui.locale() === 'en' ? labels[value] : this.sizeLabel[value];
  }

  protected difficultyName(value: DifficultyId): string {
    const labels: Record<DifficultyId, string> = {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      deadly: 'Deadly',
    };
    return this.ui.locale() === 'en' ? labels[value] : this.difficultyLabel[value];
  }

  protected emphasisName(value: EmphasisId): string {
    const labels: Record<EmphasisId, string> = {
      combat: 'Combat',
      traps: 'Traps',
      exploration: 'Exploration',
      mixed: 'Mixed',
    };
    return this.ui.locale() === 'en' ? labels[value] : this.emphasisLabel[value];
  }

  protected roleName(value: RoomRole): string {
    const labels: Record<RoomRole, string> = {
      entrance: 'Entrance',
      empty: 'Empty',
      encounter: 'Encounter',
      trap: 'Trap',
      treasure: 'Treasure',
      boss: 'Boss',
    };
    return this.ui.locale() === 'en' ? labels[value] : this.roleLabel[value];
  }

  protected readonly params = signal<GeneratorParams>({ ...DEFAULT_PARAMS });
  protected readonly adventure = signal<GeneratedAdventure | null>(null);
  protected readonly locked = signal<ReadonlySet<string>>(new Set());
  protected readonly message = signal('');
  protected readonly enhancing = signal(false);
  protected readonly ready = computed(() => this.srd.monstersStatus() === 'ready');
  private nonce = 0;

  protected readonly stats = computed(() => {
    const a = this.adventure();
    if (!a) return null;
    return {
      monsters: a.encounters.reduce((n, e) => n + e.groups.reduce((m, g) => m + g.count, 0), 0),
      xp: a.totalXp,
      gp: a.treasures.reduce((n, t) => n + t.gp, 0),
    };
  });

  /** Um marcador por encontro, no centro da sala, só para visualizar onde estão. */
  protected readonly markers = computed<TokenView[]>(() => {
    const a = this.adventure();
    if (!a) return [];
    return a.encounters.flatMap((e) => {
      const r = a.rooms.find((x) => x.id === e.roomId);
      if (!r) return [];
      const boss = r.role === 'boss';
      return [
        {
          id: e.roomId,
          name: e.groups.map((g) => g.name).join(', '),
          letter: boss ? 'C' : String(e.groups.reduce((n, g) => n + g.count, 0)),
          pos: { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) },
          size: 1,
          team: 'foes' as const,
          hpPct: 100,
          hidden: false,
          dead: false,
          active: boss,
          selected: false,
          targetable: false,
          icon: iconFor({ name: e.groups[0]?.name ?? '', kind: 'monster' }),
          image: null,
          conditions: 0,
          concentrating: false,
        },
      ];
    });
  });

  protected readonly mapRooms = computed(() => this.adventure()?.map.rooms ?? []);
  /** Prévia sem névoa: o Mestre vê o mapa inteiro. */
  protected readonly previewMap = computed(() => {
    const a = this.adventure();
    return a ? { ...a.map, fog: undefined } : null;
  });

  async ngOnInit(): Promise<void> {
    await this.srd.loadMonsters(this.ui.ruleset());
    const q = this.route.snapshot.queryParamMap;
    if (q.has('seed')) {
      this.params.update((p) => ({
        ...p,
        theme: (THEMES as readonly string[]).includes(q.get('tema') ?? '')
          ? (q.get('tema') as ThemeId)
          : p.theme,
        size: (SIZES as readonly string[]).includes(q.get('tam') ?? '')
          ? (q.get('tam') as SizeId)
          : p.size,
        difficulty: (DIFFICULTIES as readonly string[]).includes(q.get('dif') ?? '')
          ? (q.get('dif') as DifficultyId)
          : p.difficulty,
        emphasis: (EMPHASES as readonly string[]).includes(q.get('enf') ?? '')
          ? (q.get('enf') as EmphasisId)
          : p.emphasis,
        partyLevel: clamp(Number(q.get('nivel')) || p.partyLevel, 1, 20),
        partySize: clamp(Number(q.get('grupo')) || p.partySize, 1, 8),
        seed: q.get('seed') ?? p.seed,
      }));
      this.generate();
    }
  }

  protected set<K extends keyof GeneratorParams>(key: K, value: GeneratorParams[K]): void {
    this.params.update((p) => ({ ...p, [key]: value }));
  }

  protected setNumber(
    key: 'partyLevel' | 'partySize',
    value: string,
    min: number,
    max: number,
  ): void {
    this.set(key, clamp(Number(value) || min, min, max));
  }

  protected randomSeed(): void {
    this.set('seed', rnd());
  }

  protected generate(): void {
    if (!this.ready())
      return void this.message.set(
        this.ui.text('O bestiário ainda está carregando.', 'The bestiary is still loading.'),
      );
    this.adventure.set(generateAdventure(this.params(), this.srd.monsters()));
    this.locked.set(new Set());
    this.message.set('');
  }

  protected quickEncounter(): void {
    if (!this.ready()) return;
    if (this.encounter.state().combat.phase === 'running')
      return void this.message.set(
        this.ui.text(
          'Encerre o combate atual antes de gerar outro.',
          'End the current combat first.',
        ),
      );
    const result = generateQuickEncounter(this.params(), this.srd.monsters());
    if (!result)
      return void this.message.set(
        this.ui.text(
          'Nenhum encontro disponível para estes parâmetros.',
          'No encounter is available.',
        ),
      );
    const byId = new Map(this.srd.monsters().map((monster) => [monster.id, monster]));
    for (const creature of this.encounter.state().creatures.filter((c) => teamOf(c) === 'foes'))
      this.encounter.send({ type: 'removeCreature', id: creature.id });
    for (const group of result.groups) {
      const monster = byId.get(group.monsterId);
      if (!monster) continue;
      for (let i = 0; i < group.count; i++) {
        const id = this.encounter.addFromRoster(monsterToCreature(monster));
        this.encounter.autoPlace(id);
      }
    }
    void this.router.navigate(['/combate']);
  }

  /** Sorteia de novo as salas destravadas, mantendo o mapa e o que foi travado. */
  protected reroll(): void {
    const a = this.adventure();
    if (!a) return;
    this.adventure.set(regenerate(a, this.locked(), this.srd.monsters(), ++this.nonce));
  }

  protected toggleLock(id: string): void {
    this.locked.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected summary(r: GeneratedRoom): string {
    const a = this.adventure()!;
    const parts: string[] = [];
    const e = a.encounters.find((x) => x.roomId === r.id);
    if (e) parts.push(e.groups.map((g) => `${g.count}× ${g.name}`).join(', '));
    const t = a.traps.filter((x) => x.roomId === r.id);
    if (t.length) parts.push(`${t.length} ${this.ui.text('armadilha(s)', 'trap(s)')}`);
    const tr = a.treasures.find((x) => x.roomId === r.id);
    if (tr) parts.push(`${tr.gp} ${this.ui.text('po', 'gp')}`);
    return parts.join(' · ') || '—';
  }

  /** Leva a aventura para a tela de Combate: grupo na entrada, monstros ocultos, névoa. */
  protected toCombat(): void {
    const a = this.adventure();
    if (!a) return;
    const pcs = this.party.creatures().filter((c) => c.kind === 'pc');
    const copies = pcs.map((c) => ({ ...structuredClone(c), id: crypto.randomUUID() }));
    this.encounter.load(adventureToEncounter(a, copies, this.srd.monsters()));
    void this.router.navigate(['/combate']);
  }

  protected async copyLink(): Promise<void> {
    const p = this.params();
    const q = new URLSearchParams({
      tema: p.theme,
      tam: p.size,
      dif: p.difficulty,
      enf: p.emphasis,
      nivel: String(p.partyLevel),
      grupo: String(p.partySize),
      seed: p.seed,
    });
    const url = `${location.origin}${location.pathname}?${q}`;
    try {
      await navigator.clipboard.writeText(url);
      this.message.set(
        this.ui.text(
          'Link copiado. A mesma semente gera a mesma dungeon.',
          'Link copied. The same seed generates the same dungeon.',
        ),
      );
    } catch {
      this.message.set(url);
    }
  }

  protected async enhanceText(apiKey: string): Promise<void> {
    const adventure = this.adventure();
    if (!adventure || !apiKey.trim())
      return void this.message.set(
        this.ui.text('Informe sua chave da OpenAI.', 'Enter your OpenAI API key.'),
      );
    this.enhancing.set(true);
    this.message.set(this.ui.text('Aprimorando os textos...', 'Enhancing the text...'));
    try {
      this.adventure.set(await enhanceAdventureText(adventure, apiKey, this.ui.locale()));
      this.message.set(this.ui.text('Textos aprimorados com IA.', 'Text enhanced with AI.'));
    } catch (error) {
      this.message.set(
        this.ui.text('Não foi possível gerar o texto: ', 'Could not generate text: ') +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      this.enhancing.set(false);
    }
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(n)));
