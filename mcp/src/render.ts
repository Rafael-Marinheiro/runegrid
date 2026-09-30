/** Text views of the scene for the LLM: an ASCII map (per role) and the game/combat status. */
import { CONDITION_LABEL, DAMAGE_LABEL, type Creature } from '@core/models/creature';
import type { EncounterState } from '@core/models/encounter';
import { SPELLS } from '@core/rules/spells/data';
import { creatureOf, project, sizeOf, teamOf, tokenOf } from '@core/rules/encounter';
import { effectiveSpeed } from '@core/rules/creature';
import { distanceFt, footprint } from '@core/rules/grid/movement';
import type { Game } from './campaign';
import { isPartyMember } from './sheets';
import { fmt } from './util';

const GLYPH = {
  floor: '.',
  wall: '#',
  difficult: ',',
  water: '~',
  door: "'",
  'door-closed': '+',
  'door-locked': '=',
  unknown: ' ',
} as const;
const PARTY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FOES = '123456789abcdefghijklmnopqrstuvwxyz';
const LIFE = { alive: '', dying: 'DYING', stable: 'unconscious (stable)', dead: 'DEAD' } as const;

/** One stable map symbol per creature: A, B… for the party, 1, 2… for the opposition. */
export function labels(s: EncounterState): Map<string, string> {
  const out = new Map<string, string>();
  let p = 0;
  let f = 0;
  for (const c of s.creatures)
    out.set(c.id, (teamOf(c) === 'party' ? PARTY[p++] : FOES[f++]) ?? '?');
  return out;
}

export interface MapWindow {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export function renderMap(g: Game, view: 'dm' | 'player', win: MapWindow = {}): string {
  const full = g.scene;
  const s =
    view === 'dm'
      ? full
      : project(full, {
          kind: 'player',
          owns: full.creatures.filter(isPartyMember).map((c) => c.id),
        });
  const { map } = s;
  const lab = labels(full);
  const cols = Math.min(win.width ?? 60, map.width);
  const rows = Math.min(win.height ?? 40, map.height);
  const focusId = full.combat.turn?.actorId ?? full.creatures.find(isPartyMember)?.id;
  const focus = (focusId && tokenOf(full, focusId)?.pos) || {
    x: map.width >> 1,
    y: map.height >> 1,
  };
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
  const x0 = clamp(win.x ?? focus.x - (cols >> 1), map.width - cols);
  const y0 = clamp(win.y ?? focus.y - (rows >> 1), map.height - rows);

  const grid: string[][] = Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) => GLYPH[map.cells[y * map.width + x]]),
  );
  const put = (x: number, y: number, ch: string) => {
    if (grid[y]?.[x] !== undefined) grid[y][x] = ch;
  };
  for (const o of map.objects ?? []) put(o.pos.x, o.pos.y, '%');
  for (const i of map.items ?? []) put(i.pos.x, i.pos.y, '*');
  for (const t of map.traps ?? []) put(t.pos.x, t.pos.y, '^');
  for (const t of s.tokens) {
    const c = s.creatures.find((x) => x.id === t.creatureId);
    if (!c) continue;
    for (const p of footprint(t.pos, sizeOf(c)))
      put(p.x, p.y, c.status === 'dead' ? '†' : (lab.get(c.id) ?? '?'));
  }

  const xs = Array.from({ length: cols }, (_, i) => x0 + i);
  const out = [
    `    ${xs.map((x) => (x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' ')).join('')}`,
    `    ${xs.map((x) => x % 10).join('')}`,
    ...grid
      .slice(y0, y0 + rows)
      .map((row, i) => `${String(y0 + i).padStart(3)} ${row.slice(x0, x0 + cols).join('')}`),
  ];
  const who = s.creatures.map(
    (c) =>
      `${lab.get(c.id)}=${c.name}${s.tokens.find((t) => t.creatureId === c.id)?.hidden ? ' (hidden)' : ''}`,
  );
  const rooms = (map.rooms ?? []).map((r) => `${r.id}: ${r.name} [x${r.x} y${r.y} ${r.w}×${r.h}]`);
  return [
    `Map "${full.name}" ${map.width}×${map.height} (1 cell = 5 ft) — ${view === 'dm' ? 'DM view (everything)' : 'PLAYER view (what the party can see)'}; showing x${x0}–${x0 + cols - 1}, y${y0}–${y0 + rows - 1}`,
    '```',
    ...out,
    '```',
    `Legend: # wall · . floor · , difficult · ~ water · ' open door · + closed door · = locked door · ^ trap · * item · % object · † dead`,
    `Creatures: ${who.join(' · ') || '(none)'}`,
    rooms.length ? `Rooms: ${rooms.join(' | ')}` : '',
    view === 'dm' && map.fog
      ? `Fog: ${map.fog.filter(Boolean).length} cells still hidden from the players.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------- status ----------

const condText = (c: Creature): string =>
  [
    LIFE[c.status],
    ...c.conditions.map((k) => CONDITION_LABEL[k.name] + (k.rounds ? ` ${k.rounds}r` : '')),
  ]
    .filter(Boolean)
    .join(', ');

function line(s: EncounterState, lab: Map<string, string>, c: Creature): string {
  const t = tokenOf(s, c.id);
  const cond = condText(c);
  return `[${lab.get(c.id)}] ${c.name} (${c.kind === 'monster' ? `monster${c.cr !== undefined ? ` CR ${c.cr}` : ''}` : c.kind}) ${c.hp.current}/${c.hp.max} HP${c.hp.temp ? `+${c.hp.temp}` : ''} · AC ${c.ac} · ${t ? `(${t.pos.x},${t.pos.y})${t.hidden ? ' HIDDEN' : ''}` : 'off-map'}${cond ? ` · ${cond}` : ''}`;
}

export function statusText(g: Game): string {
  const s = g.scene;
  const lab = labels(s);
  const { combat } = s;
  const L: string[] = [
    `# ${g.name} — ${s.name}`,
    `Session: ${g.currentSession ?? 'none open'} · Location: ${g.location || '—'} · Game time: ${g.gameTime || '—'} · Party gold: ${g.gold} gp`,
    '',
    '## Party',
    ...s.creatures.filter(isPartyMember).map((c) => line(s, lab, c)),
  ];
  if (!s.creatures.some(isPartyMember)) L.push('(no party yet — rg_character_create)');

  const foes = s.creatures.filter((c) => !isPartyMember(c));
  if (foes.length && combat.phase !== 'running')
    L.push('', '## Opposition', ...foes.map((c) => line(s, lab, c)));

  if (combat.phase === 'setup')
    L.push(
      '',
      `Combat: not started${s.tokens.length ? ' — call rg_combat_start when ready.' : '. Creatures need map tokens (place_token) before combat.'}`,
    );
  if (combat.phase === 'ended')
    L.push(
      '',
      `Combat: ended (${combat.outcome === 'party' ? 'party won' : combat.outcome === 'foes' ? 'party defeated' : 'stopped by the DM'}) after ${combat.round} round(s). The next rg_combat_start begins a fresh one; remove corpses with rg_dm_command remove_defeated.`,
    );
  if (combat.phase === 'running' && combat.turn) L.push('', ...combatBlock(s, lab));
  return L.join('\n');
}

