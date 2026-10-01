import { Attack, Creature } from '../../models/creature';
import { InventoryItem, ItemDef } from '../../models/item';
import { abilityMod, proficiencyBonus, RuleError } from '../creature';
import { getItem } from './catalog';
import { T } from '../i18n';

const def = (i: InventoryItem): ItemDef => {
  const d = getItem(i.ref);
  if (!d) throw new RuleError(T(`Item desconhecido: ${i.ref}`, `Unknown item: ${i.ref}`));
  return d;
};

/** Peso carregado em libras. */
export const carriedWeight = (c: Creature): number =>
  (c.inventory ?? []).reduce((sum, i) => sum + (getItem(i.ref)?.weight ?? 0) * i.qty, 0);

/** Capacidade de carga: 15 × Força. */
export const carryCapacity = (c: Creature): number => c.abilities.str * 15;

/** CA dada pelo equipamento, ou `null` se nada de armadura/escudo está equipado (mantém a CA atual). */
export function equipmentAc(c: Creature): number | null {
  const wornItems = (c.inventory ?? []).filter((i) => i.equipped);
  const worn = wornItems.map(def);
  const armor = worn.find((d) => d.kind === 'armor');
  const shield = worn.find((d) => d.kind === 'shield');
  if (!armor && !shield) return null;
  // corrosão: cada toque tira 1 da CA que a peça dá
  const lost = (kind: 'armor' | 'shield') =>
    wornItems.find((i) => def(i).kind === kind)?.corrosion?.n ?? 0;
  const dex = abilityMod(c.abilities.dex);
  let base = 10 + dex; // sem armadura
  if (armor?.armor) {
    const { base: b, dex: mode } = armor.armor;
    base = b + (mode === 'full' ? dex : mode === 'max2' ? Math.min(2, dex) : 0);
  }
  return base - lost('armor') + Math.max(0, (shield?.shield ?? 0) - lost('shield'));
}

/** Ataque que uma arma equipada dá (proficiência sempre; Des para acuidade e distância). */
export function weaponAttack(c: Creature, d: ItemDef, item?: InventoryItem): Attack {
  const w = d.weapon!;
  const str = abilityMod(c.abilities.str);
  const dex = abilityMod(c.abilities.dex);
  const twoHanded = !(c.inventory ?? []).some((i) => i.equipped && def(i).kind === 'shield');
  const dice = w.versatile && twoHanded ? w.versatile : w.damage;
  const mod = w.ranged ? dex : w.finesse ? Math.max(str, dex) : str;
  const rust = item?.corrosion;
  const dmgMod = mod - (rust?.on === 'damage' ? rust.n : 0);
  return {
    name: d.name,
    bonus: proficiencyBonus(c) + mod - (rust?.on === 'attack' ? rust.n : 0),
    damage: dmgMod === 0 ? dice : `${dice}${dmgMod > 0 ? '+' : ''}${dmgMod}`,
    type: w.type,
    range: w.range,
    ...(w.finesse ? { finesse: true } : {}),
  };
}

/** Recalcula CA e ataques de armas a partir do que está equipado (ataques que não são de item ficam). */
export function refresh(c: Creature): Creature {
  const inventory = c.inventory ?? [];
  const weaponNames = new Set(
    inventory
      .map((i) => def(i))
      .filter((d) => d.kind === 'weapon')
      .map((d) => d.name),
  );
  const kept = c.attacks.filter((a) => !weaponNames.has(a.name));
  const equipped = inventory
    .filter((i) => i.equipped && def(i).kind === 'weapon')
    .map((i) => weaponAttack(c, def(i), i));
  const ac = equipmentAc(c);
  return { ...c, attacks: [...kept, ...equipped], ac: ac ?? c.ac };
}

