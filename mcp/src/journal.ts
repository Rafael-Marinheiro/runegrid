/** Everything the game writes to the vault as it happens: sessions, story entries, turn logs, combats. */
import type { LogEntry } from '@core/models/encounter';
import { summarizeCombat } from '@core/rules/encounter';
import { join, posix } from 'node:path';
import type { Game, SessionRecord } from './campaign';
import { GameError, pad, stamp } from './util';
import {
  appendToSection,
  edit,
  frontmatter,
  mergeFrontmatter,
  safeName,
  setSection,
  stem,
  write,
} from './vault';

export const JOURNAL_KINDS = {
  narration: '📖',
  dialogue: '💬',
  event: '⚡',
  decision: '⚖️',
  discovery: '🔎',
  rules: '🎲',
  combat: '⚔️',
  rest: '🏕️',
  loot: '💰',
} as const;
export type JournalKind = keyof typeof JOURNAL_KINDS;

const abs = (g: Game, file: string): string => join(g.dir, file);
const link = (file: string): string => `[[${stem(file)}]]`;
const indent = (text: string): string => text.trim().replace(/\n/g, '\n  ');

export const SECRET_LOG = posix.join('Mestre', 'Registro secreto.md');

// ---------- sessions ----------

export const currentSession = (g: Game): SessionRecord | undefined =>
  g.sessions.find((s) => s.number === g.currentSession);

export function startSession(g: Game, title?: string, recap?: string): SessionRecord {
  if (g.currentSession !== null)
    throw new GameError(
      `Session ${g.currentSession} is still open. Keep playing in it, or call rg_session_end first.`,
    );
  const number = g.sessions.length + 1;
  const name = `Sessão ${pad(number)}${title ? ` - ${safeName(title)}` : ''}`;
  const prev = g.sessions.at(-1);
  const rec: SessionRecord = {
    number,
    title: title ?? `Sessão ${number}`,
    file: posix.join('Sessões', `${name}.md`),
    started: stamp(),
  };
  write(
    abs(g, rec.file),
    frontmatter({
      tipo: 'sessao',
      numero: number,
      titulo: rec.title,
      campanha: g.name,
      iniciada: rec.started,
      encerrada: null,
    }) +
      `\n# ${name}\n\n${prev ? `Anterior: ${link(prev.file)}\n\n` : ''}## Resumo anterior\n\n${recap ?? prev?.summary ?? '_Primeira sessão._'}\n\n## Diário\n\n## Registro mecânico\n\n## Resumo final\n\n_(em andamento)_\n`,
  );
  g.sessions.push(rec);
  g.currentSession = number;
  return rec;
}

/** The open session; one is opened implicitly if the LLM forgot (nothing should go unrecorded). */
export const ensureSession = (g: Game): SessionRecord => currentSession(g) ?? startSession(g);

export function endSession(g: Game, summary: string, hooks: string[]): SessionRecord {
  const rec = currentSession(g);
  if (!rec) throw new GameError('No open session. Call rg_session_start first.');
  rec.ended = stamp();
  rec.summary = summary;
  rec.hooks = hooks;
  edit(abs(g, rec.file), (t) => {
    const withSummary = setSection(
      mergeFrontmatter(t, { encerrada: rec.ended }),
      'Resumo final',
      summary,
    );
    return hooks.length
      ? setSection(
          withSummary,
          'Ganchos para a próxima sessão',
          hooks.map((h) => `- ${h}`).join('\n'),
        )
      : withSummary;
  });
  g.currentSession = null;
  return rec;
}

// ---------- story ----------

/**
 * One beat of the story in the open session's "Diário". An explicit entry (the LLM's own
 * `rg_journal_add`) opens a session if none is open; bookkeeping lines written by other tools
 * are only added to a session that is already open, so they never pre-empt `rg_session_start`.
 */