/** What the LLM needs right after acting: the combat block while fighting, the full status otherwise. */
export function afterAction(g: Game): string {
  const s = g.scene;
  return s.combat.phase === 'running' && s.combat.turn
    ? combatBlock(s, labels(s)).join('\n')
    : statusText(g);
}

function combatBlock(s: EncounterState, lab: Map<string, string>): string[] {
  const { combat } = s;
  const turn = combat.turn!;
  const actor = creatureOf(s, turn.actorId);
  const speed = effectiveSpeed(actor) * (turn.dashed ? 2 : 1);
  const yes = (b: boolean) => (b ? 'yes' : 'no');
  const L = [
    `## Combat — round ${combat.round} — turn of ${actor.name}`,
    `Budget: action ${yes(turn.action)} · bonus ${yes(turn.bonus)} · reaction ${yes(turn.reaction)} · movement ${turn.movedFt}/${speed} ft used · extra attacks left ${turn.attacksLeft}${turn.dashed ? ' · dashed' : ''}${turn.disengaged ? ' · disengaged' : ''}`,
  ];
  if (actor.status === 'dying')
    L.push(
      `${actor.name} is DYING (${actor.deathSaves.successes}✓ ${actor.deathSaves.failures}✗): act "death_save", then "end_turn".`,
    );
  if (actor.attacks.length)
    L.push(
      `Attacks: ${actor.attacks.map((a, i) => `[${i}] ${a.name} ${fmt(a.bonus)} ${a.damage} ${DAMAGE_LABEL[a.type].toLowerCase()} (${a.range} ft)`).join(' | ')}`,
    );
  const known = (actor.spellcasting?.spells ?? [])
    .map((id) => SPELLS.find((x) => x.id === id))
    .filter((x) => x !== undefined);
  if (known.length)
    L.push(
      `Spells: ${known.map((x) => `${x.id} (L${x.level}, ${x.range} ft)`).join(', ')} · Slots: ${
        Object.entries(actor.spellSlots)
          .map(([lv, v]) => `L${lv} ${v.max - v.used}/${v.max}`)
          .join(' ') || 'none'
      }`,
    );
  for (const p of combat.pending ?? [])
    L.push(
      `⚠ PENDING REACTION: ${creatureOf(s, p.reactorId).name} may make an opportunity attack on ${creatureOf(s, p.targetId).name} — act {actor:"${creatureOf(s, p.reactorId).name}", action:"reaction", use:true|false} before end_turn.`,
    );

  L.push('Initiative order:');
  combat.order.forEach((id, i) => {
    const c = creatureOf(s, id);
    L.push(
      `${i === combat.turnIndex ? '▶' : ' '} ${combat.initiative[id] ?? '?'} ${line(s, lab, c)}`,
    );
  });
  const here = tokenOf(s, actor.id);
  if (here) {
    const d = s.tokens
      .filter((t) => t.creatureId !== actor.id)
      .map((t) => ({
        c: creatureOf(s, t.creatureId),
        ft: distanceFt(here.pos, sizeOf(actor), t.pos, sizeOf(creatureOf(s, t.creatureId)), s.rule),
      }))
      .filter((x) => x.c.status !== 'dead')
      .sort((a, b) => a.ft - b.ft);
    L.push(
      `Distance from ${actor.name}: ${d.map((x) => `${x.c.name} ${x.ft} ft`).join(', ') || '—'}`,
    );
  }
  return L;
}
