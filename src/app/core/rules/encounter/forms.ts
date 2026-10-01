import { Creature, DAMAGE_TYPES } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { FormSpec } from '../../models/spell';
import { allMods, RuleError, revertForm } from '../creature';
import { inRunningWater, isSunlit } from './environment';
import { T } from '../i18n';
import { abilitiesOf } from '../monsters/registry';
import { summonTemplate } from './summon';
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
  ruleset: '2014' | '2024' = '2014',
  by?: { id: string; spell: string },
): EncounterState {
  const c = creatureOf(state, id);
  if (spec.needsShade && !spec.noRevert && (isSunlit(state, c) || inRunningWater(state, c)))
    throw new RuleError(
      T(
        'Não dá para mudar de forma à luz do sol ou em água corrente.',
        'It cannot shape-shift in sunlight or running water.',
      ),
    );
  if (spec.revert) {
    if (c.form?.noRevert && c.hp.current <= 0)
      throw new RuleError(
        T(
          `${c.name} não volta à forma verdadeira com 0 PV.`,
          `${c.name} cannot return to its true form at 0 HP.`,
        ),
      );
    if (!c.form)
      throw new RuleError(T('Já está na forma verdadeira.', 'Already in its true form.'));
    return addLog(
      withCreature(state, restore(c)),
      T(`${c.name} volta à forma verdadeira.`, `${c.name} returns to its true form.`),
      [id],
    );
  }
  const base = c.form ? restore(c) : c;
  const model = spec.srd ? summonTemplate(spec.srd, ruleset) : undefined;
  if (spec.capByTarget && model) {
    const cap = c.cr ?? c.level;
    if ((model.cr ?? 0) > cap)
      throw new RuleError(
        T(
          `${model.name} passa do ND permitido (${cap}).`,
          `${model.name} is above the allowed CR (${cap}).`,
        ),
      );
  }
  if (spec.srd && !model)
    throw new RuleError(
      T(
        'Os dados desta criatura ainda não carregaram; tente de novo em instantes.',
        "This creature's data has not loaded yet; try again in a moment.",
      ),
    );
  let next: Creature = {
    ...base,
    form: {
      id: spec.id,
      label: spec.label,
      labelEn: spec.labelEn,
      keys: spec.keys ?? [],
      ...(spec.noActions ? { noActions: true } : {}),
      ...(spec.noSpells ? { noSpells: true } : {}),
      ...(spec.noRevert ? { noRevert: true } : {}),
      ...(spec.meldsGear ? { meldsGear: true } : {}),
      ...(spec.hp ? { hp: spec.hp } : {}),
      ...(by ? { by } : {}),
      original: c.form?.original ?? {
        hp: c.hp,
        size: c.size,
        speed: c.speed,
        ac: c.ac,
        attacksPerAction: c.attacksPerAction,
        resistances: c.resistances,
        immunities: c.immunities,
        vulnerabilities: c.vulnerabilities,
        darkvision: c.darkvision,
        abilities: c.abilities,
        attacks: c.attacks,
        speeds: c.speeds,
      },
    },
    ...(spec.size ? { size: spec.size } : {}),
    ...(spec.speed !== undefined ? { speed: spec.speed } : {}),
    ...(spec.speeds ? { speeds: spec.speeds } : {}),
    ...(spec.ac !== undefined ? { ac: spec.ac } : {}),
    ...(spec.attacksPerAction !== undefined ? { attacksPerAction: spec.attacksPerAction } : {}),
    ...(spec.resistAll ? { resistances: [...DAMAGE_TYPES] } : {}),
  };
  if (model) next = takeFrom(next, model, spec);
  if (model && spec.hp === 'replace')
    next = { ...next, hp: { max: model.hp.max, current: model.hp.max, temp: c.hp.temp } };
  if (model && spec.hp === 'temp')
    next = { ...next, hp: { ...c.hp, temp: c.hp.temp + model.hp.max } };
  return addLog(
    withCreature(state, next),
    T(`${c.name} assume a forma: ${spec.label}.`, `${c.name} takes the form: ${spec.labelEn}.`),
    [id],
  );
}

