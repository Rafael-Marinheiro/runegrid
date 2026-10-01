// SRD 5.2 (2024) — 3º nível. Lido a partir de public/data/spells-2024.json; o que não aparece é igual ao 2014.
import { cond, creature, dmg, effect, opt, point, save, sphere, vfx, auto } from './helpers.mjs';

export default {
  'bestow-curse': {
    options: [
      opt('attack', 'Desvantagem nos ataques contra você', {
        effect: effect({ note: 'Amaldiçoado: desvantagem nos ataques contra o conjurador.' }),
      }),
      opt('ability', 'Desvantagem num atributo', {
        effect: effect({
          note: 'Amaldiçoado: desvantagem em testes e salvaguardas do atributo escolhido.',
        }),
      }),
      opt('turns', 'Esquiva forçada (Sabedoria no início do turno)', {
        effect: effect({
          note: 'Amaldiçoado: no início de cada turno de combate faz salvaguarda de Sabedoria; se falhar, é forçado a usar a ação Esquivar.',
        }),
      }),
      opt('necrotic', '+1d8 necrótico nos seus ataques e magias contra ele', {
        effect: effect(
          { weaponDamage: { dice: '1d8', type: 'necrotic', onlyAgainst: '@target' } },
          { to: 'both' },
        ),
      }),
    ],
  },
  blink: {
    manual:
      'No fim de cada turno role 1d6: com 4 a 6 você vai ao Plano Etéreo e volta no início do próximo turno.',
  },
  counterspell: {
    // 2024: o conjurador faz salvaguarda de Constituição; se falhar a magia se dissipa e o espaço não é gasto
    react: { on: 'cast', save: true },
  },
  'conjure-animals': {
    replace: true,
    // 2024: uma alcateia espectral; quem chega a 10 ft dela ou termina o turno ali faz a salvaguarda
    target: point,
    resolution: save('dex'),
    damage: dmg('3d10', 'slashing', { perLevel: '1d10' }),
    noInitial: true,
    zone: { on: 'both', radius: 10, color: 'life' },
    // ao se mover no seu turno você também move a alcateia até 30 ft (clique no novo ponto)
    sustain: { cost: 'free' },
    manual:
      'A alcateia é intangível: use uma salvaguarda de Destreza por criatura por turno (o motor aplica ao entrar na área ou terminar o turno nela).',
    vfx: vfx('burst', 'life'),
  },
  'gaseous-form': {
    effect: effect({
      resist: ['bludgeoning', 'piercing', 'slashing'],
      immuneConditions: ['prone'],
      saveMode: { mode: 'advantage', abilities: ['str', 'dex', 'con'] },
      note: 'Forma de névoa: voo 10 ft, atravessa frestas; não ataca nem conjura.',
    }),
  },
  'mass-healing-word': {
    replace: true,
    target: creature(6),
    resolution: auto,
    heal: { dice: '2d4', perLevel: '1d4', addModifier: true },
    vfx: vfx('glow', 'life'),
  },
  'sleet-storm': {
    manual: 'Quem falha na salvaguarda cai (Caído) e perde a concentração (remova-a à mão).',
  },
  'stinking-cloud': {
    replace: true,
    target: sphere(20),
    resolution: save('con'),
    condition: cond('poisoned', 1),
    effect: effect(
      { note: 'Envenenado até o fim do turno: não pode usar ação nem ação bônus.' },
      { rounds: 1 },
    ),
    noInitial: true,
    zone: { on: 'start', obscures: true, color: 'poison' },
    vfx: vfx('burst', 'poison'),
  },
  'wind-wall': { damage: dmg('4d8', 'bludgeoning') },
};
