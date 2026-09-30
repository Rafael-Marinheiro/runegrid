/** Low-level Obsidian-vault helpers: plain Markdown files, YAML frontmatter, section editing. */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/** File name Obsidian and Windows both accept (no `# ^ [ ] |` either, they break wikilinks). */
export const safeName = (s: string): string =>
  s
    .replace(/[<>:"/\\|?*#^[\]\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 80) || 'Sem título';

/** `Sessões/Sessão 001.md` → `Sessão 001` (what goes inside a `[[wikilink]]`). */
export const stem = (file: string): string => file.replace(/^.*[\\/]/, '').replace(/\.md$/, '');

export function write(path: string, content: string, atomic = false): void {
  mkdirSync(dirname(path), { recursive: true });
  if (!atomic) return writeFileSync(path, content);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

export const read = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, 'utf8') : null;

/** Read–modify–write; `fn` gets `''` for a missing file. */
export function edit(path: string, fn: (text: string) => string): void {
  const before = read(path) ?? '';
  const after = fn(before);
  if (after !== before) write(path, after);
}

/** Every `.md` under `dir`, skipping dot-folders (Obsidian ignores them too). */
export function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

// ---------- frontmatter ----------

/** YAML frontmatter; JSON scalars/arrays are valid YAML, so values round-trip without a YAML library. */
export const frontmatter = (data: Record<string, unknown>): string =>
  `---\n${Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k.replace(/[^\w.-]/g, '_')}: ${JSON.stringify(v)}`)
    .join('\n')}\n---\n`;

function scalar(raw: string): unknown {
  const t = raw.trim();
  try {
    if (/^["[{]/.test(t) || /^(-?\d+(\.\d+)?|true|false|null)$/.test(t)) return JSON.parse(t);
  } catch {
    /* YAML-only syntax such as [a, b]: handled below */
  }
  if (/^\[.*\]$/.test(t))
    return t
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  return t.replace(/^'(.*)'$/, '$1');
}

/** Reads the frontmatter written by {@link frontmatter} or by hand in Obsidian (flow or block lists). */
export function parseNote(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, unknown> = {};
  let key = '';
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && key) {
      const prev = data[key];
      data[key] = [...(Array.isArray(prev) ? prev : []), scalar(item[1])];
      continue;
    }
    const kv = /^([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1].trim();
    data[key] = kv[2] === '' ? '' : scalar(kv[2]);
  }
  return { data, body: text.slice(m[0].length) };
}

/** Rewrites the frontmatter of `text`, keeping the keys we don't manage (hand-edited properties). */
export function mergeFrontmatter(text: string, data: Record<string, unknown>): string {
  const parsed = parseNote(text);
  return frontmatter({ ...parsed.data, ...data }) + parsed.body;
}

// ---------- sections & blocks ----------

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Appends `lines` at the end of the `## heading` section (created at the end of the note if missing). */
export function appendToSection(text: string, heading: string, lines: string): string {
  const m = new RegExp(`^## ${esc(heading)}[ \\t]*$`, 'm').exec(text);
  if (!m) return `${text.trimEnd()}\n\n## ${heading}\n\n${lines}\n`;
  const start = m.index + m[0].length;
  const next = /^## /m.exec(text.slice(start));
  const end = next ? start + next.index : text.length;
  const head = text.slice(0, end).trimEnd();
  const sep = head.endsWith(m[0].trimEnd()) ? '\n\n' : '\n';
  return `${head}${sep}${lines}\n${next ? '\n' : ''}${text.slice(end)}`;
}

/** The text of a `## heading` section ('' if absent). */
export function getSection(text: string, heading: string): string {
  const m = new RegExp(`^## ${esc(heading)}[ \t]*$`, 'm').exec(text);
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

/** Replaces the body of the `## heading` section (created if missing). */
export function setSection(text: string, heading: string, body: string): string {
  const m = new RegExp(`^## ${esc(heading)}[ \\t]*$`, 'm').exec(text);
  if (!m) return `${text.trimEnd()}\n\n## ${heading}\n\n${body}\n`;
  const start = m.index + m[0].length;
  const next = /^## /m.exec(text.slice(start));
  const end = next ? start + next.index : text.length;
  return `${text.slice(0, start)}\n\n${body}\n${next ? '\n' : ''}${text.slice(end)}`;
}

/** The part of a note this server owns, fenced by comments so hand-written text around it survives. */
export function upsertBlock(text: string, id: string, content: string): string {
  const open = `<!-- runegrid:${id} -->`;
  const close = `<!-- /runegrid:${id} -->`;
  const block = `${open}\n${content}\n${close}`;
  const a = text.indexOf(open);
  const b = text.indexOf(close);
  return a >= 0 && b > a
    ? text.slice(0, a) + block + text.slice(b + close.length)
    : `${text.trimEnd()}\n\n${block}\n`;
}
