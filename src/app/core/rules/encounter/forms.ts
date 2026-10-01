import { Creature, DAMAGE_TYPES } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { FormSpec } from '../../models/spell';
import { RuleError } from '../creature';
import { T } from '../i18n';
import { Context } from './helpers';
import { addLog, creatureOf, withCreature } from './state';

/** Palavras que marcam a forma verdadeira nas listas "(Vampire Form Only)", "(Humanoid Form Only)". */
const TRUE_WORDS = ['vampire', 'humanoid', 'true', 'hag', 'fiend', 'oni'];

/** Nome da forma atual (para listas e registro), ou `undefined` na forma verdadeira. */
export const formLabel = (c: Creature, en = false): string | undefined =>
  c.form ? (en ? c.form.labelEn : c.form.label) : undefined;

/**
 * Um ataque do SRD pode vir marcado "(Wolf or Hybrid Form Only)": só vale nessas formas. Sem marca,
 * vale sempre; na forma verdadeira valem as marcadas com a forma verdadeira.
 */
export function attackAllowed(c: Pick<Creature, 'form'>, attackName: string): boolean {
  const m = /\(([^)]*)\bForm Only\)/i.exec(attackName);
  if (!m) return true;
  const words = m[1].toLowerCase();
  const keys = c.form ? c.form.keys : TRUE_WORDS;
  return keys.some((k) => words.includes(k));
}

/** Assume a forma (ou volta à verdadeira); guarda a ficha original uma única vez. */
export function shapeShift(
  state: EncounterState,
  id: string,
  spec: FormSpec,
  ctx: Pick<Context, 'rng'>,
): EncounterState {
  void ctx;
  const c = creatureOf(state, id);
  if (spec.revert) {
    if (!c.form)
      throw new RuleError(T('Já está na forma verdadeira.', 'Already in its true form.'));
    return addLog(
      withCreature(state, restore(c)),
      T(`${c.name} volta à forma verdadeira.`, `${c.name} returns to its true form.`),
      [id],
    );
  }
  const base = c.form ? restore(c) : c;
  const next: Creature = {
    ...base,
    form: {
      id: spec.id,
      label: spec.label,
      labelEn: spec.labelEn,
      keys: spec.keys ?? [],
      ...(spec.noActions ? { noActions: true } : {}),
      original: c.form?.original ?? {
        size: c.size,
        speed: c.speed,
        ac: c.ac,
        attacksPerAction: c.attacksPerAction,
        resistances: c.resistances,
      },
    },
    ...(spec.size ? { size: spec.size } : {}),
    ...(spec.speed !== undefined ? { speed: spec.speed } : {}),
    ...(spec.ac !== undefined ? { ac: spec.ac } : {}),
    ...(spec.attacksPerAction !== undefined ? { attacksPerAction: spec.attacksPerAction } : {}),
    ...(spec.resistAll ? { resistances: [...DAMAGE_TYPES] } : {}),
  };
  return addLog(
    withCreature(state, next),
    T(`${c.name} assume a forma: ${spec.label}.`, `${c.name} takes the form: ${spec.labelEn}.`),
    [id],
  );
}

function restore(c: Creature): Creature {
  if (!c.form) return c;
  const { form, ...rest } = c;
  return { ...rest, ...form.original };
}

/** Quem morre volta à forma verdadeira (Mudar de Forma: "reverte se morrer"). */
export function syncForms(state: EncounterState): EncounterState {
  let s = state;
  for (const c of state.creatures)
    if (c.form && c.status === 'dead')
      s = addLog(
        withCreature(s, restore(creatureOf(s, c.id))),
        T(
          `${c.name} volta à forma verdadeira ao morrer.`,
          `${c.name} returns to its true form on death.`,
        ),
        [c.id],
      );
  return s;
}

/** Entra ou sai do plano Etéreo. */
export function togglePlane(state: EncounterState, id: string): EncounterState {
  const c = creatureOf(state, id);
  const { plane, ...rest } = c;
  const ethereal = plane !== 'ethereal';
  return addLog(
    withCreature(state, ethereal ? { ...rest, plane: 'ethereal' } : rest),
    ethereal
      ? T(`${c.name} entra no plano Etéreo.`, `${c.name} enters the Ethereal Plane.`)
      : T(`${c.name} volta ao plano Material.`, `${c.name} returns to the Material Plane.`),
    [id],
  );
}

/** Só interagem criaturas no mesmo plano (Material ou Etéreo). */
export function samePlane(a: Pick<Creature, 'plane'>, b: Pick<Creature, 'plane'>): boolean {
  return (a.plane ?? 'material') === (b.plane ?? 'material');
}

export const planeError = (): RuleError =>
  new RuleError(
    T(
      'Um está no plano Etéreo e o outro no Material: não se alcançam.',
      'One is on the Ethereal Plane and the other on the Material Plane: they cannot reach each other.',
    ),
  );
