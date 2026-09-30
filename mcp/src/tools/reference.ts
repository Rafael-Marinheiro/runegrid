import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ABILITIES, SKILLS, type Ability, type Skill } from '@core/models/creature';
import type { SrdMonster } from '@core/models/srd';
import { abilityMod, autoFailsSave, saveBonus, skillBonus } from '@core/rules/creature';
import { roll, rollD20, type AdvMode, type RollResult } from '@core/rules/dice';
import { CATALOG } from '@core/rules/inventory/catalog';
import { SPELLS } from '@core/rules/spells/data';
import { crLabel } from '@core/rules/srd/convert';
import { monsterNamePt, spellNamePt } from '@core/rules/srd/names-pt';
import { z } from 'zod';
import { activeGame, type Game } from '../campaign';
import { monstersOf, spellsOf } from '../data';
import { findMonster, tx, who } from '../game';
import { journal, secretLog } from '../journal';
import { GameError, READ, WRITE, fmt, plain, reply } from '../util';
import { ModeSchema } from './schemas';

/** The active campaign if there is one; dice and lookups work without. */
const maybeGame = (): Game | null => {
  try {
    return activeGame();
  } catch {
    return null;
  }
};

const showRoll = (r: RollResult): string =>
  r.terms
    .map((t) =>
      t.dice.length
        ? `[${t.dice.map((d) => (d.dropped ? `~${d.value}~` : d.value)).join(', ')}]`
        : fmt(t.subtotal),
    )
    .join(' ')
    .replace(/ \+(\d)/g, ' + $1');

/** Writes a mechanical roll to the diary, or to the DM-only log when secret. */
function record(text: string, secret: boolean): void {
  const g = maybeGame();
  if (!g) return;
  if (secret) secretLog(g, `- 🎲 ${text}`);
  else tx(g, () => journal(g, 'rules', text));
}

const statBlock = (m: SrdMonster, ruleset: string): string => {
  const mod = (n: number) => `${n} (${fmt(abilityMod(n))})`;
  const kv = (label: string, v: string | undefined | false) => (v ? `${label}: ${v}` : '');
  return [
    `# ${monsterNamePt(m.name)} (${m.name}) — ${m.size} ${m.type}, CR ${crLabel(m.cr)} [id ${m.id}, SRD ${ruleset}]`,
    `AC ${m.ac} · HP ${m.hp} (${m.hitDice}) · Speed ${m.speed} ft`,
    `STR ${mod(m.abilities[0])} · DEX ${mod(m.abilities[1])} · CON ${mod(m.abilities[2])} · INT ${mod(m.abilities[3])} · WIS ${mod(m.abilities[4])} · CHA ${mod(m.abilities[5])}`,
    kv(
      'Saves',
      Object.keys(m.saves).length > 0 &&
        Object.entries(m.saves)
          .map(([a, v]) => `${a.toUpperCase()} ${fmt(v as number)}`)
          .join(', '),
    ),
    kv(
      'Skills',
      Object.keys(m.skills).length > 0 &&
        Object.entries(m.skills)
          .map(([a, v]) => `${a} ${fmt(v)}`)
          .join(', '),
    ),
    kv('Damage notes', m.notes),
    kv('Senses', m.senses),
    kv('Languages', m.languages),
    m.traits.length
      ? `\n## Traits\n${m.traits.map((t) => `- **${t.name}.** ${t.desc}`).join('\n')}`
      : '',
    m.actions.length
      ? `\n## Actions\n${m.actions.map((t) => `- **${t.name}.** ${t.desc}`).join('\n')}`
      : '',
    `\nEngine attacks (auto-resolved in combat): ${m.attacks.map((a, i) => `[${i}] ${a.name} ${fmt(a.bonus)} ${a.damage} ${a.type} ${a.range} ft`).join(' | ') || 'none'}${m.attacksPerAction > 1 ? ` — ${m.attacksPerAction} attacks per action` : ''}. Traits/special actions above are NOT automated: apply them by hand.`,
  ]
    .filter(Boolean)
    .join('\n');
};

