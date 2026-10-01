const assert = require("assert");
const AC = require("./logic");

function rosterOk(state) {
  assert.strictEqual(AC.rosterCount(state), state.supply);
  Object.keys(state.pool).forEach(function (id) {
    assert.ok(state.pool[id] >= 0, id + " pool went negative");
  });
  assert.ok(state.player.gold >= 0);
  state.ais.forEach(function (ai) {
    assert.ok(ai.gold >= 0, ai.name + " gold");
  });
}

function testHex() {
  const center = { col: 3, row: 3 };
  const near = AC.neighbors(3, 3);
  assert.strictEqual(near.length, 6);
  near.forEach(function (n) {
    assert.ok(AC.inBounds(n.col, n.row));
    assert.strictEqual(AC.hexDist(center, n), 1);
    assert.strictEqual(AC.hexDist(n, center), 1);
  });
  assert.strictEqual(AC.hexDist({ col: 0, row: 0 }, { col: 0, row: 0 }), 0);
  assert.ok(AC.hexDist({ col: 0, row: 0 }, { col: 6, row: 7 }) > 3);
}

function testCatalog() {
  assert.strictEqual(AC.UNIT_LIST.length, 24);
  AC.UNIT_LIST.forEach(function (unit) {
    assert.ok(AC.ABILITIES[unit.ability], unit.id + " missing ability");
    assert.ok(AC.TRAITS[unit.origin], unit.origin);
    assert.ok(AC.TRAITS[unit.cls], unit.cls);
  });
  Object.keys(AC.ODDS).forEach(function (level) {
    const sum = AC.ODDS[level].reduce(function (s, n) { return s + n; }, 0);
    assert.strictEqual(sum, 100, "odds " + level);
  });
}

function testCreateAndShop() {
  const state = AC.createGame(7);
  rosterOk(state);
  assert.strictEqual(state.player.gold, 5);
  assert.strictEqual(state.player.level, 1);
  assert.strictEqual(state.player.shop.filter(Boolean).length, 5);
  const before = state.player.gold;
  const id = state.player.shop[0];
  const bought = AC.buyFromShop(state, 0);
  assert.strictEqual(bought.ok, true);
  assert.strictEqual(state.player.gold, before - AC.UNIT_MAP[id].cost);
  assert.ok(state.player.bench.filter(Boolean).length >= 1);
  rosterOk(state);
  state.player.gold = 10;
  assert.strictEqual(AC.refreshShop(state).ok, true);
  assert.strictEqual(state.player.gold, 8);
  rosterOk(state);
  assert.strictEqual(AC.buyXp(state).ok, true);
  assert.ok(state.player.level >= 2);
  rosterOk(state);
}

function testCombineAndSell() {
  const state = AC.createGame(3);
  for (let i = 0; i < 9; i++) {
    const res = AC.debugAddCopy(state, "yanwei");
    assert.strictEqual(res.ok, true, "copy " + i);
  }
  const pieces = state.player.bench.filter(Boolean).concat(state.player.board.filter(Boolean));
  assert.strictEqual(pieces.length, 1);
  assert.strictEqual(pieces[0].star, 3);
  assert.strictEqual(pieces[0].typeId, "yanwei");
  rosterOk(state);
  const gold = state.player.gold;
  const pool = state.pool.yanwei;
  const sold = AC.sellPiece(state, "bench", state.player.bench.findIndex(Boolean));
  assert.strictEqual(sold.ok, true);
  assert.strictEqual(sold.gold, 9);
  assert.strictEqual(state.player.gold, gold + 9);
  assert.strictEqual(state.pool.yanwei, pool + 9);
  rosterOk(state);
}

