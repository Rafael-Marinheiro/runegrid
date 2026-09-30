/**
 * Escolha de miniatura (F11-5) pela ficha: casa nome, papel e armas da criatura com o catálogo de
 * miniaturas (`public/data/miniatura-catalogo.json`). Regras puras — o Gerador, o seletor manual e
 * o futuro Mestre MCP usam a mesma função.
 */

export type MiniatureRace = 'humano' | 'anao' | 'elfo' | 'goblin';

export interface MiniatureEntry {
  /** Caminho relativo a `data/`, ex.: `miniaturas/goblin_xama-caveira-cajado.png`. */
  arquivo: string;
  nome: string;
  raca: MiniatureRace;
  grupo: string;
}

export interface MiniatureQuery {
  name: string;
  attackNames: string[];
  /** Raça da arte a buscar; `null` = criatura sem equivalente no catálogo (só o mapa por id do SRD). */
  race: MiniatureRace | null;
}

/** Só caminhos estáticos do próprio app (mesma origem para Mestre e jogadores). */
export const isTokenArt = (s: unknown): s is string =>
  typeof s === 'string' && /^miniaturas\/[\w.-]+\.png$/.test(s);

const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const RACE_BY_NAME: [RegExp, MiniatureRace][] = [
  [/goblin/, 'goblin'],
  [/duergar|dwarf|anao|anoes/, 'anao'],
  [/drow|\belf|\belfo|elves|elfa/, 'elfo'],
];

export function raceFromName(name: string): MiniatureRace | null {
  const n = plain(name);
  return RACE_BY_NAME.find(([re]) => re.test(n))?.[1] ?? null;
}

/** Palavra do nome da criatura/ataque → radicais (pt) que aparecem nos nomes das miniaturas. */
const ROLE: [RegExp, string[]][] = [
  [/\bguards?\b|\bguarda\b|\bsentinel|\bsentinela/, ['guarda', 'guardiao', 'sentinela']],
  [/captain|capitao|boss|chief|chefe|warlord|senhor/, ['capitao', 'chefe', 'lider', 'senhor']],
  [/mage|wizard|mago|arcan/, ['mago', 'arquimago', 'grimorio']],
  [/priest|acolyte|cleric|sacerdot|clerigo|acolito/, ['sacerdote', 'clerigo', 'acolito']],
  [/shaman|xama/, ['xama']],
  [/druid|druida/, ['druida']],
  [/knight|cavaleir|paladin/, ['cavaleiro', 'paladino']],
  [/veteran|veterano/, ['veterano']],
  [/berserker|barbar|tribal/, ['barbaro']],
  [/assassin|assassino/, ['assassino']],
  [/spy|espiao/, ['espiao']],
  [/scout|batedor|ranger|patrulh|archer|arqueir/, ['batedor', 'patrulheiro', 'arqueiro']],
  [/rogue|thief|ladin|skirmisher|escaramu/, ['ladino', 'escaramucador', 'espreitador']],
  [/bandit|bandido/, ['bandido', 'saqueador']],
  [/raider|saqueador/, ['saqueador']],
  [/cultist|cult|fanatic|cultista/, ['cultista', 'fanatico']],
  [/thug|brute|brutamontes/, ['brutamontes']],
  [/gladiator|gladiador/, ['gladiador']],
  [/pirate|pirata/, ['pirata']],
  [/noble|nobre/, ['nobre']],
  [/commoner|peasant|plebeu/, ['plebeu']],
  [
    /warrior|soldier|infantry|fighter|guerreir|soldado|infantaria/,
    ['guerreiro', 'soldado', 'infantaria'],
  ],
  [/engineer|artificer|inventor|engenh/, ['engenheiro', 'inventor', 'engenhoqueiro']],
  [/bard|bardo/, ['bardo']],
  [/monk|monge/, ['monge']],
  [/warlock|bruxo/, ['bruxo']],
  [/sorcerer|feiticeir/, ['feiticeiro']],
];

