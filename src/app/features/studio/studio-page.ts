import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DAMAGE_LABEL, DAMAGE_TYPES, DamageType } from '@core/models/creature';
import {
  blankMap,
  MapBackground,
  MapVision,
  Pos,
  Room,
  Terrain,
  Texture,
  TEXTURES,
  Trap,
} from '@core/models/grid';
import { project, sizeOf, teamOf } from '@core/rules/encounter';
import { MapView, TokenView } from '@features/combat/map-view';
import { iconFor } from '@features/combat/token-icons';
import { UiPrefs } from '@state/ui-prefs';
import { DungeonLibrary, SavedDungeon } from '@state/dungeon-library';
import { EncounterStore } from '@state/encounter.store';

type Tool =
  | { kind: 'select' }
  | { kind: 'terrain'; terrain: Terrain }
  | { kind: 'room' }
  | { kind: 'trap' }
  | { kind: 'fog'; hidden: boolean };

interface ToolButton {
  id: string;
  label: string;
  tool: Tool;
}

const TOOLS: ToolButton[] = [
  { id: 'select', label: 'Selecionar', tool: { kind: 'select' } },
  { id: 'floor', label: 'Piso', tool: { kind: 'terrain', terrain: 'floor' } },
  { id: 'wall', label: 'Parede', tool: { kind: 'terrain', terrain: 'wall' } },
  { id: 'difficult', label: 'Difícil', tool: { kind: 'terrain', terrain: 'difficult' } },
  { id: 'water', label: 'Água', tool: { kind: 'terrain', terrain: 'water' } },
  { id: 'door', label: 'Porta', tool: { kind: 'terrain', terrain: 'door' } },
  { id: 'door-closed', label: 'Porta fechada', tool: { kind: 'terrain', terrain: 'door-closed' } },
  { id: 'door-locked', label: 'Trancada', tool: { kind: 'terrain', terrain: 'door-locked' } },
  { id: 'room', label: 'Sala', tool: { kind: 'room' } },
  { id: 'trap', label: 'Armadilha', tool: { kind: 'trap' } },
  { id: 'fog-on', label: 'Ocultar', tool: { kind: 'fog', hidden: true } },
  { id: 'fog-off', label: 'Revelar', tool: { kind: 'fog', hidden: false } },
];

