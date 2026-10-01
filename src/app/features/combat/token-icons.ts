import { isTokenArt } from '@core/rules/srd/miniature';

/**
 * Ícones de token (desenhos próprios em grade 24×24, contorno): sem dependência e sem licença externa.
 * Um dado sem ícone cai na inicial do nome.
 */
export const ICON_IDS = [
  'sword',
  'staff',
  'holy',
  'bow',
  'dagger',
  'shield',
  'skull',
  'ghost',
  'dragon',
  'giant',
  'paw',
  'fang',
  'eye',
  'humanoid',
  'hound',
  'chain',
] as const;
export type IconId = (typeof ICON_IDS)[number];

export const ICON_LABEL: Record<IconId, string> = {
  sword: 'Espada (guerreiro)',
  staff: 'Cajado (mago)',
  holy: 'Símbolo sagrado (clérigo)',
  bow: 'Arco (patrulheiro)',
  dagger: 'Adaga (ladino)',
  shield: 'Escudo (paladino)',
  skull: 'Caveira (morto-vivo)',
  ghost: 'Fantasma',
  dragon: 'Dragão',
  giant: 'Punho (gigante)',
  paw: 'Pata (fera)',
  fang: 'Presas (monstro)',
  eye: 'Olho (aberração)',
  humanoid: 'Humanoide',
  hound: 'Cão (sentinela)',
  chain: 'Corrente',
};

export const ICON_PATH: Record<IconId, string> = {
  sword: 'M5 19l9-9M14 10l5-5V3h-2l-5 5M8 16l-3 3M6 14l4 4',
  staff: 'M6 20L17 7M15 5l4 4M17 3v4M19 5h-4',
  holy: 'M12 3v18M5 9h14',
  bow: 'M6 4c8 2 8 14 0 16M6 4v16M6 12h13M16 9l3 3-3 3',
  dagger: 'M12 3l3 9-3 3-3-3zM12 15v6M9 15h6',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  skull: 'M12 3a7 7 0 00-4 12.7V19h8v-3.3A7 7 0 0012 3zM9.5 12h.01M14.5 12h.01M10 19v2M14 19v2',
  ghost: 'M6 20V10a6 6 0 0112 0v10l-2-2-2 2-2-2-2 2-2-2zM10 10h.01M14 10h.01',
  dragon: 'M3 15c4-1 5-6 9-9 2 1 3 2 4 4l5 1-4 2c-1 3-4 5-8 5s-5-2-6-3zM14 9h.01',
  giant:
    'M7 11V7a1.5 1.5 0 013 0v4M10 8V5.5a1.5 1.5 0 013 0V9M13 8V6a1.5 1.5 0 013 0v5M16 9V8a1.5 1.5 0 013 0v5c0 4-3 7-7 7s-6-3-6-6v-2a1.5 1.5 0 013 0',
  paw: 'M8 8h.01M12 6h.01M16 8h.01M5 12h.01M19 12h.01M8 19c0-3 2-6 4-6s4 3 4 6c0 1-1 2-4 2s-4-1-4-2z',
  fang: 'M4 8c3 2 5 2 8 2s5 0 8-2M7 10l2 8 2-8M13 10l2 8 2-8',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  humanoid: 'M12 4a3 3 0 100 6 3 3 0 000-6zM5 21c0-4 3-7 7-7s7 3 7 7',
  // cabeça de cão geométrica: orelhas em ponta, focinho largo, olhos e nariz
  hound:
    'M6 3l4 5h4l4-5 1 8-3 7-4 3-4-3-3-7zM9 11h.01M15 11h.01M10.5 15.5h3l-1.5 1.5zM12 12v3.5M8 8l1 2M16 8l-1 2',
  // três elos de corrente em diagonal
  chain:
    'M5 7a2.5 2.5 0 013.5-3.5l2 2A2.5 2.5 0 017 9zM17 15a2.5 2.5 0 013.5 3.5l-2 2A2.5 2.5 0 0115 17zM9.5 9.5l5 5M12 6l2-2 4 4-2 2M12 18l-2 2-4-4 2-2',
};

/** Palavras do nome (em inglês, como no SRD, ou em português) → ícone. */
const BY_NAME: [RegExp, IconId][] = [
  [/animated chain|corrente animada/i, 'chain'],
  [/faithful hound|cão fiel|cao fiel|watchdog/i, 'hound'],
  [/skeleton|zombie|ghoul|ghast|wight|mummy|vampire|lich|esqueleto|zumbi|múmia|carniçal/i, 'skull'],
  [/ghost|specter|wraith|shadow|will-o|fantasma|espectro/i, 'ghost'],
  [/dragon|wyvern|drake|dragão|dragao|kobold/i, 'dragon'],
  [/ogre|giant|troll|golem|ettin|gigante|ogro/i, 'giant'],
  [
    /wolf|bear|rat|boar|cat|lion|tiger|spider|snake|dog|crocodile|hound|owl|bat|horse|lobo|urso|rato|aranha|cobra/i,
    'paw',
  ],
  [/beholder|aboleth|mind flayer|gazer|eye/i, 'eye'],
  [/goblin|orc|hobgoblin|bandit|guard|cultist|knight|veteran|thug|soldier|bugbear/i, 'sword'],
  [/mage|wizard|sorcerer|warlock|acolyte|druid|priest|mago|feiticeiro/i, 'staff'],
];

export interface IconSource {
  name: string;
  kind: 'pc' | 'npc' | 'monster';
  icon?: string;
  tokenImage?: string;
  tokenArt?: string;
}

/** Retrato do token: o do próprio jogador (data URL) ou, na falta dele, a miniatura estática. */
export const tokenImageFor = (c: IconSource): string | null =>
  c.tokenImage &&
  c.tokenImage.length <= 512 * 1024 &&
  /^data:image\/(?:png|jpeg|webp);base64,/.test(c.tokenImage)
    ? c.tokenImage
    : isTokenArt(c.tokenArt)
      ? `data/${c.tokenArt}`
      : null;

export function iconFor(c: IconSource): IconId | null {
  if (c.icon && (ICON_IDS as readonly string[]).includes(c.icon)) return c.icon as IconId;
  const hit = BY_NAME.find(([re]) => re.test(c.name));
  if (hit) return hit[1];
  return c.kind === 'monster' ? 'fang' : 'humanoid';
}
