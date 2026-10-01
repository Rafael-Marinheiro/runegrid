/**
 * Habilidades ativas dos monstros do SRD (F13). Cada uma é uma `Spell` de nível 0 com `ability`;
 * ficam num registro próprio (por conjunto de regras) e o motor as acha pelo id, como as magias.
 */
import { Creature } from '../../models/creature';
import { EffectMods } from '../../models/effect';
import { Spell } from '../../models/spell';
import { registerSpellNameEn } from '../srd/names-pt';
import { customEntry } from './custom';

export type MonsterRuleset = '2014' | '2024';

/** Traço passivo com efeito de regra (Resistência à Magia, Táticas de Matilha…). */
export interface TraitDef {
  id: string;
  name: string;
  nameEn: string;
  mods: EffectMods;
  manual?: string;
  manualEn?: string;
}

export interface MonsterEntry {
  /** Traços passivos com efeito de regra. */
  traits: TraitDef[];
  /** Ações lendárias por rodada (0/ausente = não tem). */
  legendary?: number;
  /** Habilidades que se usam sozinhas. */
  abilities: Spell[];
  /** Consequências extras dos ataques de arma (por nome do ataque no SRD, em inglês). */
  riders: Record<string, Spell>;
}

const tables: Record<MonsterRuleset, Map<string, MonsterEntry>> = {
  '2014': new Map(),
  '2024': new Map(),
};
const byId = new Map<string, Spell>();

/** Prefixo do id das habilidades: `mon/` (2014) e `mon24/` (2024). */
export const abilityId = (ruleset: MonsterRuleset, monster: string, slug: string): string =>
  `${ruleset === '2024' ? 'mon24' : 'mon'}/${monster}/${slug}`;

export const isAbilityId = (id: string): boolean =>
  id.startsWith('mon/') || id.startsWith('mon24/');

/** Id do monstro sem o prefixo do SRD 2024. */
export const baseMonsterId = (id: string): string => id.replace(/^srd-2024_/, '');

export const rulesetOfMonster = (srdId: string): MonsterRuleset =>
  srdId.startsWith('srd-2024_') ? '2024' : '2014';

export function registerMonsterAbilities(
  ruleset: MonsterRuleset,
  entries: Map<string, MonsterEntry>,
): void {
  for (const e of tables[ruleset].values())
    for (const s of [...e.abilities, ...Object.values(e.riders)]) byId.delete(s.id);
  tables[ruleset] = entries;
  for (const e of entries.values())
    for (const s of [...e.abilities, ...Object.values(e.riders)]) {
      byId.set(s.id, s);
      if (s.nameEn) registerSpellNameEn(s.name, s.nameEn);
    }
}

/** Habilidade (ou rider) pelo id. */
export function getMonsterAbility(id: string): Spell | undefined {
  const known = byId.get(id);
  if (known) return known;
  // fichas montadas na hora (Corcel de Outro Mundo): mon24/<monstro>/<habilidade>
  const [, monster] = id.split('/');
  return customEntry(monster ?? '')?.abilities.find((a) => a.id === id);
}

export function monsterEntry(srdId: string | undefined): MonsterEntry | undefined {
  if (!srdId) return undefined;
  return (
    tables[rulesetOfMonster(srdId)].get(baseMonsterId(srdId)) ?? customEntry(baseMonsterId(srdId))
  );
}

/** Habilidades ativas do monstro (vazio se não vieram do SRD ou as regras ainda não foram carregadas). */
export const abilitiesOf = (c: Pick<Creature, 'srdId'>): Spell[] =>
  monsterEntry(c.srdId)?.abilities ?? [];

/** Consequência extra do ataque de arma com este nome (nome do SRD), se houver. */
export const riderOf = (c: Pick<Creature, 'srdId'>, attackName: string): Spell | undefined =>
  monsterEntry(c.srdId)?.riders[attackName];

export const legendaryActionsOf = (c: Pick<Creature, 'srdId'>): number =>
  monsterEntry(c.srdId)?.legendary ?? 0;

/** Descanso: usos por dia e recargas voltam (descanso curto só os "rest"). */
export function restAbilities(c: Creature, kind: 'short' | 'long'): Creature {
  const abilities = abilitiesOf(c);
  if (!c.abilityState) return c;
  const state = { ...c.abilityState };
  // traços com usos: Implacável volta em qualquer descanso, Resistência Lendária no longo
  if (state['relentless']) state['relentless'] = { used: 0 };
  if (state['legendary-resistance'] && kind === 'long') state['legendary-resistance'] = { used: 0 };
  for (const sp of abilities) {
    const ab = sp.ability;
    const key = ab?.group ?? sp.id;
    if (!ab || !state[key]) continue;
    if (ab.recharge && kind) state[key] = { ...state[key], recharging: false };
    if (ab.uses && (kind === 'long' || ab.uses.per === 'rest'))
      state[key] = { ...state[key], used: 0 };
  }
  return { ...c, abilityState: state };
}

/** Modificadores permanentes dos traços do monstro (somam-se aos dos efeitos ativos). */
export const traitModsOf = (c: Pick<Creature, 'srdId'>): EffectMods[] =>
  monsterEntry(c.srdId)?.traits.map((t) => t.mods) ?? [];
