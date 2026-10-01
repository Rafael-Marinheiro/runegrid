import rules2014 from '../../../../public/data/spell-rules.json';
import rules2024 from '../../../../public/data/spell-rules-2024.json';
import { mapFromAscii } from '../models/grid';
import { RuleError } from './creature';
import { dispatch, newEncounter } from './encounter';
import { addLog } from './encounter/state';
import { expand, isBilingual, T, spellT } from './i18n';
import { distance, distT, ptUnits } from './units';
import { SPELLS } from './spells/builtin';
import { spellNameEn } from './srd/names-pt';

const map = mapFromAscii(['....', '....']);

describe('texto bilíngue', () => {
  it('resolve o idioma pedido e deixa texto simples intacto', () => {
    expect(expand('Olá', 'en')).toBe('Olá');
    expect(expand(T('casa', 'house'), 'pt')).toBe('casa');
    expect(expand(T('casa', 'house'), 'en')).toBe('house');
  });

  it('compõe e aninha', () => {
    const msg = T(
      `Ana usa ${T('Escudo Arcano', 'Shield')} (${T('1º', '1st')}).`,
      `Ana casts ${T('Escudo Arcano', 'Shield')}.`,
    );
    expect(expand(msg, 'pt')).toBe('Ana usa Escudo Arcano (1º).');
    expect(expand(msg, 'en')).toBe('Ana casts Shield.');
    expect(expand(`${T('a', 'b')} e ${T('c', 'd')}`, 'en')).toBe('b e d');
  });

  it('o registro guarda as duas versões', () => {
    const s = addLog(newEncounter(map), T('Olá', 'Hello'));
    expect(s.log.at(-1)).toMatchObject({ text: 'Olá', en: 'Hello' });
    expect(addLog(newEncounter(map), 'simples').log.at(-1)?.en).toBeUndefined();
    expect(isBilingual(T('a', 'b'))).toBe(true);
  });

  it('RuleError: message em pt, marked bilíngue', () => {
    const e = new RuleError(T('Sem ação.', 'No action.'));
    expect(e.message).toBe('Sem ação.');
    expect(expand(e.marked, 'en')).toBe('No action.');
  });

  it('erros do motor chegam nos dois idiomas', () => {
    try {
      dispatch(
        newEncounter(map),
        { type: 'endCombat' } as never,
        {
          rng: () => 0.5,
          role: { kind: 'dm' },
        } as never,
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RuleError);
      expect(expand((e as RuleError).marked, 'en')).toMatch(/Combat/);
    }
  });

  it('nome de magia tem versão em inglês, inclusive as embutidas', () => {
    expect(expand(spellT('Bola de Fogo'), 'en')).toBe('Fireball');
    for (const s of SPELLS) expect(spellNameEn(s.name), s.name).not.toBe(s.name);
  });

  it('toda nota manual/note tem tradução', () => {
    const walk = (node: unknown, where: string): void => {
      if (Array.isArray(node)) return node.forEach((x) => walk(x, where));
      if (!node || typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      for (const [k, v] of Object.entries(o)) {
        if ((k === 'manual' || k === 'note') && typeof v === 'string' && v)
          expect(o[k + 'En'], `${where}: ${v}`).toEqual(expect.any(String));
        else walk(v, where);
      }
    };
    for (const [id, r] of Object.entries(rules2014)) walk(r, `2014:${id}`);
    for (const [id, r] of Object.entries(rules2024)) walk(r, `2024:${id}`);
  });
});

describe('unidades de distância', () => {
  it('pt-BR em metros (5 ft = 1,5 m), inglês em ft', () => {
    expect(distance(5, 'pt')).toBe('1,5 m');
    expect(distance(30, 'pt')).toBe('9 m');
    expect(distance(30, 'en')).toBe('30 ft');
    expect(expand(distT(60), 'pt')).toBe('18 m');
    expect(expand(distT(60), 'en')).toBe('60 ft');
  });

  it('converte pés e milhas de textos em pt-BR', () => {
    expect(ptUnits('a até 5 ft (60 feet) e 1 mile')).toBe('a até 1,5 m (18 m) e 1,6 km');
    expect(ptUnits('Esfera de 20-foot')).toBe('Esfera de 6 m');
  });
});
