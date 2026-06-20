/**
 * content.js — Pure data + small-helper ES module for Shinsoku (神速)
 * Browser hack-and-slash MMORPG, 2015-era isometric feel.
 *
 * Exports:
 *   MONSTERS        — dictionary of 6 enemy definitions (kobold/lizardman/wraith/ogre/golem/skeleton)
 *   ITEM_OPTIONS    — array of droppable affix definitions
 *   AREAS           — dictionary of 3 area definitions forming a loop
 *   rollDrop(tier, rng)         — returns null | affix-object | gear-object
 *   spawnTableFor(playerLevel)  — returns weighted spawn array (fallback)
 *
 * NO DOM, NO canvas, NO imports. All randomness comes from injected rng().
 */

// ---------------------------------------------------------------------------
// 1. MONSTERS
//
// HP / ATK balance per tier (approximate):
//   tier 1 kobold:    50 HP,  6 atk  — trivial, packs of 2-4
//   tier 2 lizardman: 90 HP, 10 atk  — routine solo threat
//   tier 2 skeleton:  70 HP,  8 atk  — undead swordsman, sometimes paired
//   tier 3 wraith:    55 HP,  9 atk  — fast & dodgy, punishes slow players
//   tier 4 ogre:     220 HP, 22 atk  — beefy bruiser, punishes low HP
//   tier 5 golem:    480 HP, 32 atk  — boss-tier, high defense wall
//
// Defense is flat damage reduction applied before player damage.
// Evade is the probability this monster dodges the PLAYER's hit.
// Speed is tiles/sec; wraith fastest, golem slowest.
// ---------------------------------------------------------------------------

export const MONSTERS = {
  kobold: {
    id:         "kobold",
    name:       "コボルト",
    sprite:     "kobold",
    tier:       1,
    hpMax:      50,
    atk:        6,
    defense:    0,
    evade:      0.04,          // almost never dodges
    xpReward:   8,
    speed:      1.4,           // scurries around but not fast
    scale:      0.75,          // tiny creature
    tint:       "#c8a46e",     // tan/brown
    packMin:    2,
    packMax:    4,
    aggressive: false,         // timid — never approaches; only retaliates
    senseRange: 0,
  },

  lizardman: {
    id:         "lizardman",
    name:       "リザードマン",
    sprite:     "lizardman",
    tier:       2,
    hpMax:      90,
    atk:        10,
    defense:    2,
    evade:      0.08,
    xpReward:   18,
    speed:      1.6,
    scale:      1.0,
    tint:       "#6fcf6f",     // green
    packMin:    1,
    packMax:    2,
    aggressive: false,         // territorial but won't chase; retaliates
    senseRange: 0,
  },

  skeleton: {
    id:         "skeleton",
    name:       "スケルトン",
    sprite:     "skeleton",
    tier:       2,
    hpMax:      70,
    atk:        8,
    defense:    1,
    evade:      0.10,          // light frame makes it slightly evasive
    xpReward:   20,
    speed:      1.5,           // measured, deliberate stride
    scale:      0.95,
    tint:       "#d9d2c2",     // pale bone
    packMin:    1,
    packMax:    2,             // sometimes in pairs
    aggressive: false,         // dormant undead — retaliates when attacked
    senseRange: 0,
  },

  wraith: {
    id:         "wraith",
    name:       "レイス",
    sprite:     "wraith",
    tier:       3,
    hpMax:      55,            // glass cannon — dies fast if hit
    atk:        9,
    defense:    0,
    evade:      0.32,          // very dodgy; the main threat IS the evasion
    xpReward:   30,
    speed:      2.4,           // fastest monster
    scale:      0.9,
    tint:       "#c8b4e8",     // pale lavender
    packMin:    1,
    packMax:    2,
    aggressive: false,         // drifts; only fights when provoked
    senseRange: 0,
  },

  ogre: {
    id:         "ogre",
    name:       "オーガ",
    sprite:     "ogre",
    tier:       4,
    hpMax:      220,
    atk:        22,
    defense:    5,
    evade:      0.04,
    xpReward:   60,
    speed:      1.0,           // slow lumbering tank
    scale:      1.4,           // visibly bigger
    tint:       "#a05040",     // dull red-brown
    packMin:    1,
    packMax:    1,
    aggressive: true,          // territorial — senses & lumbers toward the player
    senseRange: 5,
  },

  golem: {
    id:         "golem",
    name:       "ゴーレム",
    sprite:     "golem",
    tier:       5,
    hpMax:      480,
    atk:        32,
    defense:    12,            // high flat reduction; players need good atk
    evade:      0.02,
    xpReward:   150,
    speed:      0.7,           // very slow
    scale:      1.8,           // massive
    tint:       "#888890",     // grey stone
    packMin:    1,
    packMax:    1,
    aggressive: false,         // dormant guardian — wakes only when attacked
    senseRange: 0,
  },
};

