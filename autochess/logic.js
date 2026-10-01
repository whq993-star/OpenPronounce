/* 星铸 — auto battler rules, economy, and combat. No DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.AutoChess = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const COLS = 7;
  const ROWS = 8;
  const PLAYER_ROWS = 4;
  const BENCH = 9;
  const XP_NEED = { 1: 2, 2: 2, 3: 4, 4: 6, 5: 10, 6: 12, 7: 16, 8: 20 };
  const ODDS = {
    1: [100, 0, 0, 0, 0],
    2: [80, 20, 0, 0, 0],
    3: [60, 30, 10, 0, 0],
    4: [40, 35, 20, 5, 0],
    5: [25, 35, 30, 10, 0],
    6: [18, 28, 32, 18, 4],
    7: [12, 20, 30, 28, 10],
    8: [10, 15, 25, 30, 20],
    9: [5, 10, 15, 30, 40],
  };
  const POOL_SIZE = { 1: 18, 2: 15, 3: 13, 4: 10, 5: 9 };
  const STAR_COPIES = { 1: 1, 2: 3, 3: 9 };
  const DIRS = [
    [1, -1, 0],
    [1, 0, -1],
    [0, 1, -1],
    [-1, 1, 0],
    [-1, 0, 1],
    [0, -1, 1],
  ];

  const ORIGIN_NAME = {
    flame: "焰庭",
    tide: "潮汐",
    grove: "森灵",
    iron: "钢盟",
    shadow: "影契",
    star: "星咏",
  };
  const CLASS_NAME = {
    warrior: "战士",
    marksman: "射手",
    mage: "法师",
    guardian: "守卫",
    assassin: "刺客",
    support: "辅助",
  };

  const TRAITS = {
    flame: {
      name: "焰庭",
      kind: "origin",
      color: "#e25b45",
      blurb: "焰庭的攻击会灼烧目标。",
      steps: [
        { n: 2, burn: 0.06, text: "2 秒内灼烧 6% 最大生命" },
        { n: 3, burn: 0.1, text: "2 秒内灼烧 10% 最大生命" },
        { n: 4, burn: 0.16, adMul: 1.2, text: "灼烧 16% 最大生命，攻击 +20%" },
      ],
    },
    tide: {
      name: "潮汐",
      kind: "origin",
      color: "#3aa7c9",
      blurb: "潮汐会持续治疗自己。",
      steps: [
        { n: 2, healPct: 0.03, text: "每 3 秒回复 3% 最大生命" },
        { n: 3, healPct: 0.05, text: "每 3 秒回复 5% 最大生命" },
        { n: 4, healPct: 0.07, ap: 20, text: "每 3 秒回复 7% 最大生命，法强 +20" },
      ],
    },
    grove: {
      name: "森灵",
      kind: "origin",
      color: "#6aaa45",
      blurb: "森灵攻速更快。",
      steps: [
        { n: 2, asMul: 1.2, text: "攻速 +20%" },
        { n: 3, asMul: 1.45, text: "攻速 +45%" },
        { n: 4, asMul: 1.7, adMul: 1.15, text: "攻速 +70%，攻击 +15%" },
      ],
    },
    iron: {
      name: "钢盟",
      kind: "origin",
      color: "#c4bfb4",
      blurb: "钢盟获得额外护甲。",
      steps: [
        { n: 2, armor: 25, text: "护甲 +25" },
        { n: 3, armor: 45, text: "护甲 +45" },
        { n: 4, armor: 70, startShieldPct: 0.12, text: "护甲 +70，开场 12% 生命护盾" },
      ],
    },
    shadow: {
      name: "影契",
      kind: "origin",
      color: "#8d6ad8",
      blurb: "影契更容易打出暴击。",
      steps: [
        { n: 2, crit: 0.2, critMult: 1.5, text: "暴击率 +20%，暴伤 150%" },
        { n: 3, crit: 0.35, critMult: 1.75, text: "暴击率 +35%，暴伤 175%" },
        { n: 4, crit: 0.5, critMult: 2, adMul: 1.15, text: "暴击率 +50%，暴伤 200%，攻击 +15%" },
      ],
    },
    star: {
      name: "星咏",
      kind: "origin",
      color: "#e2b657",
      blurb: "星咏以法力开场，技能更强。",
      steps: [
        { n: 2, ap: 25, mana: 15, text: "法强 +25，开场法力 +15" },
        { n: 3, ap: 45, mana: 30, text: "法强 +45，开场法力 +30" },
        { n: 4, ap: 75, mana: 50, text: "法强 +75，开场法力 +50" },
      ],
    },
    warrior: {
      name: "战士",
      kind: "class",
      color: "#d07a4a",
      blurb: "战士更耐打。",
      steps: [
        { n: 2, armor: 20, text: "护甲 +20" },
        { n: 4, armor: 45, text: "护甲 +45" },
      ],
    },
    marksman: {
      name: "射手",
      kind: "class",
      color: "#d2c07a",
      blurb: "射手的普通攻击更凶。",
      steps: [
        { n: 2, adMul: 1.2, text: "攻击 +20%" },
        { n: 3, adMul: 1.4, asMul: 1.25, range: 1, text: "攻击 +40%，攻速 +25%，射程 +1" },
      ],
    },
    mage: {
      name: "法师",
      kind: "class",
      color: "#6aa7e8",
      blurb: "法师的技能伤害更高。",
      steps: [
        { n: 2, ap: 30, text: "法强 +30" },
        { n: 4, ap: 60, manaOnCast: 20, text: "法强 +60，施法后回复 20 法力" },
      ],
    },
    guardian: {
      name: "守卫",
      kind: "class",
      color: "#8aa0b4",
      blurb: "守卫拥有更多生命。",
      steps: [
        { n: 2, hpMul: 1.18, text: "生命 +18%" },
        { n: 4, hpMul: 1.38, text: "生命 +38%" },
      ],
    },
    assassin: {
      name: "刺客",
      kind: "class",
      color: "#c45b8a",
      blurb: "刺客开场切入后排。",
      steps: [
        { n: 2, assassin: true, crit: 0.15, text: "跃至后排，暴击率 +15%" },
        { n: 4, assassin: true, crit: 0.35, adMul: 1.2, text: "跃至后排，暴击率 +35%，攻击 +20%" },
      ],
    },
    support: {
      name: "辅助",
      kind: "class",
      color: "#7dcaa5",
      blurb: "辅助强化治疗与护盾。",
      steps: [
        { n: 2, healPower: 1.3, text: "治疗和护盾 +30%" },
        { n: 3, healPower: 1.6, teamShield: 280, text: "治疗和护盾 +60%，我方开场 280 护盾" },
      ],
    },
  };

  const TRAIT_ORDER = [
    "flame",
    "tide",
    "grove",
    "iron",
    "shadow",
    "star",
    "warrior",
    "marksman",
    "mage",
    "guardian",
    "assassin",
    "support",
  ];

  const ITEMS = {
    blade: { name: "炎刃", glyph: "刃", color: "#e25b45", stat: "ad", value: 0.25, desc: "攻击力 +25%" },
    vest: { name: "铁衣", glyph: "甲", color: "#c4bfb4", stat: "armor", value: 30, desc: "护甲 +30" },
    rod: { name: "星杖", glyph: "杖", color: "#6aa7e8", stat: "ap", value: 40, desc: "法强 +40" },
    bow: { name: "疾弦", glyph: "弦", color: "#d2c07a", stat: "as", value: 0.35, desc: "攻速 +35%" },
    belt: { name: "巨带", glyph: "带", color: "#d07a4a", stat: "hp", value: 0.3, desc: "生命 +30%" },
    tear: { name: "法滴", glyph: "滴", color: "#3aa7c9", stat: "mana", value: 30, desc: "开场法力 +30" },
    vamp: { name: "噬咬", glyph: "噬", color: "#c45b8a", stat: "ls", value: 0.18, desc: "生命偷取 18%" },
    glove: { name: "影刺", glyph: "刺", color: "#8d6ad8", stat: "crit", value: 0.25, desc: "暴击率 +25%" },
  };

  function eff() {
    return Array.from(arguments);
  }

  const ABILITIES = {
    shield: {
      name: "盾击",
      text: "获得自身 18% 最大生命的护盾，并嘲讽周围敌人 2.4 秒。",
      effects: eff({ kind: "shield", target: "self", pct: 0.18 }, { kind: "taunt", time: 2.4 }),
    },
    mend: {
      name: "治愈",
      text: "治疗生命比例最低的友军。",
      effects: eff({ kind: "heal", target: "lowestAlly", flat: 150, ap: 0.45 }),
    },
    gale: {
      name: "疾风",
      text: "自身攻速提高 70%，持续 4 秒。",
      effects: eff({ kind: "as", mult: 0.7, time: 4 }),
    },
    wall: {
      name: "铁壁",
      text: "护甲提高 40，并获得 12% 生命护盾，持续 4 秒。",
      effects: eff({ kind: "armor", amount: 40, time: 4 }, { kind: "shield", target: "self", pct: 0.12 }),
    },
    backstab: {
      name: "背刺",
      text: "跃向最脆弱的敌人，造成 190% 攻击的物理伤害。",
      effects: eff({ kind: "jump", target: "lowest" }, { kind: "damage", target: "lowest", ad: 1.9 }),
    },
    bolt: {
      name: "星弹",
      text: "对当前目标发射星弹，造成魔法伤害。",
      effects: eff({ kind: "damage", target: "current", magic: 190, ap: 0.55 }),
    },
    blaze: {
      name: "焰步",
      text: "灼烧相邻敌人，造成魔法伤害。",
      effects: eff(
        { kind: "damage", target: "adjacent", magic: 100, ap: 0.35 },
        { kind: "burn", target: "adjacent", pct: 0.04 }
      ),
    },
    cleave: {
      name: "斩潮",
      text: "对当前目标造成 170% 攻击的伤害，并治疗自己。",
      effects: eff(
        { kind: "damage", target: "current", ad: 1.7 },
        { kind: "heal", target: "self", flat: 130, ap: 0.3 }
      ),
    },
    root: {
      name: "缠根",
      text: "缠住当前目标，造成魔法伤害并眩晕 1.6 秒。",
      effects: eff(
        { kind: "damage", target: "current", magic: 140, ap: 0.35 },
        { kind: "stun", target: "current", time: 1.6 }
      ),
    },
    shred: {
      name: "破甲",
      text: "射击当前目标，造成 165% 攻击的伤害并削减 25 护甲。",
      effects: eff(
        { kind: "damage", target: "current", ad: 1.65 },
        { kind: "shred", target: "current", amount: 25 }
      ),
    },
    dark: {
      name: "暗矢",
      text: "对当前目标射出暗影，造成魔法伤害。",
      effects: eff({ kind: "damage", target: "current", magic: 240, ap: 0.65 }),
    },
    aegis: {
      name: "星幕",
      text: "为所有友军套上护盾。",
      effects: eff({ kind: "shield", target: "allies", flat: 120, ap: 0.22 }),
    },
    fireball: {
      name: "火球",
      text: "轰击当前目标及其相邻敌人。",
      effects: eff({ kind: "damage", target: "aroundCurrent", magic: 210, ap: 0.55 }),
    },
    wave: {
      name: "怒涛",
      text: "伤害所有敌人，并治疗所有友军。",
      effects: eff(
        { kind: "damage", target: "all", magic: 150, ap: 0.35 },
        { kind: "heal", target: "allies", flat: 110, ap: 0.22 }
      ),
    },
    charge: {
      name: "冲锋",
      text: "冲向当前目标，对相邻敌人造成 155% 攻击的伤害并短暂眩晕。",
      effects: eff(
        { kind: "jump", target: "current" },
        { kind: "damage", target: "adjacent", ad: 1.55 },
        { kind: "stun", target: "adjacent", time: 1 }
      ),
    },
    bulwark: {
      name: "壁垒",
      text: "为自己套上厚盾，并护住相邻友军。",
      effects: eff(
        { kind: "shield", target: "self", pct: 0.22 },
        { kind: "shield", target: "adjAllies", flat: 130, ap: 0.15 }
      ),
    },
    execute: {
      name: "处决",
      text: "跃向生命最低的敌人，造成 280% 攻击的伤害。若击杀，回复法力。",
      effects: eff({ kind: "jump", target: "lowest" }, { kind: "damage", target: "lowest", ad: 2.8 }),
      refund: 0.6,
    },
    volley: {
      name: "流星箭",
      text: "向随机敌人射出 3 箭，每箭 125% 攻击。",
      effects: eff({ kind: "damage", target: "random", ad: 1.25, times: 3 }),
    },
    inferno: {
      name: "焚世",
      text: "焚烧所有敌人。",
      effects: eff({ kind: "damage", target: "all", magic: 270, ap: 0.5 }),
    },
    tidewell: {
      name: "潮愈",
      text: "治疗所有友军大量生命。",
      effects: eff({ kind: "heal", target: "allies", pct: 0.18, flat: 170, ap: 0.3 }),
    },
    roots: {
      name: "根须",
      text: "眩晕相邻敌人，造成魔法伤害，并获得护盾。",
      effects: eff(
        { kind: "damage", target: "adjacent", magic: 190, ap: 0.35 },
        { kind: "stun", target: "adjacent", time: 1.8 },
        { kind: "shield", target: "self", pct: 0.2 }
      ),
    },
    assassinate: {
      name: "影杀",
      text: "跃向生命最低的敌人，造成 330% 攻击的伤害。击杀后回复法力。",
      effects: eff({ kind: "jump", target: "lowest" }, { kind: "damage", target: "lowest", ad: 3.3 }),
      refund: 0.55,
    },
    meteor: {
      name: "星陨",
      text: "召下星火，轰击所有敌人。",
      effects: eff({ kind: "damage", target: "all", magic: 400, ap: 0.8 }),
    },
    hammer: {
      name: "锻锤",
      text: "锤击相邻敌人，造成 220% 攻击的伤害并眩晕，自己获得护盾。",
      effects: eff(
        { kind: "damage", target: "adjacent", ad: 2.2 },
        { kind: "stun", target: "adjacent", time: 1.4 },
        { kind: "shield", target: "self", pct: 0.25 }
      ),
    },
    slam: {
      name: "重击",
      text: "锤击当前目标，造成伤害并眩晕 1.2 秒。",
      effects: eff(
        { kind: "damage", target: "current", ad: 1.4 },
        { kind: "stun", target: "current", time: 1.2 }
      ),
    },
  };

  const UNIT_LIST = [
    u("yanwei", "焰卫", "焰", 1, "flame", "warrior", 700, 52, 0.65, 1, 32, 22, 0, 70, "shield"),
    u("chaotong", "潮童", "潮", 1, "tide", "support", 520, 38, 0.66, 2, 14, 22, 0, 60, "mend"),
    u("yaya", "芽矢", "芽", 1, "grove", "marksman", 460, 56, 0.78, 4, 10, 14, 0, 60, "gale"),
    u("tiezu", "铁卒", "铁", 1, "iron", "guardian", 760, 42, 0.58, 1, 36, 22, 0, 80, "wall"),
    u("yingshu", "影鼠", "影", 1, "shadow", "assassin", 460, 60, 0.78, 1, 12, 14, 0, 50, "backstab"),
    u("xingtu", "星徒", "星", 1, "star", "mage", 460, 38, 0.68, 3, 10, 18, 0, 50, "bolt"),
    u("yanwu", "焰舞", "舞", 2, "flame", "assassin", 580, 66, 0.78, 1, 16, 16, 0, 65, "blaze"),
    u("chaoren", "潮刃", "刃", 2, "tide", "warrior", 700, 60, 0.7, 1, 26, 20, 0, 65, "cleave"),
    u("linwei", "林卫", "林", 2, "grove", "guardian", 820, 48, 0.6, 1, 30, 22, 0, 80, "root"),
    u("gangnu", "钢弩", "弩", 2, "iron", "marksman", 540, 62, 0.75, 4, 18, 16, 0, 60, "shred"),
    u("yingyin", "影咏", "咏", 2, "shadow", "mage", 520, 42, 0.7, 3, 12, 20, 0, 60, "dark"),
    u("xingdun", "星盾", "盾", 2, "star", "support", 620, 42, 0.64, 2, 18, 24, 0, 80, "aegis"),
    u("yansi", "焰祭", "祭", 3, "flame", "mage", 640, 46, 0.72, 3, 14, 20, 0, 80, "fireball"),
    u("chaowu", "潮巫", "巫", 3, "tide", "mage", 660, 44, 0.7, 3, 14, 24, 0, 90, "wave"),
    u("senqi", "森骑", "骑", 3, "grove", "warrior", 800, 68, 0.72, 1, 26, 18, 0, 70, "charge"),
    u("gangwei", "钢卫", "垒", 3, "iron", "guardian", 980, 50, 0.58, 1, 42, 26, 0, 100, "bulwark"),
    u("yingren", "影刃", "刺", 3, "shadow", "assassin", 620, 78, 0.82, 1, 16, 16, 0, 55, "execute"),
    u("xinggong", "星弓", "弓", 3, "star", "marksman", 580, 74, 0.8, 4, 14, 16, 0, 70, "volley"),
    u("yanwang", "焰王", "王", 4, "flame", "warrior", 1080, 82, 0.72, 1, 36, 26, 0, 100, "inferno"),
    u("chaohou", "潮后", "后", 4, "tide", "support", 880, 50, 0.66, 2, 22, 30, 0, 100, "tidewell"),
    u("gushu", "古树", "树", 4, "grove", "guardian", 1280, 58, 0.52, 1, 40, 30, 0, 120, "roots"),
    u("yingwang", "影王", "魇", 4, "shadow", "assassin", 800, 96, 0.88, 1, 18, 18, 0, 60, "assassinate"),
    u("xingyun", "星陨", "陨", 5, "star", "mage", 960, 58, 0.76, 4, 18, 26, 20, 120, "meteor"),
    u("gangshen", "钢神", "铸", 5, "iron", "warrior", 1360, 96, 0.68, 1, 48, 30, 0, 110, "hammer"),
  ];

  function u(id, name, glyph, cost, origin, cls, hp, ad, as, range, armor, mr, mana, maxMana, ability) {
    return { id, name, glyph, cost, origin, cls, hp, ad, as, range, armor, mr, mana, maxMana, ability };
  }

  const UNIT_MAP = {};
  UNIT_LIST.forEach(function (unit) {
    UNIT_MAP[unit.id] = unit;
  });

  const COMPS = [
    { name: "阿燎", units: ["yanwei", "yanwu", "yansi", "yanwang", "chaoren", "senqi", "gangshen"] },
    { name: "听潮", units: ["chaotong", "chaoren", "chaowu", "chaohou", "xingtu", "yingyin", "yansi", "xingyun"] },
    { name: "林客", units: ["yaya", "linwei", "senqi", "gushu", "tiezu", "gangwei"] },
    { name: "铁砧", units: ["tiezu", "gangnu", "gangwei", "gangshen", "yaya", "xinggong"] },
    { name: "无影", units: ["yingshu", "yanwu", "yingyin", "yingren", "yingwang"] },
    { name: "观星", units: ["xingtu", "xingdun", "xinggong", "xingyun", "yingyin", "chaowu"] },
    { name: "守垒", units: ["yanwei", "chaoren", "tiezu", "linwei", "senqi", "gangwei", "yanwang", "gushu", "gangshen"] },
  ];

  function oddrToCube(col, row) {
    const x = col - (row - (row & 1)) / 2;
    const z = row;
    const y = -x - z;
    return [x, y, z];
  }

  function cubeToOddr(x, y, z) {
    return { col: x + (z - (z & 1)) / 2, row: z };
  }

  function hexDist(a, b) {
    const A = oddrToCube(a.col, a.row);
    const B = oddrToCube(b.col, b.row);
    return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2]));
  }

  function neighbors(col, row) {
    const cube = oddrToCube(col, row);
    return DIRS.map(function (d) {
      return cubeToOddr(cube[0] + d[0], cube[1] + d[1], cube[2] + d[2]);
    });
  }

  function inBounds(col, row) {
    return col >= 0 && col < COLS && row >= 0 && row < ROWS;
  }

  function makeRng(state) {
    return function rng() {
      let a = state.rngState | 0;
      a = (a + 0x6d2b79f5) | 0;
      state.rngState = a;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function starScale(star) {
    if (star <= 1) return 1;
    if (star === 2) return 1.8;
    return 3.24;
  }

  function abilityScale(star) {
    if (star <= 1) return 1;
    if (star === 2) return 1.55;
    return 2.25;
  }

  function copiesOf(star) {
    return STAR_COPIES[star] || 1;
  }

  function bestStep(traitId, count) {
    const steps = TRAITS[traitId].steps;
    let best = null;
    for (let i = 0; i < steps.length; i++) {
      if (count >= steps[i].n) best = steps[i];
    }
    return best;
  }

  function traitCounts(pieces) {
    const seen = {};
    const counts = {};
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (!p || p.creep || seen[p.typeId]) continue;
      seen[p.typeId] = true;
      const def = UNIT_MAP[p.typeId];
      counts[def.origin] = (counts[def.origin] || 0) + 1;
      counts[def.cls] = (counts[def.cls] || 0) + 1;
    }
    return counts;
  }

  function traitView(pieces) {
    const counts = traitCounts(pieces.filter(Boolean));
    const rows = [];
    TRAIT_ORDER.forEach(function (id) {
      const count = counts[id] || 0;
      if (!count) return;
      const trait = TRAITS[id];
      const step = bestStep(id, count);
      let next = null;
      for (let i = 0; i < trait.steps.length; i++) {
        if (trait.steps[i].n > count) {
          next = trait.steps[i].n;
          break;
        }
      }
      rows.push({
        id: id,
        name: trait.name,
        color: trait.color,
        kind: trait.kind,
        count: count,
        active: !!step,
        current: step ? step.n : 0,
        next: next,
        text: step ? step.text : "再凑 " + (trait.steps[0].n - count) + " 名激活：" + trait.steps[0].text,
        blurb: trait.blurb,
      });
    });
    rows.sort(function (a, b) {
      return (b.active - a.active) || (b.count - a.count);
    });
    return rows;
  }

  function emptyBonuses() {
    return {
      hpMul: 1,
      adMul: 1,
      asMul: 1,
      armor: 0,
      ap: 0,
      mana: 0,
      crit: 0.05,
      critMult: 1.45,
      range: 0,
      burn: 0,
      healPct: 0,
      healPower: 1,
      assassin: false,
      startShieldPct: 0,
      manaOnCast: 0,
    };
  }

  function bonusesFor(def, counts) {
    const b = emptyBonuses();
    function apply(traitId) {
      const step = bestStep(traitId, counts[traitId] || 0);
      if (!step) return;
      if (step.hpMul) b.hpMul *= step.hpMul;
      if (step.adMul) b.adMul *= step.adMul;
      if (step.asMul) b.asMul *= step.asMul;
      if (step.armor) b.armor += step.armor;
      if (step.ap) b.ap += step.ap;
      if (step.mana) b.mana += step.mana;
      if (step.crit) b.crit += step.crit;
      if (step.critMult) b.critMult = step.critMult;
      if (step.range) b.range += step.range;
      if (step.burn) b.burn = step.burn;
      if (step.healPct) b.healPct = step.healPct;
      if (step.healPower) b.healPower *= step.healPower;
      if (step.assassin) b.assassin = true;
      if (step.startShieldPct) b.startShieldPct += step.startShieldPct;
      if (step.manaOnCast) b.manaOnCast += step.manaOnCast;
    }
    apply(def.origin);
    apply(def.cls);
    return b;
  }

  function teamShieldOf(counts) {
    const step = bestStep("support", counts.support || 0);
    return step && step.teamShield ? step.teamShield : 0;
  }

  function applyItems(stats, items) {
    (items || []).forEach(function (id) {
      const item = ITEMS[id];
      if (!item) return;
      if (item.stat === "ad") stats.ad *= 1 + item.value;
      else if (item.stat === "armor") stats.armor += item.value;
      else if (item.stat === "ap") stats.ap += item.value;
      else if (item.stat === "as") stats.as *= 1 + item.value;
      else if (item.stat === "hp") stats.hp *= 1 + item.value;
      else if (item.stat === "mana") stats.mana += item.value;
      else if (item.stat === "ls") stats.lifesteal += item.value;
      else if (item.stat === "crit") stats.crit += item.value;
    });
  }

  let fighterSeq = 1;

  function buildCombatant(piece, side, col, row, counts, might) {
    if (piece.creep) {
      return {
        uid: piece.uid || "creep-" + fighterSeq++,
        name: piece.name,
        glyph: piece.glyph || "兽",
        color: piece.color || "#8d7560",
        origin: null,
        cls: piece.cls || "warrior",
        side: side,
        col: col,
        row: row,
        star: 1,
        cost: piece.cost || 1,
        hp: piece.hp,
        maxHp: piece.hp,
        ad: piece.ad,
        baseAs: piece.as,
        range: piece.range,
        armor: piece.armor,
        mr: piece.mr,
        ap: 100,
        mana: piece.mana || 0,
        maxMana: piece.maxMana || 0,
        crit: 0.05,
        critMult: 1.4,
        lifesteal: 0,
        ability: piece.ability || null,
        healPower: 1,
        healPct: 0,
        healEvery: 3,
        healClock: 3,
        burnOnHit: 0,
        assassin: false,
        manaOnCast: 0,
        shield: 0,
        stun: 0,
        taunt: 0,
        alive: true,
        atkCd: 0.15,
        moveCd: 0,
        asBonus: 0,
        asBonusT: 0,
        armorBonus: 0,
        armorBonusT: 0,
      };
    }
    const def = UNIT_MAP[piece.typeId];
    const bonus = bonusesFor(def, counts || {});
    const scale = starScale(piece.star);
    const mightMul = 1 + (might || 0);
    const stats = {
      hp: def.hp * scale * bonus.hpMul * mightMul,
      ad: def.ad * scale * bonus.adMul * mightMul,
      as: def.as * bonus.asMul,
      armor: def.armor + bonus.armor,
      ap: 100 + bonus.ap,
      mana: (def.mana || 0) + bonus.mana,
      crit: bonus.crit,
      lifesteal: 0,
    };
    applyItems(stats, piece.items);
    const maxHp = Math.round(stats.hp);
    let mana = Math.min(def.maxMana, Math.round(stats.mana));
    if (piece.manaOverride != null) mana = piece.manaOverride;
    return {
      uid: "f" + fighterSeq++,
      name: def.name,
      glyph: def.glyph,
      color: TRAITS[def.origin].color,
      origin: def.origin,
      cls: def.cls,
      side: side,
      col: col,
      row: row,
      star: piece.star,
      cost: def.cost,
      hp: maxHp,
      maxHp: maxHp,
      ad: stats.ad,
      baseAs: Math.min(2.6, stats.as),
      range: def.range + bonus.range,
      armor: stats.armor,
      mr: def.mr,
      ap: stats.ap,
      mana: mana,
      maxMana: def.maxMana,
      crit: Math.min(0.9, stats.crit),
      critMult: bonus.critMult,
      lifesteal: stats.lifesteal,
      ability: def.ability,
      healPower: bonus.healPower,
      healPct: bonus.healPct,
      healEvery: 3,
      healClock: 3,
      burnOnHit: bonus.burn,
      assassin: bonus.assassin,
      startShieldPct: bonus.startShieldPct,
      manaOnCast: bonus.manaOnCast,
      shield: 0,
      stun: 0,
      taunt: 0,
      alive: true,
      atkCd: 0.1,
      moveCd: 0,
      asBonus: 0,
      asBonusT: 0,
      armorBonus: 0,
      armorBonusT: 0,
    };
  }

  function previewStats(piece, boardPieces) {
    const onBoard = boardPieces.some(function (p) {
      return p && p.uid === piece.uid;
    });
    const list = onBoard ? boardPieces.filter(Boolean) : boardPieces.filter(Boolean).concat([piece]);
    const counts = traitCounts(list);
    const fighter = buildCombatant(piece, "player", 0, 4, counts, 0);
    return {
      hp: fighter.maxHp,
      ad: Math.round(fighter.ad),
      as: Math.round(fighter.baseAs * 100) / 100,
      armor: Math.round(fighter.armor),
      mr: fighter.mr,
      ap: Math.round(fighter.ap),
      range: fighter.range,
      mana: fighter.maxMana,
      startMana: fighter.mana,
    };
  }

  function stageDamage(round) {
    if (round <= 3) return 0;
    if (round <= 6) return 2;
    if (round <= 9) return 3;
    if (round <= 12) return 5;
    if (round <= 15) return 7;
    return 9;
  }

  function calcDamage(survivors, round) {
    const stars = survivors.reduce(function (sum, u) {
      return sum + (u.star || 1);
    }, 0);
    if (!survivors.length) return 0;
    if (round <= 3) return Math.min(6, Math.max(2, stars));
    return Math.min(25, Math.max(2, stageDamage(round) + stars));
  }

  function rivalMight(round) {
    if (round < 8) return 0;
    return Math.min(0.28, (round - 7) * 0.028);
  }

  function occupier(units, col, row, ignore) {
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u === ignore) continue;
      if (u.col === col && u.row === row) return u;
    }
    return null;
  }

  function living(units, side) {
    return units.filter(function (u) {
      return u.alive && (!side || u.side === side);
    });
  }

  function acquire(unit, units) {
    const enemies = living(units).filter(function (u) {
      return u.side !== unit.side;
    });
    if (!enemies.length) return null;
    const taunters = enemies.filter(function (u) {
      return u.taunt > 0;
    });
    const pool = taunters.length ? taunters : enemies;
    pool.sort(function (a, b) {
      return hexDist(unit, a) - hexDist(unit, b) || a.hp - b.hp;
    });
    return pool[0];
  }

  function selectTargets(spec, caster, units, rng) {
    const enemies = living(units).filter(function (u) {
      return u.side !== caster.side;
    });
    const allies = living(units).filter(function (u) {
      return u.side === caster.side;
    });
    if (spec === "self") return [caster];
    if (spec === "allies") return allies;
    if (spec === "adjAllies") {
      return allies.filter(function (u) {
        return hexDist(caster, u) <= 1;
      });
    }
    if (spec === "lowestAlly") {
      if (!allies.length) return [];
      return [
        allies.slice().sort(function (a, b) {
          return a.hp / a.maxHp - b.hp / b.maxHp;
        })[0],
      ];
    }
    if (!enemies.length) return [];
    if (spec === "all") return enemies.slice();
    if (spec === "adjacent") {
      return enemies.filter(function (u) {
        return hexDist(caster, u) <= 1;
      });
    }
    if (spec === "current" || spec === "aroundCurrent") {
      const current = acquire(caster, units);
      if (!current) return [];
      if (spec === "current") return [current];
      return enemies.filter(function (u) {
        return hexDist(current, u) <= 1;
      });
    }
    if (spec === "lowest") {
      return [
        enemies.slice().sort(function (a, b) {
          return a.hp / a.maxHp - b.hp / b.maxHp;
        })[0],
      ];
    }
    if (spec === "random") {
      return [enemies[Math.floor(rng() * enemies.length)]];
    }
    return [];
  }

  function armorOf(unit) {
    let armor = unit.armor + (unit.armorBonus || 0);
    if (unit.armorBonusT <= 0) armor = unit.armor;
    return armor;
  }

  function deal(attacker, target, raw, kind, events, t, rng, allowCrit) {
    if (!target || !target.alive || raw <= 0) return 0;
    let amount = raw * (kind === "physical" ? 1.75 : 1);
    let crit = false;
    if (kind === "physical") {
      if (allowCrit && attacker && rng() < attacker.crit) {
        amount *= attacker.critMult;
        crit = true;
      }
      const armor = Math.max(-10, armorOf(target));
      amount = (amount * 100) / (100 + armor);
    } else if (kind === "magic" || kind === "burn") {
      amount = (amount * 100) / (100 + Math.max(0, target.mr));
    }
    amount = Math.max(1, Math.round(amount));
    let hpDmg = amount;
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, hpDmg);
      target.shield -= absorbed;
      hpDmg -= absorbed;
    }
    if (hpDmg > 0) target.hp -= hpDmg;
    if (attacker && attacker.alive && attacker.lifesteal && kind === "physical" && hpDmg > 0) {
      const healAmt = Math.round(hpDmg * attacker.lifesteal);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt);
      if (healAmt > 0) events.push({ t: t, type: "heal", id: attacker.uid, amount: healAmt });
    }
    if (kind !== "burn" && target.alive) {
      target.mana = Math.min(target.maxMana, target.mana + (kind === "magic" ? 8 : 6));
    }
    events.push({
      t: t,
      type: "hit",
      id: attacker ? attacker.uid : null,
      target: target.uid,
      dmg: hpDmg,
      crit: crit,
      kind: kind,
    });
    if (target.hp <= 0) kill(target, events, t);
    return hpDmg;
  }

  function kill(unit, events, t) {
    if (!unit.alive) return;
    unit.alive = false;
    unit.hp = 0;
    events.push({ t: t, type: "death", id: unit.uid });
  }

  function healUnit(unit, amount, events, t) {
    if (!unit.alive || amount <= 0 || unit.hp >= unit.maxHp) return 0;
    const gain = Math.min(unit.maxHp - unit.hp, Math.round(amount));
    if (gain <= 0) return 0;
    unit.hp += gain;
    events.push({ t: t, type: "heal", id: unit.uid, amount: gain });
    return gain;
  }

  function shieldUnit(unit, amount, events, t) {
    const gain = Math.round(amount);
    if (gain <= 0 || !unit.alive) return;
    unit.shield += gain;
    events.push({ t: t, type: "shield", id: unit.uid, amount: gain });
  }

  function effectAmount(caster, eff) {
    const scale = abilityScale(caster.star || 1);
    let n = 0;
    if (eff.ad) n += caster.ad * eff.ad;
    if (eff.magic) n += eff.magic * scale;
    if (eff.ap) n += caster.ap * eff.ap;
    if (eff.flat) n += eff.flat * scale;
    return n;
  }

  function findLanding(unit, target, units) {
    let found = [];
    for (let dist = 1; dist <= 3 && !found.length; dist++) {
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          if (hexDist({ col: col, row: row }, target) !== dist) continue;
          if (occupier(units, col, row, unit)) continue;
          found.push({ col: col, row: row });
        }
      }
    }
    if (!found.length) return null;
    found.sort(function (a, b) {
      return hexDist(a, unit) - hexDist(b, unit);
    });
    return found[0];
  }

  function castAbility(unit, units, events, t, rng) {
    const ability = ABILITIES[unit.ability];
    if (!ability) return;
    unit.mana = 0;
    events.push({ t: t, type: "cast", id: unit.uid, name: ability.name });
    let killed = false;
    ability.effects.forEach(function (effect) {
      const times = effect.times || 1;
      for (let n = 0; n < times; n++) {
        const spec = effect.target || "self";
        const targets = selectTargets(spec, unit, units, rng);
        targets.forEach(function (tgt) {
          if (!tgt || !tgt.alive) return;
          if (effect.kind === "damage") {
            const magic = effect.magic || effect.ap;
            const kind = effect.ad && !magic ? "physical" : "magic";
            deal(unit, tgt, effectAmount(unit, effect), kind, events, t, rng, kind === "physical");
            if (!tgt.alive) killed = true;
          } else if (effect.kind === "heal") {
            const amt = effectAmount(unit, effect) * unit.healPower;
            const pct = effect.pct ? tgt.maxHp * effect.pct * unit.healPower : 0;
            healUnit(tgt, amt + pct, events, t);
          } else if (effect.kind === "shield") {
            let amt = 0;
            if (effect.pct) amt += tgt.maxHp * effect.pct;
            if (effect.flat || effect.ap) amt += effectAmount(unit, { flat: effect.flat, ap: effect.ap });
            shieldUnit(tgt, amt * unit.healPower, events, t);
          } else if (effect.kind === "burn") {
            tgt.burnT = 2;
            tgt.burnDps = Math.max(tgt.burnDps || 0, (tgt.maxHp * effect.pct) / 2);
          } else if (effect.kind === "stun") {
            tgt.stun = Math.max(tgt.stun, effect.time);
            events.push({ t: t, type: "stun", id: tgt.uid });
          } else if (effect.kind === "shred") {
            tgt.armor = Math.max(-10, tgt.armor - effect.amount);
          } else if (effect.kind === "taunt") {
            unit.taunt = effect.time;
          } else if (effect.kind === "as") {
            unit.asBonus = Math.max(unit.asBonus || 0, effect.mult);
            unit.asBonusT = Math.max(unit.asBonusT || 0, effect.time);
          } else if (effect.kind === "armor") {
            unit.armorBonus = Math.max(unit.armorBonus || 0, effect.amount);
            unit.armorBonusT = Math.max(unit.armorBonusT || 0, effect.time);
          } else if (effect.kind === "jump") {
            const spot = findLanding(unit, tgt, units);
            if (spot) {
              unit.col = spot.col;
              unit.row = spot.row;
              events.push({ t: t, type: "move", id: unit.uid, col: unit.col, row: unit.row });
            }
          }
        });
      }
    });
    if (killed && ability.refund) {
      unit.mana = Math.min(unit.maxMana, Math.round(unit.maxMana * ability.refund));
    }
    if (unit.manaOnCast) unit.mana = Math.min(unit.maxMana, unit.mana + unit.manaOnCast);
    unit.atkCd = Math.max(unit.atkCd, 0.28);
  }

  function stepToward(unit, target, units) {
    const options = neighbors(unit.col, unit.row).filter(function (n) {
      return inBounds(n.col, n.row) && !occupier(units, n.col, n.row, unit);
    });
    if (!options.length) return false;
    const cur = hexDist(unit, target);
    options.sort(function (a, b) {
      return hexDist(a, target) - hexDist(b, target);
    });
    if (hexDist(options[0], target) < cur) {
      unit.col = options[0].col;
      unit.row = options[0].row;
      unit.stuck = 0;
      return true;
    }
    unit.stuck = (unit.stuck || 0) + 1;
    if (unit.stuck >= 2) {
      const side = options.filter(function (n) {
        return hexDist(n, target) <= cur;
      });
      if (side.length) {
        unit.col = side[0].col;
        unit.row = side[0].row;
        unit.stuck = 0;
        return true;
      }
    }
    return false;
  }

  function jumpAssassins(units, events) {
    const assassins = units.filter(function (u) {
      return u.alive && u.assassin;
    });
    assassins.sort(function (a, b) {
      return b.star - a.star || b.cost - a.cost;
    });
    assassins.forEach(function (unit) {
      const enemies = living(units).filter(function (u) {
        return u.side !== unit.side;
      });
      if (!enemies.length) return;
      const backRow =
        unit.side === "player"
          ? Math.min.apply(
              null,
              enemies.map(function (e) {
                return e.row;
              })
            )
          : Math.max.apply(
              null,
              enemies.map(function (e) {
                return e.row;
              })
            );
      const backs = enemies.filter(function (e) {
        return e.row === backRow;
      });
      const target = (backs.length ? backs : enemies).slice().sort(function (a, b) {
        return b.cost - a.cost || b.hp - a.hp;
      })[0];
      const spot = findLanding(unit, target, units);
      if (!spot) return;
      unit.col = spot.col;
      unit.row = spot.row;
      events.push({ t: 0, type: "move", id: unit.uid, col: unit.col, row: unit.row });
    });
  }

  function simulateCombat(units, rng) {
    const events = [];
    units.forEach(function (u, i) {
      u.atkCd = 0.05 + (i % 5) * 0.04;
      u.stuck = 0;
    });
    const snapshot = units.map(function (u) {
      return {
        uid: u.uid,
        name: u.name,
        glyph: u.glyph,
        color: u.color,
        side: u.side,
        col: u.col,
        row: u.row,
        hp: u.hp,
        maxHp: u.maxHp,
        star: u.star,
        cost: u.cost,
        origin: u.origin,
        cls: u.cls,
      };
    });
    units.forEach(function (u) {
      let shield = 0;
      if (u.startShieldPct) shield += u.maxHp * u.startShieldPct;
      if (shield > 0) shieldUnit(u, shield, events, 0);
    });
    const supportSide = {};
    units.forEach(function (u) {
      if (!supportSide[u.side]) supportSide[u.side] = 0;
    });
    // Team shield is passed on the unit as teamShield if the side has it.
    units.forEach(function (u) {
      if (u.teamShield) shieldUnit(u, u.teamShield, events, 0);
    });
    jumpAssassins(units, events);

    const dt = 0.25;
    let ticks = 0;
    let endT = 0;
    for (let tick = 0; tick < 100; tick++) {
      ticks = tick + 1;
      const t = tick * dt;
      endT = t;
      if (!living(units, "player").length || !living(units, "enemy").length) break;
      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        if (!unit.alive) continue;
        if (unit.burnT > 0) {
          unit.burnT -= dt;
          unit.burnAcc = (unit.burnAcc || 0) + (unit.burnDps || 0) * dt;
          if (unit.burnAcc >= 1) {
            const chunk = Math.floor(unit.burnAcc);
            unit.burnAcc -= chunk;
            deal(null, unit, chunk, "burn", events, t, rng, false);
          }
        }
        if (unit.asBonusT > 0) {
          unit.asBonusT -= dt;
          if (unit.asBonusT <= 0) unit.asBonus = 0;
        }
        if (unit.armorBonusT > 0) {
          unit.armorBonusT -= dt;
          if (unit.armorBonusT <= 0) unit.armorBonus = 0;
        }
        if (unit.taunt > 0) unit.taunt -= dt;
        if (unit.healPct > 0 && unit.alive) {
          unit.healClock -= dt;
          if (unit.healClock <= 0) {
            unit.healClock = unit.healEvery;
            healUnit(unit, unit.maxHp * unit.healPct * unit.healPower, events, t);
          }
        }
        if (!unit.alive) continue;
        if (unit.stun > 0) {
          unit.stun -= dt;
          continue;
        }
        if (unit.ability && unit.maxMana > 0 && unit.mana >= unit.maxMana) {
          castAbility(unit, units, events, t, rng);
          continue;
        }
        const target = acquire(unit, units);
        if (!target) break;
        const dist = hexDist(unit, target);
        if (dist <= unit.range) {
          unit.atkCd -= dt;
          if (unit.atkCd <= 0) {
            const as = Math.min(2.6, unit.baseAs * (1 + (unit.asBonus || 0)));
            unit.atkCd += 1 / as;
            deal(unit, target, unit.ad, "physical", events, t, rng, true);
            unit.mana = Math.min(unit.maxMana, unit.mana + 10);
            if (unit.burnOnHit && target.alive) {
              target.burnT = 2;
              target.burnDps = Math.max(target.burnDps || 0, (target.maxHp * unit.burnOnHit) / 2);
            }
          }
        } else {
          unit.moveCd -= dt;
          if (unit.moveCd <= 0) {
            unit.moveCd = 0.42;
            if (stepToward(unit, target, units)) {
              events.push({ t: t, type: "move", id: unit.uid, col: unit.col, row: unit.row });
            }
          }
        }
      }
      if (!living(units, "player").length || !living(units, "enemy").length) {
        endT = t;
        break;
      }
    }

    const playerAlive = living(units, "player");
    const enemyAlive = living(units, "enemy");
    let winner = "draw";
    if (playerAlive.length && !enemyAlive.length) winner = "player";
    else if (enemyAlive.length && !playerAlive.length) winner = "enemy";
    else if (playerAlive.length && enemyAlive.length) {
      const php = playerAlive.reduce(function (s, u) {
        return s + u.hp;
      }, 0);
      const ehp = enemyAlive.reduce(function (s, u) {
        return s + u.hp;
      }, 0);
      winner = php === ehp ? "draw" : php > ehp ? "player" : "enemy";
    } else winner = "draw";
    events.push({ t: endT, type: "end", winner: winner });
    return {
      winner: winner,
      duration: endT,
      ticks: ticks,
      events: events,
      units: snapshot,
      playerSurvivors: playerAlive.map(brief),
      enemySurvivors: enemyAlive.map(brief),
    };
  }

  function brief(u) {
    return { star: u.star, cost: u.cost, name: u.name };
  }

  function placeGroup(list, rows) {
    const out = [];
    let r = 0;
    let i = 0;
    while (i < list.length && r < rows.length) {
      const room = Math.min(COLS, list.length - i);
      const start = Math.floor((COLS - room) / 2);
      for (let c = 0; c < room; c++) {
        out.push({ piece: list[i++], col: start + c, row: rows[r] });
      }
      r += 1;
    }
    return { out: out, rowsUsed: r };
  }

  function placeSquad(pieces, side) {
    const tanks = [];
    const back = [];
    pieces.forEach(function (p) {
      const cls = p.creep ? p.cls || "warrior" : UNIT_MAP[p.typeId].cls;
      if (cls === "warrior" || cls === "guardian") tanks.push(p);
      else back.push(p);
    });
    const rows = side === "player" ? [4, 5, 6, 7] : [3, 2, 1, 0];
    const front = placeGroup(tanks, rows);
    const remain = rows.slice(front.rowsUsed);
    const rear = placeGroup(back, remain.length ? remain : [rows[rows.length - 1]]);
    return front.out.concat(rear.out);
  }

  function creep(name, glyph, hp, ad, as, range, armor, mr, cls, ability, maxMana) {
    return {
      creep: true,
      name: name,
      glyph: glyph,
      color: "#8d7560",
      hp: hp,
      ad: ad,
      as: as,
      range: range,
      armor: armor,
      mr: mr,
      cls: cls,
      ability: ability || null,
      mana: 0,
      maxMana: maxMana || 0,
      cost: 1,
    };
  }

  function creepsFor(round) {
    if (round === 1) return [creep("野猪", "猪", 460, 32, 0.55, 1, 8, 8, "warrior", null, 0)];
    if (round === 2)
      return [
        creep("野狼", "狼", 380, 36, 0.7, 1, 6, 6, "warrior", null, 0),
        creep("野狼", "狼", 380, 36, 0.7, 1, 6, 6, "warrior", null, 0),
      ];
    return [
      creep("石像", "石", 980, 42, 0.48, 1, 28, 18, "guardian", "slam", 70),
      creep("石尘", "尘", 320, 28, 0.6, 1, 8, 8, "warrior", null, 0),
      creep("石尘", "尘", 320, 28, 0.6, 1, 8, 8, "warrior", null, 0),
    ];
  }

  const PVE_NAME = { 1: "野猪", 2: "狼群", 3: "石像" };

  function decoratePlaced(placed, side) {
    return placed.map(function (p, i) {
      const piece = p.piece;
      if (piece.creep) {
        return {
          uid: "pve-" + side + "-" + i,
          name: piece.name,
          glyph: piece.glyph,
          color: piece.color,
          cost: 1,
          star: 1,
          col: p.col,
          row: p.row,
          cls: piece.cls,
          origin: null,
        };
      }
      const def = UNIT_MAP[piece.typeId];
      return {
        uid: piece.uid || def.id + "-" + i,
        name: def.name,
        glyph: def.glyph,
        color: TRAITS[def.origin].color,
        cost: def.cost,
        star: piece.star,
        col: p.col,
        row: p.row,
        cls: def.cls,
        origin: def.origin,
        typeId: def.id,
      };
    });
  }

  function fielded(ai) {
    return ai.units
      .slice()
      .sort(function (a, b) {
        return UNIT_MAP[b.typeId].cost * b.star - UNIT_MAP[a.typeId].cost * a.star;
      })
      .slice(0, ai.level);
  }

  function playerPieces(state) {
    return state.player.board.filter(Boolean);
  }

  function eachPiece(state, fn) {
    state.player.board.forEach(function (piece, index) {
      if (piece) fn(piece, "board", index);
    });
    state.player.bench.forEach(function (piece, index) {
      if (piece) fn(piece, "bench", index);
    });
  }

  function canAccept(state, typeId) {
    if (state.player.bench.some(function (p) { return !p; })) return true;
    let ones = 0;
    eachPiece(state, function (piece) {
      if (piece.typeId === typeId && piece.star === 1) ones += 1;
    });
    return ones >= 2;
  }

  function clearAt(state, zone, index) {
    if (zone === "board") state.player.board[index] = null;
    else state.player.bench[index] = null;
  }

  function writeAt(state, zone, index, piece) {
    if (zone === "board") state.player.board[index] = piece;
    else state.player.bench[index] = piece;
  }

  function tryCombine(state) {
    let guard = 0;
    while (guard++ < 12) {
      const groups = {};
      eachPiece(state, function (piece, zone, index) {
        if (piece.star >= 3) return;
        const key = piece.typeId + "@" + piece.star;
        if (!groups[key]) groups[key] = [];
        groups[key].push({ piece: piece, zone: zone, index: index });
      });
      let did = false;
      const keys = Object.keys(groups);
      for (let k = 0; k < keys.length; k++) {
        const group = groups[keys[k]];
        if (group.length < 3) continue;
        const chosen = group.slice(0, 3);
        const keeper = chosen.filter(function (p) { return p.zone === "board"; })[0] || chosen[0];
        const items = [];
        chosen.forEach(function (p) {
          p.piece.items.forEach(function (it) { items.push(it); });
        });
        items.slice(3).forEach(function (it) { state.player.itemBench.push(it); });
        chosen.forEach(function (p) { clearAt(state, p.zone, p.index); });
        const upgraded = {
          uid: state.nextUid++,
          typeId: keeper.piece.typeId,
          star: keeper.piece.star + 1,
          items: items.slice(0, 3),
        };
        writeAt(state, keeper.zone, keeper.index, upgraded);
        state.lastUpgrades.push({ typeId: upgraded.typeId, star: upgraded.star });
        did = true;
        break;
      }
      if (!did) break;
    }
  }

  function addCopy(state, typeId) {
    const made = { uid: state.nextUid++, typeId: typeId, star: 1, items: [] };
    const empty = state.player.bench.findIndex(function (p) { return !p; });
    if (empty >= 0) {
      state.player.bench[empty] = made;
      tryCombine(state);
      return { ok: true };
    }
    const matches = [];
    eachPiece(state, function (piece, zone, index) {
      if (piece.typeId === typeId && piece.star === 1) matches.push({ piece: piece, zone: zone, index: index });
    });
    if (matches.length < 2) return { ok: false, reason: "备战席已满" };
    const chosen = matches.slice(0, 2);
    const items = [];
    chosen.forEach(function (p) {
      p.piece.items.forEach(function (it) { items.push(it); });
    });
    items.slice(3).forEach(function (it) { state.player.itemBench.push(it); });
    chosen.forEach(function (p) { clearAt(state, p.zone, p.index); });
    const upgraded = {
      uid: state.nextUid++,
      typeId: typeId,
      star: 2,
      items: items.slice(0, 3),
    };
    writeAt(state, chosen[0].zone, chosen[0].index, upgraded);
    state.lastUpgrades.push({ typeId: typeId, star: 2 });
    tryCombine(state);
    return { ok: true };
  }

  function pickCost(level, rng) {
    const odds = ODDS[Math.max(1, Math.min(9, level))];
    let roll = rng() * 100;
    for (let i = 0; i < 5; i++) {
      if (roll < odds[i]) return i + 1;
      roll -= odds[i];
    }
    return 5;
  }

  function drawType(state, cost, rng) {
    let choices = UNIT_LIST.filter(function (unit) {
      return unit.cost === cost && state.pool[unit.id] > 0;
    });
    if (!choices.length) {
      choices = UNIT_LIST.filter(function (unit) {
        return state.pool[unit.id] > 0;
      });
    }
    if (!choices.length) return null;
    let total = 0;
    choices.forEach(function (unit) { total += state.pool[unit.id]; });
    let roll = rng() * total;
    for (let i = 0; i < choices.length; i++) {
      roll -= state.pool[choices[i].id];
      if (roll < 0) return choices[i].id;
    }
    return choices[choices.length - 1].id;
  }

  function rollShop(state) {
    const rng = makeRng(state);
    const shop = [];
    for (let i = 0; i < 5; i++) {
      const id = drawType(state, pickCost(state.player.level, rng), rng);
      if (id) state.pool[id] -= 1;
      shop.push(id);
    }
    state.player.shop = shop;
  }

  function returnShop(state) {
    state.player.shop.forEach(function (id) {
      if (id) state.pool[id] += 1;
    });
    state.player.shop = [null, null, null, null, null];
  }

  function grantXp(entity, amount) {
    const before = entity.level;
    if (entity.level >= 9) return 0;
    entity.xp += amount;
    while (entity.level < 9 && entity.xp >= XP_NEED[entity.level]) {
      entity.xp -= XP_NEED[entity.level];
      entity.level += 1;
    }
    if (entity.level >= 9) entity.xp = 0;
    return entity.level - before;
  }

  function incomeBreakdown(entity) {
    const interest = Math.min(5, Math.floor(entity.gold / 10));
    const abs = Math.abs(entity.streak);
    let streakGold = 0;
    if (abs >= 5) streakGold = 3;
    else if (abs >= 4) streakGold = 2;
    else if (abs >= 2) streakGold = 1;
    const winGold = entity.streak > 0 ? 1 : 0;
    return {
      base: 5,
      interest: interest,
      streakGold: streakGold,
      winGold: winGold,
      total: 5 + interest + streakGold + winGold,
      lossStreak: entity.streak < 0,
    };
  }

  function grantIncome(entity) {
    const income = incomeBreakdown(entity);
    entity.gold += income.total;
    return income;
  }

  function combineList(list) {
    let guard = 0;
    while (guard++ < 12) {
      const groups = {};
      list.forEach(function (piece, index) {
        if (piece.star >= 3) return;
        const key = piece.typeId + "@" + piece.star;
        if (!groups[key]) groups[key] = [];
        groups[key].push(index);
      });
      let did = false;
      const keys = Object.keys(groups);
      for (let k = 0; k < keys.length; k++) {
        const idxs = groups[keys[k]];
        if (idxs.length < 3) continue;
        const take = idxs.slice(0, 3).sort(function (a, b) { return b - a; });
        const typeId = list[idxs[0]].typeId;
        const star = list[idxs[0]].star + 1;
        const items = [];
        idxs.slice(0, 3).forEach(function (i) {
          (list[i].items || []).forEach(function (it) { items.push(it); });
        });
        take.forEach(function (i) { list.splice(i, 1); });
        list.push({ typeId: typeId, star: star, items: items.slice(0, 3) });
        did = true;
        break;
      }
      if (!did) break;
    }
  }

  function aiDevelop(state, ai) {
    const rng = makeRng(state);
    const curve = Math.min(8, 1 + Math.floor((state.round + 2) / 3));
    if (ai.level < curve && ai.level < 8 && ai.gold >= 22) {
      ai.gold -= 4;
      grantXp(ai, 4);
    }
    let buys = 0;
    while (buys < 2) {
      const copies = {};
      ai.units.forEach(function (piece) {
        copies[piece.typeId] = (copies[piece.typeId] || 0) + copiesOf(piece.star);
      });
      const upgrades = ai.comp.filter(function (id) {
        if (state.pool[id] <= 0 || ai.gold < UNIT_MAP[id].cost) return false;
        return ai.units.filter(function (piece) {
          return piece.typeId === id && piece.star === 1;
        }).length >= 2;
      });
      const options = ai.comp.filter(function (id) {
        if (state.pool[id] <= 0 || ai.gold < UNIT_MAP[id].cost) return false;
        const owned = copies[id] || 0;
        if (owned >= 6 && owned < 9) return false;
        return UNIT_MAP[id].cost <= Math.max(2, ai.level - 1) || owned >= 2;
      });
      let choice = null;
      if (upgrades.length && rng() < 0.5) choice = upgrades[Math.floor(rng() * upgrades.length)];
      else if (options.length) {
        const weighted = [];
        options.forEach(function (id) {
          const owned = copies[id] || 0;
          const weight = owned === 0 ? 3 : owned < 3 ? 2 : 1;
          for (let n = 0; n < weight; n++) weighted.push(id);
        });
        choice = weighted[Math.floor(rng() * weighted.length)];
      }
      if (!choice) break;
      const reserve = state.round >= 4 ? 6 : 0;
      const upgrading = upgrades.indexOf(choice) >= 0;
      if (!upgrading && ai.gold - UNIT_MAP[choice].cost < reserve) break;
      ai.gold -= UNIT_MAP[choice].cost;
      state.pool[choice] -= 1;
      ai.units.push({ typeId: choice, star: 1, items: [] });
      combineList(ai.units);
      buys += 1;
    }
  }

  function aiPower(ai) {
    return fielded(ai).reduce(function (sum, piece) {
      return sum + UNIT_MAP[piece.typeId].cost * piece.star;
    }, 0) + ai.level * 0.4;
  }

  function clash(a, b, state) {
    const rng = makeRng(state);
    const pa = aiPower(a) * (0.9 + rng() * 0.22);
    const pb = aiPower(b) * (0.9 + rng() * 0.22);
    const winner = pa >= pb ? a : b;
    const loser = winner === a ? b : a;
    const survivors = fielded(winner).map(function (piece) {
      return { star: piece.star, cost: UNIT_MAP[piece.typeId].cost };
    });
    const dmg = Math.max(2, Math.round(calcDamage(survivors, state.round) * 0.7));
    loser.hp -= dmg;
    if (loser.hp <= 0) {
      loser.hp = 0;
      loser.alive = false;
      loser.streak = 0;
    } else {
      loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;
    }
    winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;
  }

  function resolveOffscreen(state, foughtId) {
    const rng = makeRng(state);
    const others = state.ais.filter(function (ai) {
      return ai.alive && ai.id !== foughtId;
    });
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = others[i];
      others[i] = others[j];
      others[j] = tmp;
    }
    for (let i = 0; i + 1 < others.length; i += 2) clash(others[i], others[i + 1], state);
  }

  function initPool(state) {
    let total = 0;
    UNIT_LIST.forEach(function (unit) {
      state.pool[unit.id] = POOL_SIZE[unit.cost];
      total += POOL_SIZE[unit.cost];
    });
    state.supply = total;
  }

  function createGame(seed) {
    const state = {
      rngState: (seed || 1) >>> 0 || 1,
      round: 1,
      phase: "planning",
      nextUid: 1,
      fightCursor: 0,
      pool: {},
      supply: 0,
      wins: 0,
      losses: 0,
      notice: [],
      lastUpgrades: [],
      itemDraft: null,
      over: null,
      player: {
        hp: 100,
        gold: 5,
        level: 1,
        xp: 0,
        streak: 0,
        lock: false,
        board: new Array(PLAYER_ROWS * COLS).fill(null),
        bench: new Array(BENCH).fill(null),
        shop: [null, null, null, null, null],
        itemBench: [],
      },
      ais: [],
    };
    initPool(state);
    const rng = makeRng(state);
    COMPS.forEach(function (comp, index) {
      const ai = {
        id: "ai" + index,
        name: comp.name,
        hp: 100,
        level: 1,
        xp: 0,
        gold: 0,
        streak: 0,
        alive: true,
        units: [],
        comp: comp.units.slice(),
      };
      const starters = comp.units.filter(function (id) {
        return UNIT_MAP[id].cost === 1 && state.pool[id] > 0;
      });
      if (starters.length) {
        const id = starters[Math.floor(rng() * starters.length)];
        state.pool[id] -= 1;
        ai.units.push({ typeId: id, star: 1, items: [] });
      }
      state.ais.push(ai);
    });
    rollShop(state);
    return state;
  }

  function planning(state) {
    return state.phase === "planning";
  }

  function buyFromShop(state, index) {
    if (!planning(state)) return { ok: false, reason: "现在不能购买" };
    const typeId = state.player.shop[index];
    if (!typeId) return { ok: false, reason: "这个格子是空的" };
    const cost = UNIT_MAP[typeId].cost;
    if (state.player.gold < cost) return { ok: false, reason: "金币不足" };
    if (!canAccept(state, typeId)) return { ok: false, reason: "备战席已满" };
    state.player.gold -= cost;
    state.player.shop[index] = null;
    addCopy(state, typeId);
    return { ok: true };
  }

  function refreshShop(state) {
    if (!planning(state)) return { ok: false, reason: "现在不能刷新" };
    if (state.player.gold < 2) return { ok: false, reason: "金币不足" };
    state.player.gold -= 2;
    returnShop(state);
    rollShop(state);
    return { ok: true };
  }

  function buyXp(state) {
    if (!planning(state)) return { ok: false, reason: "现在不能购买" };
    if (state.player.level >= 9) return { ok: false, reason: "已经满级" };
    if (state.player.gold < 4) return { ok: false, reason: "金币不足" };
    state.player.gold -= 4;
    const gained = grantXp(state.player, 4);
    if (gained) state.notice.push("升至 " + state.player.level + " 级，可上场 " + state.player.level + " 名");
    return { ok: true, leveled: gained > 0 };
  }

  function toggleLock(state) {
    if (!planning(state)) return { ok: false, reason: "现在不能锁定" };
    state.player.lock = !state.player.lock;
    return { ok: true, lock: state.player.lock };
  }

  function getPiece(state, zone, index) {
    return zone === "board" ? state.player.board[index] : state.player.bench[index];
  }

  function movePiece(state, from, to) {
    if (!planning(state)) return { ok: false, reason: "现在不能移动" };
    if (from.zone === to.zone && from.index === to.index) return { ok: true };
    const src = getPiece(state, from.zone, from.index);
    if (!src) return { ok: false, reason: "没有棋子" };
    const dst = getPiece(state, to.zone, to.index);
    const boardCount = state.player.board.filter(Boolean).length;
    const benchCount = state.player.bench.filter(Boolean).length;
    if (from.zone !== "board" && to.zone === "board" && !dst && boardCount >= state.player.level) {
      return { ok: false, reason: "上场人数已满" };
    }
    if (from.zone !== "bench" && to.zone === "bench" && !dst && benchCount >= BENCH) {
      return { ok: false, reason: "备战席已满" };
    }
    writeAt(state, to.zone, to.index, src);
    writeAt(state, from.zone, from.index, dst || null);
    tryCombine(state);
    return { ok: true };
  }

  function sellPiece(state, zone, index) {
    if (!planning(state)) return { ok: false, reason: "现在不能出售" };
    const piece = getPiece(state, zone, index);
    if (!piece) return { ok: false, reason: "没有棋子" };
    const copies = copiesOf(piece.star);
    const gold = UNIT_MAP[piece.typeId].cost * copies;
    state.pool[piece.typeId] += copies;
    state.player.gold += gold;
    piece.items.forEach(function (it) { state.player.itemBench.push(it); });
    clearAt(state, zone, index);
    return { ok: true, gold: gold };
  }

  function rollDraft(state) {
    const rng = makeRng(state);
    const bag = Object.keys(ITEMS);
    const out = [];
    while (out.length < 3 && bag.length) {
      out.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]);
    }
    return out;
  }

  function takeItem(state, index) {
    if (!state.itemDraft) return { ok: false, reason: "没有装备可选" };
    const id = state.itemDraft[index];
    if (!id) return { ok: false, reason: "没有这件装备" };
    state.itemDraft = null;
    state.player.itemBench.push(id);
    state.notice.push("获得装备「" + ITEMS[id].name + "」");
    return { ok: true, id: id };
  }

  function equipItem(state, benchIndex, zone, index) {
    if (!planning(state)) return { ok: false, reason: "现在不能装备" };
    const item = state.player.itemBench[benchIndex];
    const piece = getPiece(state, zone, index);
    if (!item || !piece) return { ok: false, reason: "无法装备" };
    if (piece.items.length >= 3) return { ok: false, reason: "装备已满" };
    piece.items.push(item);
    state.player.itemBench.splice(benchIndex, 1);
    return { ok: true };
  }

  function unequipItem(state, zone, index, itemIndex) {
    if (!planning(state)) return { ok: false, reason: "现在不能卸下" };
    const piece = getPiece(state, zone, index);
    if (!piece || !piece.items[itemIndex]) return { ok: false, reason: "没有装备" };
    const item = piece.items.splice(itemIndex, 1)[0];
    state.player.itemBench.push(item);
    return { ok: true };
  }

  function currentAi(state) {
    const livingAis = state.ais.filter(function (ai) { return ai.alive; });
    if (!livingAis.length) return null;
    return livingAis[state.fightCursor % livingAis.length];
  }

  function enemyPreview(state) {
    if (state.round <= 3) {
      const placed = decoratePlaced(placeSquad(creepsFor(state.round), "enemy"), "enemy");
      return { pve: true, title: PVE_NAME[state.round], subtitle: "野怪", units: placed, traits: [], might: 0 };
    }
    const ai = currentAi(state);
    if (!ai) return { pve: false, title: "—", subtitle: "", units: [], traits: [], might: 0 };
    const squad = fielded(ai);
    return {
      pve: false,
      title: ai.name,
      subtitle: "Lv." + ai.level + "  ·  " + ai.hp + " 生命",
      hp: ai.hp,
      level: ai.level,
      units: decoratePlaced(placeSquad(squad, "enemy"), "enemy"),
      traits: traitView(squad),
      might: rivalMight(state.round),
    };
  }

  function buildSide(placed, side, counts, might, teamShield) {
    return placed.map(function (spot) {
      const fighter = buildCombatant(spot.piece, side, spot.col, spot.row, counts, might);
      if (teamShield) fighter.teamShield = teamShield;
      return fighter;
    });
  }

  function resolveRound(state) {
    const rng = makeRng(state);
    let enemyPieces;
    let opponentName;
    let pve = false;
    let aiId = null;
    const might = state.round <= 3 ? 0 : rivalMight(state.round);
    if (state.round <= 3) {
      pve = true;
      opponentName = PVE_NAME[state.round];
      enemyPieces = placeSquad(creepsFor(state.round), "enemy");
    } else {
      const ai = currentAi(state);
      if (!ai) {
        return { replay: null, won: true, draw: false, damage: 0, opponentName: "—", pve: false, aiId: null };
      }
      opponentName = ai.name;
      aiId = ai.id;
      enemyPieces = placeSquad(fielded(ai), "enemy");
    }
    const playerPlaced = [];
    state.player.board.forEach(function (piece, index) {
      if (!piece) return;
      playerPlaced.push({
        piece: piece,
        col: index % COLS,
        row: Math.floor(index / COLS) + 4,
      });
    });
    const playerCounts = traitCounts(playerPlaced.map(function (p) { return p.piece; }));
    const enemyCounts = traitCounts(
      enemyPieces.map(function (p) { return p.piece; }).filter(function (p) { return !p.creep; })
    );
    const units = buildSide(playerPlaced, "player", playerCounts, 0, teamShieldOf(playerCounts)).concat(
      buildSide(enemyPieces, "enemy", enemyCounts, might, teamShieldOf(enemyCounts))
    );
    // Desync creep attacks a little without touching the shared rng stream twice.
    units.forEach(function (unit, index) {
      unit.atkCd = 0.08 + ((index * 17) % 5) * 0.05;
    });
    const replay = simulateCombat(units, rng);
    const won = replay.winner === "player";
    const draw = replay.winner === "draw";
    const damage = won || draw ? 0 : calcDamage(replay.enemySurvivors, state.round);
    return {
      replay: replay,
      won: won,
      draw: draw,
      damage: damage,
      opponentName: opponentName,
      pve: pve,
      aiId: aiId,
    };
  }

  function finishIfNeeded(state) {
    if (state.player.hp <= 0) {
      state.player.hp = 0;
      const alive = state.ais.filter(function (ai) { return ai.alive; }).length;
      state.over = { win: false, placement: alive + 1, round: state.round };
      state.phase = "end";
      return true;
    }
    if (state.round > 3 && state.ais.every(function (ai) { return !ai.alive; })) {
      state.over = { win: true, placement: 1, round: state.round };
      state.phase = "end";
      return true;
    }
    return false;
  }

  function applyRoundResult(state, result) {
    if (result.won) {
      state.wins += 1;
      state.player.streak = state.player.streak > 0 ? state.player.streak + 1 : 1;
      state.notice.push("战胜「" + result.opponentName + "」");
    } else if (result.draw) {
      state.player.streak = 0;
      state.notice.push("与「" + result.opponentName + "」战成平局");
    } else {
      state.losses += 1;
      state.player.streak = state.player.streak < 0 ? state.player.streak - 1 : -1;
      state.player.hp -= result.damage;
      state.notice.push("不敌「" + result.opponentName + "」，失去 " + result.damage + " 点生命");
    }

    if (!result.pve && result.aiId) {
      const ai = state.ais.filter(function (item) { return item.id === result.aiId; })[0];
      if (ai && result.won) {
        const dmg = calcDamage(result.replay.playerSurvivors, state.round);
        ai.hp -= dmg;
        ai.streak = ai.streak < 0 ? ai.streak - 1 : -1;
        if (ai.hp <= 0) {
          ai.hp = 0;
          ai.alive = false;
          state.notice.push(ai.name + " 被淘汰");
        }
      } else if (ai && !result.draw) {
        ai.streak = ai.streak > 0 ? ai.streak + 1 : 1;
      }
      resolveOffscreen(state, result.aiId);
      state.fightCursor += 1;
    }

    if (finishIfNeeded(state)) return;

    state.round += 1;
    if (state.round >= 30) {
      const better = state.ais.filter(function (ai) {
        return ai.alive && ai.hp > state.player.hp;
      }).length;
      const win = better === 0;
      state.over = { win: win, placement: win ? 1 : better + 1, round: state.round };
      state.phase = "end";
      state.notice.push("终局裁决");
      return;
    }

    const income = grantIncome(state.player);
    const parts = ["基础 +" + income.base];
    if (income.interest) parts.push("利息 +" + income.interest);
    if (income.streakGold) parts.push((income.lossStreak ? "连败 +" : "连胜 +") + income.streakGold);
    if (income.winGold) parts.push("胜利 +" + income.winGold);
    state.notice.push("收入 +" + income.total + "（" + parts.join(" / ") + "）");
    const levels = grantXp(state.player, 2);
    if (levels) state.notice.push("升至 " + state.player.level + " 级，可上场 " + state.player.level + " 名");

    state.ais.forEach(function (ai) {
      if (!ai.alive) return;
      grantIncome(ai);
      grantXp(ai, 2);
      aiDevelop(state, ai);
    });

    if ([4, 7, 11, 15].indexOf(state.round) >= 0) state.itemDraft = rollDraft(state);
    if (!state.player.lock) {
      returnShop(state);
      rollShop(state);
    }
    state.phase = "planning";
  }

  function rosterCount(state) {
    let n = 0;
    Object.keys(state.pool).forEach(function (id) { n += state.pool[id]; });
    state.player.shop.forEach(function (id) { if (id) n += 1; });
    function add(piece) {
      if (!piece) return;
      n += copiesOf(piece.star);
    }
    state.player.board.forEach(add);
    state.player.bench.forEach(add);
    state.ais.forEach(function (ai) {
      ai.units.forEach(add);
    });
    return n;
  }

  function debugAddCopy(state, typeId) {
    if (state.pool[typeId] <= 0) return { ok: false, reason: "卡池不足" };
    if (!canAccept(state, typeId)) return { ok: false, reason: "备战席已满" };
    state.pool[typeId] -= 1;
    return addCopy(state, typeId);
  }

  function runCombat(units, seed) {
    const state = { rngState: (seed || 1) >>> 0 || 1 };
    return simulateCombat(units, makeRng(state));
  }

  function makeFighter(typeId, star, col, row, side, extra) {
    extra = extra || {};
    const piece = {
      typeId: typeId,
      star: star,
      items: extra.items || [],
      manaOverride: extra.mana,
      creep: false,
    };
    return buildCombatant(piece, side, col, row, extra.counts || {}, extra.might || 0);
  }

  function makeCreepFighter(spec) {
    const piece = {};
    Object.keys(spec).forEach(function (key) { piece[key] = spec[key]; });
    piece.creep = true;
    return buildCombatant(piece, spec.side || "enemy", spec.col, spec.row, {}, 0);
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    BENCH: BENCH,
    XP_NEED: XP_NEED,
    ODDS: ODDS,
    UNIT_LIST: UNIT_LIST,
    UNIT_MAP: UNIT_MAP,
    TRAITS: TRAITS,
    TRAIT_ORDER: TRAIT_ORDER,
    ITEMS: ITEMS,
    ABILITIES: ABILITIES,
    ORIGIN_NAME: ORIGIN_NAME,
    CLASS_NAME: CLASS_NAME,
    hexDist: hexDist,
    neighbors: neighbors,
    inBounds: inBounds,
    createGame: createGame,
    buyFromShop: buyFromShop,
    refreshShop: refreshShop,
    buyXp: buyXp,
    toggleLock: toggleLock,
    movePiece: movePiece,
    sellPiece: sellPiece,
    takeItem: takeItem,
    equipItem: equipItem,
    unequipItem: unequipItem,
    traitView: traitView,
    traitCounts: traitCounts,
    previewStats: previewStats,
    enemyPreview: enemyPreview,
    resolveRound: resolveRound,
    applyRoundResult: applyRoundResult,
    rosterCount: rosterCount,
    incomeBreakdown: incomeBreakdown,
    calcDamage: calcDamage,
    debugAddCopy: debugAddCopy,
    runCombat: runCombat,
    makeFighter: makeFighter,
    makeCreepFighter: makeCreepFighter,
    fielded: fielded,
  };
});
