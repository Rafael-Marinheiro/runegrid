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
import { DIFFICULTY_LABEL, estimateEncounter, xpForCr } from '@core/rules/srd/xp';
import { EncounterStore } from '@state/encounter.store';
import { PartyStore } from '@state/party.store';
import { SrdStore } from '@state/srd.store';

const PAGE = 60;
const CRS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

@Component({
  selector: 'app-bestiary-page',
  templateUrl: './bestiary-page.html',
  styleUrl: './bestiary-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BestiaryPage implements OnInit {
  protected readonly srd = inject(SrdStore);
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
    void this.srd.loadMonsters();
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

  /** Leva os escolhidos para o encontro (montagem) e abre o mapa. */
  protected toEncounter(): void {
    for (const { m, n } of this.pickedList()) {
      for (let i = 0; i < n; i++)
        this.encounter.autoPlace(this.encounter.addFromRoster(monsterToCreature(m)));
    }
    this.picked.set({});
    void this.router.navigate(['/combate']);
  }

  /** Guarda o monstro entre as criaturas para reutilizar. */
  protected toParty(m: SrdMonster): void {
    this.party.creatures.update((l) => [...l, monsterToCreature(m)]);
  }
}
