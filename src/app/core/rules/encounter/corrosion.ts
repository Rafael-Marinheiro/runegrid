import { Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { addEffect, allMods } from '../creature';
import { T } from '../i18n';
import { corrode } from '../inventory/inventory';
import { getItem } from '../inventory/catalog';
import { addLog, creatureOf, withCreature } from './state';

export type RustKind = 'armor' | 'shield' | 'weapon';

const LABEL: Record<RustKind, [string, string]> = {
  armor: ['a armadura', 'the armor'],
  shield: ['o escudo', 'the shield'],
  weapon: ['a arma', 'the weapon'],
};

/** Há uma peça equipada desse tipo (mesmo que mágica ou não metálica)? */
const hasGear = (c: Creature, kind: RustKind): boolean =>
  (c.inventory ?? []).some((i) => i.equipped && getItem(i.ref)?.kind === kind);

/**
 * Ferrugem em `targetId`: −1 cumulativo na peça de metal não mágica equipada (CA da armadura/escudo,
 * dano ou acerto da arma); peça destruída ao chegar ao limite. Criaturas sem equipamento de inventário
 * (monstros) levam o −1 como efeito cumulativo; peças mágicas ou não metálicas ficam imunes.
 */
export function corrodeTarget(
  state: EncounterState,
  byId: string,
  targetId: string,
  kind: RustKind,
  on: 'attack' | 'damage',
  weaponName?: string,
): EncounterState {
  const t = creatureOf(state, targetId);
  const [pt, en] = LABEL[kind];
  const r = corrode(t, kind, on, weaponName);
  if (r) {
    let s = withCreature(state, r.creature);
    s = addLog(
      s,
      r.destroyed
        ? T(
            `${t.name}: ${r.name} é destruído(a) pela ferrugem!`,
            `${t.name}: ${r.name} is destroyed by rust!`,
          )
        : T(
            `${t.name}: ${r.name} enferruja (−${r.level} cumulativo).`,
            `${t.name}: ${r.name} rusts (−${r.level} cumulative).`,
          ),
      [byId, t.id],
    );
    return s;
  }
  if (hasGear(t, kind))
    return addLog(
      state,
      T(
        `${t.name}: ${pt} é mágico(a) ou não é de metal — a ferrugem não o afeta.`,
        `${t.name}: ${en} is magical or not metal — rust does not affect it.`,
      ),
      [byId, t.id],
    );
  if (t.kind === 'pc' || (kind !== 'weapon' && !t.ac)) return state;
  const mods =
    kind === 'weapon' ? (on === 'attack' ? { attackBonus: -1 } : { weaponBonus: -1 }) : { ac: -1 };
  const eff = {
    id: `rust:${kind}`,
    spell: 'rust',
    name: 'Ferrugem',
    by: byId,
    stack: true,
    mods: {
      ...mods,
      note: `Ferrugem: −1 cumulativo (${pt}).`,
      noteEn: `Rust: cumulative −1 (${en}).`,
    },
  };
  const s = withCreature(state, addEffect(t, eff));
  return addLog(
    s,
    T(
      `${t.name}: ${pt} enferruja (−${Math.abs(
        creatureOf(s, t.id).effects?.find((e) => e.id === eff.id)?.mods.ac ??
          creatureOf(s, t.id).effects?.find((e) => e.id === eff.id)?.mods.attackBonus ??
          creatureOf(s, t.id).effects?.find((e) => e.id === eff.id)?.mods.weaponBonus ??
          1,
      )} cumulativo).`,
      `${t.name}: ${en} rusts (cumulative).`,
    ),
    [byId, t.id],
  );
}

/** Ferrugem do Metal e Mordida do Monstro da Ferrugem: consequências automáticas de um golpe que acertou. */
export function rustOnHit(
  state: EncounterState,
  attackerId: string,
  targetId: string,
  weapon: string | undefined,
  dealt: number,
): EncounterState {
  if (!weapon || dealt <= 0) return state;
  const attacker = creatureOf(state, attackerId);
  const target = creatureOf(state, targetId);
  let s = state;
  if (allMods(target).some((m) => m.rustMetal))
    s = corrodeTarget(s, targetId, attackerId, 'weapon', 'damage', weapon);
  if (allMods(attacker).some((m) => m.corrodeOnHit === weapon))
    s = corrodeTarget(s, attackerId, targetId, 'armor', 'damage');
  return s;
}