function testBoardCap() {
  const state = AC.createGame(1);
  assert.strictEqual(AC.debugAddCopy(state, "yaya").ok, true);
  assert.strictEqual(AC.debugAddCopy(state, "tiezu").ok, true);
  const a = state.player.bench.findIndex(function (p) { return p && p.typeId === "yaya"; });
  const b = state.player.bench.findIndex(function (p) { return p && p.typeId === "tiezu"; });
  assert.strictEqual(AC.movePiece(state, { zone: "bench", index: a }, { zone: "board", index: 3 }).ok, true);
  const moved = AC.movePiece(state, { zone: "bench", index: b }, { zone: "board", index: 4 });
  assert.strictEqual(moved.ok, false);
  assert.strictEqual(state.player.board.filter(Boolean).length, 1);
  rosterOk(state);
}

function testTraitsAndCombat() {
  const board = [
    { uid: 1, typeId: "yanwei", star: 1, items: [] },
    { uid: 2, typeId: "yanwu", star: 1, items: [] },
  ];
  const view = AC.traitView(board);
  const flame = view.filter(function (row) { return row.id === "flame"; })[0];
  assert.ok(flame.active);
  assert.strictEqual(flame.count, 2);

  const mage = AC.makeFighter("xingyun", 3, 3, 4, "player", { mana: 200 });
  const dummy = AC.makeCreepFighter({
    name: "木桩",
    glyph: "桩",
    hp: 400,
    ad: 1,
    as: 0.2,
    range: 1,
    armor: 0,
    mr: 0,
    col: 3,
    row: 3,
    side: "enemy",
    maxMana: 0,
  });
  const replay = AC.runCombat([mage, dummy], 5);
  assert.strictEqual(replay.winner, "player");
  assert.ok(replay.events.some(function (ev) { return ev.type === "cast" && ev.name === "星陨"; }));
}

function testCreepRound() {
  const state = AC.createGame(11);
  const empty = AC.resolveRound(state);
  assert.strictEqual(empty.won, false);
  assert.ok(empty.damage > 0 && empty.damage <= 6);

  const armed = AC.createGame(11);
  assert.strictEqual(AC.debugAddCopy(armed, "yanwei").ok, true);
  const idx = armed.player.bench.findIndex(Boolean);
  assert.strictEqual(AC.movePiece(armed, { zone: "bench", index: idx }, { zone: "board", index: 3 }).ok, true);
  const fight = AC.resolveRound(armed);
  assert.strictEqual(fight.pve, true);
  assert.strictEqual(fight.won, true, "a frontline guard should beat the first boar");
}

function testFullGames() {
  const placements = [];
  for (let seed = 1; seed <= 12; seed++) {
    const state = AC.createGame(seed * 17 + 3);
    let guard = 0;
    while (!state.over && guard++ < 40) {
      if (state.itemDraft) AC.takeItem(state, 0);
      for (let n = 0; n < 8; n++) {
        const shopIndex = state.player.shop.findIndex(Boolean);
        if (shopIndex < 0) break;
        const unit = AC.UNIT_MAP[state.player.shop[shopIndex]];
        if (!unit || state.player.gold < unit.cost) break;
        const bought = AC.buyFromShop(state, shopIndex);
        if (!bought.ok) break;
      }
      for (let i = 0; i < 9; i++) {
        if (!state.player.bench[i]) continue;
        if (state.player.board.filter(Boolean).length >= state.player.level) break;
        const empty = state.player.board.findIndex(function (p) { return !p; });
        if (empty < 0) break;
        AC.movePiece(state, { zone: "bench", index: i }, { zone: "board", index: empty });
      }
      if (state.player.gold >= 12 && state.player.level < 8 && state.round % 2 === 0) AC.buyXp(state);
      const result = AC.resolveRound(state);
      assert.ok(result.replay);
      assert.ok(result.replay.events.length > 0);
      AC.applyRoundResult(state, result);
      rosterOk(state);
    }
    assert.ok(state.over, "seed " + seed + " did not finish by round " + state.round);
    assert.ok(state.over.placement >= 1 && state.over.placement <= 8);
    placements.push(state.over.placement + (state.over.win ? " win" : " loss") + " r" + state.round);
  }
  console.log("placements", placements.join(", "));
}

testHex();
testCatalog();
testCreateAndShop();
testCombineAndSell();
testBoardCap();
testTraitsAndCombat();
testCreepRound();
testFullGames();
console.log("logic tests passed");