const WEAPON: [RegExp, string[]][] = [
  [/heavy crossbow|besta pesada/, ['besta', 'pesada']],
  [/crossbow|besta/, ['besta', 'besteiro']],
  [/bow|arco/, ['arco', 'arqueiro']],
  [/sling|funda/, ['funda', 'fundeiro']],
  [/dagger|adaga|knife|faca/, ['adaga', 'adagas', 'faca']],
  [/spear|lance|pike|lanca/, ['lanca', 'lanceiro']],
  [/axe|machad/, ['machado']],
  [/hammer|martelo/, ['martelo']],
  [/mace|maca/, ['maca']],
  [/staff|cajado|quarterstaff/, ['cajado']],
  [/rapier|rapieira/, ['rapieira']],
  [/whip|chicote/, ['chicote']],
  [/flail|mangual/, ['mangual']],
  [/halberd|glaive|alabarda/, ['alabarda']],
  [/greatsword|montante/, ['montante', 'grande']],
  [/sword|scimitar|espada|sabre|longsword|shortsword/, ['espada', 'sabre']],
  [/club|clava/, ['clava']],
];

const tokensOf = (e: MiniatureEntry): Set<string> =>
  new Set(plain(`${e.nome} ${e.arquivo.split('/').pop() ?? ''}`).split(/[^a-z0-9]+/));

const RACE_BASE = 1;
/** Já contadas pela raça (prefixo de todos os arquivos dela). */
const RACE_WORDS = new Set(['goblin', 'humano', 'human', 'anao', 'elfo']);

function score(q: MiniatureQuery, e: MiniatureEntry): number {
  if (e.raca !== q.race) return 0;
  const toks = tokensOf(e);
  const name = plain(q.name);
  let s = RACE_BASE;
  for (const [re, stems] of ROLE) if (re.test(name) && stems.some((k) => toks.has(k))) s += 6;
  const weapons = plain(q.attackNames.join(' '));
  for (const [re, stems] of WEAPON) if (re.test(weapons) && stems.some((k) => toks.has(k))) s += 3;
  // palavras do próprio nome ("Drow", "Duergar", "Xamã") apontam o subtipo
  for (const w of new Set(name.split(/[^a-z0-9]+/)))
    if (w.length >= 4 && !RACE_WORDS.has(w) && toks.has(w)) s += 4;
  return s;
}

/** Miniaturas ordenadas da que melhor combina com a ficha; empates seguem a ordem do arquivo. */
export function suggestMiniatures(
  q: MiniatureQuery,
  catalog: MiniatureEntry[],
  limit = 24,
): MiniatureEntry[] {
  return catalog
    .map((e) => ({ e, s: score(q, e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.arquivo.localeCompare(b.e.arquivo))
    .slice(0, limit)
    .map((x) => x.e);
}

/**
 * Escolha automática (Gerador, Mestre MCP): entre as melhores que casam com algo além da raça,
 * revezando por `variant` (o 1º, o 2º… goblin do mesmo tipo ganham artes diferentes); se nada
 * casa, usa `fallback` (arte do SRD por id) ou nenhuma.
 */
export function pickMiniature(
  q: MiniatureQuery,
  catalog: MiniatureEntry[],
  fallback?: string,
  variant = 0,
): string | undefined {
  const ranked = catalog
    .map((e) => ({ e, s: score(q, e) }))
    .filter((x) => x.s > RACE_BASE)
    .sort((a, b) => b.s - a.s || a.e.arquivo.localeCompare(b.e.arquivo));
  if (!ranked.length) return fallback;
  const top = ranked.filter((x) => x.s === ranked[0].s);
  return top[variant % top.length].e.arquivo;
}

interface NamedAttacks {
  name: string;
  attacks: { name: string }[];
}

export function queryFromCreature(
  c: NamedAttacks & { kind: 'pc' | 'npc' | 'monster' },
): MiniatureQuery {
  return {
    name: c.name,
    attackNames: c.attacks.map((a) => a.name),
    // o Creature não guarda o tipo SRD: monstro só vira humano se o nome for de um papel humano
    race:
      raceFromName(c.name) ??
      (c.kind !== 'monster' || ROLE.some(([re]) => re.test(plain(c.name))) ? 'humano' : null),
  };
}

export function queryFromMonster(m: NamedAttacks & { type: string }): MiniatureQuery {
  return {
    name: m.name,
    attackNames: m.attacks.map((a) => a.name),
    race: raceFromName(m.name) ?? (/^humanoid/i.test(m.type) ? 'humano' : null),
  };
}
