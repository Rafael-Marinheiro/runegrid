import { readFileSync } from 'node:fs';
import { GeneratedAdventure, GeneratorParams, SIZES, THEMES } from '../../models/adventure';
import { sampleCreatures } from '../../models/creature-factory';
import { SrdMonster } from '../../models/srd';
import { project } from '../encounter';
import { flood } from './layout';
import {
  adventureToEncounter,
  DEFAULT_PARAMS,
  generateAdventure,
  regenerate,
  THEME_DATA,
} from './index';
import { estimateEncounter } from '../srd/xp';

const monsters: SrdMonster[] = JSON.parse(readFileSync('public/data/monsters.json', 'utf-8'));
const gen = (over: Partial<GeneratorParams> = {}) =>
  generateAdventure({ ...DEFAULT_PARAMS, ...over }, monsters);

const reachable = (adv: GeneratedAdventure) => {
  const l = { width: adv.map.width, height: adv.map.height, cells: adv.map.cells, rooms: [] };
  return flood(l, adv.entrance);
};

describe('reprodutibilidade', () => {
  it('mesma semente e parâmetros geram a mesma aventura', () => {
    expect(gen({ seed: 'abc' })).toEqual(gen({ seed: 'abc' }));
  });

  it('sementes ou parâmetros diferentes geram aventuras diferentes', () => {
    const a = gen({ seed: 'abc' });
    expect(gen({ seed: 'abd' }).map.cells).not.toEqual(a.map.cells);
    expect(gen({ seed: 'abc', theme: 'cave' }).map.cells).not.toEqual(a.map.cells);
  });
});

describe('estrutura do mapa', () => {
  const cases = THEMES.flatMap((theme) => SIZES.slice(0, 2).map((size) => ({ theme, size })));

  it.each(cases)('$theme $size: toda sala é alcançável da entrada', ({ theme, size }) => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const adv = gen({ theme, size, seed });
      const dist = reachable(adv);
      for (const r of adv.rooms) {
        const c = { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
        expect(dist.has(c.y * adv.map.width + c.x), `${theme}/${size}/${seed} sala ${r.id}`).toBe(
          true,
        );
      }
    }
  });

  it.each(cases)(
    '$theme $size: salas dentro do mapa, sem sobreposição, ao menos 3',
    ({ theme, size }) => {
      const adv = gen({ theme, size, seed: 'estrutura' });
      expect(adv.rooms.length).toBeGreaterThanOrEqual(3);
      adv.rooms.forEach((a, i) => {
        expect(
          a.x >= 1 && a.y >= 1 && a.x + a.w < adv.map.width && a.y + a.h < adv.map.height,
        ).toBe(true);
        adv.rooms.slice(i + 1).forEach((b) => {
          const apart =
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart, `${a.id} × ${b.id}`).toBe(true);
        });
      });
    },
  );

  it('a entrada é a primeira sala e o chefe é a mais distante', () => {
    const adv = gen({ size: 'medium', seed: 'chefe' });
    expect(adv.rooms[0].role).toBe('entrance');
    const bosses = adv.rooms.filter((r) => r.role === 'boss');
    expect(bosses).toHaveLength(1);
    const dist = reachable(adv);
    const d = (r: { x: number; y: number; w: number; h: number }) =>
      dist.get((r.y + Math.floor(r.h / 2)) * adv.map.width + r.x + Math.floor(r.w / 2)) ?? 0;
    expect(d(bosses[0])).toBe(Math.max(...adv.rooms.slice(1).map(d)));
  });

  it('tamanho pedido: pequeno ≈ 5 salas, médio ≈ 10', () => {
    expect(gen({ size: 'small', seed: 's' }).rooms.length).toBeLessThanOrEqual(5);
    const med = gen({ size: 'medium', seed: 'm' }).rooms.length;
    expect(med).toBeGreaterThanOrEqual(6);
    expect(med).toBeLessThanOrEqual(10);
  });
});