export function journal(
  g: Game,
  kind: JournalKind,
  text: string,
  gameTime?: string,
  explicit = false,
): void {
  const rec = explicit ? ensureSession(g) : currentSession(g);
  if (gameTime) g.gameTime = gameTime;
  if (!rec) return;
  const when = stamp().slice(11);
  const at = gameTime ? ` _(${gameTime})_` : '';
  edit(abs(g, rec.file), (t) =>
    appendToSection(t, 'Diário', `- ${JOURNAL_KINDS[kind]} **${when}**${at} ${indent(text)}`),
  );
}

// ---------- turn-by-turn log ----------

const line = (e: LogEntry): string => `- ${e.round ? `**R${e.round}** ` : ''}${e.text}`;

/** Engine log lines → the open combat note (or the session's mechanical log); secret ones → Mestre/. */
export function writeLog(g: Game, entries: LogEntry[]): void {
  const open = entries.filter((e) => !e.secret).map(line);
  const secret = entries.filter((e) => e.secret).map(line);
  if (open.length) {
    if (g.combatNote)
      edit(abs(g, g.combatNote), (t) => appendToSection(t, 'Registro', open.join('\n')));
    else {
      const rec = currentSession(g);
      if (rec)
        edit(abs(g, rec.file), (t) => appendToSection(t, 'Registro mecânico', open.join('\n')));
    }
  }
  if (secret.length)
    secretLog(g, secret.map((s) => `${s} _(sessão ${g.currentSession ?? '-'})_`).join('\n'));
}

export function secretLog(g: Game, lines: string): void {
  edit(abs(g, SECRET_LOG), (t) =>
    t
      ? `${t.trimEnd()}\n${lines}\n`
      : `${frontmatter({ tipo: 'segredo' })}\n# Registro secreto\n\nRolagens e eventos ocultos dos jogadores.\n\n${lines}\n`,
  );
}

// ---------- combat notes ----------

export function openCombatNote(g: Game): void {
  if (g.combatNote) return;
  g.combats++;
  const rec = ensureSession(g);
  const name = `Combate ${pad(g.combats)} - ${safeName(g.scene.name)}`;
  const file = posix.join('Combates', `${name}.md`);
  write(
    abs(g, file),
    frontmatter({
      tipo: 'combate',
      numero: g.combats,
      cena: g.scene.name,
      sessao: link(rec.file),
      iniciado: stamp(),
      resultado: null,
    }) + `\n# ${name}\n\nSessão: ${link(rec.file)}\n\n## Registro\n\n`,
  );
  g.combatNote = file;
  journal(g, 'combat', `Combate iniciado: ${link(file)}`);
}

/** Writes the result, awards XP to the surviving party and returns a one-paragraph summary. */
export function closeCombatNote(g: Game): string {
  const s = summarizeCombat(g.scene);
  const outcome = g.scene.combat.outcome;
  const result =
    outcome === 'party'
      ? 'vitória do grupo'
      : outcome === 'foes'
        ? 'derrota do grupo'
        : 'encerrado pelo Mestre';
  for (const c of s.survivingParty) g.xp[c.id] = (g.xp[c.id] ?? 0) + s.xpPerCharacter;
  const names = (cs: { name: string }[]): string => cs.map((c) => c.name).join(', ') || '—';
  const text = [
    `**Resultado:** ${result} em ${s.rounds} rodada(s).`,
    `**Inimigos derrotados:** ${names(s.defeatedFoes)} (${s.xp} XP no total; ${s.xpPerCharacter} por personagem).`,
    `**Sobreviventes:** ${s.survivingParty.map((c) => `${c.name} (${c.hp.current}/${c.hp.max} PV)`).join(', ') || '—'}.`,
    s.fallenParty.length ? `**Caídos:** ${names(s.fallenParty)}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  if (g.combatNote) {
    const file = g.combatNote;
    edit(abs(g, file), (t) =>
      setSection(mergeFrontmatter(t, { resultado: result, rodadas: s.rounds }), 'Resultado', text),
    );
    journal(
      g,
      'combat',
      `Combate encerrado (${result}, ${s.rounds} rodada(s)); +${s.xpPerCharacter} XP por personagem. ${link(file)}`,
    );
  }
  g.combatNote = null;
  return text;
}