export function registerReference(server: McpServer): void {
  server.registerTool(
    'rg_roll',
    {
      title: 'Roll dice',
      description: `Roll dice with the engine's RNG: "2d6+3", "d20+5", "4d6kh3" (keep highest 3), "1d8+1d6+2". Advantage/disadvantage only for a single d20 ("d20+5"). Never invent a die result — always roll. Logged to the diary (or to the DM-only secret log when secret=true: the reply still tells you, but do not reveal it).
Args: expr; mode (normal|advantage|disadvantage); secret; reason (what the roll is for).`,
      inputSchema: {
        expr: z.string().min(1).max(60),
        mode: ModeSchema.default('normal'),
        secret: z.boolean().default(false),
        reason: z.string().max(200).optional(),
      },
      annotations: WRITE,
    },
    ({ expr, mode, secret, reason }) =>
      reply(() => {
        const d20 = /^\s*1?d20\s*([+-]\s*\d+)?\s*$/i.exec(expr);
        if (mode !== 'normal' && !d20)
          throw new GameError(
            'Advantage/disadvantage only applies to a single d20 roll such as "d20+5".',
          );
        const r = d20 ? rollD20(Number((d20[1] ?? '0').replace(/\s/g, '')), mode).roll : roll(expr);
        const text = `${expr}${mode !== 'normal' ? ` (${mode})` : ''}: ${showRoll(r)} = **${r.total}**${reason ? ` — ${reason}` : ''}`;
        record(text, secret);
        return secret ? `SECRET (do not reveal) — ${text}` : text;
      }),
  );

  server.registerTool(
    'rg_check',
    {
      title: 'Ability check / saving throw',
      description: `Roll a d20 check for a creature using its real modifiers (ability score, proficiency from level/CR, expertise, save proficiencies). Conditions apply automatically: poisoned/frightened give disadvantage on ability & skill checks; paralyzed/stunned/unconscious auto-fail STR/DEX saves. Logged to the diary unless secret.
Args: who (creature name); kind (ability|skill|save); key (ability: str|dex|con|int|wis|cha; skill: ${Object.keys(SKILLS).join('|')}); dc (optional — reports success/failure); mode; secret (e.g. passive-style Perception/Stealth checks the players should not see); reason.`,
      inputSchema: {
        who: z.string(),
        kind: z.enum(['ability', 'skill', 'save']),
        key: z.string().describe('Ability key or skill key'),
        dc: z.number().int().min(1).max(40).optional(),
        mode: ModeSchema.default('normal'),
        secret: z.boolean().default(false),
        reason: z.string().max(200).optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      reply(() => {
        const g = activeGame();
        const c = who(g, a.who);
        let bonus: number;
        let label: string;
        if (a.kind === 'skill') {
          if (!(a.key in SKILLS))
            throw new GameError(
              `Unknown skill "${a.key}". Skills: ${Object.keys(SKILLS).join(', ')}.`,
            );
          bonus = skillBonus(c, a.key as Skill);
          label = SKILLS[a.key as Skill].label;
        } else {
          if (!(ABILITIES as readonly string[]).includes(a.key))
            throw new GameError(`Unknown ability "${a.key}". Use one of ${ABILITIES.join(', ')}.`);
          const ab = a.key as Ability;
          bonus = a.kind === 'save' ? saveBonus(c, ab) : abilityMod(c.abilities[ab]);
          label = `${a.kind === 'save' ? 'Salvaguarda de ' : 'Teste de '}${ab.toUpperCase()}`;
        }
        const autoFail = a.kind === 'save' && autoFailsSave(c, a.key as Ability);
        const hindered =
          a.kind !== 'save' &&
          c.conditions.some((k) => k.name === 'poisoned' || k.name === 'frightened');
        const modes: AdvMode[] = [a.mode, ...(hindered ? (['disadvantage'] as const) : [])];
        const mode: AdvMode =
          modes.includes('advantage') && !modes.includes('disadvantage')
            ? 'advantage'
            : modes.includes('disadvantage') && !modes.includes('advantage')
              ? 'disadvantage'
              : 'normal';
        const r = rollD20(bonus, mode);
        const verdict = autoFail
          ? ' → AUTO-FAIL (condition)'
          : a.dc
            ? ` vs DC ${a.dc} → ${r.roll.total >= a.dc ? 'SUCCESS' : 'FAILURE'}`
            : '';
        const text = `${c.name} — ${label}: d20 ${r.natural}${mode !== 'normal' ? ` (${mode})` : ''} ${fmt(bonus)} = **${r.roll.total}**${verdict}${hindered ? ' [disadvantage from condition]' : ''}${reason(a.reason)}`;
        record(text, a.secret);
        return a.secret ? `SECRET (do not reveal) — ${text}` : text;
      }),
  );

  server.registerTool(
    'rg_srd_search',
    {
      title: 'Search SRD (monsters, spells, items)',
      description: `Search the bundled SRD. Monsters and spells match English and Portuguese names; ids are what other tools take.
kind "monster": filters cr_min, cr_max, type (beast, undead, humanoid…); "spell": level (0 = cantrip); "item": the equipment catalog used by rg_character_create (weapons, armor, potions, gear).
Spells marked ✔engine are resolved automatically by rg_combat_act cast; others you adjudicate. Args: kind, query, filters, ruleset ('2014'|'2024', default = campaign's), limit (default 15), offset.`,
      inputSchema: {
        kind: z.enum(['monster', 'spell', 'item']),
        query: z.string().optional(),
        cr_min: z.number().min(0).optional(),
        cr_max: z.number().min(0).optional(),
        type: z.string().optional(),
        level: z.number().int().min(0).max(9).optional(),
        ruleset: z.enum(['2014', '2024']).optional(),
        limit: z.number().int().min(1).max(50).default(15),
        offset: z.number().int().min(0).default(0),
      },
      annotations: READ,
    },
    (a) =>
      reply(() => {
        const rs = a.ruleset ?? maybeGame()?.ruleset ?? '2014';
        const q = a.query ? plain(a.query) : '';
        let rows: string[];
        if (a.kind === 'monster')
          rows = monstersOf(rs)
            .filter(
              (m) =>
                (!q ||
                  [m.id, plain(m.name), plain(monsterNamePt(m.name))].some((n) => n.includes(q))) &&
                (a.cr_min === undefined || m.cr >= a.cr_min) &&
                (a.cr_max === undefined || m.cr <= a.cr_max) &&
                (!a.type || plain(m.type).startsWith(plain(a.type))),
            )
            .sort((x, y) => x.cr - y.cr || x.name.localeCompare(y.name))
            .map(
              (m) =>
                `${m.id} | ${monsterNamePt(m.name)} | CR ${crLabel(m.cr)} | ${m.size} ${m.type} | HP ${m.hp} | AC ${m.ac}`,
            );
        else if (a.kind === 'spell')
          rows = spellsOf(rs)
            .filter(
              (s) =>
                (!q ||
                  [s.id, plain(s.name), plain(spellNamePt(s.name))].some((n) => n.includes(q))) &&
                (a.level === undefined || s.level === a.level),
            )
            .sort((x, y) => x.level - y.level || x.name.localeCompare(y.name))
            .map(
              (s) =>
                `${s.id} | ${spellNamePt(s.name)} | L${s.level} | ${s.school} | ${s.classes.join('/')}${SPELLS.some((e) => e.id === s.id) ? ' | ✔engine' : ''}`,
            );
        else
          rows = CATALOG.filter((i) => !q || i.id.includes(q) || plain(i.name).includes(q)).map(
            (i) =>
              `${i.id} | ${i.name} | ${i.kind}${i.weapon ? ` | ${i.weapon.damage} ${i.weapon.type}, ${i.weapon.range} ft${i.weapon.finesse ? ', finesse' : ''}${i.weapon.versatile ? `, versatile ${i.weapon.versatile}` : ''}` : ''}${i.armor ? ` | AC ${i.armor.base}${i.armor.dex === 'full' ? '+DEX' : i.armor.dex === 'max2' ? '+DEX(max 2)' : ''}` : ''}${i.shield ? ` | +${i.shield} AC` : ''}${i.consume?.heal ? ` | heals ${i.consume.heal}` : ''}`,
          );
        const page = rows.slice(a.offset, a.offset + a.limit);
        if (!page.length) return 'No matches.';
        return `${rows.length} match(es)${rows.length > a.offset + page.length ? `; showing ${a.offset + 1}–${a.offset + page.length} (use offset for more)` : ''}:\n${page.join('\n')}`;
      }),
  );

  server.registerTool(
    'rg_srd_get',
    {
      title: 'Get SRD entry',
      description:
        'Full SRD entry. Monster: complete stat block with traits and actions (what the engine automates: the listed attacks; traits such as Pack Tactics or breath weapons you apply by hand). Spell: full text, and the mechanics the engine implements if it does. Args: kind (monster|spell); id (id, or English/Portuguese name); ruleset.',
      inputSchema: {
        kind: z.enum(['monster', 'spell']),
        id: z.string().min(1),
        ruleset: z.enum(['2014', '2024']).optional(),
      },
      annotations: READ,
    },
    ({ kind, id, ruleset }) =>
      reply(() => {
        const g = maybeGame();
        const rs = ruleset ?? g?.ruleset ?? '2014';
        if (kind === 'monster') return statBlock(findMonster(rs, id), rs);
        const r = plain(id);
        const s = spellsOf(rs).find(
          (x) =>
            x.id === r.replace(/\s+/g, '-') ||
            plain(x.name) === r ||
            plain(spellNamePt(x.name)) === r,
        );
        if (!s) throw new GameError(`No spell "${id}" in SRD ${rs}. Use rg_srd_search kind=spell.`);
        const e = SPELLS.find((x) => x.id === s.id);
        return [
          `# ${spellNamePt(s.name)} (${s.name}) — level ${s.level} ${s.school} [id ${s.id}]`,
          `Casting time ${s.castingTime} · Range ${s.range} · Components ${s.components} · Duration ${s.duration}${s.concentration ? ' (concentration)' : ''}${s.ritual ? ' · ritual' : ''}`,
          `Classes: ${s.classes.join(', ')}`,
          '',
          s.desc,
          s.higher ? `\nAt higher levels: ${s.higher}` : '',
          e
            ? `\n✔ Engine-resolved: rg_combat_act cast handles targeting, attack/save rolls, damage/healing, slots and conditions automatically (${JSON.stringify({ target: e.target, resolution: e.resolution, damage: e.damage?.dice, heal: e.heal?.dice })}).`
            : '\n✘ Not automated: adjudicate it yourself (rg_dm_command damage/heal/add_condition, rg_character_update spend_slot).',
        ]
          .filter((l) => l !== '')
          .join('\n');
      }),
  );
}

const reason = (r?: string): string => (r ? ` — ${r}` : '');
