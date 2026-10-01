import { Ability, Creature, DamageType, Size } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { RuleError } from '../creature';
import { T } from '../i18n';
import { addLog, creatureOf, withCreature } from './state';

/** Ajuste livre feito pelo Mestre numa criatura: tudo é opcional, só o que vier é alterado. */
export interface Adjustment {
  ac?: number;
  speed?: number;
  speeds?: { fly?: number; swim?: number; climb?: number; burrow?: number; hover?: boolean };
  size?: Size;
  hpMax?: number;
  hpCurrent?: number;
  hpTemp?: number;
  abilities?: Partial<Record<Ability, number>>;
  /** Soma (ou subtrai) este valor ao acerto de todos os ataques. */
  attackBonus?: number;
  /** Altera ataques específicos (índice na lista de ataques). */
  attacks?: { index: number; bonus?: number; damage?: string; range?: number }[];
  attacksPerAction?: number;
  resistances?: DamageType[];
  immunities?: DamageType[];
  vulnerabilities?: DamageType[];
}

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Comando livre do Mestre: muda campos da criatura sem passar pelas regras (nada é gasto nem
 * conferido) e registra no log o que mudou, com a descrição dada. Devolve o estado novo.
 */
export function adjustCreature(
  state: EncounterState,
  targetId: string,
  changes: Adjustment,
  note: string,
  secret = true,
): EncounterState {
  const why = note.trim();
  if (!why)
    throw new RuleError(
      T('Descreva o ajuste (campo de descrição).', 'Describe the adjustment (description field).'),
    );
  const c0 = creatureOf(state, targetId);
  let c: Creature = c0;
  const pt: string[] = [];
  const en: string[] = [];
  const both = (a: string, b: string) => {
    pt.push(a);
    en.push(b);
  };
  const num = (v: number, field: string) => {
    if (!Number.isFinite(v))
      throw new RuleError(T(`Valor inválido: ${field}.`, `Invalid value: ${field}.`));
  };

  if (changes.ac !== undefined) {
    num(changes.ac, 'ac');
    both(`CA ${c.ac} → ${changes.ac}`, `AC ${c.ac} → ${changes.ac}`);
    c = { ...c, ac: changes.ac };
  }
  if (changes.speed !== undefined) {
    num(changes.speed, 'speed');
    both(`deslocamento ${c.speed} → ${changes.speed} ft`, `speed ${c.speed} → ${changes.speed} ft`);
    c = { ...c, speed: Math.max(0, changes.speed) };
  }
  if (changes.speeds) {
    c = { ...c, speeds: { ...c.speeds, ...changes.speeds } };
    const txt = Object.entries(changes.speeds)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
    both(`velocidades (${txt})`, `speeds (${txt})`);
  }
  if (changes.size) {
    both(`tamanho ${c.size} → ${changes.size}`, `size ${c.size} → ${changes.size}`);
    c = { ...c, size: changes.size };
  }
  if (changes.hpMax !== undefined) {
    num(changes.hpMax, 'hpMax');
    const max = Math.max(1, Math.floor(changes.hpMax));
    both(`PV máximos ${c.hp.max} → ${max}`, `max HP ${c.hp.max} → ${max}`);
    c = { ...c, hp: { ...c.hp, max, current: Math.min(c.hp.current, max) } };
  }
  if (changes.hpCurrent !== undefined) {
    num(changes.hpCurrent, 'hpCurrent');
    const cur = Math.max(0, Math.min(c.hp.max, Math.floor(changes.hpCurrent)));
    both(`PV ${c.hp.current} → ${cur}`, `HP ${c.hp.current} → ${cur}`);
    c = {
      ...c,
      hp: { ...c.hp, current: cur },
      ...(cur > 0 && c.status !== 'alive'
        ? { status: 'alive' as const, deathSaves: { successes: 0, failures: 0 } }
        : {}),
    };
  }
  if (changes.hpTemp !== undefined) {
    num(changes.hpTemp, 'hpTemp');
    const temp = Math.max(0, Math.floor(changes.hpTemp));
    both(`PV temporários ${c.hp.temp} → ${temp}`, `temp HP ${c.hp.temp} → ${temp}`);
    c = { ...c, hp: { ...c.hp, temp } };
  }
  if (changes.abilities) {
    const abilities = { ...c.abilities };
    for (const [k, v] of Object.entries(changes.abilities) as [Ability, number][]) {
      num(v, k);
      both(
        `${k.toUpperCase()} ${abilities[k]} → ${v}`,
        `${k.toUpperCase()} ${abilities[k]} → ${v}`,
      );
      abilities[k] = Math.max(1, Math.min(30, Math.floor(v)));
    }
    c = { ...c, abilities };
  }
  if (changes.attackBonus) {
    num(changes.attackBonus, 'attackBonus');
    c = { ...c, attacks: c.attacks.map((a) => ({ ...a, bonus: a.bonus + changes.attackBonus! })) };
    both(
      `acerto de todos os ataques ${sign(changes.attackBonus)}`,
      `all attack rolls ${sign(changes.attackBonus)}`,
    );
  }
  for (const edit of changes.attacks ?? []) {
    const a = c.attacks[edit.index];
    if (!a)
      throw new RuleError(
        T(`Ataque ${edit.index} não existe.`, `Attack ${edit.index} does not exist.`),
      );
    const next = {
      ...a,
      ...(edit.bonus !== undefined ? { bonus: edit.bonus } : {}),
      ...(edit.damage !== undefined ? { damage: edit.damage } : {}),
      ...(edit.range !== undefined ? { range: edit.range } : {}),
    };
    c = { ...c, attacks: c.attacks.map((x, i) => (i === edit.index ? next : x)) };
    both(
      `${a.name}: acerto ${a.bonus} → ${next.bonus}, dano ${a.damage} → ${next.damage}`,
      `${a.name}: to hit ${a.bonus} → ${next.bonus}, damage ${a.damage} → ${next.damage}`,
    );
  }
  if (changes.attacksPerAction !== undefined) {
    both(
      `ataques por ação ${c.attacksPerAction} → ${changes.attacksPerAction}`,
      `attacks per action ${c.attacksPerAction} → ${changes.attacksPerAction}`,
    );
    c = { ...c, attacksPerAction: Math.max(1, Math.floor(changes.attacksPerAction)) };
  }
  for (const k of ['resistances', 'immunities', 'vulnerabilities'] as const) {
    const list = changes[k];
    if (!list) continue;
    both(`${k}: ${list.join(', ') || '—'}`, `${k}: ${list.join(', ') || '—'}`);
    c = { ...c, [k]: [...list] };
  }
  if (!pt.length) throw new RuleError(T('Nenhuma alteração informada.', 'No change was given.'));

  const s = addLog(
    withCreature(state, c),
    T(
      `Ajuste do Mestre em ${c0.name}: ${pt.join('; ')}. Motivo: ${why}`,
      `GM adjustment on ${c0.name}: ${en.join('; ')}. Reason: ${why}`,
    ),
    [targetId],
  );
  return secret
    ? { ...s, log: s.log.map((e) => (e.id === s.seq - 1 ? { ...e, secret: true } : e)) }
    : s;
}
