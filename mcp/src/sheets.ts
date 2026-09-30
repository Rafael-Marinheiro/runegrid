/** Generated vault notes: one sheet per party member and the campaign dashboard. */
import {
  ABILITIES,
  CONDITION_LABEL,
  SKILLS,
  SKILL_KEYS,
  type Creature,
} from '@core/models/creature';
import {
  abilityMod,
  proficiencyBonus,
  saveBonus,
  skillBonus,
  spellSaveDc,
} from '@core/rules/creature';
import { itemDef } from '@core/rules/inventory/inventory';
import { DAMAGE_LABEL } from '@core/models/creature';
import { join } from 'node:path';
import { writeState, type Game } from './campaign';
import { stamp, fmt } from './util';
import {
  frontmatter,
  mergeFrontmatter,
  parseNote,
  read,
  safeName,
  stem,
  upsertBlock,
  walk,
  write,
} from './vault';

export const isPartyMember = (c: Creature): boolean => c.kind !== 'monster';

const LIFE = { alive: 'viva', dying: 'morrendo', stable: 'estável (0 PV)', dead: 'morta' } as const;
const AB = { str: 'FOR', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR' } as const;

/** Plain-text sheet, used both in the vault and as the reply of `rg_character_get`. */
export function sheetText(c: Creature, xp = 0): string {
  const prof = proficiencyBonus(c);
  const L: string[] = [
    `| ${ABILITIES.map((a) => AB[a]).join(' | ')} |`,
    `|${ABILITIES.map(() => '---').join('|')}|`,
    `| ${ABILITIES.map((a) => `${c.abilities[a]} (${fmt(abilityMod(c.abilities[a]))})`).join(' | ')} |`,
    '',
    `**PV** ${c.hp.current}/${c.hp.max}${c.hp.temp ? ` (+${c.hp.temp} temp)` : ''} · **CA** ${c.ac} · **Deslocamento** ${c.speed} ft · **Proficiência** ${fmt(prof)} · **Estado** ${LIFE[c.status]}${c.darkvision ? ` · **Visão no escuro** ${c.darkvision} ft` : ''}`,
  ];
  if (c.status === 'dying')
    L.push(`**Salvaguardas contra a morte:** ${c.deathSaves.successes}✓ ${c.deathSaves.failures}✗`);
  if (c.conditions.length)
    L.push(
      `**Condições:** ${c.conditions.map((k) => CONDITION_LABEL[k.name] + (k.rounds ? ` (${k.rounds}r)` : '')).join(', ')}`,
    );
  const saves = ABILITIES.filter((a) => c.saveProficiencies.includes(a));
  if (saves.length)
    L.push(`**Salvaguardas:** ${saves.map((a) => `${AB[a]} ${fmt(saveBonus(c, a))}`).join(', ')}`);
  const skills = SKILL_KEYS.filter((k) => c.skills[k]);
  if (skills.length)
    L.push(
      `**Perícias:** ${skills.map((k) => `${SKILLS[k].label}${c.skills[k] === 'expertise' ? '★' : ''} ${fmt(skillBonus(c, k))}`).join(', ')}`,
    );
  for (const r of ['resistances', 'immunities', 'vulnerabilities'] as const)
    if (c[r].length)
      L.push(
        `**${{ resistances: 'Resistências', immunities: 'Imunidades', vulnerabilities: 'Vulnerabilidades' }[r]}:** ${c[r].map((d) => DAMAGE_LABEL[d]).join(', ')}`,
      );
  if (c.attacks.length) {
    L.push(`**Ataques** (${c.attacksPerAction} por ação):`);
    c.attacks.forEach((a, i) =>
      L.push(
        `- [${i}] ${a.name} ${fmt(a.bonus)}, ${a.damage} ${DAMAGE_LABEL[a.type].toLowerCase()}, alcance ${a.range} ft`,
      ),
    );
  }
  if (c.spellcasting)
    L.push(
      `**Conjuração:** ${AB[c.spellcasting.ability]}, CD ${spellSaveDc(c, c.spellcasting.ability)}, ataque ${fmt(prof + abilityMod(c.abilities[c.spellcasting.ability]))} — magias: ${c.spellcasting.spells.join(', ') || '—'}`,
    );
  const slots = Object.entries(c.spellSlots);
  if (slots.length)
    L.push(
      `**Espaços de magia:** ${slots.map(([lv, s]) => `${lv}º ${s.max - s.used}/${s.max}`).join(' · ')}`,
    );
  if (c.concentration) L.push(`**Concentração:** ${c.concentration}`);
  if (c.resources.length)
    L.push(
      `**Recursos:** ${c.resources.map((r) => `${r.name} ${r.max - r.used}/${r.max} (${r.recharge === 'short' ? 'descanso curto' : 'descanso longo'})`).join(', ')}`,
    );
  if (c.inventory?.length)
    L.push(
      `**Inventário:** ${c.inventory.map((i) => `${itemDef(i)?.name ?? i.ref}${i.qty > 1 ? ` ×${i.qty}` : ''}${i.equipped ? ' (equipado)' : ''}`).join(', ')}`,
    );
  L.push(`**XP:** ${xp}`);
  return L.join('\n');
}

export const sheetPath = (g: Game, c: Creature): string =>
  join(g.dir, 'Personagens', `${safeName(c.name)}.md`);

function syncSheet(g: Game, c: Creature): void {
  const path = sheetPath(g, c);
  const fm = {
    tipo: c.kind === 'pc' ? 'personagem' : 'aliado',
    nome: c.name,
    nivel: c.level,
    pv: c.hp.current,
    pv_max: c.hp.max,
    ca: c.ac,
    estado: LIFE[c.status],
    xp: g.xp[c.id] ?? 0,
  };
  const existing = read(path);
  const next = existing
    ? upsertBlock(mergeFrontmatter(existing, fm), 'sheet', sheetText(c, g.xp[c.id] ?? 0))
    : `${frontmatter(fm)}\n# ${c.name}\n\n${upsertBlock('', 'sheet', sheetText(c, g.xp[c.id] ?? 0)).trim()}\n\n## História\n\n## Notas\n`;
  if (next !== existing) write(path, next);
}

/** Titles of the quests whose `status` property is "ativa". */
function activeQuests(g: Game): string[] {
  const out: string[] = [];
  for (const f of walk(join(g.dir, 'Missões'))) {
    const fm = parseNote(read(f) ?? '').data;
    if (String(fm['status'] ?? 'ativa') === 'ativa') out.push(stem(f));
  }
  return out;
}

function dashboard(g: Game): string {
  const party = g.scene.creatures.filter(isPartyMember);
  const { combat } = g.scene;
  const quests = activeQuests(g);
  const row = (c: Creature) =>
    `| [[${safeName(c.name)}]] | ${c.level} | ${c.hp.current}/${c.hp.max} | ${c.ac} | ${[LIFE[c.status] !== 'viva' ? LIFE[c.status] : '', ...c.conditions.map((k) => CONDITION_LABEL[k.name])].filter(Boolean).join(', ') || '—'} | ${g.xp[c.id] ?? 0} |`;
  return [
    frontmatter({
      tipo: 'painel',
      campanha: g.name,
      sessao_atual: g.currentSession,
      atualizado: stamp(),
    }),
    `# ${g.name}`,
    '',
    g.premise ? `> ${g.premise.replace(/\n/g, '\n> ')}` : '',
    '',
    `**Tom:** ${g.tone || '—'} · **Regras:** SRD ${g.ruleset === '2024' ? '5.2 (2024)' : '5.1 (2014)'} · **Local:** ${g.location || '—'} · **Hora no jogo:** ${g.gameTime || '—'} · **Ouro do grupo:** ${g.gold} po`,
    '',
    '## Grupo',
    '',
    '| Personagem | Nível | PV | CA | Estado | XP |',
    '|---|---|---|---|---|---|',
    ...(party.length ? party.map(row) : ['| _(ninguém ainda)_ | | | | | |']),
    '',
    '## Cena atual',
    '',
    `${g.scene.name} — ${g.scene.map.width}×${g.scene.map.height}; combate: ${{ setup: 'não iniciado', running: `em andamento (rodada ${combat.round})`, ended: 'encerrado' }[combat.phase]}.`,
    g.adventure ? `Aventura: ${g.adventure.name}` : '',
    '',
    '## Missões ativas',
    '',
    ...(quests.length ? quests.map((q) => `- [[${q}]]`) : ['_Nenhuma registrada._']),
    '',
    '## Sessões',
    '',
    ...(g.sessions.length
      ? g.sessions.map(
          (s) =>
            `- [[${stem(s.file)}]]${s.summary ? ` — ${s.summary.split('\n')[0].slice(0, 120)}` : ''}`,
        )
      : ['_Nenhuma ainda._']),
    '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** Saves the engine state and refreshes the generated notes (only files whose content changed). */
export function persist(g: Game): void {
  writeState(g);
  for (const c of g.scene.creatures.filter(isPartyMember)) syncSheet(g, c);
  const path = join(g.dir, '00 - Painel.md');
  const next = dashboard(g);
  if (read(path) !== next) write(path, next);
}
