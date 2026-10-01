// Gosmas que se dividem (SRD 2024): ao ficar Ferida ou ao sofrer dano elétrico/cortante.
import { T } from './helpers.mjs';

const split = (from) => T('Dividir', 'Split', { split: true, splitBloodied: true }, { from });

export default {
  'ochre-jelly': { skip: ['split'], traits: { split: split('Split') } },
  'black-pudding': { skip: ['parry'], traits: { split: split('Parry') } },
};