// ---------------------------------------------------------------------------
// 2. ITEM_OPTIONS
//
// Six canonical affixes (one per allowed stat key) plus two "rare" variants
// that provide larger rolls on the same stat key for late-game loot fantasy.
//
// Balance intent:
//   atkSpeedPct: rolls 3-9 per drop; with ~10+ stacks the player can push
//                past 8 attacks/sec and eventually toward 60-100 attacks/sec
//                at extreme stack counts. Higher tiers get a ×tier multiplier
//                inside rollDrop so values naturally climb.
//   hpAbsorbPct: rolls 2-6%; even 15-20% total lifesteal makes ogre/golem
//                tankable at the cost of heavy farming.
//   evasionPct:  rolls 2-7%; stacking lets the player mirror wraith's tactic.
//   atk (flat):  rolls 2-8; small but adds up.
//   hpMax (flat):rolls 15-40; meaningful early, less so late.
//   defense:     rolls 1-5; helps absorb golem hits.
//   atkSpeedPct RARE: 6-16% — same key, just higher rolls for rarer tier5
//   hpAbsorbPct RARE: 4-10% — same key, rare high lifesteal rolls
// ---------------------------------------------------------------------------

export const ITEM_OPTIONS = [
  {
    id:       "atkspeed",
    slot:     "sword",
    stat:     "atkSpeedPct",
    label:    "攻撃速度",
    color:    "#ffd24a",
    rollMin:  3,
    rollMax:  9,
    suffix:   "%",
  },
  {
    id:       "hpabsorb",
    slot:     "armor",
    stat:     "hpAbsorbPct",
    label:    "HP吸収",
    color:    "#ff6b6b",
    rollMin:  2,
    rollMax:  6,
    suffix:   "%",
  },
  {
    id:       "evasion",
    slot:     "shield",
    stat:     "evasionPct",
    label:    "回避率",
    color:    "#7ecbf7",
    rollMin:  2,
    rollMax:  7,
    suffix:   "%",
  },
  {
    id:       "flatAtk",
    slot:     "stat",
    stat:     "atk",
    label:    "攻撃力",
    color:    "#ff9944",
    rollMin:  2,
    rollMax:  8,
    suffix:   "",
  },
  {
    id:       "flatHp",
    slot:     "stat",
    stat:     "hpMax",
    label:    "最大HP",
    color:    "#66dd88",
    rollMin:  15,
    rollMax:  40,
    suffix:   "",
  },
  {
    id:       "flatDef",
    slot:     "stat",
    stat:     "defense",
    label:    "防御力",
    color:    "#aaaacc",
    rollMin:  1,
    rollMax:  5,
    suffix:   "",
  },
  // Rare high-roll variants (same stat keys, higher rolls — obtained from
  // tier-4/5 drops via bias in rollDrop).
  {
    id:       "atkspeedRare",
    slot:     "sword",
    stat:     "atkSpeedPct",
    label:    "迅速の刃",
    color:    "#ffe877",
    rollMin:  6,
    rollMax:  16,
    suffix:   "%",
  },
  {
    id:       "hpabsorbRare",
    slot:     "armor",
    stat:     "hpAbsorbPct",
    label:    "吸血の鎧",
    color:    "#ff3355",
    rollMin:  4,
    rollMax:  10,
    suffix:   "%",
  },
];

