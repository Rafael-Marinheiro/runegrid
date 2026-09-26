import { DamageType } from '../../models/creature';
import { ThemeId } from '../../models/adventure';

export interface TrapTemplate {
  name: string;
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  damageType: DamageType;
}

export interface Theme {
  id: ThemeId;
  label: string;
  layout: 'dungeon' | 'cave' | 'open' | 'swamp';
  /** Tipos de criatura do SRD (início do campo `type`, minúsculo). */
  monsterTypes: string[];
  /** Nomes que também entram, mesmo de outro tipo. */
  monsterNames?: RegExp;
  /** Nomes que nunca entram no tema. */
  avoidNames?: RegExp;
  roomNames: string[];
  features: string[];
  details: string[];
  /** Nome da aventura: "{prefixo} {sufixo}". */
  namePrefix: string[];
  nameSuffix: string[];
  hooks: string[];
  traps: TrapTemplate[];
}

export const THEME_DATA: Record<ThemeId, Theme> = {
  crypt: {
    id: 'crypt',
    label: 'Cripta',
    layout: 'dungeon',
    monsterTypes: ['undead'],
    monsterNames: /skeleton|zombie|ghoul|wight|specter|wraith/i,
    roomNames: [
      'Ossuário',
      'Câmara dos Sarcófagos',
      'Nave Profanada',
      'Capela Abandonada',
      'Cripta dos Nobres',
      'Sala dos Ecos',
      'Galeria dos Epitáfios',
    ],
    features: [
      'Fileiras de sarcófagos de pedra alinham-se sob um teto baixo.',
      'Ossos empilhados cobrem as paredes até a altura do peito.',
      'Um altar rachado domina o centro da sala.',
      'Estátuas de mortos sem rosto observam das nichos.',
      'Teias grossas pendem entre colunas cobertas de musgo.',
    ],
    details: [
      'O ar cheira a cinza e a algo mais antigo.',
      'Uma corrente fria roça os tornozelos.',
      'Velas há muito apagadas ainda pingam cera.',
      'O silêncio pesa nos ouvidos.',
    ],
    namePrefix: ['Cripta de', 'Catacumbas de', 'Sepulcro de', 'Ossuário de'],
    nameSuffix: ['Vharos', 'Morketh', 'Uldrin', 'Belzar', 'Korath'],
    hooks: [
      'O sino da vila toca sozinho desde que o sacerdote {n} desceu à cripta. Ninguém voltou para dizer por quê.',
      'Os mortos de {n} deixaram de descansar: túmulos aparecem abertos ao amanhecer.',
      'Um mapa roubado promete o tesouro enterrado com {n}, mas o cemitério tem dono.',
    ],
    traps: [
      { name: 'Placa de pressão com dardos', ability: 'dex', damageType: 'piercing' },
      { name: 'Runa necrótica', ability: 'con', damageType: 'necrotic' },
      { name: 'Piso falso sobre estacas', ability: 'dex', damageType: 'piercing' },
    ],
  },
  cave: {
    id: 'cave',
    label: 'Caverna',
    layout: 'cave',
    monsterTypes: ['beast', 'monstrosity', 'giant'],
    monsterNames: /goblin|kobold|orc|bugbear|gnoll|troglodyte/i,
    roomNames: [
      'Câmara Gotejante',
      'Salão dos Estalactites',
      'Toca Escura',
      'Gruta Coberta de Musgo',
      'Poço Profundo',
      'Passagem Estreita',
      'Covil',
    ],
    features: [
      'Estalactites pingam numa poça de água escura.',
      'Ossos de animais forram o chão de terra batida.',
      'Cogumelos luminosos revelam paredes úmidas.',
      'O teto baixo obriga a andar curvado.',
      'Marcas de garras riscam a rocha até a altura de um homem.',
    ],
    details: [
      'Um cheiro forte de bicho enche o ar.',
      'Ecos distantes respondem a qualquer som.',
      'O chão está escorregadio.',
      'Uma brisa fria vem de alguma passagem.',
    ],
    namePrefix: ['Gruta de', 'Covil de', 'Cavernas de', 'Toca de'],
    nameSuffix: ['Krag', 'Zul', 'Dolm', 'Ghar', 'Urk'],
    hooks: [
      'Rebanhos somem à noite e as pegadas levam à boca de {n}.',
      'Mineiros abriram uma passagem para {n} e agora não voltam.',
      'Um mercador jura ter visto ouro brilhando na entrada de {n}.',
    ],
    traps: [
      { name: 'Pedra solta (avalanche pequena)', ability: 'dex', damageType: 'bludgeoning' },
      { name: 'Fosso oculto', ability: 'dex', damageType: 'bludgeoning' },
      { name: 'Esporos venenosos', ability: 'con', damageType: 'poison' },
    ],
  },
  ruins: {
    id: 'ruins',
    label: 'Ruínas',
    layout: 'dungeon',
    monsterTypes: ['undead', 'construct', 'monstrosity'],
    monsterNames: /gargoyle|cultist|bandit|specter/i,
    roomNames: [
      'Salão Desabado',
      'Biblioteca em Cinzas',
      'Pátio Coberto de Ervas',
      'Torre Partida',
      'Sala do Trono Rachado',
      'Capela sem Teto',
      'Armaria Saqueada',
    ],
    features: [
      'Vigas caídas cortam a luz em faixas empoeiradas.',
      'Um mosaico quebrado ainda mostra metade de um rosto.',
      'Colunas partidas se erguem como dentes.',
      'Uma escadaria leva ao nada, cortada pelo desabamento.',
      'Ervas daninhas rompem o piso de mármore.',
    ],
    details: [
      'O vento assobia por frestas invisíveis.',
      'Pássaros levantam voo ao menor ruído.',
      'Há sinais recentes de fogueira num canto.',
      'O pó guarda pegadas frescas.',
    ],
    namePrefix: ['Ruínas de', 'Fortaleza Caída de', 'Palácio Arruinado de', 'Santuário Perdido de'],
    nameSuffix: ['Aldareth', 'Oskun', 'Verdane', 'Halmoor', 'Tyrnas'],
    hooks: [
      'Diz a lenda que {n} guardava um artefato que nunca foi achado entre os escombros.',
      'Estudiosos pagam bem por qualquer inscrição saída das ruínas de {n}.',
      'Algo se instalou em {n} e não gosta de visitas.',
    ],
    traps: [
      { name: 'Teto instável', ability: 'dex', damageType: 'bludgeoning' },
      { name: 'Glifo de proteção', ability: 'dex', damageType: 'force' },
      { name: 'Lâminas ocultas na parede', ability: 'dex', damageType: 'slashing' },
    ],
  },
  forest: {
    id: 'forest',
    label: 'Floresta',
    layout: 'open',
    monsterTypes: ['beast', 'fey', 'plant'],
    monsterNames: /goblin|bandit|druid|owlbear|dryad|elf/i,
    roomNames: [
      'Clareira Silenciosa',
      'Círculo de Pedras',
      'Riacho Encoberto',
      'Carvalho Ancestral',
      'Trilha de Caça',
      'Acampamento Abandonado',
      'Toca de Raposas',
    ],
    features: [
      'Raios de sol atravessam a copa em colunas douradas.',
      'Raízes enormes formam degraus naturais.',
      'Cogumelos crescem em círculo perfeito.',
      'Um riacho murmura entre pedras cobertas de musgo.',
      'Os troncos têm marcas de garras em várias alturas.',
    ],
    details: [
      'Os pássaros calaram de repente.',
      'Um perfume doce de flores estranhas paira no ar.',
      'A névoa rasteja entre os troncos.',
      'Folhas estalam sob passos que não são seus.',
    ],
    namePrefix: ['Bosque de', 'Floresta de', 'Mata de', 'Vale de'],
    nameSuffix: ['Elmarion', 'Thornwood', 'Caldeira', 'Silvarel', 'Nornah'],
    hooks: [
      'Lenhadores desaparecem no coração de {n} e as árvores parecem se mover.',
      'Uma criança voltou de {n} falando com uma voz que não é a sua.',
      'Caçadores vêem luzes dançando em {n} toda noite de lua cheia.',
    ],
    traps: [
      { name: 'Laço de caçador escondido', ability: 'dex', damageType: 'piercing' },
      { name: 'Armadilha de espinhos', ability: 'dex', damageType: 'piercing' },
      { name: 'Nuvem de esporos', ability: 'con', damageType: 'poison' },
    ],
  },
  swamp: {
    id: 'swamp',
    label: 'Pântano',
    layout: 'swamp',
    monsterTypes: ['beast', 'monstrosity', 'ooze', 'plant', 'undead'],
    monsterNames: /lizardfolk|bullywug|hag|will-o|crocodile|giant frog/i,
    roomNames: [
      'Ilhota Podre',
      'Passarela Apodrecida',
      'Poço de Lama',
      'Cabana Afundada',
      'Bosque de Salgueiros',
      'Charco Fedorento',
      'Ninho de Juncos',
    ],
    features: [
      'A água escura chega aos joelhos e esconde o chão.',
      'Troncos mortos emergem da lama como dedos.',
      'Uma cabana inclinada afunda devagar.',
      'Bolhas sobem do fundo com um cheiro de enxofre.',
      'Vaga-lumes desenham rotas que levam para o brejo.',
    ],
    details: [
      'Os mosquitos são quase insuportáveis.',
      'Uma névoa espessa reduz tudo a silhuetas.',
      "Algo grande se moveu debaixo d'água.",
      'O ar úmido gruda na pele.',
    ],
    namePrefix: ['Pântano de', 'Brejo de', 'Charco de', 'Lodaçal de'],
    nameSuffix: ['Morgwyn', 'Sallow', 'Drenna', 'Ghulm', 'Vessik'],
    hooks: [
      'Uma velha do brejo promete a cura de uma praga em troca de algo que só existe em {n}.',
      'Viajantes somem na neblina de {n} e só as botas voltam.',
      'Fogos-fátuos guiam pessoas ao fundo de {n}.',
    ],
    traps: [
      { name: 'Areia movediça', ability: 'str', damageType: 'bludgeoning' },
      { name: 'Gás dos pântanos', ability: 'con', damageType: 'poison' },
      { name: 'Raízes que agarram', ability: 'str', damageType: 'bludgeoning' },
    ],
  },
  fortress: {
    id: 'fortress',
    label: 'Fortaleza',
    layout: 'dungeon',
    monsterTypes: ['humanoid', 'giant'],
    monsterNames: /ogre|troll|guard|knight|veteran|mage|cultist|bandit/i,
    avoidNames: /commoner|noble|acolyte/i,
    roomNames: [
      'Salão de Armas',
      'Posto de Guarda',
      'Refeitório',
      'Alojamento',
      'Sala do Comandante',
      'Armaria',
      'Calabouço',
    ],
    features: [
      'Estandartes rasgados pendem de vigas escurecidas.',
      'Uma mesa longa ainda guarda pratos de uma última refeição.',
      'Armas quebradas se amontoam num canto.',
      'Um mapa de guerra cobre uma parede inteira.',
      'Correntes e grilhões pendem de argolas de ferro.',
    ],
    details: [
      'Vozes abafadas vêm de algum lugar mais adiante.',
      'O cheiro de fumaça e couro vela tudo.',
      'Passos ritmados ecoam num corredor próximo.',
      'Uma tocha ainda arde numa arandela.',
    ],
    namePrefix: ['Fortaleza de', 'Bastião de', 'Cidadela de', 'Torre de'],
    nameSuffix: ['Grimhold', 'Karn Dur', 'Baldrek', 'Ironvale', 'Skarn'],
    hooks: [
      'Um senhor da guerra tomou {n} e cobra pedágio de toda a estrada.',
      'Prisioneiros importantes estão em {n}; o resgate tem prazo.',
      'Suprimentos do reino sumiram e todos os rastros levam a {n}.',
    ],
    traps: [
      { name: 'Alçapão sobre fosso', ability: 'dex', damageType: 'bludgeoning' },
      { name: 'Besta de gatilho', ability: 'dex', damageType: 'piercing' },
      { name: 'Grade que despenca', ability: 'dex', damageType: 'bludgeoning' },
    ],
  },
  sewer: {
    id: 'sewer',
    label: 'Esgoto',
    layout: 'dungeon',
    monsterTypes: ['beast', 'ooze'],
    monsterNames: /kobold|goblin|gnoll|cultist|bandit|swarm|rat/i,
    avoidNames: /dragon/i,
    roomNames: [
      'Cruzamento de Canais',
      'Câmara de Comportas',
      'Reservatório',
      'Galeria Alagada',
      'Ninho de Ratos',
      'Depósito Esquecido',
      'Passarela Estreita',
    ],
    features: [
      'Um canal de água escura corta o piso ao meio.',
      'Ratos grandes como gatos desaparecem nas frestas.',
      'Comportas enferrujadas pingam sem parar.',
      'Tijolos cobertos de limo brilham à luz fraca.',
      'Uma grade permite ver o movimento de algo lá embaixo.',
    ],
    details: [
      'O fedor é quase insuportável.',
      'Ouve-se um ruído contínuo de água correndo.',
      'Pegadas de botas recentes marcam o lodo.',
      'Sombras se movem no fim do corredor.',
    ],
    namePrefix: ['Esgotos de', 'Galerias de', 'Subterrâneos de', 'Canais de'],
    nameSuffix: ['Blackwater', 'Marrow', 'Underhill', 'Dockside', 'Brimmer'],
    hooks: [
      'Uma seita usa os esgotos de {n} para ir e vir sem ser vista.',
      'Casas afundam sobre {n} e todos culpam algo que vive lá embaixo.',
      'Um ladrão fugiu para {n} carregando o que todos querem.',
    ],
    traps: [
      { name: 'Comporta que se abre (inundação)', ability: 'str', damageType: 'bludgeoning' },
      { name: 'Gás de esgoto', ability: 'con', damageType: 'poison' },
      { name: 'Piso podre', ability: 'dex', damageType: 'bludgeoning' },
    ],
  },
};
