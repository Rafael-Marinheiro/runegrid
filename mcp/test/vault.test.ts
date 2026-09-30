import { describe, expect, it } from 'vitest';
import {
  appendToSection,
  frontmatter,
  getSection,
  mergeFrontmatter,
  parseNote,
  safeName,
  setSection,
  upsertBlock,
} from '../src/vault';

describe('vault helpers', () => {
  it('round-trips frontmatter, accents and wikilinks included', () => {
    const fm = {
      tipo: 'sessao',
      numero: 3,
      titulo: 'A cripta: parte 2',
      sessao: '[[Sessão 001]]',
      tags: ['a', 'b'],
      fim: null,
    };
    expect(parseNote(`${frontmatter(fm)}\n# corpo`).data).toEqual(fm);
  });

  it('reads hand-written Obsidian properties (block lists, unquoted values)', () => {
    const text =
      '---\ntags:\n  - vharos\n  - vilão\nstatus: ativa\nnivel: 4\nlista: [a, b]\n---\nTexto';
    const { data, body } = parseNote(text);
    expect(data).toEqual({
      tags: ['vharos', 'vilão'],
      status: 'ativa',
      nivel: 4,
      lista: ['a', 'b'],
    });
    expect(body).toBe('Texto');
  });

  it('merges frontmatter without losing properties the user added', () => {
    const merged = mergeFrontmatter('---\nfoo: "bar"\nxp: 1\n---\ncorpo', { xp: 9 });
    expect(parseNote(merged).data).toEqual({ foo: 'bar', xp: 9 });
  });

  it('appends to a section, before the next one, creating it when missing', () => {
    const base = '# T\n\n## Diário\n\n- a\n\n## Registro\n\n- x\n';
    const out = appendToSection(base, 'Diário', '- b');
    expect(getSection(out, 'Diário')).toBe('- a\n- b');
    expect(getSection(out, 'Registro')).toBe('- x');
    expect(appendToSection('# T\n', 'Novo', '- z')).toContain('## Novo\n\n- z');
    const empty = appendToSection('## Diário\n\n## Outro\n', 'Diário', '- first');
    expect(getSection(empty, 'Diário')).toBe('- first');
  });

  it('replaces a section body and only the generated block', () => {
    expect(getSection(setSection('## A\n\nold\n\n## B\n\nkeep\n', 'A', 'new'), 'A')).toBe('new');
    const once = upsertBlock('# Nome\n\nescrito à mão', 'sheet', 'v1');
    const twice = upsertBlock(once, 'sheet', 'v2');
    expect(twice).toContain('escrito à mão');
    expect(twice).toContain('v2');
    expect(twice).not.toContain('v1');
    expect(twice.match(/runegrid:sheet/g)).toHaveLength(2);
  });

  it('makes names safe for files and wikilinks', () => {
    expect(safeName('A/B: "C" #1 [x]|?')).toBe('AB C 1 x');
    expect(safeName('../../etc/passwd')).not.toMatch(/[\\/]/);
    expect(safeName('  ...  ')).toBe('Sem título');
  });
});