// ---------------------------------------------------------------------------
// 3. AREAS
//
// Three areas forming a loop: dungeon → grassland → forest → dungeon
//
// Each area has:
//   id, name, theme, radius, spawn (weighted table), boss, next, prev
//
// Spawn weights use only the 6 valid sprite keys:
//   kobold, lizardman, wraith, ogre, golem, skeleton
//
// Boss balance:
//   dungeon  / 封印の守護者  — highest defense, meant to wall unprepared players
//   grassland/ 草原の巨王    — huge HP pool, medium defense, straightforward
//   forest   / 森の死霊王    — glass-cannon wraith scaled to boss stats; big HP,
//                             very high evasion implied (renderer should apply
//                             wraith evade model), lethal atk
// ---------------------------------------------------------------------------

export const AREAS = {
  dungeon: {
    id:     "dungeon",
    name:   "地下牢",
    theme:  "dungeon",
    radius: 11,
    spawn: [
      { sprite: "kobold",    weight: 5 },
      { sprite: "lizardman", weight: 4 },
      { sprite: "wraith",    weight: 2 },
      { sprite: "skeleton",  weight: 1 },
    ],
    boss: {
      sprite:    "golem",
      name:      "七つの封印の守護者",
      hpMax:     2400,
      atk:       34,
      defense:   18,           // heavily armoured — players need good atk to chip through
      xpReward:  1200,
      scale:     2.8,
      tint:      "#666070",    // darker, more ancient stone than a regular golem
    },
    next: "grassland",
    prev: "forest",
  },

  grassland: {
    id:     "grassland",
    name:   "草原",
    theme:  "grassland",
    radius: 14,
    spawn: [
      { sprite: "kobold",    weight: 4 },
      { sprite: "lizardman", weight: 4 },
      { sprite: "skeleton",  weight: 4 },
      { sprite: "wraith",    weight: 1 },
    ],
    boss: {
      sprite:    "ogre",
      name:      "草原の巨王",
      hpMax:     1800,
      atk:       38,
      defense:   8,
      xpReward:  800,
      scale:     2.6,
      tint:      "#a05040",
    },
    next: "forest",
    prev: "dungeon",
  },

  forest: {
    id:     "forest",
    name:   "深森",
    theme:  "forest",
    radius: 13,
    spawn: [
      { sprite: "skeleton",  weight: 5 },
      { sprite: "wraith",    weight: 5 },
      { sprite: "lizardman", weight: 3 },
      { sprite: "ogre",      weight: 1 },
    ],
    boss: {
      sprite:    "wraith",
      name:      "森の死霊王",
      hpMax:     1400,         // glass-cannon model: big HP, no defense, dies to burst
      atk:       42,           // lethal — forces the player to kite
      defense:   0,
      xpReward:  900,
      scale:     2.4,
      tint:      "#5a3080",    // deep indigo — visibly different from regular wraith
    },
    next: "dungeon",
    prev: "grassland",
  },
};

// ---------------------------------------------------------------------------
// 4. Gear generation helpers
//
// Slot → eligible affixes:
//   sword:  atkSpeedPct (攻撃速度, "%"), atk (攻撃力, "")
//   shield: evasionPct  (回避率, "%"),   defense (防御力, "")
//   armor:  hpAbsorbPct (HP吸収, "%"),   hpMax (最大HP, ""), defense (防御力, "")
//
// Rarity → option count + roll magnitude multiplier:
//   common    (1 opt, ×1.0)
//   rare      (2 opt, ×1.3)
//   epic      (3 opt, ×1.6)
//   legendary (3 opt, ×2.2)
// ---------------------------------------------------------------------------

// Internal tables — not exported; used only by rollGear / rollDrop.

const _GEAR_SLOTS = ["sword", "shield", "armor"];

