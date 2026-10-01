import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { ABILITIES, Creature, SIZES } from '@core/models/creature';
import { sampleCreatures } from '@core/models/creature-factory';
import { EncounterState, Role } from '@core/models/encounter';
import { inBounds, isGridMap, mapFromAscii } from '@core/models/grid';
import { RuleError } from '@core/rules/creature';
import {
  Command,
  dispatch,
  newEncounter,
  occupiedCells,
  project,
  sizeOf,
  teamOf,
} from '@core/rules/encounter';
import { canStand } from '@core/rules/grid/movement';
import { RNG } from './rng.token';
import { T } from '@core/rules/i18n';

const KEY = 'runegrid.encounter.v2';
const SESSION_FORMAT = 'runegrid-session';
const SESSION_VERSION = 1;

/** Ligação com o Mestre quando este navegador é um jogador numa sala. */
export interface RemoteLink {
  send(cmd: Command): Promise<{ ok: boolean; error?: string }>;
}
const MAX_UNDO = 100;

const SAMPLE_MAP = [
  '################',
  '#.....#........#',
  '#.....#..,,....#',
  '#.....D..,,....#',
  '#.....#........#',
  '###D###...,,...#',
  '#.....#........#',
  '#..,..D........#',
  '#.....#####D####',
  '#.....#........#',
  '################',
];

/** Encontro de exemplo: o grupo contra dois esqueletos e um ogro, ainda na montagem. */
function sampleEncounter(): EncounterState {
  const [thordak, lyra, brann, skeleton, ogre] = sampleCreatures();
  const placed: [Creature, number, number][] = [
    [thordak, 9, 3],
    [lyra, 8, 4],
    [brann, 10, 5],
    [{ ...skeleton, name: 'Esqueleto A' }, 13, 2],
    [{ ...structuredClone(skeleton), id: crypto.randomUUID(), name: 'Esqueleto B' }, 13, 4],
    [ogre, 12, 6],
  ];
  const ctx = { rng: Math.random, role: { kind: 'dm' } as Role };
  let s = newEncounter(mapFromAscii(SAMPLE_MAP), 'Sala dos Sarcófagos');
  for (const [creature, x, y] of placed)
    s = dispatch(s, { type: 'addCreature', creature, pos: { x, y } }, ctx);
  return s;
}

