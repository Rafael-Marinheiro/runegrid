import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SKILLS, type Creature } from '@core/models/creature';
import { newCreature } from '@core/models/creature-factory';
import { fullCasterSlots, rest } from '@core/rules/creature';
import { addItem, removeItem, toggleEquip } from '@core/rules/inventory/inventory';
import { CATALOG, getItem } from '@core/rules/inventory/catalog';
import { spendResource, spendSlot } from '@core/rules/creature';
import { allSpells } from '@core/rules/spells/data';
import { z } from 'zod';
import { activeGame, type Game } from '../campaign';
import { exec, place, tx, who } from '../game';
import { journal } from '../journal';
import { isPartyMember, sheetPath, sheetText } from '../sheets';
import { edit, setSection } from '../vault';
import { GameError, READ, WRITE, plain, reply } from '../util';
import { AbilitySchema, DamageTypeSchema, PosSchema, SizeSchema } from './schemas';

const ABILITY_DEFAULTS = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

/** Engine spell ids for the names given; unknown ones are kept as slugs (narrated by hand). */
function spellIds(names: string[]): { ids: string[]; manual: string[] } {
  const ids: string[] = [];
  const manual: string[] = [];
  for (const n of names) {
    const r = plain(n);
    const s = allSpells('2024').find((x) => x.id === r.replace(/\s+/g, '-') || plain(x.name) === r);
    if (s) ids.push(s.id);
    else {
      ids.push(r.replace(/\s+/g, '-'));
      manual.push(n);
    }
  }
  return { ids, manual };
}

function itemRef(ref: string): string {
  const r = plain(ref);
  const d = CATALOG.find((i) => i.id === r || plain(i.name) === r || plain(i.name).includes(r));
  if (!d)
    throw new GameError(
      `Unknown item "${ref}". Catalog ids: ${CATALOG.map((i) => i.id).join(', ')}.`,
    );
  return d.id;
}

const replaceCreature = (g: Game, c: Creature): void => {
  g.scene = { ...g.scene, creatures: g.scene.creatures.map((x) => (x.id === c.id ? c : x)) };
};

/** Skill names are validated here rather than in the schema (an 18-key enum would bloat every tool listing). */
function skillMap(
  skills: Record<string, 'proficient' | 'expertise'> | undefined,
): Creature['skills'] {
  for (const k of Object.keys(skills ?? {}))
    if (!(k in SKILLS))
      throw new GameError(`Unknown skill "${k}". Skills: ${Object.keys(SKILLS).join(', ')}.`);
  return { ...skills } as Creature['skills'];
}

const ResourceSchema = z.object({
  name: z.string().max(60),
  max: z.number().int().min(1),
  recharge: z.enum(['short', 'long']).default('long'),
});

