import { ItemKind } from '@core/models/item';

/** Ícones próprios em grade 24×24, só contorno e sem dependência externa. */
export const ITEM_ICON_PATH: Record<ItemKind, string> = {
  weapon: 'M5 19l9-9M14 10l5-5V3h-2l-5 5M8 16l-3 3M6 14l4 4',
  armor: 'M8 4l4-2 4 2 4 3-3 5v9H7v-9L4 7zM10 3v5h4V3',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  consumable: 'M9 3h6M10 3v5l-4 5v8h12v-8l-4-5V3M8 14h8',
  gear: 'M4 7h16v13H4zM9 7V4h6v3M4 12h16M10 12v2h4v-2',
};

export const ITEM_ICON_LABEL: Record<ItemKind, string> = {
  weapon: 'Arma',
  armor: 'Armadura',
  shield: 'Escudo',
  consumable: 'Poção ou consumível',
  gear: 'Equipamento',
};

export const itemIconFor = (kind: ItemKind): string => ITEM_ICON_PATH[kind];
