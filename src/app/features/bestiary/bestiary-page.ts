import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ABILITIES, ABILITY_LABEL } from '@core/models/creature';
import { SrdMonster } from '@core/models/srd';
import { abilityMod, fmtBonus } from '@core/rules/creature';
import { crLabel, monsterToCreature } from '@core/rules/srd/convert';
import { artUrl, MiniatureQuery, queryFromMonster } from '@core/rules/srd/miniature';
import { monsterNamePt } from '@core/rules/srd/names-pt';
import { DIFFICULTY_LABEL, estimateEncounter, xpForCr } from '@core/rules/srd/xp';
import { MiniaturePicker } from '@features/creatures/miniature-picker';
import { EncounterStore } from '@state/encounter.store';
import { MonsterArtStore } from '@state/monster-art.store';
import { PartyStore } from '@state/party.store';
import { SrdStore } from '@state/srd.store';
import { UiPrefs } from '@state/ui-prefs';

const PAGE = 60;
const CRS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

@Component({
  selector: 'app-bestiary-page',
  imports: [MiniaturePicker],
  templateUrl: './bestiary-page.html',
  styleUrl: './bestiary-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BestiaryPage implements OnInit {
  protected readonly srd = inject(SrdStore);
  protected readonly art = inject(MonsterArtStore);
  protected readonly ui = inject(UiPrefs);
  private readonly encounter = inject(EncounterStore);
  private readonly party = inject(PartyStore);
  private readonly router = inject(Router);

  protected readonly crs = CRS;
  protected readonly cr = crLabel;
  protected readonly xp = xpForCr;
  protected readonly bonus = fmtBonus;
  protected readonly mod = abilityMod;
  protected readonly abilities = ABILITIES;
  protected readonly abilityLabel = ABILITY_LABEL;
  protected readonly difficultyLabel = DIFFICULTY_LABEL;

  protected difficulty(value: keyof typeof DIFFICULTY_LABEL): string {
    const labels = {
      trivial: 'Trivial',
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      deadly: 'Deadly',
    } as const;
    return this.ui.locale() === 'en' ? labels[value] : this.difficultyLabel[value];
  }

  protected readonly query = signal('');
  protected readonly type = signal('');
  protected readonly minCr = signal(0);
  protected readonly maxCr = signal(30);
  protected readonly shown = signal(PAGE);
  protected readonly selectedId = signal<string | null>(null);
  /** Monstros escolhidos para o encontro: id → quantidade. */
  protected readonly picked = signal<Record<string, number>>({});

  protected readonly types = computed(() =>
    [...new Set(this.srd.monsters().map((m) => m.type.split(' ')[0].toLowerCase()))].sort(),
  );

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const t = this.type();
    return this.srd
      .monsters()
      .filter(
        (m) =>
          m.cr >= this.minCr() &&
          m.cr <= this.maxCr() &&
          (!t || m.type.toLowerCase().startsWith(t)) &&
          (!q || m.name.toLowerCase().includes(q)),
      );
  });

  protected readonly visible = computed(() => this.filtered().slice(0, this.shown()));
  protected readonly selected = computed(() =>
    this.srd.monsters().find((m) => m.id === this.selectedId()),
  );

  protected readonly pickedList = computed(() =>
    Object.entries(this.picked()).flatMap(([id, n]) => {
      const m = this.srd.monsters().find((x) => x.id === id);
      return m ? [{ m, n }] : [];
    }),
  );

  /** Níveis do grupo: os PJs cadastrados. */
  protected readonly partyLevels = computed(() =>
    this.party
      .creatures()
      .filter((c) => c.kind === 'pc')
      .map((c) => c.level),
  );

  protected readonly estimate = computed(() =>
    estimateEncounter(
      this.partyLevels(),
      this.pickedList().flatMap(({ m, n }) => Array.from({ length: n }, () => m.cr)),
    ),
  );

  ngOnInit(): void {
    void this.srd.loadMonsters(this.ui.ruleset());
    void this.art.load();
  }

  /** Miniatura do monstro (F11-5), quando o pacote de arte tiver uma para o id. */
  protected artUrl(m: SrdMonster): string | null {
    const file = this.artFile(m);
    return file ? artUrl(file) : null;
  }

  /** Variante escolhida na ficha (vale para a lista, o retrato e o token ao levar ao mapa). */
  private readonly chosenArt = signal<Record<string, string>>({});

  protected artFile(m: SrdMonster): string | undefined {
    return this.chosenArt()[m.id] ?? this.art.fileFor(m.id);
  }

  protected artQuery(m: SrdMonster): MiniatureQuery {
    return queryFromMonster(m);
  }

  /** Só humanoides do catálogo (humanos, anões, elfos, goblins) têm variantes para escolher. */
  protected hasVariants(m: SrdMonster): boolean {
    return this.art.suggest(queryFromMonster(m), 1).length > 0;
  }

  protected chooseArt(m: SrdMonster, file: string | undefined): void {
    this.chosenArt.update((c) => {
      const next = { ...c };
      if (file) next[m.id] = file;
      else delete next[m.id];
      return next;
    });
  }

  protected setRuleset(value: string): void {
    const ruleset = value === '2024' ? '2024' : '2014';
    this.ui.ruleset.set(ruleset);
    void this.srd.loadMonsters(ruleset);
  }

  protected setNumber(sig: { set(v: number): void }, value: string): void {
    sig.set(Number(value));
    this.shown.set(PAGE);
  }

  protected resetPage(): void {
    this.shown.set(PAGE);
  }

  protected add(m: SrdMonster, delta = 1): void {
    this.picked.update((p) => {
      const next = { ...p };
      const n = (p[m.id] ?? 0) + delta;
      if (n > 0) next[m.id] = n;
      else delete next[m.id];
      return next;
    });
  }

  protected modLabel(score: number): string {
    return `${score} (${fmtBonus(abilityMod(score))})`;
  }

  protected skills(m: SrdMonster): string {
    return Object.entries(m.skills)
      .map(([k, v]) => `${k.replace(/_/g, ' ')} ${fmtBonus(v)}`)
      .join(', ');
  }

  protected saves(m: SrdMonster): string {
    return Object.entries(m.saves)
      .map(([k, v]) => `${k.toUpperCase()} ${fmtBonus(v)}`)
      .join(', ');
  }

  /** Nome do monstro em pt-BR se a interface estiver nesse idioma (glossário próprio, F11-6). */
  protected name(m: SrdMonster): string {
    return this.ui.text(monsterNamePt(m.name), m.name);
  }

  /** Leva os escolhidos para o encontro (montagem) e abre o mapa. */
  protected toEncounter(): void {
    for (const { m, n } of this.pickedList()) {
      for (let i = 0; i < n; i++)
        this.encounter.autoPlace(
          this.encounter.addFromRoster(monsterToCreature(m, this.name(m), this.artFile(m))),
        );
    }
    this.picked.set({});
    void this.router.navigate(['/combate']);
  }

  /** Guarda o monstro entre as criaturas para reutilizar. */
  protected toParty(m: SrdMonster): void {
    this.party.creatures.update((l) => [...l, monsterToCreature(m, this.name(m), this.artFile(m))]);
  }
}
