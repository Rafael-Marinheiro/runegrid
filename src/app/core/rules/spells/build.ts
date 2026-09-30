import { Spell, SpellRule, CastTime } from '../../models/spell';
import { SrdSpell } from '../../models/srd';
import { spellNamePt } from '../srd/names-pt';
import { baseSpellId } from './registry';

/** Entrada de `spell-rules*.json`; no 2024 herda a do 2014 e muda só os campos presentes (`replace` troca tudo). */
export type SpellRuleEntry = SpellRule & { replace?: boolean };
export type SpellRules = Record<string, SpellRuleEntry>;

/** "1 action", "1 bonus action", "1 reaction, which you take…", "action" (2024), "1 minute"… */
export function parseCastTime(text: string): { castTime: CastTime; trigger?: string } {
  const t = text.trim().toLowerCase();
  if (/^(1 )?bonus[ -]action/.test(t)) return { castTime: 'bonus' };
  if (/^(1 )?reaction/.test(t)) {
    const trigger = /,\s*(.+)$/.exec(text.trim())?.[1];
    return { castTime: 'reaction', ...(trigger ? { trigger } : {}) };
  }
  if (/^(1 )?action$/.test(t)) return { castTime: 'action' };
  return { castTime: 'long' };
}

/** Alcance em pés: "Self" 0, "Touch" 5, "60 feet", "1 mile"; "Sight"/"Unlimited" = 9999. */
export function parseRange(text: string): number {
  const t = text.trim().toLowerCase();
  if (t.startsWith('self')) return 0;
  if (t === 'touch') return 5;
  const ft = /^(\d[\d,]*)\s*(feet|foot|ft)/.exec(t);
  if (ft) return Number(ft[1].replace(/,/g, ''));
  const mi = /^(\d+)\s*miles?/.exec(t);
  if (mi) return Number(mi[1]) * 5280;
  return 9999;
}

/** Duração em rodadas de 6 s; `undefined` para instantânea, "até dissipar" ou especial. */
export function parseRounds(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  const m = /(\d+)\s*(round|minute|hour|day)s?/.exec(t);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = { round: 1, minute: 10, hour: 600, day: 14400 }[m[2] as 'round'];
  return n * unit;
}

const TOUCH_OR_SELF_TARGET = { kind: 'creature' } as const;

/** Junta o registro do SRD (alcance, duração, texto oficial) com a mecânica escrita a mão. */
export function buildSpell(srd: SrdSpell, rule: SpellRule): Spell {
  const cast = parseCastTime(srd.castingTime);
  const range = rule.range ?? parseRange(srd.range);
  const rounds = rule.rounds ?? parseRounds(srd.duration);
  const target = rule.target ?? (range === 0 ? { kind: 'self' as const } : TOUCH_OR_SELF_TARGET);
  const description = srd.higher ? `${srd.desc}\n\n${srd.higher}` : srd.desc;
  return {
    ...rule,
    id: baseSpellId(srd.id),
    name: spellNamePt(srd.name),
    level: srd.level,
    school: srd.school,
    castTime: rule.castTime ?? cast.castTime,
    ...(cast.trigger ? { trigger: cast.trigger } : {}),
    range,
    ...(rounds !== undefined ? { rounds } : {}),
    concentration: rule.concentration ?? srd.concentration,
    target,
    resolution: rule.resolution ?? { kind: 'auto' },
    description,
  };
}

/** Regras do 2014 com as mudanças do 2024 por cima. */
export function mergeRules(base: SpellRules, over: SpellRules): SpellRules {
  const out: SpellRules = { ...base };
  for (const [id, r] of Object.entries(over)) {
    const { replace, ...rest } = r;
    out[id] = replace || !base[id] ? rest : { ...base[id], ...rest };
  }
  return out;
}

/** Monta as magias de um conjunto de regras; magias sem entrada em `rules` ficam de fora. */
export function buildSpells(srd: SrdSpell[], rules: SpellRules): Spell[] {
  return srd.flatMap((s) => {
    const r = rules[baseSpellId(s.id)];
    return r ? [buildSpell(s, r)] : [];
  });
}