describe('povoamento', () => {
  it('monstros respeitam o tema (cripta = mortos-vivos)', () => {
    const t = THEME_DATA.crypt;
    for (const seed of ['1', '2', '3', '4']) {
      const adv = gen({ theme: 'crypt', size: 'medium', seed });
      for (const g of adv.encounters.flatMap((e) => e.groups)) {
        const m = monsters.find((x) => x.id === g.monsterId)!;
        const ok =
          t.monsterTypes.some((ty) => m.type.toLowerCase().startsWith(ty)) ||
          t.monsterNames!.test(m.name);
        expect(ok, `${m.name} (${m.type})`).toBe(true);
      }
    }
  });

  it('todo monstro gerado consegue lutar (tem ataque) e não passa do nível + 2', () => {
    const adv = gen({ size: 'medium', seed: 'lutar', partyLevel: 5 });
    for (const g of adv.encounters.flatMap((e) => e.groups)) {
      const m = monsters.find((x) => x.id === g.monsterId)!;
      expect(m.attacks.length).toBeGreaterThan(0);
      expect(m.cr).toBeLessThanOrEqual(7);
    }
  });

  it('XP dos encontros fica perto do alvo da dificuldade (±40% em média)', () => {
    const levels = [5, 5, 5, 5];
    const t = estimateEncounter(levels, []).thresholds;
    const ratios: number[] = [];
    for (const seed of ['x1', 'x2', 'x3', 'x4', 'x5', 'x6']) {
      const adv = gen({ size: 'medium', seed, difficulty: 'medium', emphasis: 'combat' });
      for (const e of adv.encounters) {
        if (adv.rooms.find((r) => r.id === e.roomId)!.role === 'boss') continue;
        ratios.push(e.adjustedXp / t.medium);
      }
    }
    expect(ratios.length).toBeGreaterThan(10);
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(mean).toBeGreaterThan(0.6);
    expect(mean).toBeLessThan(1.4);
  });

  it('dificuldade maior gera encontros mais pesados', () => {
    const total = (d: 'easy' | 'deadly') =>
      ['p', 'q', 'r'].reduce(
        (s, seed) => s + gen({ size: 'medium', seed, difficulty: d }).totalXp,
        0,
      );
    expect(total('deadly')).toBeGreaterThan(total('easy') * 2);
  });

  it('a ênfase muda a mistura: mais armadilhas em "armadilhas" que em "combate"', () => {
    const n = (emphasis: 'traps' | 'combat') =>
      ['a', 'b', 'c', 'd'].reduce(
        (s, seed) => s + gen({ size: 'medium', seed, emphasis }).traps.length,
        0,
      );
    expect(n('traps')).toBeGreaterThan(n('combat'));
    const enc = (emphasis: 'traps' | 'combat') =>
      ['a', 'b', 'c', 'd'].reduce(
        (s, seed) => s + gen({ size: 'medium', seed, emphasis }).encounters.length,
        0,
      );
    expect(enc('combat')).toBeGreaterThan(enc('traps'));
  });
});

describe('armadilhas e tesouro', () => {
  it('CD entre 10 e 20 e dano por severidade e nível (DMG)', () => {
    const low = gen({
      size: 'medium',
      seed: 't',
      partyLevel: 3,
      difficulty: 'medium',
      emphasis: 'traps',
    });
    const high = gen({
      size: 'medium',
      seed: 't',
      partyLevel: 12,
      difficulty: 'medium',
      emphasis: 'traps',
    });
    expect(low.traps.length).toBeGreaterThan(0);
    for (const t of [...low.traps, ...high.traps]) {
      expect(t.dc).toBeGreaterThanOrEqual(10);
      expect(t.dc).toBeLessThanOrEqual(20);
    }
    expect(new Set(low.traps.map((t) => t.damage))).toEqual(new Set(['2d10']));
    expect(new Set(high.traps.map((t) => t.damage))).toEqual(new Set(['10d10']));
  });

  it('armadilhas ficam em piso e escondidas no mapa', () => {
    const adv = gen({ size: 'medium', seed: 'piso', emphasis: 'traps' });
    for (const t of adv.map.traps ?? []) {
      expect(adv.map.cells[t.pos.y * adv.map.width + t.pos.x]).toBe('floor');
      expect(t.hidden).toBe(true);
    }
  });

  it('tesouro cresce com o nível e o chefe rende mais', () => {
    const a = gen({ size: 'medium', seed: 'loot', partyLevel: 3 });
    const b = gen({ size: 'medium', seed: 'loot', partyLevel: 14 });
    const sum = (adv: GeneratedAdventure) => adv.treasures.reduce((s, t) => s + t.gp, 0);
    expect(sum(b)).toBeGreaterThan(sum(a) * 5);
    const boss = a.rooms.find((r) => r.role === 'boss')!;
    expect(a.treasures.some((t) => t.roomId === boss.id)).toBe(true);
  });
});

