/**
 * content.js — Pure data + small-helper ES module for Shinsoku (神速)
 * Browser hack-and-slash MMORPG, 2015-era isometric feel.
 *
 * Exports:
 *   MONSTERS        — dictionary of 9 enemy definitions (kobold/lizardman/wraith/ogre/golem/skeleton/bat/spider/guardian)
 *   ITEM_OPTIONS    — array of droppable affix definitions
 *   AREAS           — dictionary of 6 area definitions forming a loop (grassland/forest/cave/temple/dungeon/dragon_lair)
 *   rollDrop(tier, rng)         — returns null | affix-object | gear-object
 *   spawnTableFor(playerLevel)  — returns weighted spawn array (fallback)
 *
 * NO DOM, NO canvas, NO imports. All randomness comes from injected rng().
 */

// ---------------------------------------------------------------------------
// 1. MONSTERS
//
// HP / ATK balance per tier (approximate):
//   tier 1 kobold:      50 HP,  6 atk  — trivial, packs of 2-4
//   tier 2 lizardman:   90 HP, 10 atk  — routine solo threat
//   tier 2 skeleton:    70 HP,  8 atk  — undead swordsman, sometimes paired
//   tier 2 bat:         40 HP,  7 atk  — fast flying pest, cave signature, packs of 2-4
//   tier 3 wraith:      55 HP,  9 atk  — fast & dodgy, punishes slow players
//   tier 3 spider:     110 HP, 13 atk  — forest ambusher, solo-or-pairs
//   tier 4 ogre:       220 HP, 22 atk  — beefy bruiser, punishes low HP
//   tier 4 guardian:   280 HP, 24 atk  — stone sentinel, temple signature, solo
//   tier 5 golem:      480 HP, 32 atk  — boss-tier, high defense wall
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

  // --- New signature creatures -------------------------------------------

  bat: {
    id:         "bat",
    name:       "コウモリ",
    sprite:     "bat",
    tier:       2,
    hpMax:      40,
    atk:        7,
    defense:    0,
    evade:      0.14,          // erratic flight makes it hard to hit
    xpReward:   14,
    speed:      2.2,           // fast — darts around the player
    scale:      0.7,           // tiny
    tint:       "#5a4a6a",     // dark purple-grey
    packMin:    2,
    packMax:    4,
    aggressive: true,          // swarms toward the player on detection
    senseRange: 5,
  },

  spider: {
    id:         "spider",
    name:       "大蜘蛛",
    sprite:     "spider",
    tier:       3,
    hpMax:      110,
    atk:        13,
    defense:    2,
    evade:      0.06,
    xpReward:   34,
    speed:      1.7,
    scale:      1.0,
    tint:       "#3a2e44",     // dark purple-brown
    packMin:    1,
    packMax:    2,
    aggressive: false,         // ambusher — stays still, retaliates when provoked
    senseRange: 0,
  },

  guardian: {
    id:         "guardian",
    name:       "ストーンガーディアン",
    sprite:     "guardian",
    tier:       4,
    hpMax:      280,
    atk:        24,
    defense:    10,
    evade:      0.02,
    xpReward:   70,
    speed:      0.85,          // slow heavy stone sentinel
    scale:      1.4,           // visibly larger than standard foes
    tint:       "#8a8270",     // sandstone
    packMin:    1,
    packMax:    1,
    aggressive: false,         // dormant until provoked
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
// Six areas forming a loop (player STARTS at grassland):
//   grassland → forest → cave → temple → dungeon → dragon_lair → grassland
//
// Each area has:
//   id, name, theme, kind, level, radius, spawn (weighted table), boss, next, prev
//
// kind:
//   "field"  — standard room; engine places boss at far end of room
//   "dragon" — activates the full dragon boss encounter (dragon_lair only)
//
// level (1-6): base difficulty; engine scales monster stats and drop
//   quality by (level + loop count).
//
// radius: bigger rooms so the player must scroll across to reach the boss.
//   field rooms ~16, dragon lair 18.
//
// Spawn weights use only the 7 valid sprite keys:
//   kobold, lizardman, wraith, ogre, golem, skeleton, dragon
//
// Every room has a boss object — the engine places it at the FAR end so
// it is not immediately visible on entry.
//
// Mid-boss xpReward scales with level (300 → 1 500) and HP climbs per room.
//
// Dragon balance (final room, level 6):
//   hpMax 120 000 — requires extensive farming to chip down
//   atk 95 raw    — painful per hit; defense gear matters
//   atkInterval 1.1 s — fast cadence; lifesteal becomes load-bearing
//   senseRange 9  — notices the player from across much of the lair
// ---------------------------------------------------------------------------

export const AREAS = {
  grassland: {
    id:     "grassland",
    name:   "草原",
    theme:  "grassland",
    kind:   "field",
    level:  1,
    radius: 16,
    // Signature: reptile plains — lizardmen and kobold skirmishers
    spawn: [
      { sprite: "lizardman", weight: 6 },
      { sprite: "kobold",    weight: 5 },
    ],
    // Mid-boss: giant ogre chieftain blocking the far end of the plain
    boss: {
      sprite:      "ogre",
      name:        "草原の巨王",
      hpMax:       900,
      atk:         26,
      defense:     4,
      xpReward:    300,
      scale:       2.4,
      tint:        "#a05040",   // dull red-brown
      senseRange:  6,
      atkInterval: 1.0,
    },
    next: "forest",
    prev: "dragon_lair",
  },

  forest: {
    id:     "forest",
    name:   "森林",
    theme:  "forest",
    kind:   "field",
    level:  2,
    radius: 16,
    // Signature: haunted wood — wraiths dominant, skeleton support, lizardman patrol, spider ambushers
    spawn: [
      { sprite: "wraith",    weight: 5 },
      { sprite: "skeleton",  weight: 4 },
      { sprite: "lizardman", weight: 2 },
      { sprite: "spider",    weight: 3 },  // forest signature
    ],
    // Mid-boss: oversized wraith lord — glass-cannon but massive HP pool
    boss: {
      sprite:      "wraith",
      name:        "森の死霊王",
      hpMax:       1100,
      atk:         30,
      defense:     0,
      xpReward:    600,
      scale:       2.6,
      tint:        "#c8b4e8",   // pale lavender, amplified
      senseRange:  7,
      atkInterval: 0.9,
    },
    next: "cave",
    prev: "grassland",
  },

  cave: {
    id:     "cave",
    name:   "洞窟",
    theme:  "cave",
    kind:   "field",
    level:  3,
    radius: 16,
    // Signature: underground den — bat swarms, kobold miners, skeleton sentinels, rare elite golem
    spawn: [
      { sprite: "kobold",   weight: 5 },
      { sprite: "skeleton", weight: 4 },
      { sprite: "golem",    weight: 1 },  // rare roaming guardian
      { sprite: "bat",      weight: 4 },  // cave signature
    ],
    // Mid-boss: ancient stone golem — high defense wall, needs good atk to crack
    boss: {
      sprite:      "golem",
      name:        "洞窟の主",
      hpMax:       2200,
      atk:         34,
      defense:     14,
      xpReward:    900,
      scale:       2.7,
      tint:        "#888890",   // grey stone
      senseRange:  5,
      atkInterval: 1.1,
    },
    next: "temple",
    prev: "forest",
  },

  temple: {
    id:     "temple",
    name:   "神殿",
    theme:  "temple",
    kind:   "field",
    level:  4,
    radius: 16,
    // Signature: desecrated temple — skeleton and wraith guardians, stone sentinels
    spawn: [
      { sprite: "skeleton",  weight: 6 },
      { sprite: "wraith",    weight: 5 },
      { sprite: "guardian",  weight: 2 },  // temple signature
    ],
    // Mid-boss: stone-gold ogre guardian — armored temple sentinel
    boss: {
      sprite:      "ogre",
      name:        "神殿の守護者",
      hpMax:       2600,
      atk:         40,
      defense:     10,
      xpReward:    1100,
      scale:       2.6,
      tint:        "#9a8a5a",   // stone-gold
      senseRange:  6,
      atkInterval: 1.0,
    },
    next: "dungeon",
    prev: "cave",
  },

  dungeon: {
    id:     "dungeon",
    name:   "地下牢",
    theme:  "dungeon",
    kind:   "field",
    level:  5,
    radius: 16,
    // Signature: underground prison — skeleton wardens, rare ogre brute, kobold runts
    spawn: [
      { sprite: "skeleton", weight: 6 },
      { sprite: "kobold",   weight: 3 },
      { sprite: "ogre",     weight: 1 },  // rare heavy patrol
    ],
    // Mid-boss: iron golem jailer — highest defense of mid-bosses
    boss: {
      sprite:      "golem",
      name:        "地下牢の獄長",
      hpMax:       3400,
      atk:         46,
      defense:     18,
      xpReward:    1500,
      scale:       2.9,
      tint:        "#6f6f78",   // dark iron-grey
      senseRange:  5,
      atkInterval: 1.1,
    },
    next: "dragon_lair",
    prev: "temple",
  },

  dragon_lair: {
    id:     "dragon_lair",
    name:   "竜の巣",
    theme:  "cave",
    kind:   "dragon",
    level:  6,
    radius: 18,
    // Light minion presence — mostly atmosphere; the dragon IS the content
    spawn: [
      { sprite: "wraith",   weight: 3 },
      { sprite: "skeleton", weight: 2 },
    ],
    // Ancient dragon — near-unkillable until the player has grinded
    // lifesteal + attack speed + gear deep into the field loops.
    // atk 95 raw: painful per hit but not one-shot at moderate defense.
    // atkInterval 1.1 s: hits fast — lifesteal becomes load-bearing.
    // hpMax 120 000: a long war of attrition, not a burst-down race.
    boss: {
      sprite:      "dragon",
      name:        "古龍 ヴァルガ",
      hpMax:       120000,
      atk:         95,
      defense:     22,
      xpReward:    50000,
      scale:       3.6,
      tint:        "#a83232",   // deep crimson
      senseRange:  9,
      atkInterval: 1.1,
    },
    next: "grassland",
    prev: "dungeon",
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
// New loot economy — NO raw stat (affix) drops. Three possible results:
//
//   null           — nothing dropped
//   kind:"potion"  — HP recovery item the player clicks to use
//   kind:"option"  — loose equipment option; player attaches it to gear
//   kind:"gear"    — full equipment piece (unchanged rollGear shape)
//
// DROP RATES by tier (absolute, not conditional):
//   tier 1: potion 55%, option  6%, gear  4%, null 35%
//   tier 2: potion 50%, option  9%, gear  7%, null 34%
//   tier 3: potion 40%, option 14%, gear 14%, null 32%
//   tier 4: potion 28%, option 18%, gear 24%, null 30%
//   tier 5: potion 18%, option 22%, gear 35%, null 25%
//   tier 6: potion  5%, option 30%, gear 55%, null 10%
//
// Loose option value scaling (same pool / bias as old affix logic):
//   base roll × (1 + (tier - 1) * 0.20)
//   tier1 → ×1.0, tier2 → ×1.2, tier3 → ×1.4, tier4 → ×1.6,
//   tier5 → ×1.8, tier6 → ×2.0
//
// Gear rarity bias inherited from rollGear (higher tier → more epic/legendary).
// ---------------------------------------------------------------------------

/**
 * _rollLooseOption(tier, rng) — build a kind:"option" object.
 * Weighted pool identical to old affix logic; stat/label/color from ITEM_OPTIONS.
 */
function _rollLooseOption(tier, rng) {
  // Weighted pool — mirrors old rollDrop affix selection bias.
  const pool = [
    ["atkspeed",      tier >= 3 ? 2 : 1],
    ["hpabsorb",      tier >= 3 ? 2 : 1],
    ["evasion",       1],
    ["flatAtk",       1],
    ["flatHp",        1],
    ["flatDef",       1],
  ];
  if (tier >= 4) {
    pool.push(["atkspeedRare", tier >= 5 ? 3 : 1]);
    pool.push(["hpabsorbRare", tier >= 5 ? 3 : 1]);
  }

  // Weighted pick.
  const totalWeight = pool.reduce((sum, [, w]) => sum + w, 0);
  let pick = rng() * totalWeight;
  let chosenId = pool[pool.length - 1][0];
  for (const [id, w] of pool) {
    pick -= w;
    if (pick <= 0) { chosenId = id; break; }
  }

  const opt = ITEM_OPTIONS.find(o => o.id === chosenId);

  // Value scales with tier: ×1.0 at tier1, ×2.0 at tier6.
  const scale = 1 + (Math.min(tier, 6) - 1) * 0.20;
  const rawMin = opt.rollMin * scale;
  const rawMax = opt.rollMax * scale;
  const value = Math.round(rawMin + rng() * (rawMax - rawMin));

  return {
    kind:   "option",
    stat:   opt.stat,
    value,
    suffix: opt.suffix,
    label:  opt.label,
    color:  opt.color,
    text:   `${opt.label}+${value}${opt.suffix}`,
  };
}

export function rollDrop(tier, rng) {
  const t = Math.min(Math.max(tier, 1), 6);

  // Absolute drop-rate table (potion, option, gear per tier).
  // Remaining probability is null.
  const RATES = [
    //  [potion, option, gear]
    [0.55, 0.06, 0.04],   // tier 1
    [0.50, 0.09, 0.07],   // tier 2
    [0.40, 0.14, 0.14],   // tier 3
    [0.28, 0.18, 0.24],   // tier 4
    [0.18, 0.22, 0.35],   // tier 5
    [0.05, 0.30, 0.55],   // tier 6 (bosses)
  ];

  const [pPotion, pOption, pGear] = RATES[t - 1];

  const roll = rng();

  if (roll < pPotion) {
    // HP potion — engine decides the heal amount.
    return { kind: "potion", color: "#6bff8a", text: "HP回復薬" };
  }

  if (roll < pPotion + pOption) {
    return _rollLooseOption(t, rng);
  }

  if (roll < pPotion + pOption + pGear) {
    return rollGear(t, rng);
  }

  return null;
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
