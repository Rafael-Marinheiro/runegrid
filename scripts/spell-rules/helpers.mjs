// Atalhos para escrever a mecânica das magias (ver `src/app/core/models/spell.ts`).
// Cada magia é lida a partir do texto oficial em public/data/spells*.json; aqui só se declara o que o motor faz.

/** Alvos. */
export const creature = (max = 1, perLevel = 0) => ({
  kind: 'creature',
  ...(max > 1 ? { max } : {}),
  ...(perLevel ? { perLevel } : {}),
});
export const self = { kind: 'self' };
export const point = { kind: 'point' };
export const sphere = (radius, o = {}) => ({ kind: 'sphere', radius, ...o });
export const cube = (size, o = {}) => ({ kind: 'cube', size, ...o });
export const cone = (length) => ({ kind: 'cone', length });
export const line = (length, width) => ({ kind: 'line', length, width });

/** Resolução. */
export const attack = { kind: 'attack' };
export const auto = { kind: 'auto' };
export const save = (ability, onSave = 'none') => ({ kind: 'save', ability, onSave });
export const pool = (dice, perLevel) => ({ kind: 'pool', dice, ...(perLevel ? { perLevel } : {}) });

/** Dano, cura, condição, efeito. */
export const dmg = (dice, type, o = {}) => ({ dice, type, ...o });
export const cantrip = (dice, type, o = {}) => dmg(dice, type, { cantrip: true, ...o });
export const cond = (name, rounds = 0, o = {}) => ({ name, rounds, ...o });
export const effect = (mods, o = {}) => ({ mods, ...o });

/** Efeito visual: bolts | ray | glow | burst | cone + cor; `o` = { impact, radius }. */
export const vfx = (kind, color, o = {}) => ({ kind, color, ...o });

/** Magia sem mecânica no motor: gasta espaço/concentração e registra o texto oficial. */
export const narrative = (v, o = {}) => ({
  narrative: true,
  target: self,
  ...(v ? { vfx: v } : {}),
  ...o,
});

/** Modificadores por espaço: `ladder(3, 9, (s) => ({ maxHp: 5 * (s - 1) }))` → um degrau por nível. */
export const ladder = (from, to, fn) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ from: from + i, mods: fn(from + i) }));

/** Todos os tipos de dano (Vínculo Protetor: resistência a tudo). */
export const ALL_DAMAGE = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
];

/** Escolha feita ao lançar (Proteção contra Energia: o tipo de dano); `patch` troca campos da magia. */
export const opt = (id, label, patch) => ({ id, label, patch });
