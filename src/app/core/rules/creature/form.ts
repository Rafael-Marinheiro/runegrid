import { Creature } from '../../models/creature';

/** Volta à forma verdadeira: devolve a ficha guardada (e os PV, se a forma os tinha trocado). */
export function revertForm(c: Creature): Creature {
  if (!c.form) return c;
  const { form, ...rest } = c;
  const { hp, ...stats } = form.original;
  // PV: trocados voltam aos de antes; PV temporários da forma somem
  const back = form.hp === 'replace' ? hp : form.hp === 'temp' ? { ...c.hp, temp: hp.temp } : c.hp;
  return { ...rest, ...stats, hp: back };
}