function load(): EncounterState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return raw?.map?.cells && Array.isArray(raw.creatures) && raw.combat
      ? (raw as EncounterState)
      : null;
  } catch {
    return null;
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function validCreature(value: unknown): value is Creature {
  if (!record(value) || !record(value['hp']) || !record(value['abilities'])) return false;
  const hp = value['hp'];
  const abilities = value['abilities'];
  return (
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    ['pc', 'npc', 'monster'].includes(String(value['kind'])) &&
    SIZES.includes(value['size'] as (typeof SIZES)[number]) &&
    ['alive', 'dying', 'stable', 'dead'].includes(String(value['status'])) &&
    ['level', 'speed', 'ac', 'attacksPerAction'].every((key) => finite(value[key])) &&
    ABILITIES.every((ability) => finite(abilities[ability])) &&
    ['max', 'current', 'temp'].every((key) => finite(hp[key])) &&
    [
      'saveProficiencies',
      'resources',
      'attacks',
      'resistances',
      'immunities',
      'vulnerabilities',
      'conditions',
    ].every((key) => Array.isArray(value[key])) &&
    record(value['deathSaves']) &&
    record(value['spellSlots'])
  );
}

function validCombat(value: unknown): boolean {
  if (!record(value) || !record(value['initiative'])) return false;
  const turn = value['turn'];
  return (
    ['setup', 'running', 'ended'].includes(String(value['phase'])) &&
    finite(value['round']) &&
    finite(value['turnIndex']) &&
    strings(value['order']) &&
    strings(value['dodging']) &&
    Object.values(value['initiative']).every(finite) &&
    (turn === null ||
      (record(turn) &&
        typeof turn['actorId'] === 'string' &&
        ['action', 'bonus', 'reaction', 'dashed', 'disengaged'].every(
          (key) => typeof turn[key] === 'boolean',
        ) &&
        finite(turn['movedFt']) &&
        finite(turn['attacksLeft'])))
  );
}

/** Valida o formato persistido antes que qualquer tela passe a consumi-lo. */
export function isEncounterState(value: unknown): value is EncounterState {
  if (!record(value) || !isGridMap(value['map'])) return false;
  const creatures = value['creatures'];
  const tokens = value['tokens'];
  const log = value['log'];
  const floors = value['floors'];
  const ids = new Set(
    Array.isArray(creatures) ? creatures.filter(validCreature).map((creature) => creature.id) : [],
  );
  const validToken = (token: unknown, map: unknown = value['map']): boolean =>
    isGridMap(map) &&
    record(token) &&
    record(token['pos']) &&
    typeof token['creatureId'] === 'string' &&
    ids.has(token['creatureId']) &&
    inBounds(map, token['pos'] as { x: number; y: number }) &&
    (token['hidden'] === undefined || typeof token['hidden'] === 'boolean');
  return (
    typeof value['name'] === 'string' &&
    ['simple', 'alternate'].includes(String(value['rule'])) &&
    Array.isArray(creatures) &&
    creatures.length === ids.size &&
    Array.isArray(tokens) &&
    tokens.every((token) => validToken(token)) &&
    validCombat(value['combat']) &&
    Array.isArray(log) &&
    log.every(
      (entry) =>
        record(entry) &&
        finite(entry['id']) &&
        finite(entry['round']) &&
        typeof entry['text'] === 'string',
    ) &&
    finite(value['seq']) &&
    (floors === undefined ||
      (Array.isArray(floors) &&
        floors.every(
          (floor) =>
            record(floor) &&
            typeof floor['id'] === 'string' &&
            typeof floor['name'] === 'string' &&
            isGridMap(floor['map']) &&
            Array.isArray(floor['tokens']) &&
            floor['tokens'].every((token) => validToken(token, floor['map'])),
        )))
  );
}

export function serializeSession(state: EncounterState): string {
  return JSON.stringify(
    {
      format: SESSION_FORMAT,
      version: SESSION_VERSION,
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    1,
  );
}

export function parseSession(text: string): EncounterState | null {
  try {
    const envelope: unknown = JSON.parse(text);
    if (
      !record(envelope) ||
      envelope['format'] !== SESSION_FORMAT ||
      envelope['version'] !== SESSION_VERSION ||
      !isEncounterState(envelope['state'])
    )
      return null;
    return envelope['state'];
  } catch {
    return null;
  }
}

/** Estado do encontro. Toda mudança é um `Command` validado por `core/rules/encounter`. */
@Injectable({ providedIn: 'root' })
export class EncounterStore {
  private readonly rng = inject(RNG);

  readonly state = signal<EncounterState>(load() ?? sampleEncounter());
  /** Quem está usando: o Mestre ou um jogador dono de certas criaturas. */
  readonly role = signal<Role>({ kind: 'dm' });
  /** O que este papel enxerga (jogador não vê tokens ocultos nem PV exatos dos inimigos). */
  readonly view = computed(() => project(this.state(), this.role()));
  readonly message = signal('');
  /** Presente quando este navegador é um jogador: o estado vem do Mestre e os comandos vão para ele. */
  readonly remote = signal<RemoteLink | null>(null);

  private readonly past = signal<EncounterState[]>([]);
  private readonly future = signal<EncounterState[]>([]);
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);

  constructor() {
    effect(() => {
      // jogador numa sala não grava por cima do encontro local
      if (this.remote()) return;
      const data = JSON.stringify(this.state());
      try {
        localStorage.setItem(KEY, data);
      } catch {
        /* sem armazenamento: segue só em memória */
      }
    });
  }

  /** Envia um comando. Devolve `true` se foi aceito; senão a regra violada vira mensagem. */
  send(cmd: Command): boolean {
    const link = this.remote();
    if (link) {
      // jogador: o Mestre valida; a resposta chega depois e o estado novo vem por `applyRemote`
      void link
        .send(cmd)
        .then((r) => this.message.set(r.ok ? '' : (r.error ?? 'Comando recusado.')));
      return true;
    }
    try {
      const next = dispatch(this.state(), cmd, { rng: this.rng, role: this.role() });
      this.past.update((p) => [...p, this.state()].slice(-MAX_UNDO));
      this.future.set([]);
      this.state.set(next);
      this.message.set('');
      return true;
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      this.message.set(e.marked);
      return false;
    }
  }

  /** Mestre: aplica o comando de um jogador remoto com o papel dele. Nunca lança. */
  sendAs(cmd: Command, role: Role): { ok: boolean; error?: string } {
    try {
      const next = dispatch(this.state(), cmd, { rng: this.rng, role });
      this.past.update((p) => [...p, this.state()].slice(-MAX_UNDO));
      this.future.set([]);
      this.state.set(next);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof RuleError ? e.marked : T('Comando inválido.', 'Invalid command.'),
      };
    }
  }

  /** Jogador: recebe a visão enviada pelo Mestre. */
  applyRemote(view: EncounterState): void {
    this.state.set(view);
  }

  undo(): void {
    const p = this.past();
    if (!p.length) return;
    this.future.update((f) => [this.state(), ...f]);
    this.state.set(p[p.length - 1]);
    this.past.set(p.slice(0, -1));
    this.message.set('');
  }

  redo(): void {
    const f = this.future();
    if (!f.length) return;
    this.past.update((p) => [...p, this.state()]);
    this.state.set(f[0]);
    this.future.set(f.slice(1));
    this.message.set('');
  }

  /** Coloca uma cópia da criatura do grupo no encontro (monstros repetidos ganham numeração). */
  addFromRoster(source: Creature, pos?: { x: number; y: number }, hidden = false): string {
    const base = source.name.replace(/ \d+$/, '');
    const same = this.state().creatures.filter((c) => c.name.replace(/ \d+$/, '') === base);
    const name =
      source.kind === 'monster' && same.length ? `${base} ${same.length + 1}` : source.name;
    const id = crypto.randomUUID();
    this.send({
      type: 'addCreature',
      creature: { ...structuredClone(source), id, name },
      pos,
      hidden,
    });
    return id;
  }

  /** Coloca a criatura na primeira célula livre: monstros a partir da direita, o grupo a partir da esquerda. */
  autoPlace(id: string): boolean {
    const s = this.state();
    const c = s.creatures.find((x) => x.id === id);
    if (!c) return false;
    const { width, height } = s.map;
    const occupied = occupiedCells(s, (o) => o.id !== id);
    const xs = Array.from({ length: width }, (_, i) => i);
    if (teamOf(c) === 'foes') xs.reverse();
    for (const x of xs) {
      for (let y = 0; y < height; y++) {
        if (canStand(s.map, { x, y }, sizeOf(c), occupied)) {
          return this.send({ type: 'placeToken', id, pos: { x, y } });
        }
      }
    }
    this.message.set('Não há espaço livre no mapa.');
    return false;
  }

  /** Carrega um encontro pronto (por exemplo, o de uma aventura gerada) e zera o histórico. */
  load(state: EncounterState): void {
    this.past.set([]);
    this.future.set([]);
    this.state.set(state);
    this.message.set('');
  }

  exportSession(): string {
    return serializeSession(this.state());
  }

  importSession(text: string): boolean {
    const state = parseSession(text);
    if (!state) return false;
    this.load(state);
    return true;
  }

  reset(): void {
    this.past.set([]);
    this.future.set([]);
    this.state.set(sampleEncounter());
    this.message.set('');
  }
}
