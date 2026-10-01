import { Spell } from '../../models/spell';
import { SrdMonster } from '../../models/srd';
import { monsterNamePt } from '../srd/names-pt';

const CR_TEXT: Record<number, string> = { 0: '0', 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };

/**
 * Uma opção por criatura do Bestiário que cabe em `formFrom` (Mudar de Forma dos dragões metálicos,
 * Metamorfose): o tipo e o ND máximo vêm da magia/habilidade; `self` fica de fora.
 */
export function formOptions(sp: Spell, self: string, sheets: SrdMonster[]): Spell['options'] {
  const from = sp.formFrom!;
  const types = from.types.map((t) => t.toLowerCase());
  const list = sheets
    .filter((m) => types.includes(m.type.toLowerCase()) && m.cr <= from.maxCr)
    .sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name))
    .map((m) => {
      const id = m.id.replace(/^srd-2024_/, '');
      const pt = monsterNamePt(m.name);
      const cr = m.cr >= 1 ? String(m.cr) : CR_TEXT[m.cr];
      const label = (n: string) => `${n} (ND ${cr})`;
      return {
        id,
        label: label(pt),
        ...(pt !== m.name ? { labelEn: label(m.name) } : {}),
        patch: {
          form: {
            id,
            label: pt,
            labelEn: m.name,
            srd: id,
            take: from.take,
            ...(from.keepAttacks ? { keepAttacks: from.keepAttacks } : {}),
            ...(from.hp ? { hp: from.hp } : {}),
            ...(from.capByTarget ? { capByTarget: true } : {}),
            ...(from.noSpells ? { noSpells: true } : {}),
            ...(from.meldsGear ? { meldsGear: true } : {}),
            ...(from.onTarget ? { onTarget: true } : {}),
          },
        },
      };
    })
    .filter((o) => o.id !== self);
  const back = sp.options?.filter((o) => o.patch.form?.revert) ?? [];
  return [...list, ...back];
}

/** Preenche as opções das magias com `formFrom` (Metamorfose) a partir das fichas do Bestiário. */
export function expandFormOptions(spells: Spell[], sheets: SrdMonster[]): Spell[] {
  for (const sp of spells) if (sp.formFrom) sp.options = formOptions(sp, '', sheets);
  return spells;
}
