// Versão em inglês das notas `manual` e `note` das magias (chave = texto em pt-BR). O build exige uma entrada para cada nota.
export default new Map([
  [
    'Se a concentração quebrar, a criatura fica hostil e some 1 hora depois; se for uma fera, é uma fera feérica.',
    'If concentration breaks, the creature turns hostile and disappears 1 hour later; a beast form is a fey spirit.',
  ],
  [
    'Se a concentração quebrar, o elemental fica hostil e some 1 hora depois. Escolha o elemental que combina com o ponto (fogo de uma fogueira, terra do chão…).',
    'If concentration breaks, the elemental turns hostile and disappears 1 hour later. Choose the elemental that fits the spot (fire from a bonfire, earth from the ground…).',
  ],
  [
    'Esqueleto (ossos) ou zumbi (cadáver). Com espaço de 4º nível ou mais, mais dois por nível. Obedecem por 24 horas; como ação bônus você comanda os que estiverem a até 18 m.',
    'Skeleton (bones) or zombie (corpse). With a 4th-level slot or higher, two more per level. They obey for 24 hours; as a bonus action you command those within 60 ft.',
  ],
  [
    'Só à noite. Obedecem por 24 horas. Com espaço de 8º nível ou mais, o Mestre pode trocar carniçais por aparições ou múmias.',
    'Night only. They obey for 24 hours. With an 8th-level slot or higher, the DM may swap ghouls for wights or mummies.',
  ],
  [
    'O familiar não ataca e some ao chegar a 0 PV; conjure a magia de novo para chamá-lo.',
    'The familiar cannot attack and disappears at 0 hit points; cast the spell again to call it back.',
  ],
  [
    'A montaria é um espírito celestial, feérico ou corruptor; se a Inteligência for 5 ou menos, passa a 6 e ela entende um idioma que você fale. Some a 0 PV e volta ao conjurar de novo.',
    'The steed is a celestial, fey or fiend spirit; if its Intelligence is 5 or lower it becomes 6 and it understands a language you speak. It disappears at 0 hit points and returns when you cast the spell again.',
  ],
  [
    'O familiar é celestial, feérico ou ínfero; some ao chegar a 0 PV; conjure a magia de novo para chamá-lo.',
    'The familiar is a celestial, fey or fiend; it disappears at 0 hit points; cast the spell again to call it back.',
  ],
  [
    'Corcel de Outro Mundo: Grande, CA 10 + nível, PV 5 + 10 por nível, 60 ft (voo 60 ft com espaço de 4º nível ou mais), pancada com o seu ataque de magia. Vínculo Vital: ao recuperar PV de uma magia de 1º nível ou mais, o corcel recupera o mesmo valor se estiver a até 1,5 m (o Mestre aplica). Substitui o corcel anterior; some a 0 PV ou se você morrer.',
    'Otherworldly Steed: Large, AC 10 + level, HP 5 + 10 per level, 60 ft (fly 60 ft with a level 4+ slot), slam uses your spell attack. Life Bond: when you regain HP from a level 1+ spell, the steed regains the same amount if within 5 ft (the DM applies it). It replaces the previous steed; it disappears at 0 HP or if you die.',
  ],
  [
    'Se o alvo for morto-vivo, ele tem desvantagem nos ataques contra você até o fim do seu próximo turno.',
    'If the target is undead, it has disadvantage on attack rolls against you until the end of your next turn.',
  ],
  [
    '+1d4 em um teste de atributo à escolha, uma vez.',
    '+1d4 to one ability check of your choice, once.',
  ],
  [
    'Clava/bordão: ataque e dano com o atributo de conjuração; dado de dano d8; arma mágica.',
    'Club/quarterstaff: attack and damage use the spellcasting ability; damage die d8; magical weapon.',
  ],
  [
    'Atributo de conjuração no ataque e dano da arma e dado d8: aplique na ficha enquanto durar.',
    "Spellcasting ability on the weapon's attack and damage, and a d8 damage die: apply them on the sheet while it lasts.",
  ],
  [
    'Só funciona em uma fera com Inteligência 3 ou menos; se você ou um companheiro a ferir, a magia termina.',
    'Only works on a beast with Intelligence 3 or lower; if you or a companion harms it, the spell ends.',
  ],
  [
    'Só afeta humanoides; a criatura tem vantagem na salvaguarda se você ou seus companheiros a estiverem combatendo.',
    'Only affects humanoids; the creature has advantage on the save if you or your companions are fighting it.',
  ],
  [
    'Segue o comando no próximo turno: Aproximar, Largar, Fugir, Rastejar ou Parar.',
    'It follows the command on its next turn: Approach, Drop, Flee, Grovel or Halt.',
  ],
  [
    'Quem está preso pode usar a ação para um teste de Força contra a sua CD e se libertar (remova a condição).',
    'A restrained creature can use its action to make a Strength check against your DC and break free (remove the condition).',
  ],
  [
    'Ao conjurar você já pode Correr (gaste a ação bônus em Correr); em cada turno seguinte, Correr é ação bônus.',
    'When you cast it you can already Dash (spend your bonus action on Dash); on each later turn, Dash is a bonus action.',
  ],
  [
    'Criaturas com Inteligência 4 ou menos não são afetadas; ao sofrer dano o alvo repete a salvaguarda com vantagem.',
    'Creatures with Intelligence 4 or lower are unaffected; when it takes damage the target repeats the save with advantage.',
  ],
  [
    'Vantagem em Sabedoria (Percepção ou Sobrevivência) para achá-lo; se ele cair a 0 PV, use uma ação bônus para marcar outra criatura.',
    'Advantage on Wisdom (Perception or Survival) checks to find it; if it drops to 0 HP, use a bonus action to mark another creature.',
  ],
  ['Distância de salto triplicada.', 'Jump distance tripled.'],
  [
    'Só vale em criatura sem armadura; termina se o alvo vestir armadura.',
    'Only works on an unarmored creature; it ends if the target dons armor.',
  ],
  [
    'Aberrações, celestiais, elementais, fadas, ínferos e mortos-vivos têm desvantagem nos ataques contra o alvo e não podem enfeitiçá-lo, amedrontá-lo nem possuí-lo.',
    'Aberrations, celestials, elementals, fey, fiends and undead have disadvantage on attacks against the target and cannot charm, frighten or possess it.',
  ],
  [
    'Quem o ataca ou mira magia nociva nele faz salvaguarda de Sabedoria; se falhar, perde o ataque/magia. Termina se o protegido atacar ou ferir.',
    'Whoever attacks it or targets it with a harmful spell makes a Wisdom save; on a failure they lose the attack or spell. It ends if the protected creature attacks or harms.',
  ],
  [
    'Mortos-vivos e criaturas imunes a enfeitiçamento não são afetados; acordar também exige uma ação para sacudir o dorminhoco.',
    'Undead and creatures immune to being charmed are unaffected; waking also requires an action to shake the sleeper.',
  ],
  [
    'Você escolhe cegar (aplicado) ou ensurdecer: para surdez, troque a condição para Surdo.',
    'You choose to blind (applied) or deafen: for deafness, change the condition to Deafened.',
  ],
  [
    'Suprime enfeitiçado/amedrontado ou torna indiferente a quem você escolher (só humanoides).',
    'Suppresses charmed/frightened, or makes whoever you choose indifferent (humanoids only).',
  ],
  [
    'Visão no escuro não enxerga dentro; luz não mágica não a ilumina.',
    'Darkvision cannot see inside it; nonmagical light does not illuminate it.',
  ],
  ['Visão no escuro de 60 ft.', 'Darkvision of 60 ft.'],
  [
    'Vantagem em testes de um atributo à escolha (Fortitude do Urso: +2d6 PV temporários).',
    "Advantage on checks of one ability of your choice (Bear's Endurance: +2d6 temporary HP).",
  ],
  [
    'Escolha o aspecto; Fortitude do Urso dá 2d6 PV temporários (aplique à mão).',
    "Choose the aspect; Bear's Endurance gives 2d6 temporary HP (apply by hand).",
  ],
  [
    'Ampliar: um tamanho maior, vantagem em Força, +1d4 nas armas.',
    'Enlarge: one size larger, advantage on Strength, +1d4 weapon damage.',
  ],
  [
    'Ampliar está aplicado (+1d4 nas armas); para Reduzir aplique −1d4 e desvantagem em Força à mão. Alvo relutante faz salvaguarda de Constituição.',
    'Enlarge is applied (+1d4 weapon damage); for Reduce apply −1d4 and disadvantage on Strength by hand. An unwilling target makes a Constitution save.',
  ],
  [
    'Desvantagem em Percepção para notar qualquer criatura além do conjurador.',
    'Disadvantage on Perception checks to notice any creature other than the caster.',
  ],
  [
    'Quem segura ou veste o objeto faz salvaguarda de Constituição para largá-lo; se não largar, tem desvantagem em ataques e testes até o início do seu próximo turno.',
    "Whoever holds or wears the object makes a Constitution save to drop it; if it isn't dropped, it has disadvantage on attacks and ability checks until the start of its next turn.",
  ],
  ['Também pode encerrar uma doença.', 'Can also end a disease.'],
  [
    'Flutua 20 ft acima do chão; só se move empurrando/puxando algo fixo.',
    'Floats 20 ft above the ground; moves only by pushing against or pulling on something fixed.',
  ],
  [
    'Alvo relutante faz salvaguarda de Constituição.',
    'An unwilling target makes a Constitution save.',
  ],
  [
    'Um metamorfo faz a salvaguarda com desvantagem e, se falhar, volta à forma original.',
    'A shapechanger makes the save with disadvantage and, on a failure, returns to its original form.',
  ],
  [
    '+10 em Destreza (Furtividade) e não deixa rastros.',
    '+10 to Dexterity (Stealth) and leaves no tracks.',
  ],
  [
    'Vantagem em salvaguardas contra ser envenenado.',
    'Advantage on saving throws against being poisoned.',
  ],
  [
    'Dentro da esfera: sem som, imunes a trovejante, surdos; não se conjura magia com componente verbal.',
    'Inside the sphere: no sound, immune to thunder damage, deafened; no spell with a verbal component can be cast.',
  ],
  [
    'Anda em paredes e tetos, velocidade de escalada igual à de caminhada.',
    'Walks on walls and ceilings, with a climbing speed equal to the walking speed.',
  ],
  [
    'Causa 2d4 a cada 5 ft percorridos dentro da área; aqui, uma vez ao entrar (o Mestre acrescenta o resto).',
    'Deals 2d4 for every 5 ft traveled inside the area; here, once on entering (the GM adds the rest).',
  ],
  [
    'Segue a sugestão (uma ou duas frases) pelo tempo dela.',
    'Follows the suggestion (one or two sentences) for as long as it lasts.',
  ],
  [
    'Cada vez que o protegido sofre dano, você sofre o mesmo dano; a magia acaba se vocês se afastarem mais de 60 ft.',
    'Each time the protected creature takes damage, you take the same damage; the spell ends if you move more than 60 ft apart.',
  ],
  [
    'Preso: usa a ação para um teste de Força contra a sua CD e se liberta (remova a condição). As teias queimam: 2d4 de fogo.',
    'Restrained: uses its action to make a Strength check against your DC and break free (remove the condition). The webs burn: 2d4 fire damage.',
  ],
  [
    'Não consegue mentir deliberadamente dentro da área.',
    'Cannot deliberately lie inside the area.',
  ],
  [
    'Invocação: o Mestre adiciona o esqueleto ou zumbi ao combate (as estatísticas estão no Bestiário).',
    'Summoning: the GM adds the skeleton or zombie to the combat (stats are in the Bestiary).',
  ],
  [
    'Vantagem em salvaguardas contra a morte; toda cura rola o máximo possível.',
    'Advantage on death saving throws; all healing rolls the maximum possible.',
  ],
  [
    'Amaldiçoado: desvantagem nos ataques contra o conjurador.',
    'Cursed: disadvantage on attack rolls against the caster.',
  ],
  [
    'Amaldiçoado: desvantagem em testes e salvaguardas do atributo escolhido.',
    'Cursed: disadvantage on checks and saving throws of the chosen ability.',
  ],
  [
    'Amaldiçoado: no início de cada turno faz salvaguarda de Sabedoria; se falhar, perde a ação.',
    'Cursed: at the start of each turn it makes a Wisdom save; on a failure it loses its action.',
  ],
  [
    'No fim de cada turno role d20: 11 ou mais, você vai ao Plano Etéreo e volta no início do próximo turno.',
    'At the end of each turn roll a d20: on 11 or higher you go to the Ethereal Plane and return at the start of the next turn.',
  ],
  ['Em tempestade, o dano aumenta em 1d10.', 'In a storm, the damage increases by 1d10.'],
  [
    'Invocação: o Mestre adiciona as feras (ND conforme a opção) ao combate como grupo amigo.',
    'Summoning: the GM adds the beasts (CR per the option) to the combat as a friendly group.',
  ],
  [
    'Larga o que segura e deve Correr para longe de você; ao terminar o turno sem linha de visão, repete a salvaguarda.',
    'Drops what it holds and must Dash away from you; when it ends its turn without line of sight, it repeats the save.',
  ],
  ['Velocidade de voo de 60 ft.', 'Flying speed of 60 ft.'],
  [
    'O movimento aéreo não é simulado: o Mestre move o token.',
    'Aerial movement is not simulated: the GM moves the token.',
  ],
  [
    'Forma de névoa: voo 10 ft, atravessa frestas; não ataca nem conjura.',
    'Mist form: flying 10 ft, passes through cracks; cannot attack or cast.',
  ],
  [
    'Ação extra por turno (um ataque com arma, Correr, Desengajar, Esconder ou Usar Objeto).',
    'Extra action each turn (one weapon attack, Dash, Disengage, Hide or Use an Object).',
  ],
  [
    'O ataque extra com arma e o torpor ao terminar a magia são aplicados à mão.',
    'The extra weapon attack and the lethargy when the spell ends are applied by hand.',
  ],
  [
    'Acorda ao sofrer dano ou se alguém usar uma ação para sacudi-lo.',
    'Wakes on taking damage or if someone uses an action to shake it.',
  ],
  [
    'Também desfaz a sintonização de um item amaldiçoado.',
    'Also ends the attunement of a cursed item.',
  ],
  [
    'Só vale se a criatura morreu há no máximo 1 minuto (e não de velhice).',
    'Only works if the creature died no more than 1 minute ago (and not of old age).',
  ],
  [
    'Quem se concentra dentro da área faz salvaguarda de Constituição contra a sua CD ou perde a concentração.',
    'Whoever concentrates inside the area makes a Constitution save against your DC or loses concentration.',
  ],
  [
    'Uma ação ou uma ação bônus por turno, um único ataque; magia de 1 ação pode atrasar (d20, 11+).',
    'One action or one bonus action per turn, a single attack; a 1-action spell may be delayed (d20, 11+).',
  ],
  [
    'Até seis criaturas à sua escolha: desconsidere as que passarem da sexta.',
    'Up to six creatures of your choice: ignore any beyond the sixth.',
  ],
  [
    'Você escolhe quem não é afetado; os espíritos causam radiante (bom/neutro) ou necrótico (mau).',
    'You choose who is unaffected; the spirits deal radiant (good/neutral) or necrotic (evil) damage.',
  ],
  [
    'Gasta a ação vomitando e cambaleando neste turno.',
    'Spends its action retching and reeling this turn.',
  ],
  ['Respira debaixo d’água.', 'Breathes underwater.'],
  [
    'Anda sobre qualquer líquido como se fosse chão.',
    'Walks on any liquid as if it were solid ground.',
  ],
  [
    'A parede desvia projéteis comuns e impede criaturas voadoras Pequenas de atravessá-la.',
    'The wall deflects ordinary projectiles and stops Small flying creatures from passing through it.',
  ],
  [
    'Banido: retire o token do mapa enquanto durar; ao fim da magia (ou se durar 1 minuto fora do plano de origem) o alvo volta ao espaço de onde saiu.',
    'Banished: remove the token from the map while it lasts; when the spell ends (or after 1 minute outside its home plane) the target returns to the space it left.',
  ],
  [
    'Preso, o alvo pode usar a ação para um teste de Força ou Destreza contra a sua CD e se libertar; quem já está preso sofre o dano de novo no início do turno.',
    'While restrained, the target can use its action to make a Strength or Dexterity check against your DC and break free; a creature already restrained takes the damage again at the start of its turn.',
  ],
  [
    'Sem efeito em mortos-vivos e constructos; plantas têm desvantagem e sofrem o dano máximo.',
    'No effect on undead and constructs; plants have disadvantage and take maximum damage.',
  ],
  [
    'Deve se mover o máximo que puder na direção indicada (ação bônus do conjurador); refaz a salvaguarda depois de se mover.',
    "It must move as far as it can in the indicated direction (the caster's bonus action); it remakes the save after moving.",
  ],
  [
    'No início de cada turno role d10: 1 move-se ao acaso; 2–6 não age; 7–8 ataca alguém ao alcance; 9–10 age normalmente.',
    'At the start of each turn roll a d10: 1 moves randomly; 2–6 does nothing; 7–8 attacks someone in reach; 9–10 acts normally.',
  ],
  [
    'Invocação: o Mestre adiciona os elementais (ND conforme a opção) ao combate como grupo amigo.',
    'Summoning: the GM adds the elementals (CR per the option) to the combat as a friendly group.',
  ],
  [
    'Invocação: o Mestre adiciona as criaturas feéricas (ND conforme a opção) ao combate como grupo amigo.',
    'Summoning: the GM adds the fey creatures (CR per the option) to the combat as a friendly group.',
  ],
  [
    'A primeira queda a 0 PV vira 1 PV e a magia acaba.',
    'The first drop to 0 HP becomes 1 HP and the spell ends.',
  ],
  [
    'Você pode levar um aliado voluntário a até 5 ft (mova o token dele à mão). Chegar num espaço ocupado causa 4d6 de energia a você e falha o teleporte.',
    'You can bring a willing ally within 5 ft (move their token by hand). Arriving in an occupied space deals 4d6 force damage to you and the teleport fails.',
  ],
  [
    'Só afeta feras; o alvo tem vantagem se você ou amigos o combatem; com uma ação você controla totalmente o alvo até o fim do seu próximo turno; ao sofrer dano ele repete a salvaguarda.',
    'Only affects beasts; the target has advantage if you or friends are fighting it; with an action you fully control the target until the end of your next turn; when it takes damage it repeats the save.',
  ],
  [
    'No início de cada turno seu, o cão morde uma criatura hostil a até 5 ft (bônus = seu modificador + proficiência; 4d8 perfurante): aplique à mão.',
    'At the start of each of your turns, the hound bites a hostile creature within 5 ft (bonus = your modifier + proficiency; 4d8 piercing): apply by hand.',
  ],
  [
    'Quem te acerta com ataque corpo a corpo a até 5 ft leva 2d8 de fogo (escudo quente) ou gelo (frio): aplique à mão.',
    'Whoever hits you with a melee attack within 5 ft takes 2d8 fire (warm shield) or cold (chill shield) damage: apply by hand.',
  ],
  [
    'Terreno difícil não o afeta; escapa de amarras gastando 5 ft de movimento; sem penalidade na água.',
    'Difficult terrain does not affect it; escapes bonds by spending 5 ft of movement; no penalty in water.',
  ],
  [
    'O guardião some depois de causar 60 de dano no total (acompanhe à mão).',
    'The guardian vanishes after dealing 60 damage in total (track it by hand).',
  ],
  [
    'O granizo torna a área terreno difícil até o fim do seu próximo turno.',
    'The hail makes the area difficult terrain until the end of your next turn.',
  ],
  [
    'No início de cada turno o alvo faz salvaguarda de Sabedoria (aqui, no fim): se passar, a magia acaba.',
    'At the start of each turn the target makes a Wisdom save (here, at the end): if it passes, the spell ends.',
  ],
  [
    'Transformação: troque as estatísticas do alvo pelas da fera escolhida (PV novos; ao voltar, o excesso de dano passa para a forma normal).',
    "Transformation: swap the target's stats for those of the chosen beast (new HP; when it reverts, excess damage carries over to its normal form).",
  ],
  [
    'Preso numa esfera de energia: nada atravessa, o alvo não sofre dano de fora e rola a esfera a metade da velocidade.',
    'Trapped in a sphere of force: nothing passes through, the target takes no damage from outside and rolls the sphere at half speed.',
  ],
  ['Resistência só a dano não mágico.', 'Resistance only to nonmagical damage.'],
  [
    'Só um lado da muralha causa dano (o que você escolher): o motor aplica aos que estão na linha; ajuste se estiverem do lado inofensivo.',
    'Only one side of the wall deals damage (the one you choose): the engine applies it to those on the line; adjust if they are on the harmless side.',
  ],
  [
    'Invocação: o Mestre adiciona os objetos animados (PV, CA e ataque conforme o tamanho) ao combate.',
    'Summoning: the GM adds the animated objects (HP, AC and attack by size) to the combat.',
  ],
  [
    'A barreira impede que criaturas (exceto mortos-vivos e constructos) passem ou alcancem através; quem for forçado a atravessá-la encerra a magia.',
    'The barrier stops creatures (except undead and constructs) from passing or reaching through; whoever is forced through it ends the spell.',
  ],
  [
    'Além do punho (aplicado), a mão pode empurrar, agarrar (2d6 + modificador a cada esmagada) ou interpor-se como meia cobertura: conduza à mão.',
    'Besides the fist (applied), the hand can push, grapple (2d6 + modifier each crush) or interpose as half cover: run it by hand.',
  ],
  [
    'Invocação: o Mestre adiciona o elemental (ND 5 ou menor) ao combate; se a concentração quebrar ele fica hostil.',
    'Summoning: the GM adds the elemental (CR 5 or lower) to the combat; if concentration breaks it turns hostile.',
  ],
  [
    'Faça uma salvaguarda de Inteligência CD 15: se falhar, 6d6 psíquico e insanidade até o descanso longo (aplique à mão).',
    'Make an Intelligence save, DC 15: on a failure, 6d6 psychic damage and insanity until a long rest (apply by hand).',
  ],
  [
    'Doença: a cada fim de turno faz salvaguarda de Constituição (três falhas a fixam; três sucessos a curam).',
    'Disease: at the end of each turn it makes a Constitution save (three failures fix it; three successes cure it).',
  ],
  [
    'Cego; desvantagem em testes e salvaguardas de Sabedoria.',
    'Blinded; disadvantage on Wisdom checks and saves.',
  ],
  [
    'Desvantagem em testes, salvaguardas e ataques de Força.',
    'Disadvantage on Strength checks, saves and attack rolls.',
  ],
  [
    'Desvantagem em Carisma; vulnerável a todo dano.',
    'Disadvantage on Charisma; vulnerable to all damage.',
  ],
  [
    'Desvantagem em Inteligência; age como sob Confusão em combate.',
    'Disadvantage on Intelligence; acts as if under Confusion in combat.',
  ],
  [
    'Desvantagem em testes, salvaguardas e ataques de Destreza.',
    'Disadvantage on Dexterity checks, saves and attack rolls.',
  ],
  [
    'Desvantagem em Constituição; ao sofrer dano fica atordoado até o fim do próximo turno.',
    'Disadvantage on Constitution; when it takes damage it is stunned until the end of the next turn.',
  ],
  [
    'Celestiais, elementais, fadas, ínferos e mortos-vivos têm desvantagem nos ataques contra você.',
    'Celestials, elementals, fey, fiends and undead have disadvantage on attacks against you.',
  ],
  [
    'Você pode encerrar a magia para Quebrar Encantamento (toque: acaba enfeitiçado/amedrontado/possuído por essas criaturas) ou Dispensar (ataque corpo a corpo; salvaguarda de Carisma ou é mandado de volta).',
    'You can end the spell to Break Enchantment (touch: ends charmed/frightened/possessed by those creatures) or Dismissal (melee attack; Charisma save or sent back).',
  ],
  [
    'Só afeta humanoides; o alvo tem vantagem se você ou amigos o combatem; com uma ação você o controla até o fim do seu próximo turno; ao sofrer dano ele repete a salvaguarda.',
    'Only affects humanoids; the target has advantage if you or friends are fighting it; with an action you control it until the end of your next turn; when it takes damage it repeats the save.',
  ],
  [
    'O alvo sofre 5d10 psíquico (no máximo uma vez por dia) sempre que agir contra as suas instruções.',
    'The target takes 5d10 psychic damage (at most once per day) whenever it acts against your instructions.',
  ],
  [
    'Também reduz um nível de exaustão ou encerra uma maldição, uma redução de atributo ou de PV máximos (aplique à mão).',
    'Also reduces one level of exhaustion or ends a curse, an ability score reduction or a hit point maximum reduction (apply by hand).',
  ],
  ['Sem efeito em mortos-vivos.', 'No effect on undead.'],
  [
    'Um duplo ilusório surge onde você estava e pode ser movido com uma ação (aplique à mão).',
    'An illusory double appears where you were and can be moved with an action (apply by hand).',
  ],
  [
    'Enquanto durar, você reescreve a memória de um evento das últimas 24 horas (narrativa).',
    'While it lasts, you rewrite the memory of an event from the last 24 hours (narrative).',
  ],
  [
    '−4 em ataques, salvaguardas e testes até o descanso longo.',
    '−4 on attacks, saves and checks until a long rest.',
  ],
  [
    'Só vale se a criatura morreu há no máximo 10 dias e a alma quer voltar.',
    'Only works if the creature died no more than 10 days ago and its soul is willing to return.',
  ],
  [
    'Você move uma criatura (teste de atributo contra o de Força dela) ou um objeto a cada turno: conduza à mão.',
    'You move a creature (ability check against its Strength) or an object each turn: run it by hand.',
  ],
  [
    'Uma barreira invisível: nada a atravessa e ela resiste a todo dano; mova os tokens à mão se ela corta um espaço.',
    'An invisible barrier: nothing passes through and it resists all damage; move tokens by hand if it cuts through a space.',
  ],
  [
    'Uma muralha de pedra (CA 15, 30 PV por polegada): mova os tokens à mão se ela corta um espaço.',
    'A stone wall (AC 15, 30 HP per inch): move tokens by hand if it cuts through a space.',
  ],
  [
    'A muralha dá três quartos de cobertura a quem está atrás.',
    'The wall gives three-quarters cover to those behind it.',
  ],
  [
    'Invocação: o Mestre adiciona a criatura feérica (ND 6 ou menor) ao combate; se a concentração quebrar ela fica hostil.',
    'Summoning: the GM adds the fey creature (CR 6 or lower) to the combat; if concentration breaks it turns hostile.',
  ],
  [
    'Invocação: o Mestre adiciona os carniçais ao combate (só à noite).',
    'Summoning: the GM adds the ghouls to the combat (night only).',
  ],
  [
    'Se o dano reduzir o alvo a 0 PV, ele é desintegrado (só o true resurrection ou o wish o trazem de volta).',
    'If the damage reduces the target to 0 HP, it is disintegrated (only true resurrection or wish brings it back).',
  ],
  [
    'Desvantagem em ataques e testes de atributo.',
    'Disadvantage on attack rolls and ability checks.',
  ],
  [
    'O alvo repete a salvaguarda a cada turno: três falhas o petrificam (aplique a condição Petrificado); três sucessos encerram a magia.',
    'The target repeats the save each turn: three failures petrify it (apply the Petrified condition); three successes end the spell.',
  ],
  [
    'Magias de 5º nível ou menor lançadas de fora da esfera não a afetam (+1 nível por espaço acima do 6º).',
    'Spells of 5th level or lower cast from outside the sphere do not affect it (+1 level per slot above 6th).',
  ],
  [
    'O dano não reduz os PV do alvo abaixo de 1; se falhar, os PV máximos dele caem pelo mesmo valor por 1 hora (aplique à mão).',
    'The damage cannot reduce the target below 1 HP; on a failure, its hit point maximum drops by the same amount for 1 hour (apply by hand).',
  ],
  [
    'Também encerra doenças; sem efeito em constructos e mortos-vivos.',
    'Also ends diseases; no effect on constructs and undead.',
  ],
  [
    'Dança sem sair do lugar; com uma ação faz salvaguarda de Sabedoria para recuperar o controle.',
    'Dances in place; with an action it makes a Wisdom save to regain control.',
  ],
  [
    'Invocação: o Mestre adiciona o aliado planar ao combate conforme o acordo.',
    'Summoning: the GM adds the planar ally to the combat according to the agreement.',
  ],
  [
    'Mortos-vivos e limos têm desvantagem na salvaguarda.',
    'Undead and oozes have disadvantage on the save.',
  ],
  [
    'Visão verdadeira, vê portas secretas mágicas e o Plano Etéreo até 120 ft.',
    'True seeing, sees magical secret doors and the Ethereal Plane up to 120 ft.',
  ],
  [
    'A muralha é um objeto (CA 12, 30 PV por trecho de 10 ft, vulnerável a fogo); ao quebrar deixa ar gélido (5d6 de frio, Constituição).',
    'The wall is an object (AC 12, 30 HP per 10-ft section, vulnerable to fire); when broken it leaves freezing air (5d6 cold, Constitution).',
  ],
  [
    'Ao entrar ou terminar o turno na muralha o alvo sofre 7d8 cortante (aqui o motor repete o dano perfurante); atravessá-la custa 4 ft de movimento por pé.',
    'On entering or ending its turn in the wall the target takes 7d8 slashing damage (here the engine repeats the piercing damage); passing through costs 4 ft of movement per foot.',
  ],
  [
    'Invocação: o Mestre adiciona o celestial (ND 4 ou menor; 5 com espaço de 9º nível) ao combate.',
    'Summoning: the GM adds the celestial (CR 4 or lower; 5 with a 9th-level slot) to the combat.',
  ],
  [
    'A esfera também explode se a concentração quebrar; o dano base sobe 1d6 a cada fim de turno sem detonar (some à mão).',
    'The sphere also explodes if concentration breaks; the base damage rises 1d6 at the end of each turn without detonating (add it by hand).',
  ],
  [
    'Celestiais, elementais, fadas e ínferos que falham são mandados de volta ao plano de origem (por 24 horas).',
    'Celestials, elementals, fey and fiends that fail are sent back to their home plane (for 24 hours).',
  ],
  [
    'Um humanoide morto por esta magia se ergue como zumbi sob seu comando no início do seu próximo turno.',
    'A humanoid killed by this spell rises as a zombie under your command at the start of your next turn.',
  ],
  [
    'Uma prisão de energia (jaula de até 20 ft ou caixa de até 10 ft): quem está dentro não sai por meios não mágicos; ela resiste a Dissipar Magia.',
    'A prison of force (a cage up to 20 ft or a box up to 10 ft): whoever is inside cannot leave by nonmagical means; it resists Dispel Magic.',
  ],
  [
    'Para banir uma criatura relutante: ataque corpo a corpo e, se acertar, salvaguarda de Carisma (aplique à mão).',
    'To banish an unwilling creature: melee attack and, on a hit, a Charisma save (apply by hand).',
  ],
  [
    'Índigo: três falhas seguidas de salvaguarda de Constituição o petrificam; três sucessos encerram.',
    'Indigo: three consecutive failed Constitution saves petrify it; three successes end it.',
  ],
  [
    'Violeta: na próxima vez que você agir, o alvo faz salvaguarda de Sabedoria; se falhar é transportado a outro plano.',
    'Violet: the next time you act, the target makes a Wisdom save; on a failure it is sent to another plane.',
  ],
  [
    'Raio 8: o alvo é atingido por dois raios (aqui, fogo e ácido); role de novo à mão para raios 6 e 7 se quiser.',
    'Ray 8: the target is struck by two rays (here, fire and acid); roll again by hand for rays 6 and 7 if you wish.',
  ],
  ['Membros decepados voltam depois de 2 minutos.', 'Severed limbs regrow after 2 minutes.'],
  [
    '−4 em ataques, salvaguardas e testes; cai 1 por descanso longo.',
    '−4 on attacks, saves and checks; drops by 1 per long rest.',
  ],
  [
    'Só vale se a criatura morreu há no máximo um século e não de velhice.',
    'Only works if the creature died no more than a century ago and not of old age.',
  ],
  [
    'Criaturas na área caem para cima (Destreza para se agarrar a algo fixo); ao fim da magia, caem de volta.',
    'Creatures in the area fall upward (Dexterity to grab something fixed); when the spell ends, they fall back down.',
  ],
  [
    'Invocação: o Mestre cria o simulacro (metade dos PV do original) e o adiciona ao combate.',
    "Summoning: the GM creates the simulacrum (half the original's HP) and adds it to the combat.",
  ],
  [
    'O destino e a margem de erro seguem a tabela de familiaridade: o Mestre rola e move os tokens.',
    'The destination and margin of error follow the familiarity table: the GM rolls and moves the tokens.',
  ],
  [
    'Transformação: troque as estatísticas de cada alvo pelas da fera escolhida (ND 4 ou menor).',
    "Transformation: swap each target's stats for those of the chosen beast (CR 4 or lower).",
  ],
  [
    'Dentro da esfera magias não funcionam, criaturas invocadas somem e itens mágicos ficam comuns: suprima à mão os efeitos de quem estiver nela.',
    "Inside the sphere spells don't work, summoned creatures vanish and magic items become mundane: suppress the effects on anyone inside by hand.",
  ],
  [
    'Você tem vantagem de comando telepática; com uma ação controla totalmente o alvo até o fim do seu próximo turno; ao sofrer dano ele repete a salvaguarda.',
    'You have telepathic command advantage; with an action you fully control the target until the end of your next turn; when it takes damage it repeats the save.',
  ],
  [
    'A cada fim de turno seu, quem está no chão faz a salvaguarda de novo; quem se concentra na área faz Constituição ou perde a concentração; fissuras e estruturas ficam a cargo do Mestre.',
    'At the end of each of your turns, whoever is on the ground makes the save again; whoever concentrates in the area makes a Constitution save or loses concentration; fissures and structures are up to the GM.',
  ],
  [
    'Inteligência e Carisma caem a 1: não conjura, não entende linguagem nem se comunica; repete a salvaguarda a cada 30 dias.',
    'Intelligence and Charisma drop to 1: it cannot cast spells, understand language or communicate; it repeats the save every 30 days.',
  ],
  [
    'Quando um ínfero ou morto-vivo o acerta corpo a corpo, ele faz Constituição ou fica cego.',
    'When a fiend or undead hits it in melee, it makes a Constitution save or is blinded.',
  ],
  [
    'O alvo está no labirinto: retire o token do mapa; com uma ação faz teste de Inteligência CD 20 para escapar (a magia acaba e ele volta ao espaço de onde saiu).',
    'The target is in the maze: remove the token from the map; with an action it makes an Intelligence check, DC 20, to escape (the spell ends and it returns to the space it left).',
  ],
  [
    'Imune a dano psíquico, a ler pensamentos e emoções e a adivinhação.',
    'Immune to psychic damage, to having thoughts and emotions read, and to divination.',
  ],
  [
    'Mortos-vivos e limos têm desvantagem na salvaguarda; a luz dissipa escuridão mágica na área.',
    'Undead and oozes have disadvantage on the save; the light dispels magical darkness in the area.',
  ],
  [
    'Não pode ser surpreendido; vantagem em ataques, testes e salvaguardas.',
    'Cannot be surprised; advantage on attacks, checks and saves.',
  ],
  [
    'Nas formas de sepultamento, prisão cercada e contenção mínima, retire o token do mapa. A magia dura até ser dissipada (Dissipar Magia de 9º nível).',
    'For burial, hedged prison and minimus containment, remove the token from the map. The spell lasts until dispelled (Dispel Magic with a 9th-level slot).',
  ],
  [
    'Também cura todas as doenças; sem efeito em constructos e mortos-vivos.',
    'Also cures all diseases; no effect on constructs and undead.',
  ],
  [
    'São quatro pontos: conjure este efeito uma vez por ponto (uma criatura em mais de uma explosão sofre só uma).',
    'There are four points: cast this effect once per point (a creature in more than one blast is affected only once).',
  ],
  [
    'Sete camadas (vermelha a violeta): quem atravessa faz Destreza em cada uma (10d6 de fogo, ácido, elétrico, veneno ou gelo; restrito; cego/transportado); quem vê a parede a até 20 ft faz Constituição ou fica cego.',
    'Seven layers (red to violet): whoever passes through makes a Dexterity save on each (10d6 fire, acid, lightning, poison or cold; restrained; blinded/transported); whoever sees the wall within 20 ft makes a Constitution save or is blinded.',
  ],
  [
    'Transformação: troque as suas estatísticas pelas da criatura escolhida (ND até o seu nível).',
    'Transformation: swap your stats for those of the chosen creature (CR up to your level).',
  ],
  [
    'A cada rodada em que você mantém a concentração: 2ª chuva ácida (1d6), 3ª seis raios (10d6), 4ª granizo (2d6), 5ª–10ª chuva gelada (1d6): aplique à mão.',
    'Each round you keep concentrating: 2nd acid rain (1d6), 3rd six lightning bolts (10d6), 4th hail (2d6), 5th–10th freezing rain (1d6): apply by hand.',
  ],
  [
    'Você age 1d4 + 1 turnos seguidos; acaba se uma ação sua afetar outra criatura: conduza à mão.',
    'You act for 1d4 + 1 turns in a row; it ends if one of your actions affects another creature: run it by hand.',
  ],
  [
    'Transformação: troque as estatísticas do alvo (criatura em criatura, objeto ou vice-versa) à mão.',
    "Transformation: swap the target's stats (creature into creature, object, or vice versa) by hand.",
  ],
  [
    'Só vale se a criatura morreu há no máximo 200 anos e não de velhice; cura doenças, venenos e maldições.',
    'Only works if the creature died no more than 200 years ago and not of old age; cures diseases, poisons and curses.',
  ],
  [
    'No início de cada turno o alvo faz salvaguarda de Sabedoria (aqui, no fim): se passar, a magia acaba para ele.',
    'At the start of each turn the target makes a Wisdom save (here, at the end): if it passes, the spell ends for it.',
  ],
  [
    'O Desejo duplica magia de até 8º nível (conjure a magia em si) ou cria um efeito livre: o Mestre adjudica.',
    'Wish duplicates a spell of 8th level or lower (cast that spell itself) or creates a free-form effect: the GM adjudicates.',
  ],
  [
    '+1d4 nos testes da perícia escolhida enquanto durar.',
    '+1d4 on checks of the chosen skill while it lasts.',
  ],
  [
    'Reduz em 1d4 o dano do tipo escolhido que sofrer (uma vez por turno).',
    'Reduces the chosen damage type you take by 1d4 (once per turn).',
  ],
  [
    'Escolha o tipo de dano; a redução de 1d4 no dano sofrido é aplicada à mão.',
    'Choose the damage type; the 1d4 reduction to the damage taken is applied by hand.',
  ],
  [
    'Se sair 8 em um d8 do dano, role outro d8 e some (no máximo seu modificador de conjuração vezes).',
    'If an 8 comes up on a d8 of the damage, roll another d8 and add it (at most your spellcasting modifier times).',
  ],
  [
    'Emite luz fraca em 10 ft e não se beneficia de Invisível.',
    'Emits dim light in 10 ft and gains no benefit from Invisible.',
  ],
  [
    'Faça um ataque com a arma usando o atributo de conjuração no ataque e no dano (pode causar radiante, +1d6/2d6/3d6 nos níveis 5/11/17): use a ação Atacar.',
    'Make a weapon attack using the spellcasting ability for attack and damage (it can deal radiant, +1d6/2d6/3d6 at levels 5/11/17): use the Attack action.',
  ],
  [
    'Se dois ou mais d8 saírem iguais, o orbe salta para outra criatura a até 30 ft do alvo (lance um novo ataque à mão).',
    'If two or more d8s come up the same, the orb leaps to another creature within 30 ft of the target (make a new attack by hand).',
  ],
  ['Não se move nem age neste turno.', 'Does not move or act this turn.'],
  ['Larga o que segura e encerra o turno.', 'Drops what it holds and ends its turn.'],
  ['Gasta o turno se afastando de você.', 'Spends its turn moving away from you.'],
  ['Cai no chão e encerra o turno.', 'Falls prone and ends its turn.'],
  [
    'Se falhar, o alvo usa a reação (se tiver) para se afastar de você o máximo possível.',
    'On a failure, the target uses its reaction (if it has one) to move as far from you as possible.',
  ],
  ['+1d8 se o alvo for ínfero ou morto-vivo.', '+1d8 if the target is a fiend or undead.'],
  [
    'Criatura Grande ou maior tem vantagem na salvaguarda; o alvo (ou alguém ao alcance) pode usar uma ação para um teste de Força (Atletismo) e acabar com a magia.',
    'A Large or larger creature has advantage on the save; the target (or anyone in reach) can use an action to make a Strength (Athletics) check and end the spell.',
  ],
  [
    'Escolha um atributo: o alvo tem desvantagem em testes dele. Se o alvo cair a 0 PV, use uma ação bônus para transferir a maldição.',
    'Choose an ability: the target has disadvantage on its checks with it. If the target drops to 0 HP, use a bonus action to transfer the curse.',
  ],
  [
    'Uma vez por turno, salta 30 ft gastando 10 ft de deslocamento.',
    'Once per turn, jumps 30 ft by spending 10 ft of movement.',
  ],
  [
    'O alvo queima: no início de cada turno sofre o dano e faz salvaguarda de Constituição; passar acaba com a magia.',
    'The target burns: at the start of each turn it takes the damage and makes a Constitution save; passing ends the spell.',
  ],
  [
    'Ao fim do próximo turno o alvo repete a salvaguarda: se falhar, fica inconsciente pela duração (aplique a condição); elfos e quem não dorme passam automaticamente.',
    "At the end of its next turn the target repeats the save: on a failure, it is unconscious for the duration (apply the condition); elves and creatures that don't sleep pass automatically.",
  ],
  [
    'Imune a enfeitiçado e amedrontado (os atuais ficam suspensos), ou indiferente a quem você escolher.',
    'Immune to charmed and frightened (existing ones are suspended), or indifferent toward whoever you choose.',
  ],
  ['Visão no escuro de 150 ft.', 'Darkvision of 150 ft.'],
  [
    '−10 em Sabedoria (Percepção) e na Percepção passiva.',
    '−10 on Wisdom (Perception) checks and passive Perception.',
  ],
  [
    'Você sabe onde o alvo está; ele não se esconde nem se beneficia de Invisível contra você.',
    'You know where the target is; it cannot hide from you or benefit from Invisible against you.',
  ],
  [
    'Só o alvo percebe o fantasma; se passar num teste de Investigação contra a sua CD, a magia acaba.',
    'Only the target perceives the phantasm; if it passes an Investigation check against your DC, the spell ends.',
  ],
  [
    'O dano de 2d8 psíquico acontece enquanto o alvo estiver na área do fantasma ou a até 5 ft dele.',
    "The 2d8 psychic damage happens while the target is in the phantasm's area or within 5 ft of it.",
  ],
  [
    'Os afetados também ganham os benefícios de um descanso curto (uma vez por descanso longo).',
    'Those affected also gain the benefits of a short rest (once per long rest).',
  ],
  [
    'Desvantagem em testes de d20 de Força e −1d8 em cada dano.',
    'Disadvantage on Strength d20 tests and −1d8 on each damage roll.',
  ],
  [
    'Se passar na salvaguarda, o alvo só tem desvantagem no próximo ataque até o início do seu próximo turno.',
    'If it passes the save, the target only has disadvantage on its next attack until the start of its next turn.',
  ],
  [
    'Brilha: luz plena em 5 ft e não se beneficia de Invisível.',
    'Shines: bright light in 5 ft and gains no benefit from Invisible.',
  ],
  [
    'Cumpre a sugestão (até 25 palavras) da melhor forma possível.',
    'Carries out the suggestion (up to 25 words) as best it can.',
  ],
  [
    'Amaldiçoado: no início de cada turno de combate faz salvaguarda de Sabedoria; se falhar, é forçado a usar a ação Esquivar.',
    'Cursed: at the start of each combat turn it makes a Wisdom save; on a failure, it is forced to take the Dodge action.',
  ],
  [
    'No fim de cada turno role 1d6: com 4 a 6 você vai ao Plano Etéreo e volta no início do próximo turno.',
    'At the end of each turn roll a d6: on a 4–6 you go to the Ethereal Plane and return at the start of the next turn.',
  ],
  [
    'A alcateia é intangível: use uma salvaguarda de Destreza por criatura por turno (o motor aplica ao entrar na área ou terminar o turno nela).',
    'The pack is intangible: use one Dexterity save per creature per turn (the engine applies it on entering the area or ending the turn in it).',
  ],
  [
    'Quem falha na salvaguarda cai (Caído) e perde a concentração (remova-a à mão).',
    'Whoever fails the save falls (Prone) and loses concentration (remove it by hand).',
  ],
  [
    'Envenenado até o fim do turno: não pode usar ação nem ação bônus.',
    'Poisoned until the end of the turn: cannot use an action or bonus action.',
  ],
  ['Seus PV máximos não podem ser reduzidos.', 'Your hit point maximum cannot be reduced.'],
  [
    'Você e seus aliados na aura têm resistência a necrótico e PV máximos imunes a redução; um aliado a 0 PV que começa o turno na aura recupera 1 PV.',
    "You and your allies in the aura have resistance to necrotic damage and your hit point maximums can't be reduced; an ally at 0 HP that starts its turn in the aura regains 1 HP.",
  ],
  [
    'Vantagem na salvaguarda se você ou aliados o combatem; o alvo fica Amistoso e sabe que foi enfeitiçado ao fim da magia.',
    'Advantage on the save if you or allies are fighting it; the target is Friendly and knows it was charmed when the spell ends.',
  ],
  [
    'O dano extra vale ao acertar uma criatura dentro da aura; o chão da aura é terreno difícil para seus inimigos.',
    "The extra damage applies when you hit a creature inside the aura; the aura's ground is difficult terrain for your enemies.",
  ],
  [
    'Você pode usar Desengajar como ação bônus enquanto durar.',
    'You can use Disengage as a bonus action while it lasts.',
  ],
  [
    'No início de cada turno seu o cão morde um inimigo a até 5 ft (Destreza ou 4d8 de energia); com uma ação nos turnos seguintes você o move até 30 ft.',
    'At the start of each of your turns the hound bites an enemy within 5 ft (Dexterity or 4d8 force); with an action on later turns you move it up to 30 ft.',
  ],
  [
    'Se o alvo passar na salvaguarda inicial, sofre metade do dano e a magia acaba.',
    'If the target passes the initial save, it takes half damage and the spell ends.',
  ],
  [
    'Transformação: o alvo ganha como PV temporários os PV da fera (e mantém os seus PV); a magia acaba nele se os PV temporários acabarem.',
    "Transformation: the target gains the beast's HP as temporary HP (and keeps its own HP); the spell ends on it if the temporary HP run out.",
  ],
  [
    'Quem está contido repete a salvaguarda no início do turno (4d8 do mesmo tipo se falhar); só um alvo fica contido por vez.',
    'A restrained creature repeats the save at the start of its turn (4d8 of the same type on a failure); only one target is restrained at a time.',
  ],
  [
    'Escolha um atributo: o alvo envenenado tem desvantagem em salvaguardas dele. Ao fim de cada turno ele repete a salvaguarda de Constituição: três sucessos encerram a magia; três falhas a fixam por 7 dias.',
    'Choose an ability: the poisoned target has disadvantage on its saves with it. At the end of each turn it repeats the Constitution save: three successes end the spell; three failures fix it for 7 days.',
  ],
  [
    'Invocação: o Mestre adiciona o espírito dracônico (bloco Draconic Spirit) ao combate; ele age logo depois de você.',
    'Summoning: the GM adds the draconic spirit (Draconic Spirit block) to the combat; it acts right after you.',
  ],
  [
    'O espírito aparece a até 60 ft e o alvo precisa estar a até 5 ft dele; nos turnos seguintes você o teletransporta até 30 ft e ataca de novo.',
    'The spirit appears within 60 ft and the target must be within 5 ft of it; on later turns you teleport it up to 30 ft and attack again.',
  ],
  [
    'Sem efeito em constructos e mortos-vivos; 70 PV (+10 por nível acima do 6º).',
    'No effect on constructs and undead; 70 HP (+10 per level above 6th).',
  ],
  [
    'Índigo: três falhas de salvaguarda de Constituição (no fim de cada turno) o petrificam; três sucessos encerram.',
    'Indigo: three failed Constitution saves (at the end of each turn) petrify it; three successes end it.',
  ],
  [
    'Violeta: no início do seu próximo turno o alvo faz salvaguarda de Sabedoria; se falhar é transportado a outro plano.',
    'Violet: at the start of your next turn the target makes a Wisdom save; on a failure it is transported to another plane.',
  ],
  [
    'Não conjura nem usa a ação Magia; repete a salvaguarda a cada 30 dias (ou Restauração Maior, Cura ou Desejo).',
    'Cannot cast spells or take the Magic action; repeats the save every 30 days (or Greater Restoration, Heal or Wish).',
  ],
  [
    'Vantagem na salvaguarda se você ou aliados lutam contra o alvo; ao sofrer dano ele repete a salvaguarda; o comando telepático não gasta ação.',
    'Advantage on the save if you or allies are fighting the target; when it takes damage it repeats the save; the telepathic command takes no action.',
  ],
  [
    'A cada início de turno seu a parede avança 50 ft; Enormes ou menores dentro dela fazem Força ou sofrem 5d10 (−1d10 a cada rodada). Mova e aplique à mão.',
    'Each of your turns the wall advances 50 ft; Huge or smaller creatures inside make a Strength save or take 5d10 (−1d10 each round). Move and apply by hand.',
  ],
  [
    'Vantagem em todos os Testes de d20; quem o ataca tem desvantagem.',
    'Advantage on all d20 tests; whoever attacks it has disadvantage.',
  ],
  [
    'Se o alvo está caído, ele pode usar a Reação para se levantar.',
    'If the target is prone, it can use its Reaction to stand up.',
  ],
  [
    'No fim de cada turno o alvo faz salvaguarda de Sabedoria: se falhar, sofre 5d10 psíquico; se passar, a magia acaba para ele.',
    'At the end of each turn the target makes a Wisdom save: on a failure, it takes 5d10 psychic damage; if it passes, the spell ends for it.',
  ],
]);
