// Leitura automática do texto de uma ação de monstro do SRD (5.1 e 5.2) para a mecânica do motor.
// É só um ponto de partida: o build usa o resultado quando a habilidade traz `parse: true`, e tudo o que
// a regra escreve à mão tem prioridade. `report()` mostra o que foi lido para conferência.

const ABILITY = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};
const DAMAGE = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
];
const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
];

/** "for 1 minute" → 10 rodadas; "until the end of its next turn" → 1; sem prazo → 0 (até acabar). */
function rounds(text) {
  const m = /for (?:up to )?(\d+) (round|minute|hour|day)s?/i.exec(text);
  if (m) return Number(m[1]) * { round: 1, minute: 10, hour: 600, day: 14400 }[m[2].toLowerCase()];
  if (
    /until the (?:end|start) of (?:its|the dragon's|the \w+'s) next turn|until the end of the target's next turn/i.test(
      text,
    )
  )
    return 1;
  return 0;
}

export function parseAbility(desc, { section } = {}) {
  let text = desc.replace(/\*\*/g, '').replace(/\s+/g, ' ');
  if (section) {
    const i = text.indexOf(`${section}.`);
    if (i >= 0) {
      const rest = text.slice(i + section.length + 1);
      const j = rest.search(/\b[A-Z][A-Za-z' ]+ (?:Breath)\./);
      text = j > 0 ? rest.slice(0, j) : rest;
    }
  }
  const out = {};
  const notes = [];

  // ---- área ----
  let m;
  if (
    (m =
      /(?:targets?|one|a) (?:\w+ )?(?:creature|humanoid|target)[^.]{0,80}?within (\d+) (?:feet|ft)/i.exec(
        text,
      )) &&
    !/each creature/i.test(text.slice(0, m.index + 20)) &&
    !/cone|line that|radius|cube/i.test(text)
  ) {
    out.target = { kind: 'creature' };
    out.range = Number(m[1]);
  } else if (
    (m = /(\d+)[- ]?(?:foot|ft\.?)[- ]cone/i.exec(text)) ||
    (m = /cone[^.]*?(\d+)[- ]?(?:foot|ft)/i.exec(text))
  ) {
    out.target = { kind: 'cone', length: Number(m[1]) };
    out.range = 0;
  } else if (
    (m =
      /(\d+)[- ]?(?:foot|ft\.?)[- ]?(?:long )?line(?: that is| that's)? (\d+) ?(?:feet|ft\.?|foot)[- ]wide/i.exec(
        text,
      )) ||
    (m = /line (?:that is )?(\d+) ?(?:feet|ft\.?) long and (\d+) ?(?:feet|ft\.?) wide/i.exec(text))
  ) {
    out.target = { kind: 'line', length: Number(m[1]), width: Number(m[2]) };
    out.range = 0;
  } else if (
    (m = /(\d+)[- ]?(?:foot|ft\.?)[- ]radius(?: sphere)?/i.exec(text)) ||
    (m = /within (\d+) (?:feet|ft\.?) of (?:it|the \w+|him|her)/i.exec(text))
  ) {
    const radius = Number(m[1]);
    if (/centered on a point|point (?:it|the \w+) can see within|point within/i.test(text)) {
      const r = /within (\d+) (?:feet|ft\.?)/i.exec(text.replace(m[0], ''));
      out.target = { kind: 'sphere', radius };
      out.range = r ? Number(r[1]) : 60;
    } else {
      out.target = { kind: 'sphere', radius, self: true };
      out.range = 0;
    }
  } else if ((m = /(\d+)[- ]?(?:foot|ft\.?)[- ]cube/i.exec(text))) {
    out.target = { kind: 'cube', size: Number(m[1]), self: true };
    out.range = 0;
  }

  // ---- salvaguarda ----
  const dc =
    /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(
      text,
    ) ??
    /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)/i.exec(
      text,
    );
  let saveAb, saveDc;
  if (dc) {
    if (/^\d/.test(dc[1])) [saveDc, saveAb] = [Number(dc[1]), ABILITY[dc[2].toLowerCase()]];
    else [saveAb, saveDc] = [ABILITY[dc[1].toLowerCase()], Number(dc[2])];
  }

  // ---- dano ----
  const damage = [];
  const re = /\d+ \((\d+d\d+(?: ?[+-] ?\d+)?)\) (\w+) damage/gi;
  while ((m = re.exec(text))) {
    const type = m[2].toLowerCase();
    if (DAMAGE.includes(type)) damage.push({ dice: m[1].replace(/\s+/g, ''), type });
  }
  const half = /half as much damage|half damage/i.test(text);

  // ---- condições ----
  const conds = [];
  for (const c of CONDITIONS) {
    const rx = new RegExp(
      `\\b(?:be|is|becomes?|become|has the|ends up|are|and|fall|falls) (?:\\w+ )?${c}\\b|${c} condition|\\b${c} (?:for|until)`,
      'i',
    );
    const hit = rx.exec(text);
    if (hit) conds.push({ name: c, rounds: rounds(text.slice(hit.index)) });
  }

  if (saveAb) {
    out.resolution = { kind: 'save', ability: saveAb, onSave: half ? 'half' : 'none' };
    out.dc = saveDc;
  } else if (
    (m = /Attack(?: Roll)?: \+(\d+)/i.exec(text)) ||
    (m = /Weapon Attack: \+(\d+) to hit/i.exec(text))
  ) {
    out.resolution = { kind: 'attack' };
    out.attackBonus = Number(m[1]);
    const rg = /range (\d+)(?:\/(\d+))? ft/i.exec(text) ?? /reach (\d+) ft/i.exec(text);
    if (rg) out.range = Number(rg[1]);
  }
  if (damage.length) {
    out.damage = damage[0];
    if (damage.length > 1) out.extraDamage = damage.slice(1);
  }
  if (conds.length) out.condition = conds.length === 1 ? conds[0] : conds;
  if (!out.target && out.resolution?.kind === 'save') out.target = { kind: 'creature' };
  if (!out.target && out.resolution?.kind === 'attack') out.target = { kind: 'creature' };
  return { rule: out, notes };
}

export function report(rule) {
  const parts = [];
  if (rule.target) parts.push(JSON.stringify(rule.target));
  if (rule.resolution)
    parts.push(
      `${rule.resolution.kind}${rule.resolution.ability ? ':' + rule.resolution.ability : ''}${rule.resolution.onSave ? '/' + rule.resolution.onSave : ''}`,
    );
  if (rule.dc) parts.push(`DC${rule.dc}`);
  if (rule.attackBonus !== undefined) parts.push(`+${rule.attackBonus}`);
  if (rule.damage)
    parts.push(
      [rule.damage, ...(rule.extraDamage ?? [])].map((d) => `${d.dice} ${d.type}`).join(' + '),
    );
  if (rule.condition)
    parts.push(
      []
        .concat(rule.condition)
        .map((c) => `${c.name}${c.rounds ? '/' + c.rounds : ''}`)
        .join(','),
    );
  return parts.join(' · ');
}