export function addItem(c: Creature, ref: string, qty = 1): Creature {
  if (!getItem(ref)) throw new RuleError(T('Item desconhecido.', 'Unknown item.'));
  if (!(qty >= 1)) throw new RuleError(T('Quantidade inválida.', 'Invalid amount.'));
  const inventory = c.inventory ?? [];
  const stackable = getItem(ref)!.kind === 'consumable' || getItem(ref)!.kind === 'gear';
  const same = stackable ? inventory.find((i) => i.ref === ref) : undefined;
  const next = same
    ? inventory.map((i) => (i === same ? { ...i, qty: i.qty + qty } : i))
    : [...inventory, { id: crypto.randomUUID(), ref, qty: Math.floor(qty), equipped: false }];
  return { ...c, inventory: next };
}

export function removeItem(c: Creature, itemId: string): Creature {
  return refresh({ ...c, inventory: (c.inventory ?? []).filter((i) => i.id !== itemId) });
}

/** Equipa ou desequipa; só uma armadura e um escudo por vez. */
export function toggleEquip(c: Creature, itemId: string): Creature {
  const inventory = c.inventory ?? [];
  const item = inventory.find((i) => i.id === itemId);
  if (!item) throw new RuleError(T('Item não encontrado.', 'Item not found.'));
  const d = def(item);
  if (d.kind !== 'weapon' && d.kind !== 'armor' && d.kind !== 'shield')
    throw new RuleError(T(`${d.name} não se equipa.`, `${d.name} cannot be equipped.`));
  const turnOn = !item.equipped;
  const next = inventory.map((i) => {
    if (i.id === itemId) return { ...i, equipped: turnOn };
    // uma armadura e um escudo por vez
    if (turnOn && (d.kind === 'armor' || d.kind === 'shield') && def(i).kind === d.kind)
      return { ...i, equipped: false };
    return i;
  });
  return refresh({ ...c, inventory: next });
}

/** Gasta uma unidade do consumível; some quando acaba. */
export function consume(c: Creature, itemId: string): Creature {
  const inventory = c.inventory ?? [];
  const item = inventory.find((i) => i.id === itemId);
  if (!item || item.qty <= 0)
    throw new RuleError(T('Você não tem esse item.', "You don't have that item."));
  const next = inventory.flatMap((i) =>
    i.id !== itemId ? [i] : i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : [],
  );
  return { ...c, inventory: next };
}

export const itemDef = (i: InventoryItem): ItemDef | undefined => getItem(i.ref);

/** Peça de metal não mágica que o Monstro da Ferrugem pode corroer. */
const corrodible = (i: InventoryItem, kind: 'armor' | 'shield' | 'weapon'): boolean => {
  const d = getItem(i.ref);
  return !!d && i.equipped && d.kind === kind && !!d.metal && !d.magic;
};

/**
 * Corrói −1 uma peça de metal equipada (armadura, escudo ou arma). Armadura cuja CA cai a 10, escudo que
 * chega a +0 e arma que chega a −5 são destruídos. Devolve `null` se não há peça que a ferrugem afete.
 */
export function corrode(
  c: Creature,
  kind: 'armor' | 'shield' | 'weapon',
  on: 'attack' | 'damage',
  weaponName?: string,
): { creature: Creature; name: string; destroyed: boolean; level: number } | null {
  const inventory = c.inventory ?? [];
  const item = inventory.find(
    (i) => corrodible(i, kind) && (!weaponName || def(i).name === weaponName),
  );
  if (!item) return null;
  const d = def(item);
  const n = (item.corrosion?.n ?? 0) + 1;
  const destroyed =
    kind === 'armor'
      ? (d.armor?.base ?? 0) - n <= 10
      : kind === 'shield'
        ? (d.shield ?? 0) - n <= 0
        : n >= 5;
  const next = destroyed
    ? inventory.filter((i) => i !== item)
    : inventory.map((i) => (i === item ? { ...i, corrosion: { n, on } } : i));
  return { creature: refresh({ ...c, inventory: next }), name: d.name, destroyed, level: n };
}
