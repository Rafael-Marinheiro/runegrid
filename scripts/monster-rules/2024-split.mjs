// Gosmas que se dividem (SRD 2024): no 2024 também divide ao ficar Ferida, o que o motor não modela.
import { T } from './helpers.mjs';

export default {
  'ochre-jelly': {
    skip: ['split'],
    traits: {
      split: T(
        'Dividir',
        'Split',
        { split: true },
        {
          from: 'Split',
          manual:
            'No 2024 a gosma também se divide ao ficar Ferida (metade dos PV): o Mestre aplica.',
          manualEn:
            'In 2024 the ooze also splits when it becomes Bloodied (half HP): the DM applies it.',
        },
      ),
    },
  },
  'black-pudding': {
    skip: ['parry'],
    traits: {
      split: T(
        'Dividir',
        'Split',
        { split: true },
        {
          from: 'Parry',
          manual:
            'No 2024 a gosma também se divide ao ficar Ferida (metade dos PV): o Mestre aplica.',
          manualEn:
            'In 2024 the ooze also splits when it becomes Bloodied (half HP): the DM applies it.',
        },
      ),
    },
  },
};