describe('névoa e textos', () => {
  it('só a sala de entrada começa revelada', () => {
    const adv = gen({ size: 'medium', seed: 'nevoa' });
    const fog = adv.map.fog!;
    const first = adv.rooms[0];
    const cx = first.x + Math.floor(first.w / 2);
    const cy = first.y + Math.floor(first.h / 2);
    expect(fog[cy * adv.map.width + cx]).toBe(false);
    const boss = adv.rooms.find((r) => r.role === 'boss')!;
    expect(fog[(boss.y + 1) * adv.map.width + boss.x + 1]).toBe(true);
  });

  it('a textura do piso acompanha o tema', () => {
    const tex = (theme: (typeof THEMES)[number]) => gen({ theme, seed: 'tex' }).map.texture;
    expect([tex('crypt'), tex('cave'), tex('forest'), tex('swamp')]).toEqual([
      'stone',
      'cave',
      'grass',
      'mud',
    ]);
  });

  it('nome, gancho e descrições em português e sem revelar armadilhas', () => {
    const adv = gen({ seed: 'texto' });
    expect(adv.name.length).toBeGreaterThan(4);
    expect(adv.hook).not.toContain('{n}');
    for (const r of adv.rooms) {
      expect(r.description.length).toBeGreaterThan(10);
      expect(r.description.toLowerCase()).not.toContain('armadilha');
    }
  });
});

describe('regenerar mantendo salas travadas', () => {
  it('o mapa não muda; salas travadas mantêm o conteúdo; as outras são sorteadas de novo', () => {
    const adv = gen({ size: 'medium', seed: 'travar', emphasis: 'combat' });
    const withEnc = adv.encounters.map((e) => e.roomId);
    const locked = new Set(withEnc.slice(0, 2));
    const next = regenerate(adv, locked, monsters, 1);

    expect(next.map.cells).toEqual(adv.map.cells);
    expect(next.rooms.map((r) => [r.x, r.y, r.w, r.h])).toEqual(
      adv.rooms.map((r) => [r.x, r.y, r.w, r.h]),
    );
    for (const id of locked) {
      expect(next.encounters.find((e) => e.roomId === id)).toEqual(
        adv.encounters.find((e) => e.roomId === id),
      );
      expect(next.rooms.find((r) => r.id === id)).toEqual(adv.rooms.find((r) => r.id === id));
    }
    const changed = adv.rooms
      .filter((r) => !locked.has(r.id))
      .some((r) => JSON.stringify(next.rooms.find((n) => n.id === r.id)) !== JSON.stringify(r));
    expect(changed).toBe(true);
  });

  it('é determinístico para o mesmo nonce', () => {
    const adv = gen({ seed: 'det' });
    expect(regenerate(adv, new Set(), monsters, 7)).toEqual(
      regenerate(adv, new Set(), monsters, 7),
    );
  });
});

describe('levar para o combate', () => {
  it('grupo na entrada, monstros ocultos nas suas salas e mapa sob névoa', () => {
    const adv = gen({ size: 'medium', seed: 'jogar', emphasis: 'combat' });
    const party = sampleCreatures().filter((c) => c.kind === 'pc');
    const s = adventureToEncounter(adv, party, monsters);

    const inRoom = (id: string, r: { x: number; y: number; w: number; h: number }) => {
      const t = s.tokens.find((k) => k.creatureId === id)!;
      return t.pos.x >= r.x && t.pos.x < r.x + r.w && t.pos.y >= r.y && t.pos.y < r.y + r.h;
    };
    for (const p of party) expect(inRoom(p.id, adv.rooms[0])).toBe(true);

    const expected = adv.encounters.reduce(
      (n, e) => n + e.groups.reduce((m, g) => m + g.count, 0),
      0,
    );
    expect(s.creatures.filter((c) => c.kind === 'monster')).toHaveLength(expected);
    expect(s.tokens.filter((t) => t.hidden)).toHaveLength(expected);

    const names = s.creatures.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length); // nomes únicos na aventura inteira

    const view = project(s, { kind: 'player', owns: party.map((p) => p.id) });
    expect(view.creatures.every((c) => c.kind !== 'monster')).toBe(true);
    expect(view.map.cells.filter((c) => c === 'unknown').length).toBeGreaterThan(
      view.map.cells.length / 2,
    );
  });
});
