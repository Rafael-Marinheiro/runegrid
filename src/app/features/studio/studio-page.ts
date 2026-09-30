import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Creature, DAMAGE_LABEL, DAMAGE_TYPES, DamageType } from '@core/models/creature';
import {
  blankMap,
  IMPASSABLE,
  MapBackground,
  MapObject,
  MapObjectKind,
  MAP_OBJECT_KINDS,
  MapObjectTexture,
  MAP_OBJECT_TEXTURES,
  MapVision,
  PlacedItem,
  Portal,
  Pos,
  Room,
  Terrain,
  Texture,
  TEXTURES,
  Trap,
} from '@core/models/grid';
import { project, sizeOf, teamOf } from '@core/rules/encounter';
import { CATALOG } from '@core/rules/inventory/catalog';
import { monsterToCreature } from '@core/rules/srd/convert';
import { queryFromMonster } from '@core/rules/srd/miniature';
import { monsterNamePt } from '@core/rules/srd/names-pt';
import { exportFoundryScene, importFoundryScene } from '@core/rules/vtt/foundry';
import { MapView, TokenView } from '@features/combat/map-view';
import {
  MAP_OBJECT_ART,
  MAP_OBJECT_GROUPS,
  MAP_OBJECT_TEXTURE_LABEL,
  MapObjectGroup,
} from '@features/combat/map-object-art';
import { iconFor, tokenImageFor } from '@features/combat/token-icons';
import { SceneSuggestion, suggestSceneText } from '@net/ai-text';
import { UiPrefs } from '@state/ui-prefs';
import { DungeonLibrary, SavedDungeon } from '@state/dungeon-library';
import { EncounterStore } from '@state/encounter.store';
import { PartyStore } from '@state/party.store';
import { MonsterArtStore } from '@state/monster-art.store';
import { SrdStore } from '@state/srd.store';

type Tool =
  | { kind: 'select' }
  | { kind: 'terrain'; terrain: Terrain }
  | { kind: 'room' }
  | { kind: 'trap' }
  | { kind: 'portal' }
  | { kind: 'creature' }
  | { kind: 'item' }
  | { kind: 'object' }
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
  { id: 'portal', label: 'Portal', tool: { kind: 'portal' } },
  { id: 'creature', label: 'Criatura', tool: { kind: 'creature' } },
  { id: 'item', label: 'Item', tool: { kind: 'item' } },
  { id: 'object', label: 'Objeto', tool: { kind: 'object' } },
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
export class StudioPage implements OnInit {
  protected readonly store = inject(EncounterStore);
  protected readonly library = inject(DungeonLibrary);
  protected readonly ui = inject(UiPrefs);
  protected readonly party = inject(PartyStore);
  protected readonly srd = inject(SrdStore);
  private readonly art = inject(MonsterArtStore);
  protected readonly catalog = CATALOG;
  protected readonly objectKinds = MAP_OBJECT_KINDS;
  protected readonly objectTextures = MAP_OBJECT_TEXTURES;
  protected readonly objectGroups = MAP_OBJECT_GROUPS;
  protected readonly objectAngles = [0, 45, 90, 135, 180, 225, 270, 315] as const;
  protected readonly textures = TEXTURES;
  protected readonly textureLabel: Record<Texture, string> = {
    none: 'Sem textura',
    stone: 'Pedra',
    cave: 'Caverna',
    grass: 'Grama',
    mud: 'Lama',
    ice: 'Gelo e neve',
    sand: 'Areia',
    wood: 'Madeira',
  };

  protected readonly tools = TOOLS;
  protected readonly damageTypes = DAMAGE_TYPES;
  protected readonly damageLabel = DAMAGE_LABEL;
  protected readonly abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

