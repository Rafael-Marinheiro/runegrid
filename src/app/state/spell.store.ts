import { inject, Injectable, signal } from '@angular/core';
import { SrdMonster, SrdSpell } from '@core/models/srd';
import { registerSummonLang, registerSummonSource } from '@core/rules/encounter';
import { monsterToCreature } from '@core/rules/srd/convert';
import { monsterNamePt } from '@core/rules/srd/names-pt';
import { buildSpells, mergeRules, SpellRules } from '@core/rules/spells/build';
import { buildMonsterAbilities, MonsterRules } from '@core/rules/monsters/build';
import { registerMonsterAbilities } from '@core/rules/monsters/registry';
import { expandFormOptions } from '@core/rules/monsters/form-options';
import { registerSpells } from '@core/rules/spells/registry';
import { Ruleset, UiPrefs } from './ui-prefs';

/**
 * Mecânica das magias do SRD: junta o texto oficial (`spells*.json`) com a mecânica escrita a mão
 * (`spell-rules*.json`) e registra no motor. Carregado sob demanda (os JSON ficam fora do bundle);
 * `version` muda a cada conjunto registrado para as telas recalcularem as listas de magias.
 */
@Injectable({ providedIn: 'root' })
export class SpellStore {
  readonly version = signal(0);
  private readonly ui = inject(UiPrefs);
  private readonly sheets = new Map<Ruleset, Map<string, SrdMonster>>();
  private readonly loading = new Map<Ruleset, Promise<void>>();

  /** Garante que as magias do conjunto de regras estão registradas no motor. */
  ensure(ruleset: Ruleset = '2014'): Promise<void> {
    let p = this.loading.get(ruleset);
    if (!p) {
      p = this.load(ruleset).catch((e) => {
        console.warn('Falha ao carregar a mecânica das magias', e);
        this.loading.delete(ruleset);
      });
      this.loading.set(ruleset, p);
    }
    return p;
  }

  private async json<T>(file: string): Promise<T> {
    const res = await fetch(new URL(`data/${file}`, document.baseURI));
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    return (await res.json()) as T;
  }

  private async load(ruleset: Ruleset): Promise<void> {
    const is24 = ruleset === '2024';
    const [srd, base, over, monsters, creatures] = await Promise.all([
      this.json<SrdSpell[]>(is24 ? 'spells-2024.json' : 'spells.json'),
      this.json<SpellRules>('spell-rules.json'),
      is24 ? this.json<SpellRules>('spell-rules-2024.json') : Promise.resolve({} as SpellRules),
      this.json<MonsterRules>(is24 ? 'monster-rules-2024.json' : 'monster-rules.json'),
      this.json<SrdMonster[]>(is24 ? 'monsters-2024.json' : 'monsters.json'),
    ]);
    this.sheets.set(ruleset, new Map(creatures.map((m) => [m.id.replace(/^srd-2024_/, ''), m])));
    registerSummonLang(() => (this.ui.locale() === 'en' ? 'en' : 'pt'));
    registerSummonSource((id, rs) => {
      const m = this.sheets.get(rs)?.get(id);
      return m
        ? monsterToCreature(m, this.ui.locale() === 'en' ? m.name : monsterNamePt(m.name))
        : undefined;
    });
    registerSpells(
      ruleset,
      expandFormOptions(buildSpells(srd, is24 ? mergeRules(base, over) : base), creatures),
    );
    registerMonsterAbilities(ruleset, buildMonsterAbilities(ruleset, monsters, creatures));
    this.version.update((v) => v + 1);
  }
}
