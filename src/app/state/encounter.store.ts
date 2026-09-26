import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Creature } from '@core/models/creature';
import { sampleCreatures } from '@core/models/creature-factory';
import { EncounterState, Role } from '@core/models/encounter';
import { mapFromAscii } from '@core/models/grid';
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

const KEY = 'runegrid.encounter.v2';

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
      this.message.set(e.message);
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
      return { ok: false, error: e instanceof RuleError ? e.message : 'Comando inválido.' };
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
  addFromRoster(source: Creature): string {
    const base = source.name.replace(/ \d+$/, '');
    const same = this.state().creatures.filter((c) => c.name.replace(/ \d+$/, '') === base);
    const name =
      source.kind === 'monster' && same.length ? `${base} ${same.length + 1}` : source.name;
    const id = crypto.randomUUID();
    this.send({ type: 'addCreature', creature: { ...structuredClone(source), id, name } });
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

  reset(): void {
    this.past.set([]);
    this.future.set([]);
    this.state.set(sampleEncounter());
    this.message.set('');
  }
}