@Component({
  selector: 'app-studio-page',
  imports: [MapView],
  templateUrl: './studio-page.html',
  styleUrl: './studio-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioPage {
  protected readonly store = inject(EncounterStore);
  protected readonly library = inject(DungeonLibrary);
  protected readonly ui = inject(UiPrefs);
  protected readonly textures = TEXTURES;
  protected readonly textureLabel: Record<Texture, string> = {
    none: 'Sem textura',
    stone: 'Pedra',
    cave: 'Caverna',
    grass: 'Grama',
    mud: 'Lama',
  };

  protected readonly tools = TOOLS;
  protected readonly damageTypes = DAMAGE_TYPES;
  protected readonly damageLabel = DAMAGE_LABEL;
  protected readonly abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

  protected readonly toolId = signal('floor');
  protected readonly asPlayer = signal(false);
  protected readonly selectedRoomId = signal<string | null>(null);
  protected readonly selectedTrapId = signal<string | null>(null);
  protected readonly message = signal('');

  protected toolLabel(tool: ToolButton): string {
    const labels: Record<string, string> = {
      select: 'Select',
      floor: 'Floor',
      wall: 'Wall',
      difficult: 'Difficult',
      water: 'Water',
      door: 'Door',
      'door-closed': 'Closed door',
      'door-locked': 'Locked door',
      room: 'Room',
      trap: 'Trap',
      'fog-on': 'Hide',
      'fog-off': 'Reveal',
    };
    return this.ui.locale() === 'en' ? labels[tool.id] : tool.label;
  }

  protected textureName(texture: Texture): string {
    const labels: Record<Texture, string> = {
      none: 'No texture',
      stone: 'Stone',
      cave: 'Cave',
      grass: 'Grass',
      mud: 'Mud',
    };
    return this.ui.locale() === 'en' ? labels[texture] : this.textureLabel[texture];
  }

  protected damageName(type: DamageType): string {
    return this.ui.locale() === 'en' ? type : this.damageLabel[type];
  }

  /** Traço em andamento (células do pincel) e retângulo de sala. */
  protected readonly stroke = signal<Pos[]>([]);
  protected readonly draft = signal<{ a: Pos; b: Pos } | null>(null);

  protected readonly state = this.store.state;
  protected readonly tool = computed(() => TOOLS.find((t) => t.id === this.toolId())!.tool);
  protected readonly editable = computed(
    () => this.state().combat.phase === 'setup' && this.store.role().kind === 'dm',
  );

  /** O que se mostra: a visão do Mestre ou a do jogador (com névoa aplicada). */
  protected readonly shown = computed(() => {
    const s = this.state();
    if (!this.asPlayer()) return s;
    const owns = s.creatures.filter((c) => c.kind !== 'monster').map((c) => c.id);
    return project(s, { kind: 'player', owns });
  });

  protected readonly rooms = computed(() => this.state().map.rooms ?? []);
  protected readonly traps = computed(() => this.state().map.traps ?? []);
  protected readonly selectedRoom = computed(() =>
    this.rooms().find((r) => r.id === this.selectedRoomId()),
  );
  protected readonly selectedTrap = computed(() =>
    this.traps().find((t) => t.id === this.selectedTrapId()),
  );

  protected readonly tokens = computed<TokenView[]>(() => {
    const s = this.shown();
    return s.tokens.flatMap((t) => {
      const c = s.creatures.find((x) => x.id === t.creatureId);
      if (!c) return [];
      return [
        {
          id: c.id,
          name: c.name,
          letter: c.name.trim().charAt(0).toUpperCase(),
          pos: t.pos,
          size: sizeOf(c),
          team: teamOf(c),
          hpPct: c.hp.max ? (c.hp.current / c.hp.max) * 100 : 0,
          hidden: !!t.hidden,
          dead: c.status === 'dead',
          active: false,
          selected: false,
          targetable: false,
          icon: iconFor(c),
          conditions: 0,
          concentrating: false,
        },
      ];
    });
  });

  protected pick(id: string): void {
    this.toolId.set(id);
    this.stroke.set([]);
    this.draft.set(null);
  }

  // ---------- pincel ----------

  protected onStart(pos: Pos): void {
    if (!this.editable() || this.asPlayer()) return this.inspect(pos);
    const t = this.tool();
    if (t.kind === 'terrain' || t.kind === 'fog') this.stroke.set([pos]);
    else if (t.kind === 'room') this.draft.set({ a: pos, b: pos });
    else if (t.kind === 'trap') this.addTrap(pos);
    else this.inspect(pos);
  }

  protected onMove(pos: Pos): void {
    const t = this.tool();
    if (t.kind === 'terrain' || t.kind === 'fog') {
      this.stroke.update((s) => (s.some((c) => c.x === pos.x && c.y === pos.y) ? s : [...s, pos]));
    } else if (t.kind === 'room') {
      this.draft.update((d) => (d ? { ...d, b: pos } : d));
    }
  }

  protected onEnd(): void {
    const t = this.tool();
    const cells = this.stroke();
    if (t.kind === 'terrain' && cells.length)
      this.send({ type: 'paint', cells, terrain: t.terrain });
    else if (t.kind === 'fog' && cells.length)
      this.send({ type: 'setFog', cells, hidden: t.hidden });
    else if (t.kind === 'room') this.commitRoom();
    this.stroke.set([]);
    this.draft.set(null);
  }

  private commitRoom(): void {
    const d = this.draft();
    if (!d) return;
    const n = this.rooms().length + 1;
    const room: Room = {
      id: crypto.randomUUID(),
      name: `${this.ui.text('Sala', 'Room')} ${n}`,
      description: '',
      notes: '',
      x: Math.min(d.a.x, d.b.x),
      y: Math.min(d.a.y, d.b.y),
      w: Math.abs(d.a.x - d.b.x) + 1,
      h: Math.abs(d.a.y - d.b.y) + 1,
    };
    if (this.send({ type: 'upsertRoom', room })) this.selectedRoomId.set(room.id);
  }

  private addTrap(pos: Pos): void {
    const trap: Trap = {
      id: crypto.randomUUID(),
      name: this.ui.text('Armadilha', 'Trap'),
      pos,
      ability: 'dex',
      dc: 13,
      damage: '2d10',
      damageType: 'piercing',
      hidden: true,
      triggered: false,
    };
    if (this.send({ type: 'upsertTrap', trap })) this.selectedTrapId.set(trap.id);
  }

  private inspect(pos: Pos): void {
    const trap = this.traps().find((t) => t.pos.x === pos.x && t.pos.y === pos.y);
    const room = this.rooms().find(
      (r) => pos.x >= r.x && pos.x < r.x + r.w && pos.y >= r.y && pos.y < r.y + r.h,
    );
    this.selectedTrapId.set(trap?.id ?? null);
    this.selectedRoomId.set(room?.id ?? null);
  }

  private send(cmd: Parameters<EncounterStore['send']>[0]): boolean {
    const ok = this.store.send(cmd);
    this.message.set(ok ? '' : this.store.message());
    return ok;
  }

  // ---------- salas e armadilhas ----------

  protected editRoom(changes: Partial<Room>): void {
    const r = this.selectedRoom();
    if (r) this.send({ type: 'upsertRoom', room: { ...r, ...changes } });
  }

  protected reveal(hidden: boolean): void {
    const r = this.selectedRoom();
    if (r) this.send({ type: 'revealRoom', id: r.id, hidden });
  }

  protected removeRoom(): void {
    const r = this.selectedRoom();
    if (r && this.send({ type: 'removeRoom', id: r.id })) this.selectedRoomId.set(null);
  }

  protected editTrap(changes: Partial<Trap>): void {
    const t = this.selectedTrap();
    if (t) this.send({ type: 'upsertTrap', trap: { ...t, ...changes } });
  }

  protected removeTrap(): void {
    const t = this.selectedTrap();
    if (t && this.send({ type: 'removeTrap', id: t.id })) this.selectedTrapId.set(null);
  }

  protected damageType(value: string): DamageType {
    return value as DamageType;
  }

  protected setTexture(value: string): void {
    this.send({ type: 'setTexture', texture: value as Texture });
  }

  protected setVision(changes: Partial<MapVision>): void {
    const vision = this.state().map.vision ?? { enabled: false, darkness: false };
    this.send({ type: 'setVision', vision: { ...vision, ...changes } });
  }

  protected editBackground(changes: Partial<MapBackground>): void {
    const background = this.state().map.background;
    if (background)
      this.send({ type: 'setMapBackground', background: { ...background, ...changes } });
  }

  protected removeBackground(): void {
    this.send({ type: 'setMapBackground' });
  }

  protected async importBackground(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      this.message.set(
        this.ui.text('Use uma imagem válida de até 2 MB.', 'Use a valid image up to 2 MB.'),
      );
      return;
    }
    try {
      const src = await fileToDataUrl(file);
      const image = new Image();
      image.src = src;
      await image.decode();
      this.send({
        type: 'setMapBackground',
        background: {
          src,
          widthPx: image.naturalWidth,
          heightPx: image.naturalHeight,
          pixelsPerCell: image.naturalWidth / this.state().map.width,
          offsetX: 0,
          offsetY: 0,
          opacity: 1,
        },
      });
    } catch {
      this.message.set(this.ui.text('Não foi possível ler a imagem.', 'Could not read the image.'));
    }
  }

  // ---------- mapa e biblioteca ----------

  protected newMap(w: string, h: string): void {
    this.send({ type: 'setMap', map: blankMap(Number(w) || 20, Number(h) || 14) });
  }

  protected saveToLibrary(name: string): void {
    this.library.save(name || this.state().name, this.state().map);
    this.message.set(
      `"${name || this.state().name}" ${this.ui.text('salvo na biblioteca.', 'saved to the library.')}`,
    );
  }

  protected load(d: SavedDungeon): void {
    this.send({ type: 'setMap', map: structuredClone(d.map) });
  }

  protected exportMap(name: string): void {
    const text = this.library.serialize({ name: name || this.state().name, map: this.state().map });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `${(name || this.state().name).replace(/[^\w-]+/g, '-')}.runegrid.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  protected async importMap(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = this.library.parse(await file.text());
    if (!parsed)
      return void this.message.set(
        this.ui.text(
          'Arquivo inválido: não é um mapa do Runegrid.',
          'Invalid file: this is not a Runegrid map.',
        ),
      );
    if (this.send({ type: 'setMap', map: parsed.map }))
      this.message.set(`"${parsed.name}" ${this.ui.text('importado.', 'imported.')}`);
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
