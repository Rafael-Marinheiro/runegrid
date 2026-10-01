/**
 * Habilidades ativas de monstros (F13): custo, recarga ("Recharge 5-6"), usos por dia e ações
 * lendárias, em cima do mesmo comando `cast` das magias.
 */
import { Creature } from '../../models/creature';
import { EncounterState } from '../../models/encounter';
import { Spell } from '../../models/spell';
import { RuleError } from '../creature';
import { roll, Rng } from '../dice';
import { T, spellName } from '../i18n';
import { legendaryActionsOf } from '../monsters/registry';
import { addLog, creatureOf, withCreature } from './state';

/** Ações lendárias: só fora do próprio turno, com o combate em andamento e pontos sobrando. */
export function legendaryGate(state: EncounterState, actor: Creature, spell: Spell): void {
  const cost = spell.ability?.legendary ?? 1;
  if (state.combat.phase !== 'running')
    throw new RuleError(T('O combate não está em andamento.', 'Combat is not in progress.'));
  if (state.combat.turn?.actorId === actor.id)
    throw new RuleError(
      T(
        'Ações lendárias só no turno de outra criatura.',
        'Legendary actions can only be used on another creature’s turn.',
      ),
    );
  if (actor.status !== 'alive')
    throw new RuleError(T(`${actor.name} não pode agir agora.`, `${actor.name} cannot act now.`));
  const left = actor.legendary?.left ?? legendaryActionsOf(actor);
  if (left < cost)
    throw new RuleError(
      T(
        `${actor.name} não tem ações lendárias suficientes (${left}/${cost}).`,
        `${actor.name} does not have enough legendary actions (${left}/${cost}).`,
      ),
    );
}

/** Sem recarga ou sem usos: não dá para usar agora. */
export function abilitySpent(actor: Creature, spell: Spell): boolean {
  const ab = spell.ability;
  if (!ab) return false;
  const st = actor.abilityState?.[spell.id];
  return (!!ab.recharge && !!st?.recharging) || (!!ab.uses && (st?.used ?? 0) >= ab.uses.n);
}

/** Recarga pendente ou usos esgotados impedem o uso. */
export function abilityReady(actor: Creature, spell: Spell): void {
  const ab = spell.ability;
  if (!ab) return;
  const st = actor.abilityState?.[spell.id];
  if (ab.recharge && st?.recharging)
    throw new RuleError(
      T(
        `${spell.name} está recarregando (volta com ${ab.recharge}–6 no d6).`,
        `${spellName(spell)} is recharging (returns on ${ab.recharge}–6 on a d6).`,
      ),
    );
  if (ab.uses && (st?.used ?? 0) >= ab.uses.n)
    throw new RuleError(T(`Sem usos de ${spell.name}.`, `No uses of ${spellName(spell)} left.`));
}

/** Registra o uso: começa a recarga, gasta um uso ou desconta as ações lendárias. */
export function payAbility(state: EncounterState, actorId: string, spell: Spell): EncounterState {
  const ab = spell.ability;
  if (!ab) return state;
  const c = creatureOf(state, actorId);
  const prev = c.abilityState?.[spell.id] ?? {};
  const next = {
    ...prev,
    ...(ab.recharge ? { recharging: true } : {}),
    ...(ab.uses ? { used: (prev.used ?? 0) + 1 } : {}),
  };
  const legendary =
    ab.cost === 'legendary'
      ? {
          legendary: {
            max: c.legendary?.max ?? legendaryActionsOf(c),
            left: (c.legendary?.left ?? legendaryActionsOf(c)) - (ab.legendary ?? 1),
          },
        }
      : {};
  return withCreature(state, {
    ...c,
    ...(ab.recharge || ab.uses ? { abilityState: { ...c.abilityState, [spell.id]: next } } : {}),
    ...legendary,
  });
}

/** Início do turno do monstro: rola as recargas pendentes e devolve as ações lendárias. */
export function abilitiesAtTurnStart(
  state: EncounterState,
  actorId: string,
  rng: Rng,
  abilities: Spell[],
): EncounterState {
  let s = state;
  const c0 = creatureOf(s, actorId);
  for (const sp of abilities) {
    const need = sp.ability?.recharge;
    if (!need || !creatureOf(s, actorId).abilityState?.[sp.id]?.recharging) continue;
    const r = roll('1d6', rng).total;
    const ok = r >= need;
    const c = creatureOf(s, actorId);
    if (ok)
      s = withCreature(s, {
        ...c,
        abilityState: {
          ...c.abilityState,
          [sp.id]: { ...c.abilityState![sp.id], recharging: false },
        },
      });
    s = addLog(
      s,
      T(
        `${c0.name}: recarga de ${sp.name} (d6 ${r}, precisa de ${need}+): ${ok ? 'recarregou' : 'ainda não'}.`,
        `${c0.name}: ${spellName(sp)} recharge (d6 ${r}, needs ${need}+): ${ok ? 'recharged' : 'not yet'}.`,
      ),
      [actorId],
    );
  }
  const c = creatureOf(s, actorId);
  if (c.legendary && c.legendary.left !== c.legendary.max)
    s = withCreature(s, { ...c, legendary: { ...c.legendary, left: c.legendary.max } });
  return s;
}
