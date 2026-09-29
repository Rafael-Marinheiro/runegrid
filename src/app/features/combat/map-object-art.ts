import { MapObject, MapObjectKind, MapObjectTexture } from '@core/models/grid';

export type MapObjectGroup = 'furniture' | 'storage' | 'architecture' | 'nature' | 'camp';

interface MapObjectArt {
  label: [string, string];
  group: MapObjectGroup;
  icon: string;
  defaults: Pick<MapObject, 'texture' | 'blocksMovement' | 'blocksSight'>;
}

export const MAP_OBJECT_ART: Record<MapObjectKind, MapObjectArt> = {
  table: {
    label: ['Mesa', 'Table'],
    group: 'furniture',
    icon: 'M3 6h18v12H3zM6 9h12M6 15h12M7 6V3M17 6V3M7 18v3M17 18v3',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  chair: {
    label: ['Cadeira', 'Chair'],
    group: 'furniture',
    icon: 'M6 5h12v13H6zM9 8h6v7H9zM6 3v4M18 3v4M8 18v3M16 18v3',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  bench: {
    label: ['Banco', 'Bench'],
    group: 'furniture',
    icon: 'M3 7h18v9H3zM6 10h12M6 16v5M18 16v5',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  bed: {
    label: ['Cama', 'Bed'],
    group: 'furniture',
    icon: 'M4 3h16v18H4zM6 5h12v5H6zM6 12h12M8 6h3v2H8zM13 6h3v2h-3z',
    defaults: { texture: 'fabric', blocksMovement: true, blocksSight: false },
  },
  bookshelf: {
    label: ['Estante', 'Bookshelf'],
    group: 'furniture',
    icon: 'M4 3h16v18H4zM7 6h10M7 10h10M7 14h10M7 18h10M9 6v4M14 10v4M11 14v4',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: true },
  },
  cabinet: {
    label: ['Armário', 'Cabinet'],
    group: 'furniture',
    icon: 'M5 3h14v18H5zM12 4v16M9 12h1M14 12h1M7 6h3M14 6h3',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: true },
  },
  chest: {
    label: ['Baú', 'Chest'],
    group: 'storage',
    icon: 'M3 9h18v11H3zM4 9c0-4 3-6 8-6s8 2 8 6M3 13h18M10 13v4h4v-4',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  barrel: {
    label: ['Barril', 'Barrel'],
    group: 'storage',
    icon: 'M7 3c-2 4-2 14 0 18h10c2-4 2-14 0-18zM6 7h12M5 12h14M6 17h12M9 3c-1 5-1 13 0 18M15 3c1 5 1 13 0 18',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  crate: {
    label: ['Caixote', 'Crate'],
    group: 'storage',
    icon: 'M3 3h18v18H3zM6 6l12 12M18 6L6 18M3 8h18M3 16h18',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  pillar: {
    label: ['Pilar', 'Pillar'],
    group: 'architecture',
    icon: 'M5 3h14v4H5zM7 7h10v10H7zM5 17h14v4H5zM10 8v8M14 8v8',
    defaults: { texture: 'stone', blocksMovement: true, blocksSight: true },
  },
  'broken-column': {
    label: ['Coluna quebrada', 'Broken column'],
    group: 'architecture',
    icon: 'M5 4h14v4H5zM7 8h10v5l-3 2 3 2v3H7v-4l3-2-3-2zM4 20h16M9 9v3M15 9v3',
    defaults: { texture: 'stone', blocksMovement: true, blocksSight: false },
  },
  statue: {
    label: ['Estátua', 'Statue'],
    group: 'architecture',
    icon: 'M9 6a3 3 0 1 1 6 0 3 3 0 0 1-6 0zM8 11h8l2 7H6zM5 18h14v3H5zM10 11l-2 5M14 11l2 5',
    defaults: { texture: 'stone', blocksMovement: true, blocksSight: true },
  },
  altar: {
    label: ['Altar', 'Altar'],
    group: 'architecture',
    icon: 'M3 7h18v5H3zM6 12h12l2 9H4zM12 3v8M9 6h6',
    defaults: { texture: 'stone', blocksMovement: true, blocksSight: false },
  },
  fountain: {
    label: ['Fonte', 'Fountain'],
    group: 'architecture',
    icon: 'M3 15c0 4 4 6 9 6s9-2 9-6zM6 14h12M12 3v11M8 8c0-2 2-3 4-3s4 1 4 3M9 11c1-2 2-3 3-3s2 1 3 3',
    defaults: { texture: 'stone', blocksMovement: true, blocksSight: false },
  },
  well: {
    label: ['Poço', 'Well'],
    group: 'architecture',
    icon: 'M4 10h16v9H4zM4 10c0-4 16-4 16 0M4 19c0 3 16 3 16 0M7 9V4M17 9V4M5 4h14M12 4v5',
    defaults: { texture: 'stone', blocksMovement: true, blocksSight: false },
  },
  bridge: {
    label: ['Ponte', 'Bridge'],
    group: 'architecture',
    icon: 'M3 5h18v14H3zM7 5v14M12 5v14M17 5v14M3 8h18M3 16h18M1 4v16M23 4v16',
    defaults: { texture: 'wood', blocksMovement: false, blocksSight: false },
  },
  stairs: {
    label: ['Escada', 'Stairs'],
    group: 'architecture',
    icon: 'M3 3h18v18H3zM3 7h18M3 11h18M3 15h18M3 19h18M8 3v18M16 3v18',
    defaults: { texture: 'stone', blocksMovement: false, blocksSight: false },
  },
  rug: {
    label: ['Tapete', 'Rug'],
    group: 'furniture',
    icon: 'M5 3h14v18H5zM8 6h8v12H8zM12 8l3 4-3 4-3-4zM3 5h2M3 9h2M3 13h2M3 17h2M19 5h2M19 9h2M19 13h2M19 17h2',
    defaults: { texture: 'fabric', blocksMovement: false, blocksSight: false },
  },
  throne: {
    label: ['Trono', 'Throne'],
    group: 'furniture',
    icon: 'M6 3h12v14H6zM4 10h4M16 10h4M8 8h8v9H8zM7 17v4M17 17v4M9 5l3 2 3-2',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  tree: {
    label: ['Árvore', 'Tree'],
    group: 'nature',
    icon: 'M12 3c-4 0-7 3-7 7-2 2 0 5 3 5-1 3 1 6 4 6s5-3 4-6c3 0 5-3 3-5 0-4-3-7-7-7zM12 13v8M9 17l3-3 3 3',
    defaults: { texture: 'foliage', blocksMovement: true, blocksSight: true },
  },
  bush: {
    label: ['Arbusto', 'Bush'],
    group: 'nature',
    icon: 'M4 16c-2-3 0-6 3-6-1-4 4-6 6-3 3-3 7 0 6 3 3 1 3 5 0 7H7c-3 0-5-2-3-4zM8 13l4 8M16 12l-4 9',
    defaults: { texture: 'foliage', blocksMovement: false, blocksSight: false },
  },
  stump: {
    label: ['Toco', 'Stump'],
    group: 'nature',
    icon: 'M6 7c0-5 12-5 12 0v11c0 4-12 4-12 0zM6 7c0 4 12 4 12 0M9 7c0-2 6-2 6 0s-6 2-6 0M8 14l-3 3M16 14l3 3',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  rock: {
    label: ['Pedra', 'Rock'],
    group: 'nature',
    icon: 'M3 17l4-10 6-4 7 7 1 8-7 3-8-1zM7 7l5 5 8-2M6 20l6-8 2 9',
    defaults: { texture: 'stone', blocksMovement: true, blocksSight: false },
  },
  boulder: {
    label: ['Rochedo', 'Boulder'],
    group: 'nature',
    icon: 'M3 16L6 7l7-4 7 5 1 9-6 4H7zM6 7l6 5 8-4M12 12l3 9M3 16l9-4',
    defaults: { texture: 'stone', blocksMovement: true, blocksSight: true },
  },
  campfire: {
    label: ['Fogueira', 'Campfire'],
    group: 'camp',
    icon: 'M5 19l14-6M5 13l14 6M12 3c4 4 4 8 0 11-4-3-4-6 0-11zM12 8c2 2 2 4 0 6-2-2-2-4 0-6z',
    defaults: { texture: 'earth', blocksMovement: false, blocksSight: false },
  },
  tent: {
    label: ['Barraca', 'Tent'],
    group: 'camp',
    icon: 'M12 3L3 20h18zM12 3v17M8 20l4-8 4 8M5 17h14',
    defaults: { texture: 'fabric', blocksMovement: true, blocksSight: true },
  },
  cart: {
    label: ['Carroça', 'Cart'],
    group: 'camp',
    icon: 'M3 5h15v11H3zM18 8h3v5h-3M7 18a3 3 0 1 0 0 .1M16 18a3 3 0 1 0 0 .1M6 8h9M6 12h9',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  anvil: {
    label: ['Bigorna', 'Anvil'],
    group: 'camp',
    icon: 'M3 6h18l-4 5h-5v5h4v5H6v-5h4v-5H6zM8 8h9',
    defaults: { texture: 'metal', blocksMovement: true, blocksSight: false },
  },
  brazier: {
    label: ['Braseiro', 'Brazier'],
    group: 'camp',
    icon: 'M5 9h14c0 5-3 8-7 8s-7-3-7-8zM8 17l-2 4M16 17l2 4M12 17v4M9 8c-2-2 1-3 0-5M13 8c-2-2 1-3 0-5M17 8c-2-2 1-3 0-5',
    defaults: { texture: 'metal', blocksMovement: true, blocksSight: false },
  },
  'weapon-rack': {
    label: ['Suporte de armas', 'Weapon rack'],
    group: 'camp',
    icon: 'M4 5h16v4H4zM6 9v12M18 9v12M8 14h8M9 3l6 18M15 3L9 21',
    defaults: { texture: 'wood', blocksMovement: true, blocksSight: false },
  },
  cauldron: {
    label: ['Caldeirão', 'Cauldron'],
    group: 'camp',
    icon: 'M4 8h16c0 7-3 11-8 11S4 15 4 8zM3 8h18M8 19l-2 3M16 19l2 3M7 6c0-3 10-3 10 0M9 5c-2-2 1-3 0-5M14 5c-2-2 1-3 0-5',
    defaults: { texture: 'metal', blocksMovement: true, blocksSight: false },
  },
};

export const MAP_OBJECT_GROUPS: { id: MapObjectGroup; label: [string, string] }[] = [
  { id: 'furniture', label: ['Móveis', 'Furniture'] },
  { id: 'storage', label: ['Armazenamento', 'Storage'] },
  { id: 'architecture', label: ['Arquitetura', 'Architecture'] },
  { id: 'nature', label: ['Natureza', 'Nature'] },
  { id: 'camp', label: ['Acampamento e oficina', 'Camp and workshop'] },
];

export const MAP_OBJECT_TEXTURE_LABEL: Record<MapObjectTexture, [string, string]> = {
  wood: ['Madeira', 'Wood'],
  stone: ['Pedra', 'Stone'],
  metal: ['Metal', 'Metal'],
  fabric: ['Tecido', 'Fabric'],
  foliage: ['Folhagem', 'Foliage'],
  earth: ['Terra e carvão', 'Earth and charcoal'],
};
