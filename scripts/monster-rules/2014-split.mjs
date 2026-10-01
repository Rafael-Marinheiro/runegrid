// Gosmas que se dividem ao sofrer dano de raio ou cortante (reação "Split" do SRD 2014).
import { T } from './helpers.mjs';

const split = (from) => ({
  skip: ['split'],
  traits: { split: T('Dividir', 'Split', { split: true }, { from }) },
});

export default {
  'ochre-jelly': split('Split'),
  'black-pudding': split('Split'),
};
