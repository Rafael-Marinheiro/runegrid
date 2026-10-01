import { ItemDef } from '../../models/item';

/** Equipamento do SRD 5.1 usado pelo combate (nomes em português). */
export const CATALOG: ItemDef[] = [
  {
    id: 'dagger',
    metal: true,
    name: 'Adaga',
    kind: 'weapon',
    weight: 1,
    weapon: { damage: '1d4', type: 'piercing', range: 5, finesse: true },
  },
  {
    id: 'shortsword',
    metal: true,
    name: 'Espada curta',
    kind: 'weapon',
    weight: 2,
    weapon: { damage: '1d6', type: 'piercing', range: 5, finesse: true },
  },
  {
    id: 'rapier',
    metal: true,
    name: 'Rapieira',
    kind: 'weapon',
    weight: 2,
    weapon: { damage: '1d8', type: 'piercing', range: 5, finesse: true },
  },
  {
    id: 'longsword',
    metal: true,
    name: 'Espada longa',
    kind: 'weapon',
    weight: 3,
    weapon: { damage: '1d8', type: 'slashing', range: 5, versatile: '1d10' },
  },
  {
    id: 'greataxe',
    metal: true,
    name: 'Machado grande',
    kind: 'weapon',
    weight: 7,
    weapon: { damage: '1d12', type: 'slashing', range: 5 },
  },
  {
    id: 'mace',
    metal: true,
    name: 'Maça',
    kind: 'weapon',
    weight: 4,
    weapon: { damage: '1d6', type: 'bludgeoning', range: 5 },
  },
  {
    id: 'quarterstaff',
    name: 'Cajado',
    kind: 'weapon',
    weight: 4,
    weapon: { damage: '1d6', type: 'bludgeoning', range: 5, versatile: '1d8' },
  },
  {
    id: 'handaxe',
    metal: true,
    name: 'Machadinha',
    kind: 'weapon',
    weight: 2,
    weapon: { damage: '1d6', type: 'slashing', range: 5 },
  },
  {
    id: 'shortbow',
    name: 'Arco curto',
    kind: 'weapon',
    weight: 2,
    weapon: { damage: '1d6', type: 'piercing', range: 80, ranged: true },
  },
  {
    id: 'longbow',
    name: 'Arco longo',
    kind: 'weapon',
    weight: 2,
    weapon: { damage: '1d8', type: 'piercing', range: 150, ranged: true },
  },
  {
    id: 'light-crossbow',
    name: 'Besta leve',
    kind: 'weapon',
    weight: 5,
    weapon: { damage: '1d8', type: 'piercing', range: 80, ranged: true },
  },

  {
    id: 'leather',
    name: 'Armadura de couro',
    kind: 'armor',
    weight: 10,
    armor: { base: 11, dex: 'full' },
  },
  {
    id: 'chain-shirt',
    metal: true,
    name: 'Camisão de malha',
    kind: 'armor',
    weight: 20,
    armor: { base: 13, dex: 'max2' },
  },
  {
    id: 'chain-mail',
    metal: true,
    name: 'Cota de malha',
    kind: 'armor',
    weight: 55,
    armor: { base: 16, dex: 'none' },
  },
  {
    id: 'plate',
    metal: true,
    name: 'Armadura de placas',
    kind: 'armor',
    weight: 65,
    armor: { base: 18, dex: 'none' },
  },
  { id: 'shield', name: 'Escudo', kind: 'shield', weight: 6, shield: 2, metal: true },

  {
    id: 'potion-healing',
    name: 'Poção de cura',
    kind: 'consumable',
    weight: 0.5,
    consume: { heal: '2d4+2' },
  },
  {
    id: 'potion-healing-greater',
    name: 'Poção de cura maior',
    kind: 'consumable',
    weight: 0.5,
    consume: { heal: '4d4+4' },
  },
  {
    id: 'antidote',
    name: 'Antídoto',
    kind: 'consumable',
    weight: 0.5,
    consume: { cures: 'poisoned' },
  },

  { id: 'rations', name: 'Ração (1 dia)', kind: 'gear', weight: 2 },
  { id: 'rope', name: 'Corda de cânhamo (15 m)', kind: 'gear', weight: 10 },
  { id: 'torch', name: 'Tocha', kind: 'gear', weight: 1 },
  { id: 'backpack', name: 'Mochila', kind: 'gear', weight: 5 },
];

const BY_ID = new Map(CATALOG.map((i) => [i.id, i]));

export const getItem = (id: string): ItemDef | undefined => BY_ID.get(id);