export function registerCharacters(server: McpServer): void {
  server.registerTool(
    'rg_character_create',
    {
      title: 'Create character',
      description: `Create a player character (kind "pc"), an allied NPC that fights with the party (kind "npc"), or a custom opponent with its own stat block (kind "monster"; for SRD monsters use rg_scene_add_monsters instead). A sheet note is written to Personagens/ for pc/npc.
Game-rule side: "npc" = party side, "monster" = opposition side. Hostile humans should be "monster".
The engine computes modifiers, proficiency (from level, or cr for monsters) and — if you give "equipment" (catalog ids, see rg_srd_search kind=item) — equips weapons/armor/shield and derives attacks and AC from them. Extra "attacks" are for natural weapons/special attacks: {name, bonus (total to-hit), damage ("1d8+3"), type, range (ft)}.
Spellcasters: spellcasting {ability, spells:[names or ids]} plus full_caster:true (slots by level) or spell_slots {"1":4,"2":2}. The engine can auto-resolve only some spells (see rg_srd_get); others are narrated by you.
Put the character on the map with position, or near/room; omit to add without a token.
Args: name, kind, level (1-20), abilities (scores), hp (max), plus optional speed, size, darkvision, ac (else from equipment/10+DEX), save_proficiencies, skills, resistances, immunities, vulnerabilities, resources ({name,max,recharge}), attacks_per_action, background (written to the sheet note).`,
      inputSchema: {
        name: z.string().min(1).max(60),
        kind: z.enum(['pc', 'npc', 'monster']).default('pc'),
        level: z.number().int().min(1).max(20).default(1),
        cr: z
          .number()
          .min(0)
          .max(30)
          .optional()
          .describe('Challenge rating (monsters/NPCs; drives proficiency and XP)'),
        abilities: z
          .object({
            str: z.number().int().min(1).max(30),
            dex: z.number().int().min(1).max(30),
            con: z.number().int().min(1).max(30),
            int: z.number().int().min(1).max(30),
            wis: z.number().int().min(1).max(30),
            cha: z.number().int().min(1).max(30),
          })
          .partial()
          .optional(),
        hp: z.number().int().min(1).max(999),
        ac: z.number().int().min(1).max(30).optional(),
        speed: z.number().int().min(0).default(30),
        size: SizeSchema.default('medium'),
        darkvision: z.number().int().min(0).optional(),
        save_proficiencies: z.array(AbilitySchema).optional(),
        skills: z
          .record(z.string(), z.enum(['proficient', 'expertise']))
          .describe(
            'skill → proficient|expertise; skills: acrobatics, animalHandling, arcana, athletics, deception, history, insight, intimidation, investigation, medicine, nature, perception, performance, persuasion, religion, sleightOfHand, stealth, survival',
          )
          .optional(),
        attacks: z
          .array(
            z.object({
              name: z.string(),
              bonus: z.number().int(),
              damage: z.string().regex(/^\d+d\d+([+-]\d+)?$/, 'like 1d8+3'),
              type: DamageTypeSchema,
              range: z.number().int().min(5).default(5),
            }),
          )
          .optional(),
        attacks_per_action: z.number().int().min(1).max(6).optional(),
        equipment: z.array(z.string()).optional(),
        spellcasting: z.object({ ability: AbilitySchema, spells: z.array(z.string()) }).optional(),
        full_caster: z.boolean().optional(),
        spell_slots: z.record(z.string(), z.number().int().min(1).max(9)).optional(),
        resources: z.array(ResourceSchema).optional(),
        resistances: z.array(DamageTypeSchema).optional(),
        immunities: z.array(DamageTypeSchema).optional(),
        vulnerabilities: z.array(DamageTypeSchema).optional(),
        background: z.string().max(4000).optional(),
        position: PosSchema.optional(),
        near: z.string().optional().describe('Creature name to stand beside'),
        room: z.string().optional().describe('Room id/name to appear in'),
        hidden: z.boolean().default(false),
      },
      annotations: WRITE,
    },
    (a) =>
      reply(() => {
        const g = activeGame();
        if (g.scene.creatures.some((c) => plain(c.name) === plain(a.name)))
          throw new GameError(`A creature named "${a.name}" already exists.`);
        const { ids, manual } = spellIds(a.spellcasting?.spells ?? []);
        let c = newCreature(a.kind, {
          name: a.name,
          level: a.level,
          ...(a.kind === 'monster' || a.cr !== undefined ? { cr: a.cr ?? a.level } : {}),
          size: a.size,
          speed: a.speed,
          darkvision: a.darkvision ?? 0,
          ac: a.ac ?? 10,
          abilities: { ...ABILITY_DEFAULTS, ...a.abilities },
          saveProficiencies: a.save_proficiencies ?? [],
          skills: skillMap(a.skills),
          hp: { max: a.hp, current: a.hp, temp: 0 },
          attacks: a.attacks ?? [],
          attacksPerAction: a.attacks_per_action ?? 1,
          resistances: a.resistances ?? [],
          immunities: a.immunities ?? [],
          vulnerabilities: a.vulnerabilities ?? [],
          resources: (a.resources ?? []).map((r) => ({ ...r, used: 0 })),
          ...(a.spellcasting
            ? { spellcasting: { ability: a.spellcasting.ability, spells: ids } }
            : {}),
          spellSlots: a.full_caster
            ? fullCasterSlots(a.level)
            : Object.fromEntries(
                Object.entries(a.spell_slots ?? {}).map(([lv, max]) => [lv, { max, used: 0 }]),
              ),
        });
        if (a.ac === undefined) c = { ...c, ac: 10 + Math.floor((c.abilities.dex - 10) / 2) };
        for (const ref of a.equipment ?? []) {
          const id = itemRef(ref);
          c = addItem(c, id);
          const last = c.inventory![c.inventory!.length - 1];
          if (['weapon', 'armor', 'shield'].includes(getItem(id)!.kind))
            c = toggleEquip(c, last.id);
        }
        const out = tx(g, () => {
          const pos = place(
            g,
            c.size === 'large' ? 2 : c.size === 'huge' ? 3 : c.size === 'gargantuan' ? 4 : 1,
            { pos: a.position, near: a.near, room: a.room },
          );
          exec(g, { type: 'addCreature', creature: c, ...(pos ? { pos, hidden: a.hidden } : {}) });
          if (isPartyMember(c))
            journal(
              g,
              'event',
              `[[${c.name}]] entra na história (${c.kind === 'pc' ? 'personagem' : 'aliado'}, nível ${c.level}).`,
            );
          return `${sheetText(c)}${
            manual.length
              ? `
Note: engine cannot auto-resolve ${manual.join(', ')} — narrate/adjudicate them by hand.`
              : ''
          }`;
        });
        // the sheet note exists once tx has persisted; the background goes under its "História" section
        if (a.background && isPartyMember(c))
          edit(sheetPath(g, c), (t) => setSection(t, 'História', a.background!));
        return out;
      }),
  );

  server.registerTool(
    'rg_character_get',
    {
      title: 'Get character sheet',
      description:
        'Full sheet of any creature in the scene (party, NPC or monster): ability scores and modifiers, HP, AC, proficiency, saves, skills, attacks (with the index used by attack actions), spellcasting, slots, resources, inventory, conditions, XP and map position. Args: name.',
      inputSchema: { name: z.string().min(1) },
      annotations: READ,
    },
    ({ name }) =>
      reply(() => {
        const g = activeGame();
        const c = who(g, name);
        const t = g.scene.tokens.find((x) => x.creatureId === c.id);
        return `# ${c.name} (${c.kind}, level ${c.level}${c.cr !== undefined ? `, CR ${c.cr}` : ''}, ${c.size})\n${t ? `Position: (${t.pos.x},${t.pos.y})${t.hidden ? ' — hidden' : ''}\n` : 'Not on the map.\n'}${sheetText(c, g.xp[c.id] ?? 0)}`;
      }),
  );

  server.registerTool(
    'rg_character_update',
    {
      title: 'Update character',
      description: `Edit a character outside the combat commands: level-ups, stat/AC changes, loot, equipment, spell slots and resources. Every change is written to the diary.
Args: name; patch {level, ac, hp_max (raising it also heals by the difference), speed, size, darkvision, abilities (partial scores), save_proficiencies, skills, attacks_per_action, temp_hp}; give_items [{item, qty}] (catalog ids/names); toggle_equip [item] (equip/unequip; recomputes AC and weapon attacks); drop_items [item]; set_spell_slots {"1":4,...} (new MAXIMUMS); learn_spells [names]; spend_slot (spell level, for spells the engine does not auto-resolve); spend_resource (resource name); add_resources [{name,max,recharge}].
For damage/healing/conditions use rg_dm_command instead (it is logged as a mechanical event).`,
      inputSchema: {
        name: z.string(),
        patch: z
          .object({
            level: z.number().int().min(1).max(20),
            ac: z.number().int().min(1).max(30),
            hp_max: z.number().int().min(1).max(999),
            speed: z.number().int().min(0),
            size: SizeSchema,
            darkvision: z.number().int().min(0),
            abilities: z
              .object({
                str: z.number().int(),
                dex: z.number().int(),
                con: z.number().int(),
                int: z.number().int(),
                wis: z.number().int(),
                cha: z.number().int(),
              })
              .partial(),
            save_proficiencies: z.array(AbilitySchema),
            skills: z
              .record(z.string(), z.enum(['proficient', 'expertise']))
              .describe(
                'skill → proficient|expertise; skills: acrobatics, animalHandling, arcana, athletics, deception, history, insight, intimidation, investigation, medicine, nature, perception, performance, persuasion, religion, sleightOfHand, stealth, survival',
              ),
            attacks_per_action: z.number().int().min(1).max(6),
            temp_hp: z.number().int().min(0),
          })
          .partial()
          .optional(),
        give_items: z
          .array(z.object({ item: z.string(), qty: z.number().int().min(1).default(1) }))
          .optional(),
        toggle_equip: z.array(z.string()).optional(),
        drop_items: z.array(z.string()).optional(),
        set_spell_slots: z.record(z.string(), z.number().int().min(0).max(9)).optional(),
        learn_spells: z.array(z.string()).optional(),
        spend_slot: z.number().int().min(1).max(9).optional(),
        spend_resource: z.string().optional(),
        add_resources: z.array(ResourceSchema).optional(),
      },
      annotations: WRITE,
    },
    (a) =>
      reply(() => {
        const g = activeGame();
        let c = who(g, a.name);
        const log: string[] = [];
        const p = a.patch ?? {};
        if (p.level !== undefined)
          (log.push(`nível ${c.level}→${p.level}`), (c = { ...c, level: p.level }));
        if (p.ac !== undefined) (log.push(`CA ${c.ac}→${p.ac}`), (c = { ...c, ac: p.ac }));
        if (p.hp_max !== undefined) {
          const diff = p.hp_max - c.hp.max;
          log.push(`PV máx ${c.hp.max}→${p.hp_max}`);
          c = {
            ...c,
            hp: {
              ...c.hp,
              max: p.hp_max,
              current: Math.min(p.hp_max, Math.max(0, c.hp.current + Math.max(0, diff))),
            },
          };
        }
        if (p.temp_hp !== undefined)
          (log.push(`PV temporários ${p.temp_hp}`),
            (c = { ...c, hp: { ...c.hp, temp: p.temp_hp } }));
        if (p.speed !== undefined) c = { ...c, speed: p.speed };
        if (p.size) c = { ...c, size: p.size };
        if (p.darkvision !== undefined) c = { ...c, darkvision: p.darkvision };
        if (p.abilities)
          (log.push(`atributos ${JSON.stringify(p.abilities)}`),
            (c = { ...c, abilities: { ...c.abilities, ...p.abilities } }));
        if (p.save_proficiencies) c = { ...c, saveProficiencies: p.save_proficiencies };
        if (p.skills) c = { ...c, skills: { ...c.skills, ...skillMap(p.skills) } };
        if (p.attacks_per_action) c = { ...c, attacksPerAction: p.attacks_per_action };
        for (const { item, qty } of a.give_items ?? []) {
          const id = itemRef(item);
          c = addItem(c, id, qty);
          log.push(`recebeu ${qty}× ${getItem(id)!.name}`);
        }
        for (const ref of a.toggle_equip ?? []) {
          const r = plain(ref);
          const it = (c.inventory ?? []).find(
            (i) => i.id === ref || i.ref === r || plain(getItem(i.ref)?.name ?? '').includes(r),
          );
          if (!it)
            throw new GameError(
              `${c.name} carries no "${ref}". Inventory: ${(c.inventory ?? []).map((i) => i.ref).join(', ') || '(empty)'}.`,
            );
          c = toggleEquip(c, it.id);
          log.push(
            `${getItem(it.ref)!.name} ${c.inventory!.find((i) => i.id === it.id)?.equipped ? 'equipado' : 'guardado'}`,
          );
        }
        for (const ref of a.drop_items ?? []) {
          const r = plain(ref);
          const it = (c.inventory ?? []).find(
            (i) => i.id === ref || i.ref === r || plain(getItem(i.ref)?.name ?? '').includes(r),
          );
          if (!it) throw new GameError(`${c.name} carries no "${ref}".`);
          c = removeItem(c, it.id);
          log.push(`largou ${getItem(it.ref)!.name}`);
        }
        if (a.set_spell_slots) {
          const slots = { ...c.spellSlots };
          for (const [lv, max] of Object.entries(a.set_spell_slots)) {
            if (max === 0) delete slots[Number(lv)];
            else slots[Number(lv)] = { max, used: Math.min(slots[Number(lv)]?.used ?? 0, max) };
          }
          c = { ...c, spellSlots: slots };
          log.push('espaços de magia atualizados');
        }
        if (a.learn_spells?.length) {
          const { ids, manual } = spellIds(a.learn_spells);
          if (!c.spellcasting)
            throw new GameError(
              `${c.name} has no spellcasting; create it with rg_character_create or set it up first.`,
            );
          c = {
            ...c,
            spellcasting: {
              ...c.spellcasting,
              spells: [...new Set([...c.spellcasting.spells, ...ids])],
            },
          };
          log.push(
            `aprendeu ${a.learn_spells.join(', ')}${manual.length ? ` (manual: ${manual.join(', ')})` : ''}`,
          );
        }
        if (a.spend_slot)
          ((c = spendSlot(c, a.spend_slot)), log.push(`gastou espaço de ${a.spend_slot}º nível`));
        if (a.spend_resource)
          ((c = spendResource(c, a.spend_resource)), log.push(`usou ${a.spend_resource}`));
        if (a.add_resources)
          c = {
            ...c,
            resources: [...c.resources, ...a.add_resources.map((r) => ({ ...r, used: 0 }))],
          };
        return tx(g, () => {
          replaceCreature(g, c);
          if (log.length) journal(g, 'rules', `[[${c.name}]]: ${log.join('; ')}.`);
          return `${c.name} updated${log.length ? `: ${log.join('; ')}` : ''}.\n${sheetText(c, g.xp[c.id] ?? 0)}`;
        });
      }),
  );

  server.registerTool(
    'rg_character_rest',
    {
      title: 'Rest',
      description:
        'Short rest (recovers "short" resources) or long rest (full HP, all spell slots, all resources, death saves reset). Hit-dice healing on a short rest is yours to resolve: roll with rg_roll and apply with rg_dm_command heal. Not allowed during combat. Advance the clock with rg_party_update game_time. Args: kind; who ("party" = all living party members, or a list of names).',
      inputSchema: {
        kind: z.enum(['short', 'long']),
        who: z.union([z.literal('party'), z.array(z.string())]).default('party'),
      },
      annotations: WRITE,
    },
    ({ kind, who: w }) =>
      reply(() => {
        const g = activeGame();
        if (g.scene.combat.phase === 'running') throw new GameError('Cannot rest during combat.');
        const who_ =
          w === 'party'
            ? g.scene.creatures.filter((c) => isPartyMember(c) && c.status !== 'dead')
            : w.map((n) => who(g, n));
        return tx(g, () => {
          for (const c of who_) replaceCreature(g, rest(c, kind));
          journal(
            g,
            'rest',
            `${kind === 'long' ? 'Descanso longo' : 'Descanso curto'}: ${who_.map((c) => `[[${c.name}]]`).join(', ')}.`,
          );
          return `${kind === 'long' ? 'Long' : 'Short'} rest taken by ${who_.map((c) => c.name).join(', ')}.`;
        });
      }),
  );
}