  protected readonly toolId = signal('floor');
  protected readonly asPlayer = signal(false);
  protected readonly selectedRoomId = signal<string | null>(null);
  protected readonly selectedTrapId = signal<string | null>(null);
  protected readonly selectedPortalId = signal<string | null>(null);
  protected readonly selectedCreatureId = signal<string | null>(null);
  protected readonly selectedObjectId = signal<string | null>(null);
  protected readonly creatureSource = signal(`party:${this.party.creatures()[0]?.id ?? ''}`);
  protected readonly itemRef = signal(CATALOG[0].id);
  protected readonly placementHidden = signal(true);
  protected readonly objectKind = signal<MapObjectKind>('table');
  protected readonly objectTexture = signal<MapObjectTexture>('wood');
  protected readonly objectRotation = signal(0);
  protected readonly objectBlocksMovement = signal(true);
  protected readonly objectBlocksSight = signal(false);
  protected readonly suggesting = signal(false);
  protected readonly aiSuggestion = signal<(SceneSuggestion & { roomId?: string }) | null>(null);
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
      portal: 'Portal',
      creature: 'Creature',
      item: 'Item',
      object: 'Object',
      'fog-on': 'Hide',
      'fog-off': 'Reveal',
    };
    return this.ui.locale() === 'en' ? labels[tool.id] : tool.label;
  }

  protected objectName(kind: MapObjectKind): string {
    return this.ui.text(...MAP_OBJECT_ART[kind].label);
  }

  protected objectKindsIn(group: MapObjectGroup): readonly MapObjectKind[] {
    return MAP_OBJECT_KINDS.filter((kind) => MAP_OBJECT_ART[kind].group === group);
  }

  protected objectGroupName(group: (typeof MAP_OBJECT_GROUPS)[number]): string {
    return this.ui.text(...group.label);
  }

  protected objectTextureName(texture: MapObjectTexture): string {
    return this.ui.text(...MAP_OBJECT_TEXTURE_LABEL[texture]);
  }

  protected textureName(texture: Texture): string {
    const labels: Record<Texture, string> = {
      none: 'No texture',
      stone: 'Stone',
      cave: 'Cave',
      grass: 'Grass',
      mud: 'Mud',
      ice: 'Ice and snow',
      sand: 'Sand',
      wood: 'Wood',
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
    const owns = s.creatures.filter((c) => c.kind === 'pc').map((c) => c.id);
    return project(s, { kind: 'player', owns });
  });

  protected readonly rooms = computed(() => this.state().map.rooms ?? []);
  protected readonly traps = computed(() => this.state().map.traps ?? []);
  protected readonly portals = computed(() => this.state().map.portals ?? []);
  protected readonly floors = computed(() => [
    {
      id: this.state().floorId ?? 'floor-1',
      name: this.state().floorName ?? this.ui.text('Térreo', 'Ground floor'),
    },
    ...(this.state().floors ?? []).map(({ id, name }) => ({ id, name })),
  ]);
  protected readonly selectedRoom = computed(() =>
    this.rooms().find((r) => r.id === this.selectedRoomId()),
  );
  protected readonly selectedTrap = computed(() =>
    this.traps().find((t) => t.id === this.selectedTrapId()),
  );
  protected readonly selectedPortal = computed(() =>
    this.portals().find((portal) => portal.id === this.selectedPortalId()),
  );
  protected readonly selectedCreature = computed(() => {
    const id = this.selectedCreatureId();
    const creature = this.state().creatures.find((item) => item.id === id);
    const token = this.state().tokens.find((item) => item.creatureId === id);
    return creature && token ? { creature, token } : undefined;
  });
  protected readonly placedItems = computed(() => this.state().map.items ?? []);
  protected readonly selectedObject = computed(() =>
    (this.state().map.objects ?? []).find((object) => object.id === this.selectedObjectId()),
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
          selected: c.id === this.selectedCreatureId(),
          targetable: false,
          icon: iconFor(c),
          image: tokenImageFor(c),
          conditions: 0,
          concentrating: false,
        },
      ];
    });
  });

  ngOnInit(): void {
    void this.srd.loadMonsters(this.ui.ruleset());
    void this.art.load();
  }

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
    else if (t.kind === 'portal') this.addPortal(pos);
    else if (t.kind === 'creature') this.addCreature(pos);
    else if (t.kind === 'item') this.addItem(pos);
    else if (t.kind === 'object') this.addMapObject(pos);
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

  private addPortal(pos: Pos): void {
    const floor = this.state().floors?.[0];
    if (!floor) {
      this.message.set(
        this.ui.text(
          'Crie outro andar antes de adicionar um portal.',
          'Create another floor first.',
        ),
      );
      return;
    }
    const target = floor.map.cells.findIndex((cell) => !IMPASSABLE.includes(cell));
    if (target < 0)
      return void this.message.set(
        this.ui.text('O andar de destino está bloqueado.', 'The target floor is blocked.'),
      );
    const portal: Portal = {
      id: crypto.randomUUID(),
      name: `${this.ui.text('Portal', 'Portal')} ${this.portals().length + 1}`,
      pos,
      targetFloorId: floor.id,
      target: { x: target % floor.map.width, y: Math.floor(target / floor.map.width) },
    };
    if (this.send({ type: 'upsertPortal', portal })) this.selectedPortalId.set(portal.id);
  }

  /** Nome do monstro em pt-BR se a interface estiver nesse idioma (glossário próprio, F11-6). */
  protected monsterName(m: { name: string }): string {
    return this.ui.text(monsterNamePt(m.name), m.name);
  }

  private creatureForPlacement(): Creature | undefined {
    const [source, id] = this.creatureSource().split(':', 2);
    if (source === 'party') return this.party.creatures().find((creature) => creature.id === id);
    const monster = this.srd.monsters().find((creature) => creature.id === id);
    return monster
      ? monsterToCreature(
          monster,
          this.monsterName(monster),
          this.art.pickFor(monster.id, queryFromMonster(monster)),
        )
      : undefined;
  }

  private addCreature(pos: Pos): void {
    const source = this.creatureForPlacement();
    if (!source) {
      this.message.set(this.ui.text('Escolha uma criatura.', 'Choose a creature.'));
      return;
    }
    const id = this.store.addFromRoster(source, pos, this.placementHidden());
    if (this.state().tokens.some((token) => token.creatureId === id)) {
      this.selectedCreatureId.set(id);
      this.message.set('');
    } else {
      this.message.set(this.store.message());
    }
  }

  private addItem(pos: Pos): void {
    const definition = CATALOG.find((item) => item.id === this.itemRef());
    if (!definition) return;
    const item: PlacedItem = {
      id: crypto.randomUUID(),
      ref: definition.id,
      name: definition.name,
      qty: 1,
      pos,
      hidden: this.placementHidden(),
    };
    this.send({ type: 'upsertItem', item });
  }

  protected setObjectKind(value: string): void {
    if (!MAP_OBJECT_KINDS.includes(value as MapObjectKind)) return;
    const kind = value as MapObjectKind;
    const defaults = MAP_OBJECT_ART[kind].defaults;
    this.objectKind.set(kind);
    this.objectTexture.set(defaults.texture);
    this.objectBlocksMovement.set(defaults.blocksMovement);
    this.objectBlocksSight.set(defaults.blocksSight);
  }

  protected setObjectTexture(value: string): void {
    if (MAP_OBJECT_TEXTURES.includes(value as MapObjectTexture))
      this.objectTexture.set(value as MapObjectTexture);
  }

  protected setObjectRotation(value: string): void {
    const rotation = Number(value);
    if (this.objectAngles.includes(rotation as (typeof this.objectAngles)[number]))
      this.objectRotation.set(rotation);
  }

  protected editSelectedObjectKind(value: string): void {
    if (!MAP_OBJECT_KINDS.includes(value as MapObjectKind)) return;
    const kind = value as MapObjectKind;
    this.editMapObject({ kind, ...MAP_OBJECT_ART[kind].defaults });
  }

  protected editSelectedObjectRotation(value: string): void {
    const rotation = Number(value);
    if (this.objectAngles.includes(rotation as (typeof this.objectAngles)[number]))
      this.editMapObject({ rotation });
  }

  private addMapObject(pos: Pos): void {
    const object: MapObject = {
      id: crypto.randomUUID(),
      kind: this.objectKind(),
      pos,
      rotation: this.objectRotation(),
      texture: this.objectTexture(),
      blocksMovement: this.objectBlocksMovement(),
      blocksSight: this.objectBlocksSight(),
    };
    if (this.send({ type: 'upsertMapObject', object })) this.selectMapObject(object.id);
  }

  protected moveToken(event: { id: string; pos: Pos }): void {
    if (this.editable() && !this.asPlayer())
      this.send({ type: 'placeToken', id: event.id, pos: event.pos });
  }

  protected selectCreature(id: string): void {
    this.selectedCreatureId.set(id);
    this.selectedRoomId.set(null);
    this.selectedTrapId.set(null);
    this.selectedPortalId.set(null);
    this.selectedObjectId.set(null);
  }

  protected selectMapObject(id: string): void {
    this.selectedObjectId.set(id);
    this.selectedCreatureId.set(null);
    this.selectedRoomId.set(null);
    this.selectedTrapId.set(null);
    this.selectedPortalId.set(null);
  }

  protected moveMapObject(event: { id: string; pos: Pos }): void {
    const object = (this.state().map.objects ?? []).find((item) => item.id === event.id);
    if (object && this.editable() && !this.asPlayer())
      this.send({ type: 'upsertMapObject', object: { ...object, pos: event.pos } });
  }

  protected nudgeMapObject(event: { id: string; dx: number; dy: number }): void {
    const object = (this.state().map.objects ?? []).find((item) => item.id === event.id);
    if (object)
      this.moveMapObject({
        id: object.id,
        pos: { x: object.pos.x + event.dx, y: object.pos.y + event.dy },
      });
  }

  protected editMapObject(changes: Partial<MapObject>): void {
    const object = this.selectedObject();
    if (object) this.send({ type: 'upsertMapObject', object: { ...object, ...changes } });
  }

  protected removeMapObject(): void {
    const object = this.selectedObject();
    if (object && this.send({ type: 'removeMapObject', id: object.id }))
      this.selectedObjectId.set(null);
  }

  protected setCreatureHidden(hidden: boolean): void {
    const selected = this.selectedCreature();
    if (selected) this.send({ type: 'setHidden', id: selected.creature.id, hidden });
  }

  protected removeCreature(): void {
    const selected = this.selectedCreature();
    if (selected && this.send({ type: 'removeCreature', id: selected.creature.id }))
      this.selectedCreatureId.set(null);
  }

  protected editItem(item: PlacedItem, changes: Partial<PlacedItem>): void {
    this.send({ type: 'upsertItem', item: { ...item, ...changes } });
  }

  protected removeItem(item: PlacedItem): void {
    this.send({ type: 'removeItem', id: item.id });
  }

  private inspect(pos: Pos): void {
    const trap = this.traps().find((t) => t.pos.x === pos.x && t.pos.y === pos.y);
    const portal = this.portals().find((item) => item.pos.x === pos.x && item.pos.y === pos.y);
    const object = (this.state().map.objects ?? []).find(
      (item) => item.pos.x === pos.x && item.pos.y === pos.y,
    );
    const room = this.rooms().find(
      (r) => pos.x >= r.x && pos.x < r.x + r.w && pos.y >= r.y && pos.y < r.y + r.h,
    );
    this.selectedTrapId.set(trap?.id ?? null);
    this.selectedPortalId.set(portal?.id ?? null);
    this.selectedRoomId.set(room?.id ?? null);
    this.selectedCreatureId.set(null);
    this.selectedObjectId.set(object?.id ?? null);
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

  protected editPortal(changes: Partial<Portal>): void {
    const portal = this.selectedPortal();
    if (portal) this.send({ type: 'upsertPortal', portal: { ...portal, ...changes } });
  }

  protected changePortalFloor(id: string): void {
    const portal = this.selectedPortal();
    const floor = this.state().floors?.find((item) => item.id === id);
    if (!portal || !floor) return;
    const i = floor.map.cells.findIndex((cell) => !IMPASSABLE.includes(cell));
    if (i >= 0)
      this.editPortal({
        targetFloorId: id,
        target: { x: i % floor.map.width, y: Math.floor(i / floor.map.width) },
      });
  }

  protected removePortal(): void {
    const portal = this.selectedPortal();
    if (portal && this.send({ type: 'removePortal', id: portal.id }))
      this.selectedPortalId.set(null);
  }

  protected travelPortal(): void {
    const portal = this.selectedPortal();
    if (portal && this.send({ type: 'travelPortal', id: portal.id })) this.clearSelection();
  }

  protected addFloor(name: string): void {
    const value = name.trim();
    if (!value) return;
    this.send({
      type: 'addFloor',
      id: crypto.randomUUID(),
      name: value,
      map: blankMap(this.state().map.width, this.state().map.height),
    });
  }

  protected switchFloor(id: string): void {
    if (this.send({ type: 'switchFloor', id })) this.clearSelection();
  }

  protected removeFloor(id: string): void {
    if (this.send({ type: 'removeFloor', id })) this.clearSelection();
  }

  private clearSelection(): void {
    this.selectedRoomId.set(null);
    this.selectedTrapId.set(null);
    this.selectedPortalId.set(null);
    this.selectedCreatureId.set(null);
    this.selectedObjectId.set(null);
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
    const state = this.state();
    this.library.save(
      name || state.name,
      state.map,
      (state.floors ?? []).map(({ id, name, map }) => ({ id, name, map })),
      state.floorId ?? 'floor-1',
      state.floorName ?? this.ui.text('Térreo', 'Ground floor'),
    );
    this.message.set(
      `"${name || this.state().name}" ${this.ui.text('salvo na biblioteca.', 'saved to the library.')}`,
    );
  }

  protected load(d: SavedDungeon): void {
    if (!this.send({ type: 'setMap', map: structuredClone(d.map) })) return;
    this.send({
      type: 'setFloors',
      floorId: d.floorId ?? 'floor-1',
      floorName: d.floorName ?? this.ui.text('Térreo', 'Ground floor'),
      floors: structuredClone(d.floors ?? []),
    });
    this.clearSelection();
  }

  protected exportMap(name: string): void {
    const state = this.state();
    const text = this.library.serialize({
      name: name || state.name,
      map: state.map,
      floorId: state.floorId,
      floorName: state.floorName,
      floors: (state.floors ?? []).map(({ id, name, map }) => ({ id, name, map })),
    });
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
    if (!this.send({ type: 'setMap', map: parsed.map })) return;
    this.send({
      type: 'setFloors',
      floorId: parsed.floorId ?? 'floor-1',
      floorName: parsed.floorName ?? this.ui.text('Térreo', 'Ground floor'),
      floors: parsed.floors ?? [],
    });
    this.clearSelection();
    this.message.set(`"${parsed.name}" ${this.ui.text('importado.', 'imported.')}`);
  }

  protected exportFoundry(): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([exportFoundryScene(this.state())], { type: 'application/json' }),
    );
    a.download = `${this.state().name.replace(/[^\w-]+/g, '-') || 'cena'}.foundry-v13.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  protected async importFoundry(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const state = importFoundryScene(await file.text());
    if (!state)
      return void this.message.set(
        this.ui.text('Cena Foundry inválida.', 'Invalid Foundry scene.'),
      );
    this.store.load(state);
    this.clearSelection();
    this.message.set(this.ui.text('Cena Foundry importada.', 'Foundry scene imported.'));
  }

  protected async suggestScene(apiKey: string): Promise<void> {
    if (!apiKey.trim()) {
      this.message.set(this.ui.text('Informe sua chave da OpenAI.', 'Enter your OpenAI API key.'));
      return;
    }
    const room = this.selectedRoom();
    const selected = this.selectedCreature()?.creature;
    const npc = selected && selected.kind !== 'pc' ? selected : undefined;
    this.suggesting.set(true);
    this.message.set('');
    try {
      const suggestion = await suggestSceneText(
        {
          encounter: this.state().name,
          room: room ? { name: room.name, description: room.description } : undefined,
          npc: npc
            ? {
                name: npc.name,
                kind: npc.kind,
                status: npc.status,
                conditions: npc.conditions.map((condition) => condition.name),
              }
            : undefined,
        },
        apiKey,
        this.ui.locale(),
      );
      this.aiSuggestion.set({ ...suggestion, roomId: room?.id });
    } catch (error) {
      this.message.set(
        error instanceof Error
          ? error.message
          : this.ui.text('Não foi possível gerar a sugestão.', 'Could not generate suggestion.'),
      );
    } finally {
      this.suggesting.set(false);
    }
  }

  protected applySceneSuggestion(): void {
    const suggestion = this.aiSuggestion();
    const room = this.selectedRoom();
    if (!suggestion || !room || suggestion.roomId !== room.id || !this.editable()) return;
    this.editRoom({ description: suggestion.scene });
    this.message.set(this.ui.text('Sugestão aplicada à sala.', 'Suggestion applied to room.'));
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
