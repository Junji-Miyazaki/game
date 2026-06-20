/**
 * content.js — Pure data + small-helper ES module for Shinsoku (神速)
 * Browser hack-and-slash MMORPG, 2015-era isometric feel.
 *
 * Exports:
 *   MONSTERS        — dictionary of 5 enemy definitions
 *   ITEM_OPTIONS    — array of droppable affix definitions
 *   rollDrop(tier, rng)         — returns a drop object or null
 *   spawnTableFor(playerLevel)  — returns weighted spawn array
 *
 * NO DOM, NO canvas, NO imports. All randomness comes from injected rng().
 */

// ---------------------------------------------------------------------------
// 1. MONSTERS
//
// HP / ATK balance per tier (approximate):
//   tier 1 kobold:    50 HP,  6 atk  — trivial, packs of 2-4
//   tier 2 lizardman: 90 HP, 10 atk  — routine solo threat
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
    id:        "kobold",
    name:      "コボルト",
    sprite:    "kobold",
    tier:      1,
    hpMax:     50,
    atk:       6,
    defense:   0,
    evade:     0.04,          // almost never dodges
    xpReward:  8,
    speed:     1.4,           // scurries around but not fast
    scale:     0.75,          // tiny creature
    tint:      "#c8a46e",     // tan/brown
    packMin:   2,
    packMax:   4,
    aggressive: false,        // timid — never approaches; only retaliates
    senseRange: 0,
  },

  lizardman: {
    id:        "lizardman",
    name:      "リザードマン",
    sprite:    "lizardman",
    tier:      2,
    hpMax:     90,
    atk:       10,
    defense:   2,
    evade:     0.08,
    xpReward:  18,
    speed:     1.6,
    scale:     1.0,
    tint:      "#6fcf6f",     // green
    packMin:   1,
    packMax:   2,
    aggressive: false,        // territorial but won't chase; retaliates
    senseRange: 0,
  },

  wraith: {
    id:        "wraith",
    name:      "レイス",
    sprite:    "wraith",
    tier:      3,
    hpMax:     55,            // glass cannon — dies fast if hit
    atk:       9,
    defense:   0,
    evade:     0.32,          // very dodgy; the main threat IS the evasion
    xpReward:  30,
    speed:     2.4,           // fastest monster
    scale:     0.9,
    tint:      "#c8b4e8",     // pale lavender
    packMin:   1,
    packMax:   2,
    aggressive: false,        // drifts; only fights when provoked
    senseRange: 0,
  },

  ogre: {
    id:        "ogre",
    name:      "オーガ",
    sprite:    "ogre",
    tier:      4,
    hpMax:     220,
    atk:       22,
    defense:   5,
    evade:     0.04,
    xpReward:  60,
    speed:     1.0,           // slow lumbering tank
    scale:     1.4,           // visibly bigger
    tint:      "#a05040",     // dull red-brown
    packMin:   1,
    packMax:   1,
    aggressive: true,         // territorial — senses & lumbers toward the player
    senseRange: 5,
  },

  golem: {
    id:        "golem",
    name:      "ゴーレム",
    sprite:    "golem",
    tier:      5,
    hpMax:     480,
    atk:       32,
    defense:   12,            // high flat reduction; players need good atk
    evade:     0.02,
    xpReward:  150,
    speed:     0.7,           // very slow
    scale:     1.8,           // massive
    tint:      "#888890",     // grey stone
    packMin:   1,
    packMax:   1,
    aggressive: false,        // dormant guardian — wakes only when attacked
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
// 3. rollDrop(tier, rng)
//
// Drop chance table (approximate):
//   tier 1 → 25%
//   tier 2 → 40%
//   tier 3 → 58%
//   tier 4 → 75%
//   tier 5 → 90%
//
// Affix selection bias by tier:
//   tier 1-2: uniform across the 6 base options
//   tier 3:   atkspeed and hpabsorb each get 2× weight
//   tier 4:   atkspeedRare and hpabsorbRare become available (added to pool)
//   tier 5:   atkspeedRare/hpabsorbRare dominate (3× weight each)
//
// Value scaling: base roll value is scaled up by (1 + (tier - 1) * 0.15)
// so tier 5 values are 60% higher than tier 1 base rolls (clamped to rollMax
// for normal options; rare options already have higher ceilings).
// ---------------------------------------------------------------------------

export function rollDrop(tier, rng) {
  // --- 1. Drop chance --------------------------------------------------
  // dropChance = 0.25 + (tier - 1) * 0.1625  →  tier1=0.25, tier5=0.90
  const dropChance = 0.25 + (tier - 1) * 0.1625;
  if (rng() >= dropChance) return null;

  // --- 2. Build weighted affix pool -----------------------------------
  // Each entry: [optionId, weight]
  const pool = [];

  // Base options always present
  pool.push(["atkspeed",  tier >= 3 ? 2 : 1]);
  pool.push(["hpabsorb",  tier >= 3 ? 2 : 1]);
  pool.push(["evasion",   1]);
  pool.push(["flatAtk",   1]);
  pool.push(["flatHp",    1]);
  pool.push(["flatDef",   1]);

  // Rare options unlock at tier 4+
  if (tier >= 4) {
    pool.push(["atkspeedRare", tier >= 5 ? 3 : 1]);
    pool.push(["hpabsorbRare", tier >= 5 ? 3 : 1]);
  }

  // --- 3. Weighted pick -----------------------------------------------
  const totalWeight = pool.reduce((sum, [, w]) => sum + w, 0);
  let pick = rng() * totalWeight;
  let chosenId = pool[pool.length - 1][0]; // fallback
  for (const [id, w] of pool) {
    pick -= w;
    if (pick <= 0) { chosenId = id; break; }
  }

  // --- 4. Retrieve option definition ----------------------------------
  const opt = ITEM_OPTIONS.find(o => o.id === chosenId);
  // (opt is always found because pool only contains valid ids)

  // --- 5. Roll value with tier scaling --------------------------------
  // Scale factor: tier1 = 1.0, tier5 = 1.6
  const scale = 1 + (tier - 1) * 0.15;
  const rawMin = opt.rollMin * scale;
  const rawMax = opt.rollMax * scale;
  // Integer in [scaled min, scaled max]
  const value = Math.round(rawMin + rng() * (rawMax - rawMin));

  // --- 6. Build and return drop object --------------------------------
  return {
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
// 4. spawnTableFor(playerLevel)
//
// Level ranges and monster introduction:
//   Lv  1-4:  kobold only
//   Lv  5-9:  kobold (heavy) + lizardman (light)
//   Lv 10-14: kobold + lizardman (balanced) + wraith (light)
//   Lv 15-19: lizardman + wraith + ogre (light)
//   Lv 20-24: wraith + ogre + golem (rare)
//   Lv 25+:   wraith + ogre + golem (golem weight climbs)
//
// Weights are tuned so the player faces familiar enemies even as new ones
// appear, preventing sudden difficulty spikes from pure-new-enemy spawns.
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
      { sprite: "kobold",    weight: 5 },
      { sprite: "lizardman", weight: 4 },
      { sprite: "wraith",    weight: 1 },
    ];
  }

  if (lv <= 19) {
    return [
      { sprite: "kobold",    weight: 2 },
      { sprite: "lizardman", weight: 5 },
      { sprite: "wraith",    weight: 3 },
      { sprite: "ogre",      weight: 1 },
    ];
  }

  if (lv <= 24) {
    return [
      { sprite: "lizardman", weight: 2 },
      { sprite: "wraith",    weight: 5 },
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