const _SLOT_AFFIXES = {
  sword: [
    { stat: "atkSpeedPct", label: "攻撃速度", suffix: "%", rollMin: 4,  rollMax: 12 },
    { stat: "atk",         label: "攻撃力",   suffix: "",  rollMin: 3,  rollMax: 10 },
  ],
  shield: [
    { stat: "evasionPct",  label: "回避率",   suffix: "%", rollMin: 3,  rollMax: 9  },
    { stat: "defense",     label: "防御力",   suffix: "",  rollMin: 2,  rollMax: 7  },
  ],
  armor: [
    { stat: "hpAbsorbPct", label: "HP吸収",   suffix: "%", rollMin: 2,  rollMax: 8  },
    { stat: "hpMax",       label: "最大HP",   suffix: "",  rollMin: 20, rollMax: 60 },
    { stat: "defense",     label: "防御力",   suffix: "",  rollMin: 2,  rollMax: 7  },
  ],
};

// Japanese name tables by slot × rarity for themed gear names.
const _GEAR_NAMES = {
  sword: {
    common:    ["鉄の剣", "古びた刃", "骨の剣"],
    rare:      ["業炎の剣", "銀の太刀", "霜刃"],
    epic:      ["覇者の剣", "天狗刃", "魔剣カゲロウ"],
    legendary: ["神速丸", "断界の刃", "天地覇剣"],
  },
  shield: {
    common:    ["木の盾", "革の円盾", "錆びた盾"],
    rare:      ["鋼鉄の盾", "月影の楯", "骨盾"],
    epic:      ["守護の盾", "神域の楯", "霊鏡盾"],
    legendary: ["不壊の盾", "天の楯", "虚空防壁"],
  },
  armor: {
    common:    ["革の鎧", "鎖帷子", "ぼろ衣"],
    rare:      ["鉄の鎧", "吸血の胴", "骨鎧"],
    epic:      ["竜鱗の鎧", "霊鎧", "死神の衣"],
    legendary: ["不滅の鎧", "天界の甲冑", "覇王の外套"],
  },
};

const _RARITY_COLOR = {
  common:    "#c8c8c8",
  rare:      "#4ab8ff",
  epic:      "#cc66ff",
  legendary: "#ffd700",
};

const _RARITY_OPTS = {
  common:    { count: 1, mult: 1.0 },
  rare:      { count: 2, mult: 1.3 },
  epic:      { count: 3, mult: 1.6 },
  legendary: { count: 3, mult: 2.2 },
};

/**
 * rollGear(tier, rng) — internal helper.
 * Returns a gear drop object. Not exported.
 *
 * @param {number} tier  — monster tier (1-6)
 * @param {Function} rng — () => [0,1)
 * @returns {object} gear object
 */