/** Passa para `c` o que a forma toma da ficha do modelo (tamanho, CA, Força/Destreza, ataques…). */
function takeFrom(c: Creature, model: Creature, spec: FormSpec): Creature {
  const take = new Set(spec.take ?? []);
  const out: Creature = { ...c };
  if (take.has('size')) out.size = model.size;
  if (take.has('speed')) {
    out.speed = model.speed;
    out.speeds = model.speeds;
  }
  if (take.has('ac')) out.ac = model.ac;
  if (take.has('senses')) out.darkvision = model.darkvision;
  if (take.has('resist')) {
    out.resistances = model.resistances;
    out.immunities = model.immunities;
    out.vulnerabilities = model.vulnerabilities;
  }
  const abilities = { ...c.abilities };
  for (const k of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const)
    if (take.has(k)) abilities[k] = model.abilities[k];
  out.abilities = abilities;
  if (take.has('attacks')) {
    const kept = c.attacks.filter(
      (a) =>
        (spec.keepAttacks ?? []).includes(a.name) &&
        model.attacks.some((m) => m.name.toLowerCase().startsWith(a.name.toLowerCase())),
    );
    out.attacks = [...model.attacks, ...kept];
    out.attacksPerAction = model.attacksPerAction;
  } else if (take.has('attacksAdd')) {
    out.attacks = [
      ...c.attacks,
      ...model.attacks.filter((m) => !c.attacks.some((a) => a.name === m.name)),
    ];
  }
  return out;
}

const restore = revertForm;

/**
 * A forma acaba: ao morrer (Mudar de Forma: "reverte se morrer"), quando os PV da forma zeram
 * (Metamorfose) ou quando quem a sustenta perde a concentração.
 */
export function syncForms(state: EncounterState): EncounterState {
  let s = state;
  for (const c of state.creatures) {
    const f = c.form;
    if (!f) continue;
    // névoa da Fuga Nebulosa: com PV de novo, volta à forma verdadeira
    const risen = !!f.noRevert && c.hp.current > 0;
    const spent = (f.hp === 'replace' && c.hp.current <= 0) || (f.hp === 'temp' && c.hp.temp <= 0);
    const holder = f.by ? state.creatures.find((x) => x.id === f.by!.id) : undefined;
    const lost = !!f.by && holder?.concentration !== f.by.spell;
    if (spent || lost || risen) {
      const base = restore(creatureOf(s, c.id));
      s = addLog(
        withCreature(s, {
          ...base,
          status: 'alive',
          deathSaves: { successes: 0, failures: 0 },
        }),
        T(`${c.name} volta à forma verdadeira.`, `${c.name} returns to its true form.`),
        [c.id],
      );
      continue;
    }
    if (c.status === 'dead')
      s = addLog(
        withCreature(s, restore(creatureOf(s, c.id))),
        T(
          `${c.name} volta à forma verdadeira ao morrer.`,
          `${c.name} returns to its true form on death.`,
        ),
        [c.id],
      );
  }
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

/** Quem muda de forma por natureza passa sozinho na salvaguarda da Metamorfose. */
export function isShapechanger(c: Creature): boolean {
  return abilitiesOf(c).some((a) => a.options?.some((o) => o.patch.form && !o.patch.form.onTarget));
}

/**
 * Fuga Nebulosa: a 0 PV fora do sol e da água corrente, em vez de morrer vira névoa (e fica a 0 PV,
 * sem poder voltar à forma de vampiro até recuperar PV: o Mestre cura 1 PV quando ele chega ao esquife).
 */
export function mistyEscape(state: EncounterState, id: string): EncounterState {
  const c = creatureOf(state, id);
  if (c.status !== 'dead' || c.form?.id === 'mist' || !allMods(c).some((m) => m.mistyEscape))
    return state;
  if (isSunlit(state, c) || inRunningWater(state, c)) return state;
  const mist = abilitiesOf(c)
    .flatMap((a) => a.options ?? [])
    .find((o) => o.patch.form?.id === 'mist')?.patch.form;
  if (!mist) return state;
  let s = shapeShift(
    state,
    id,
    { ...mist, noRevert: true, needsShade: false },
    c.srdId?.startsWith('srd-2024_') ? '2024' : '2014',
  );
  const now = creatureOf(s, id);
  s = withCreature(s, {
    ...now,
    status: 'alive',
    hp: { ...now.hp, current: 0 },
    deathSaves: { successes: 0, failures: 0 },
  });
  return addLog(
    s,
    T(
      `${c.name} vira névoa em vez de cair (Fuga Nebulosa): precisa chegar ao esquife.`,
      `${c.name} turns to mist instead of falling (Misty Escape): it must reach its resting place.`,
    ),
    [id],
  );
}
