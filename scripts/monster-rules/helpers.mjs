// Atalhos para escrever a mecânica das habilidades de monstros (ver `src/app/core/models/spell.ts`: `AbilityMeta`).
// Cada habilidade é lida a partir do texto oficial em public/data/monsters*.json; aqui só se declara o que o motor faz.
export * from '../spell-rules/helpers.mjs';

/** Uma habilidade: nome em pt-BR, nome do SRD (em inglês), custo/recarga e a mecânica. */
export const A = (pt, en, ability, rule = {}) => ({ pt, en, ability, ...rule });

/** Custos. `dc` e `attackBonus` vêm do texto do monstro. */
export const action = (o = {}) => ({ cost: 'action', ...o });
export const bonus = (o = {}) => ({ cost: 'bonus', ...o });
export const reaction = (o = {}) => ({ cost: 'reaction', ...o });
export const free = (o = {}) => ({ cost: 'free', ...o });
/** Ação lendária de `n` pontos. */
export const legendary = (n = 1, o = {}) => ({
  cost: 'legendary',
  ...(n > 1 ? { legendary: n } : {}),
  ...o,
});
/** "Recharge 5-6" → `recharge(5)`. */
export const recharge = (n, o = {}) => action({ recharge: n, ...o });
/** "3/Day". */
export const perDay = (n, o = {}) => action({ uses: { n, per: 'day' }, ...o });
/** "Recharges after a Short or Long Rest". */
export const perRest = (o = {}) => action({ uses: { n: 1, per: 'rest' }, ...o });

/** Nota para o Mestre nos dois idiomas. */
export const man = (manual, manualEn) => ({ manual, manualEn });

/** Consequência extra de um ataque de arma de mesmo nome (`en` = nome do ataque no SRD). */
export const rider = (pt, en, dc, rule = {}) => ({
  pt,
  en,
  ability: { cost: 'free', rider: en, dc },
  ...rule,
});

/** Traço passivo com efeito de regra (`mods`: ver `EffectMods`). */
export const T = (pt, en, mods, extra = {}) => ({ pt, en, mods, ...extra });