function rollGear(tier, rng) {
  // --- Pick slot ------------------------------------------------------
  const slotIdx = Math.floor(rng() * _GEAR_SLOTS.length);
  const slot = _GEAR_SLOTS[slotIdx];

  // --- Pick rarity based on tier ------------------------------------
  // Cumulative probability thresholds by tier:
  //   tier 1: common 70%, rare 25%, epic 4%, legendary 1%
  //   tier 3: common 45%, rare 35%, epic 15%, legendary 5%
  //   tier 5: common 15%, rare 35%, epic 35%, legendary 15%
  //   tier 6: common  5%, rare 20%, epic 40%, legendary 35%
  const t = Math.min(tier, 6);
  // Linear interpolation for each boundary
  // pLegendary: tier1=0.01 → tier6=0.35
  const pLeg  = 0.01 + (t - 1) * (0.34 / 5);
  // pEpic+: tier1=0.05 → tier6=0.75
  const pEpicPlus = 0.05 + (t - 1) * (0.70 / 5);
  // pRare+: tier1=0.30 → tier6=0.95
  const pRarePlus = 0.30 + (t - 1) * (0.65 / 5);

  let rarity;
  const r = rng();
  if (r < pLeg)          rarity = "legendary";
  else if (r < pEpicPlus) rarity = "epic";
  else if (r < pRarePlus) rarity = "rare";
  else                    rarity = "common";

  // --- Pick name ------------------------------------------------------
  const namePool = _GEAR_NAMES[slot][rarity];
  const name = namePool[Math.floor(rng() * namePool.length)];

  // --- Roll options ---------------------------------------------------
  const { count, mult } = _RARITY_OPTS[rarity];
  const affixPool = _SLOT_AFFIXES[slot].slice(); // copy so we can splice
  const options = [];

  // For epic/legendary with 3 options but sword only has 2 affixes,
  // allow repeating the last affix with a slightly different roll.
  const actualCount = Math.min(count, affixPool.length + (affixPool.length < count ? 1 : 0));

  for (let i = 0; i < actualCount; i++) {
    // Pick from remaining pool (no repeats if pool allows)
    let pickIdx;
    if (affixPool.length === 0) {
      // Repeat a random affix from the slot table (only happens for 3-opt sword)
      const fallbackPool = _SLOT_AFFIXES[slot];
      pickIdx = Math.floor(rng() * fallbackPool.length);
      const affix = fallbackPool[pickIdx];
      const scaledMin = affix.rollMin * mult;
      const scaledMax = affix.rollMax * mult;
      const value = Math.round(scaledMin + rng() * (scaledMax - scaledMin));
      options.push({ stat: affix.stat, value, suffix: affix.suffix, label: affix.label });
    } else {
      pickIdx = Math.floor(rng() * affixPool.length);
      const affix = affixPool.splice(pickIdx, 1)[0];
      const scaledMin = affix.rollMin * mult;
      const scaledMax = affix.rollMax * mult;
      const value = Math.round(scaledMin + rng() * (scaledMax - scaledMin));
      options.push({ stat: affix.stat, value, suffix: affix.suffix, label: affix.label });
    }
  }

  // --- Build text string ---------------------------------------------
  const optText = options
    .map(o => `${o.label}+${o.value}${o.suffix}`)
    .join(" / ");
  const text = `${name}  ${optText}`;

  return {
    kind:    "gear",
    slot,
    name,
    rarity,
    color:   _RARITY_COLOR[rarity],
    options,
    text,
  };
}

// ---------------------------------------------------------------------------
// 5. rollDrop(tier, rng)
//
// Drop chance table (approximate):
//   tier 1 → 25%
//   tier 2 → 40%
//   tier 3 → 58%
//   tier 4 → 75%
//   tier 5 → 90%
//   tier 6 → 98%  (boss)
//
// Gear vs affix split by tier:
//   tier 1: 10% gear, 90% affix
//   tier 3: 30% gear, 70% affix
//   tier 5: 60% gear, 40% affix
//   tier 6: 85% gear, 15% affix  (almost always gear from bosses)
//
// Affix selection bias by tier (unchanged from original):
//   tier 1-2: uniform across the 6 base options
//   tier 3:   atkspeed and hpabsorb each get 2× weight
//   tier 4:   atkspeedRare and hpabsorbRare become available (added to pool)
//   tier 5:   atkspeedRare/hpabsorbRare dominate (3× weight each)
//
// Value scaling: base roll value is scaled up by (1 + (tier - 1) * 0.15)
// so tier 5 values are 60% higher than tier 1 base rolls.
// ---------------------------------------------------------------------------

