import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  Ability,
  ABILITIES,
  ABILITY_LABEL,
  Creature,
  CreatureKind,
  DAMAGE_LABEL,
  DAMAGE_TYPES,
  DamageType,
  Proficiency,
  Size,
  SIZE_LABEL,
  SIZES,
  Skill,
  SKILL_KEYS,
  SKILLS,
} from '@core/models/creature';
import {
  abilityMod,
  fmtBonus,
  initiativeBonus,
  passivePerception,
  proficiencyBonus,
  saveBonus,
  skillBonus,
} from '@core/rules/creature';
import { ICON_IDS, ICON_LABEL } from '@features/combat/token-icons';
import { DiceStore } from '@state/dice.store';
import { PartyStore } from '@state/party.store';
import { UiPrefs } from '@state/ui-prefs';
import { HpPanel } from './hp-panel';
import { InventoryPanel } from './inventory-panel';
import { SlotsPanel } from './slots-panel';

type Trait = 'resistances' | 'immunities' | 'vulnerabilities';

@Component({
  selector: 'app-creature-sheet',
  imports: [HpPanel, InventoryPanel, SlotsPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './creature-sheet.html',
  styleUrl: './creature-sheet.scss',
})
export class CreatureSheet {
  readonly creature = input.required<Creature>();

  private readonly store = inject(PartyStore);
  private readonly dice = inject(DiceStore);
  protected readonly ui = inject(UiPrefs);

  protected readonly icons = ICON_IDS;
  protected readonly iconLabel = ICON_LABEL;
  protected readonly abilities = ABILITIES;
  protected readonly abilityLabel = ABILITY_LABEL;
  protected readonly skillKeys = SKILL_KEYS;
  protected readonly skills = SKILLS;
  protected readonly sizes = SIZES;
  protected readonly sizeLabel = SIZE_LABEL;
  protected readonly damageTypes = DAMAGE_TYPES;
  protected readonly damageLabel = DAMAGE_LABEL;
  protected readonly traits: { key: Trait; label: string }[] = [
    { key: 'resistances', label: 'Resistências' },
    { key: 'immunities', label: 'Imunidades' },
    { key: 'vulnerabilities', label: 'Vulnerabilidades' },
  ];

  protected abilityName(ability: Ability): string {
    const labels: Record<Ability, string> = {
      str: 'Strength',
      dex: 'Dexterity',
      con: 'Constitution',
      int: 'Intelligence',
      wis: 'Wisdom',
      cha: 'Charisma',
    };
    return this.ui.locale() === 'en' ? labels[ability] : this.abilityLabel[ability];
  }

  protected skillName(skill: Skill): string {
    if (this.ui.locale() !== 'en') return this.skills[skill].label;
    return skill.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
  }

  protected sizeName(size: Size): string {
    return this.ui.locale() === 'en'
      ? size.replace(/^./, (letter) => letter.toUpperCase())
      : this.sizeLabel[size];
  }

  protected damageName(type: DamageType): string {
    return this.ui.locale() === 'en' ? type : this.damageLabel[type];
  }

  protected traitName(trait: { key: Trait; label: string }): string {
    const labels: Record<Trait, string> = {
      resistances: 'Resistances',
      immunities: 'Immunities',
      vulnerabilities: 'Vulnerabilities',
    };
    return this.ui.locale() === 'en' ? labels[trait.key] : trait.label;
  }

  protected readonly mod = abilityMod;
  protected readonly bonus = fmtBonus;
  protected readonly prof = proficiencyBonus;
  protected readonly save = saveBonus;
  protected readonly skill = skillBonus;
  protected readonly passive = passivePerception;
  protected readonly init = initiativeBonus;

  /** Último teste rolado (aria-live). */
  protected readonly check = signal('');

  protected patch(changes: Partial<Creature>): void {
    this.store.patch(this.creature().id, changes);
  }

  protected num(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.floor(value) || min));
  }

  protected setAbility(a: Ability, value: number): void {
    this.store.update(this.creature().id, (c) => ({
      ...c,
      abilities: { ...c.abilities, [a]: this.num(value, 1, 30) },
    }));
  }

  protected toggleSave(a: Ability, on: boolean): void {
    this.store.update(this.creature().id, (c) => ({
      ...c,
      saveProficiencies: on
        ? [...new Set([...c.saveProficiencies, a])]
        : c.saveProficiencies.filter((x) => x !== a),
    }));
  }

  protected setSkill(s: Skill, value: string): void {
    this.store.update(this.creature().id, (c) => {
      const skills = { ...c.skills };
      if (value) skills[s] = value as Proficiency;
      else delete skills[s];
      return { ...c, skills };
    });
  }

  protected toggleTrait(list: Trait, t: DamageType, on: boolean): void {
    this.store.update(this.creature().id, (c) => ({
      ...c,
      [list]: on ? [...new Set([...c[list], t])] : c[list].filter((x) => x !== t),
    }));
  }

  protected setKind(kind: string): void {
    this.patch({
      kind: kind as CreatureKind,
      cr: kind === 'monster' ? (this.creature().cr ?? 1) : undefined,
    });
  }

  protected setSize(size: string): void {
    this.patch({ size: size as Size });
  }

  protected async uploadTokenImage(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    )
      return void this.check.set(
        this.ui.text('Use PNG, JPEG ou WebP de até 5 MB.', 'Use PNG, JPEG, or WebP up to 5 MB.'),
      );
    try {
      const image = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const side = Math.min(image.width, image.height);
      canvas
        .getContext('2d')!
        .drawImage(
          image,
          (image.width - side) / 2,
          (image.height - side) / 2,
          side,
          side,
          0,
          0,
          256,
          256,
        );
      image.close();
      this.patch({ tokenImage: canvas.toDataURL('image/webp', 0.85) });
      this.check.set(this.ui.text('Imagem do token atualizada.', 'Token image updated.'));
    } catch {
      this.check.set(this.ui.text('Não foi possível ler a imagem.', 'Could not read the image.'));
    }
  }

  /** Rola um d20 com o bônus e anuncia o resultado. */
  protected roll(label: string, bonus: number): void {
    this.dice.rollD20(bonus, 'normal');
    const last = this.dice.last()!;
    this.check.set(
      `${this.creature().name} — ${label}: ${last.result.total} (d20 ${last.d20!.natural} ${fmtBonus(bonus)})`,
    );
  }
}