export function rollDrop(tier, rng) {
  // --- 1. Drop chance --------------------------------------------------
  // tier1=0.25, tier5=0.90, tier6=0.98 (boss)
  const t = Math.min(tier, 6);
  const dropChance = t <= 5
    ? 0.25 + (t - 1) * 0.1625          // tier1=0.25 … tier5=0.90
    : 0.98;                              // tier6 (boss) near-certain
  if (rng() >= dropChance) return null;

  // --- 2. Decide gear vs affix ----------------------------------------
  // gearChance: tier1=0.10, tier5=0.60, tier6=0.85
  const gearChance = t <= 5
    ? 0.10 + (t - 1) * 0.125
    : 0.85;

  if (rng() < gearChance) {
    return rollGear(tier, rng);
  }

  // --- 3. Build weighted affix pool (original logic, unchanged) --------
  const pool = [];

  pool.push(["atkspeed",  tier >= 3 ? 2 : 1]);
  pool.push(["hpabsorb",  tier >= 3 ? 2 : 1]);
  pool.push(["evasion",   1]);
  pool.push(["flatAtk",   1]);
  pool.push(["flatHp",    1]);
  pool.push(["flatDef",   1]);

  if (tier >= 4) {
    pool.push(["atkspeedRare", tier >= 5 ? 3 : 1]);
    pool.push(["hpabsorbRare", tier >= 5 ? 3 : 1]);
  }

  // --- 4. Weighted pick -----------------------------------------------
  const totalWeight = pool.reduce((sum, [, w]) => sum + w, 0);
  let pick = rng() * totalWeight;
  let chosenId = pool[pool.length - 1][0]; // fallback
  for (const [id, w] of pool) {
    pick -= w;
    if (pick <= 0) { chosenId = id; break; }
  }

  // --- 5. Retrieve option definition ----------------------------------
  const opt = ITEM_OPTIONS.find(o => o.id === chosenId);

  // --- 6. Roll value with tier scaling --------------------------------
  const scale = 1 + (tier - 1) * 0.15;
  const rawMin = opt.rollMin * scale;
  const rawMax = opt.rollMax * scale;
  const value = Math.round(rawMin + rng() * (rawMax - rawMin));

  // --- 7. Return affix object (with kind:"affix" tag) -----------------
  return {
    kind:     "affix",
    optionId: opt.id,
    slot:     opt.slot,
    stat:     opt.stat,
    label:    opt.label,
    value:    value,
    color:    opt.color,
    suffix:   opt.suffix,
    text:     `${opt.label} +${value}${opt.suffix}`,
  };
}

// ---------------------------------------------------------------------------
// 6. spawnTableFor(playerLevel)
//
// Kept as a fallback — AREAS.*.spawn is the primary source. The engine may
// still call spawnTableFor when no area context is available.
//
// Level ranges and monster introduction:
//   Lv  1-4:  kobold only
//   Lv  5-9:  kobold (heavy) + lizardman (light)
//   Lv 10-14: kobold + lizardman (balanced) + wraith + skeleton (light)
//   Lv 15-19: lizardman + wraith + skeleton + ogre (light)
//   Lv 20-24: wraith + skeleton + ogre + golem (rare)
//   Lv 25+:   wraith + ogre + golem (golem weight climbs)
// ---------------------------------------------------------------------------

export function spawnTableFor(playerLevel) {
  const lv = Math.max(1, Math.floor(playerLevel));

  if (lv <= 4) {
    return [
      { sprite: "kobold", weight: 10 },
    ];
  }

  if (lv <= 9) {
    return [
      { sprite: "kobold",    weight: 8 },
      { sprite: "lizardman", weight: 2 },
    ];
  }

  if (lv <= 14) {
    return [
      { sprite: "kobold",    weight: 4 },
      { sprite: "lizardman", weight: 3 },
      { sprite: "skeleton",  weight: 2 },
      { sprite: "wraith",    weight: 1 },
    ];
  }

  if (lv <= 19) {
    return [
      { sprite: "kobold",    weight: 1 },
      { sprite: "lizardman", weight: 4 },
      { sprite: "skeleton",  weight: 3 },
      { sprite: "wraith",    weight: 2 },
      { sprite: "ogre",      weight: 1 },
    ];
  }

  if (lv <= 24) {
    return [
      { sprite: "lizardman", weight: 1 },
      { sprite: "skeleton",  weight: 2 },
      { sprite: "wraith",    weight: 4 },
      { sprite: "ogre",      weight: 4 },
      { sprite: "golem",     weight: 1 },
    ];
  }

  // Lv 25+ — late game; golem weight scales with level past 25
  const golemBonus = Math.min(lv - 25, 6); // caps at +6 extra weight (lv 31+)
  return [
    { sprite: "wraith",    weight: 3 },
    { sprite: "ogre",      weight: 5 },
    { sprite: "golem",     weight: 2 + golemBonus },
  ];
}
