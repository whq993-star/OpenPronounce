(function () {
  "use strict";

  const AC = window.AutoChess;
  const COLS = 7;

  let state = null;
  let started = false;
  let modal = null;
  let codexCost = 0;
  let selectedUid = null;
  let hoverUid = null;
  let armItem = null;
  let busy = false;
  let timerId = null;
  let timerLeft = 40;
  let muted = false;
  let rate = 2.4;
  let metrics = null;
  let audioCtx = null;
  let skipFight = null;

  const costName = ["", "一费", "二费", "三费", "四费", "五费"];

  function $(id) { return document.getElementById(id); }

  function tone(freq, dur, type, gain) {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const amp = audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(gain || 0.04, audioCtx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(amp);
      amp.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (err) { /* audio is optional */ }
  }

  function toast(text, big) {
    const el = document.createElement("div");
    el.className = "toast" + (big ? " big" : "");
    el.textContent = text;
    $("toasts").appendChild(el);
    while ($("toasts").children.length > 4) $("toasts").firstChild.remove();
    setTimeout(function () { el.remove(); }, 2200);
  }

  function computeMetrics() {
    const stage = $("stage");
    const maxW = Math.max(280, stage.clientWidth - 8);
    const maxH = Math.max(300, stage.clientHeight - 8);
    const rW = maxW / (Math.sqrt(3) * 7.65);
    const rH = maxH / 13.5;
    const R = Math.max(16, Math.min(rW, rH, 36));
    const hexW = Math.sqrt(3) * R;
    const rowH = R * 1.5;
    const gap = R * 0.95;
    return {
      R: R,
      hexW: hexW,
      hexH: R * 2,
      rowH: rowH,
      gap: gap,
      width: hexW * 7.55,
      height: rowH * 7 + R * 2 + gap,
    };
  }

  function center(col, row) {
    const m = metrics;
    const x = m.hexW * (col + (row % 2 ? 0.5 : 0)) + m.hexW / 2;
    let y = m.R + row * m.rowH;
    if (row >= 4) y += m.gap;
    return { x: x, y: y };
  }

  function pin(el, col, row) {
    const p = center(col, row);
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
  }

  function stars(n) {
    return "★★★".slice(0, n || 1);
  }

  function pieceView(piece) {
    const def = AC.UNIT_MAP[piece.typeId];
    let copies = 0;
    state.player.board.concat(state.player.bench).forEach(function (other) {
      if (other && other.typeId === piece.typeId && other.star === piece.star) copies += 1;
    });
    return {
      uid: piece.uid,
      name: def.name,
      glyph: def.glyph,
      color: AC.TRAITS[def.origin].color,
      star: piece.star,
      cost: def.cost,
      items: piece.items,
      progress: piece.star < 3 && copies >= 2 ? copies + "/3" : "",
    };
  }

  function makeToken(view, opts) {
    opts = opts || {};
    const el = document.createElement(opts.button ? "button" : "div");
    if (opts.button) el.type = "button";
    el.className = "token s" + (view.star || 1) + (opts.ghost ? " ghost" : "");
    el.style.setProperty("--c", view.color || "#e4c17a");
    if (view.uid) el.dataset.uid = view.uid;
    if (opts.zone) {
      el.dataset.zone = opts.zone;
      el.dataset.index = String(opts.index);
    }
    const items = (view.items || []).map(function (id) {
      return '<i style="background:' + AC.ITEMS[id].color + '"></i>';
    }).join("");
    el.innerHTML =
      '<b class="glyph">' + view.glyph + "</b>" +
      '<em class="stars">' + stars(view.star) + "</em>" +
      "<small class=\"nm\">" + view.name + "</small>" +
      (view.progress ? '<em class="prog">' + view.progress + "</em>" : "") +
      (items ? '<span class="pips">' + items + "</span>" : "") +
      (opts.combat ? '<span class="hpbar"><span></span></span>' : "");
    return el;
  }

  function renderHexes() {
    metrics = computeMetrics();
    const board = $("board");
    board.style.width = metrics.width + "px";
    board.style.height = metrics.height + "px";
    board.style.setProperty("--ts", Math.round(metrics.R * 1.45) + "px");
    const layer = $("hexes");
    layer.innerHTML = "";
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < COLS; col++) {
        const el = document.createElement("div");
        el.className = "hex " + (row >= 4 ? "mine" : "foe") + (row === 4 ? " front" : "");
        el.dataset.col = String(col);
        el.dataset.row = String(row);
        const p = center(col, row);
        el.style.width = metrics.hexW + "px";
        el.style.height = metrics.hexH + "px";
        el.style.left = p.x - metrics.hexW / 2 + "px";
        el.style.top = p.y - metrics.hexH / 2 + "px";
        layer.appendChild(el);
      }
    }
    const label = document.createElement("div");
    label.id = "gaplabel";
    const y = (center(3, 3).y + center(3, 4).y) / 2;
    label.style.top = y + "px";
    layer.appendChild(label);
  }

  function renderTop() {
    const xpNeed = state.player.level >= 9 ? 1 : AC.XP_NEED[state.player.level];
    const xpPct = state.player.level >= 9 ? 100 : Math.min(100, (state.player.xp / xpNeed) * 100);
    const interest = Math.min(5, Math.floor(state.player.gold / 10));
    const onBoard = state.player.board.filter(Boolean).length;
    const phase = state.phase === "combat" ? "交锋" : state.over ? "终局" : "备战";
    const kind = state.round <= 3 ? "野怪" : "对战";
    const preview = AC.enemyPreview(state);
    $("top").innerHTML =
      '<div class="brand"><b>星铸</b><span>自走棋</span></div>' +
      '<div class="round-block"><strong>第 ' + state.round + " 回合</strong><em>" + phase + " · " + kind + " · " + preview.title + "</em></div>" +
      '<div class="meters">' +
        '<div class="meter"><div class="label"><span>生命</span><b id="hp">' + state.player.hp + "</b></div>" +
          '<div class="bar hp"><span style="width:' + state.player.hp + '%"></span></div></div>' +
        '<div class="meter"><div class="label"><span>金币</span><b id="gold">' + state.player.gold + "</b></div>" +
          '<div class="label"><span>利息 +' + interest + "</span><span>上场 " + onBoard + "/" + state.player.level + "</span></div></div>" +
        '<div class="meter"><div class="label"><span>等级 ' + state.player.level + "</span><b>" +
          (state.player.level >= 9 ? "满级" : state.player.xp + "/" + xpNeed) + "</b></div>" +
          '<div class="bar xp"><span style="width:' + xpPct + '%"></span></div></div>' +
      "</div>" +
      '<button type="button" class="text-btn" id="btn-codex">图鉴</button>' +
      '<button type="button" class="text-btn" id="btn-help">说明</button>' +
      '<button type="button" class="icon-btn' + (muted ? "" : " active") + '" id="btn-mute">' + (muted ? "静音" : "声效") + "</button>";
  }

  function renderLobby() {
    const preview = AC.enemyPreview(state);
    const people = [{ name: "你", hp: state.player.hp, alive: !state.over, self: true, foe: false }].concat(
      state.ais.map(function (ai) {
        return { name: ai.name, hp: ai.hp, alive: ai.alive, self: false, foe: !preview.pve && ai.name === preview.title };
      })
    );
    $("lobby").innerHTML = people.map(function (p) {
      return '<div class="crest' + (p.self ? " self" : "") + (p.alive ? "" : " dead") + (p.foe ? " foe" : "") + '">' +
        '<div class="nm"><b>' + p.name + "</b><span>" + Math.max(0, p.hp) + "</span></div>" +
        '<div class="track"><span style="width:' + Math.max(0, Math.min(100, p.hp)) + '%"></span></div></div>';
    }).join("");
  }

  function renderTraits() {
    const rows = AC.traitView(state.player.board.filter(Boolean));
    const hint = state.round <= 2
      ? '<p class="hint">点击商店购买棋子，拖到下方金色半场。前排留战士和守卫，后排放射手与法师。快捷键：F 刷新，D 经验，空格开战。</p>'
      : '<p class="hint">每 10 金币回合开始 +1 利息，上限 5。连胜或连败也会加钱。</p>';
    $("left").innerHTML = "<h2>羁绊</h2>" + (rows.length ? rows.map(function (row) {
      const mark = row.active ? row.count + (row.next ? "/" + row.next : "") : row.count + "/" + (row.next || row.current);
      return '<div class="trait' + (row.active ? "" : " off") + '">' +
        '<i style="--c:' + row.color + '"></i><div><div class="row"><b>' + row.name + "</b><span>" + mark + "</span></div>" +
        "<small>" + row.text + "</small></div></div>";
    }).join("") : '<p class="empty-note">把棋子放上棋盘后，这里会显示羁绊。</p>') + hint;
  }

  function locate(uid) {
    if (!uid || !state) return null;
    for (let i = 0; i < state.player.board.length; i++) {
      if (state.player.board[i] && state.player.board[i].uid === uid) {
        return { zone: "board", index: i, piece: state.player.board[i] };
      }
    }
    for (let i = 0; i < state.player.bench.length; i++) {
      if (state.player.bench[i] && state.player.bench[i].uid === uid) {
        return { zone: "bench", index: i, piece: state.player.bench[i] };
      }
    }
    return null;
  }

  function renderDetail() {
    const found = locate(selectedUid || hoverUid);
    if (!found) {
      const preview = AC.enemyPreview(state);
      const might = preview.might ? '<p class="empty-note">对手历练 +' + Math.round(preview.might * 100) + "% 生命与攻击。</p>" : "";
      const traits = (preview.traits || []).slice(0, 4).map(function (row) {
        return row.name + " " + row.count;
      }).join(" · ");
      $("right").innerHTML = "<h2>侦察</h2><p class=\"empty-note\">下一场对阵 <b style=\"color:var(--ivory)\">" +
        preview.title + "</b>" + (preview.subtitle ? " · " + preview.subtitle : "") + "</p>" +
        (traits ? '<p class="empty-note">' + traits + "</p>" : "") + might +
        '<p class="empty-note">点一名自己的棋子查看属性和技能。右键出售。</p>';
      return;
    }
    const piece = found.piece;
    const def = AC.UNIT_MAP[piece.typeId];
    const ability = AC.ABILITIES[def.ability];
    const stats = AC.previewStats(piece, state.player.board.filter(Boolean));
    const sell = def.cost * (piece.star === 1 ? 1 : piece.star === 2 ? 3 : 9);
    const items = piece.items.map(function (id, index) {
      return '<button type="button" data-unequip="' + index + '">' + AC.ITEMS[id].name + " · 卸下</button>";
    }).join("");
    $("right").innerHTML =
      '<div class="detail"><div class="who"><div class="disc" style="--c:' + AC.TRAITS[def.origin].color + '">' + def.glyph + "</div>" +
      "<div><b>" + def.name + " " + stars(piece.star) + "</b><span>" + costName[def.cost] + " · " +
      AC.ORIGIN_NAME[def.origin] + " · " + AC.CLASS_NAME[def.cls] + "</span></div></div>" +
      '<p class="ability"><b>' + ability.name + "。</b>" + ability.text + "</p>" +
      '<div class="stats">' +
        "<span>生命 <b>" + stats.hp + "</b></span><span>攻击 <b>" + stats.ad + "</b></span>" +
        "<span>攻速 <b>" + stats.as + "</b></span><span>护甲 <b>" + stats.armor + "</b></span>" +
        "<span>魔抗 <b>" + stats.mr + "</b></span><span>法强 <b>" + stats.ap + "</b></span>" +
        "<span>射程 <b>" + stats.range + "</b></span><span>法力 <b>" + stats.startMana + "/" + stats.mana + "</b></span>" +
      "</div>" +
      (items ? '<div class="mini-items">' + items + "</div>" : "") +
      '<button type="button" class="text-btn" id="btn-sell" data-sell="1">出售 +' + sell + "</button></div>";
  }

  function renderUnits() {
    const layer = $("units");
    layer.innerHTML = "";
    const preview = AC.enemyPreview(state);
    const label = $("gaplabel");
    if (label) label.textContent = "";
    preview.units.forEach(function (unit) {
      const el = makeToken(unit, { ghost: true });
      pin(el, unit.col, unit.row);
      layer.appendChild(el);
    });
    state.player.board.forEach(function (piece, index) {
      if (!piece) return;
      const el = makeToken(pieceView(piece), { button: true, zone: "board", index: index });
      pin(el, index % COLS, Math.floor(index / COLS) + 4);
      layer.appendChild(el);
    });
  }

  function renderBench() {
    $("bench").innerHTML = '<span class="section-label">备战</span>' + state.player.bench.map(function (piece, index) {
      if (!piece) return '<div class="slot" data-bench="' + index + '"></div>';
      const view = pieceView(piece);
      return '<button type="button" class="bench-piece" data-zone="bench" data-index="' + index + '" data-uid="' + piece.uid +
        '" style="--c:' + view.color + '"><b class="glyph">' + view.glyph + '</b><em class="stars">' + stars(piece.star) +
        '</em><small class="nm">' + view.name + "</small></button>";
    }).join("");
  }

  function renderItems() {
    if (!state.player.itemBench.length && armItem == null) {
      $("items").innerHTML = "";
      return;
    }
    $("items").innerHTML = '<span class="section-label">装备</span>' + state.player.itemBench.map(function (id, index) {
      const item = AC.ITEMS[id];
      return '<button type="button" class="chip' + (armItem === index ? " armed" : "") + '" data-arm="' + index + '" style="border-color:' +
        item.color + '">' + item.glyph + " " + item.name + "<small> " + item.desc + "</small></button>";
    }).join("") + (armItem != null ? '<span class="section-label">点一名棋子穿上</span>' : "");
  }

  function renderShop() {
    $("shop").innerHTML = state.player.shop.map(function (id, index) {
      if (!id) return '<div class="card empty">空</div>';
      const def = AC.UNIT_MAP[id];
      const poor = state.player.gold < def.cost ? " poor" : "";
      return '<button type="button" class="card c' + def.cost + poor + '" data-shop="' + index + '">' +
        '<span class="cost">' + def.cost + "</span>" +
        '<span class="disc" style="--c:' + AC.TRAITS[def.origin].color + '">' + def.glyph + "</span>" +
        '<span class="card-name">' + def.name + "</span>" +
        '<span class="card-tags">' + AC.ORIGIN_NAME[def.origin] + " · " + AC.CLASS_NAME[def.cls] + "</span></button>";
    }).join("");
    const lock = state.player.lock;
    $("actions").innerHTML =
      '<button type="button" class="act" id="btn-refresh">刷新<small>2 金 · F</small></button>' +
      '<button type="button" class="act" id="btn-xp">经验<small>4 金 · D</small></button>' +
      '<button type="button" class="act' + (lock ? " on" : "") + '" id="btn-lock">' + (lock ? "已锁定" : "锁定") + "<small>L</small></button>" +
      '<button type="button" class="act primary" id="btn-fight">开战 <span id="time">' + timerLeft + "</span><small>空格</small></button>";
  }

  function flushNotices() {
    const lines = (state.notice || []).slice();
    state.notice = [];
    (state.lastUpgrades || []).forEach(function (up) {
      lines.push(AC.UNIT_MAP[up.typeId].name + " 升为 " + up.star + " 星");
      tone(up.star >= 3 ? 660 : 520, 0.18, "triangle", 0.05);
    });
    state.lastUpgrades = [];
    lines.forEach(function (line) { toast(line, line.indexOf("升为") >= 0); });
  }

  function renderModal() {
    const root = $("modal");
    if (!started) {
      root.className = "open";
      root.innerHTML = '<div class="dialog"><h1>星铸</h1><p class="lead">一局能玩完的自走棋。买棋子、凑羁绊、摆上六角棋盘，然后看他们自己打。</p><ul>' +
        "<li>点击商店购买。三个相同星级的棋子会合成更高星。</li>" +
        "<li>等级决定能上场的人数。经验 4 金，刷新商店 2 金。</li>" +
        "<li>每存 10 金币，下回合开始多 1 利息，最多 5。</li>" +
        "<li>前三回合打野怪，之后和其他铸星者对战。生命归零就被淘汰。</li>" +
        "<li>战士和守卫放前排，射手、法师、辅助放后排。</li></ul>" +
        '<button type="button" class="go" id="btn-start">开始对局</button></div>';
      return;
    }
    if (state.over) {
      root.className = "open";
      root.innerHTML = '<div class="dialog"><h1>' + (state.over.win ? "铸星成功" : "第 " + state.over.placement + " 名") + "</h1>" +
        "<p>" + (state.over.win ? "其他铸星者都已倒下。" : "你在第 " + state.over.round + " 回合退出了棋局。") + "</p>" +
        "<p>胜 " + state.wins + " 场 · 负 " + state.losses + " 场</p>" +
        '<button type="button" class="go" id="btn-again">再来一局</button></div>';
      return;
    }
    if (modal === "help") {
      root.className = "open";
      root.innerHTML = '<div class="dialog"><h1>怎么玩</h1><ul>' +
        "<li>F 刷新，D 买经验，L 锁定商店，空格开战，E 出售选中棋子。</li>" +
        "<li>右键棋子可以直接卖掉。卖掉会按星级退回金币。</li>" +
        "<li>装备先点一下，再点棋子穿上。每名棋子最多三件。</li>" +
        "<li>第 4、7、11、15 回合会送来三件装备里选一件。</li></ul>" +
        '<button type="button" class="go" id="btn-close-modal">返回棋盘</button></div>';
      return;
    }
    if (modal === "codex") {
      const units = AC.UNIT_LIST.filter(function (unit) { return !codexCost || unit.cost === codexCost; });
      root.className = "open";
      root.innerHTML = '<div class="dialog"><h1>图鉴</h1><div class="filters">' +
        [0, 1, 2, 3, 4, 5].map(function (cost) {
          return '<button type="button" data-cost="' + cost + '" class="' + (codexCost === cost ? "on" : "") + '">' +
            (cost ? costName[cost] : "全部") + "</button>";
        }).join("") + "</div>" +
        '<div class="codex-grid">' + units.map(function (unit) {
          const ability = AC.ABILITIES[unit.ability];
          return '<article class="codex-card"><b style="color:' + AC.TRAITS[unit.origin].color + '">' + unit.glyph + " " + unit.name +
            "</b><span>" + costName[unit.cost] + " · " + AC.ORIGIN_NAME[unit.origin] + " · " + AC.CLASS_NAME[unit.cls] +
            "</span><p>" + ability.name + "：" + ability.text + "</p></article>";
        }).join("") + "</div>" +
        '<p class="lead">羁绊按场上不同名字的棋子计算，同名棋子只算一个。备战席不算。</p>' +
        '<button type="button" class="go" id="btn-close-modal">返回棋盘</button></div>';
      return;
    }
    if (state.itemDraft) {
      root.className = "open";
      root.innerHTML = '<div class="dialog"><h1>选择装备</h1><p class="lead">三选一。之后点装备，再点棋子穿上。</p><div class="drafts">' +
        state.itemDraft.map(function (id, index) {
          const item = AC.ITEMS[id];
          return '<button type="button" class="draft-card" data-draft="' + index + '"><b style="color:' + item.color + '">' +
            item.glyph + " " + item.name + "</b><span>" + item.desc + "</span></button>";
        }).join("") + "</div></div>";
      return;
    }
    root.className = "";
    root.innerHTML = "";
  }

  function renderAll() {
    if (!state) {
      renderModal();
      return;
    }
    renderHexes();
    renderTop();
    renderLobby();
    renderTraits();
    renderUnits();
    renderBench();
    renderItems();
    renderShop();
    renderDetail();
    renderModal();
    flushNotices();
    $("banner").className = "";
  }

  function paintTime() {
    const el = $("time");
    if (el) el.textContent = String(timerLeft);
  }

  function armTimer() {
    clearInterval(timerId);
    timerLeft = 40;
    paintTime();
    timerId = setInterval(function () {
      if (!state || state.phase !== "planning" || busy || modal || state.itemDraft || state.over) return;
      timerLeft -= 1;
      paintTime();
      if (timerLeft <= 0) fight();
    }, 1000);
  }

  function startGame() {
    state = AC.createGame((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    started = true;
    modal = null;
    selectedUid = null;
    armItem = null;
    busy = false;
    document.body.classList.remove("in-fight");
    renderAll();
    armTimer();
    tone(440, 0.08, "sine", 0.03);
  }

  function afterMutation(res) {
    if (!res.ok) {
      toast(res.reason || "不行");
      tone(180, 0.08, "square", 0.02);
      return;
    }
    renderAll();
  }

  function fight() {
    if (!state || state.phase !== "planning" || busy) return;
    if (state.itemDraft) {
      toast("先选一件装备");
      return;
    }
    busy = true;
    clearInterval(timerId);
    state.phase = "combat";
    const result = AC.resolveRound(state);
    document.body.classList.add("in-fight");
    $("btn-skip").hidden = false;
    renderTop();
    const fightBtn = $("btn-fight");
    if (fightBtn) fightBtn.innerHTML = "战斗中";
    $("banner").className = "";
    playReplay(result.replay, function () {
      document.body.classList.remove("in-fight");
      $("btn-skip").hidden = true;
      skipFight = null;
      AC.applyRoundResult(state, result);
      busy = false;
      if (result.won) tone(523, 0.12, "triangle", 0.05);
      else if (!result.draw) tone(196, 0.18, "sawtooth", 0.03);
      renderAll();
      if (!state.over) armTimer();
    });
  }

  function playReplay(replay, done) {
    const layer = $("units");
    layer.innerHTML = "";
    const nodes = new Map();
    replay.units.forEach(function (unit) {
      const el = makeToken(unit, { combat: true });
      pin(el, unit.col, unit.row);
      layer.appendChild(el);
      const hp = el.querySelector(".hpbar > span");
      nodes.set(unit.uid, { el: el, hp: unit.hp, max: unit.maxHp, hpEl: hp });
    });
    const events = replay.events;
    let index = 0;
    let stopped = false;
    const t0 = performance.now();

    function floatOn(node, text, cls) {
      if (!node) return;
      const floater = document.createElement("span");
      floater.className = "floater " + (cls || "");
      floater.textContent = text;
      node.el.appendChild(floater);
      setTimeout(function () { floater.remove(); }, 700);
    }

    function applyEvent(ev) {
      const node = ev.id ? nodes.get(ev.id) : null;
      const target = ev.target ? nodes.get(ev.target) : null;
      if (ev.type === "move" && node) {
        node.el.style.transition = "left .16s linear, top .16s linear";
        pin(node.el, ev.col, ev.row);
      } else if (ev.type === "hit" && target) {
        target.hp = Math.max(0, target.hp - ev.dmg);
        if (target.hpEl) target.hpEl.style.width = Math.max(0, (target.hp / target.max) * 100) + "%";
        if (ev.dmg > 0) floatOn(target, (ev.crit ? "" : "-") + ev.dmg, ev.crit ? "crit" : ev.kind === "magic" || ev.kind === "burn" ? "magic" : "");
        if (node) {
          node.el.classList.add("pulse");
          setTimeout(function () { node.el.classList.remove("pulse"); }, 160);
        }
      } else if (ev.type === "heal" && node) {
        node.hp = Math.min(node.max, node.hp + ev.amount);
        if (node.hpEl) node.hpEl.style.width = (node.hp / node.max) * 100 + "%";
        floatOn(node, "+" + ev.amount, "heal");
      } else if (ev.type === "shield" && node) {
        floatOn(node, "盾" + ev.amount, "magic");
      } else if (ev.type === "cast" && node) {
        node.el.classList.add("cast");
        floatOn(node, ev.name, "castname");
        setTimeout(function () { node.el.classList.remove("cast"); }, 450);
        tone(640, 0.06, "sine", 0.02);
      } else if (ev.type === "death" && node) {
        node.el.classList.add("dead");
      }
    }

    function finish() {
      if (stopped) return;
      stopped = true;
      setTimeout(done, 650);
    }

    skipFight = function () {
      while (index < events.length) applyEvent(events[index++]);
      const end = events[events.length - 1];
      if (end && end.type === "end") {
        const banner = $("banner");
        banner.textContent = end.winner === "player" ? "胜利" : end.winner === "enemy" ? "失利" : "平局";
        banner.className = "show " + end.winner;
      }
      finish();
    };

    function frame(now) {
      if (stopped) return;
      const simT = ((now - t0) / 1000) * rate;
      while (index < events.length && events[index].t <= simT) {
        const ev = events[index++];
        applyEvent(ev);
        if (ev.type === "end") {
          const banner = $("banner");
          banner.textContent = ev.winner === "player" ? "胜利" : ev.winner === "enemy" ? "失利" : "平局";
          banner.className = "show " + ev.winner;
          finish();
          return;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  let drag = null;

  function onPointerDown(event) {
    if (!state || state.phase !== "planning" || busy) return;
    const token = event.target.closest("[data-zone]");
    if (!token) return;
    event.preventDefault();
    const zone = token.dataset.zone;
    const index = Number(token.dataset.index);
    const piece = zone === "board" ? state.player.board[index] : state.player.bench[index];
    if (!piece) return;
    selectedUid = piece.uid;
    drag = {
      uid: piece.uid,
      zone: zone,
      index: index,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    token.setPointerCapture(event.pointerId);
    renderDetail();
  }

  function onPointerMove(event) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && dx * dx + dy * dy < 25) return;
    drag.moved = true;
    document.body.classList.add("dragging");
    const ghost = $("drag-ghost");
    const found = locate(drag.uid);
    if (!found) return;
    const def = AC.UNIT_MAP[found.piece.typeId];
    ghost.hidden = false;
    ghost.style.setProperty("--c", AC.TRAITS[def.origin].color);
    ghost.textContent = def.glyph;
    ghost.style.left = event.clientX + "px";
    ghost.style.top = event.clientY + "px";
    document.querySelectorAll(".hex.hot, .slot.hot").forEach(function (el) { el.classList.remove("hot"); });
    const hit = hitTarget(event.clientX, event.clientY);
    if (hit && hit.el) hit.el.classList.add("hot");
  }

  function hitTarget(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (let i = 0; i < stack.length; i++) {
      const el = stack[i];
      if (el.id === "drag-ghost") continue;
      if (el.closest && el.closest("[data-uid='" + drag.uid + "']")) continue;
      const hex = el.closest ? el.closest(".hex") : null;
      if (hex) {
        const row = Number(hex.dataset.row);
        const col = Number(hex.dataset.col);
        if (row >= 4) return { type: "board", index: (row - 4) * COLS + col, el: hex };
      }
      const benchPiece = el.closest ? el.closest("[data-zone='bench']") : null;
      if (benchPiece) return { type: "bench", index: Number(benchPiece.dataset.index), el: benchPiece };
      const slot = el.closest ? el.closest("[data-bench]") : null;
      if (slot) return { type: "bench", index: Number(slot.dataset.bench), el: slot };
      if (el.closest && (el.closest("#sell") || el.closest("#shop") || el.id === "sell")) return { type: "sell", el: $("sell") };
    }
    return null;
  }

  function onPointerUp(event) {
    if (!drag) return;
    const current = drag;
    drag = null;
    document.body.classList.remove("dragging");
    $("drag-ghost").hidden = true;
    document.querySelectorAll(".hex.hot, .slot.hot").forEach(function (el) { el.classList.remove("hot"); });
    if (!current.moved) {
      if (armItem != null) {
        const found = locate(current.uid);
        if (found) afterMutation(AC.equipItem(state, armItem, found.zone, found.index));
        armItem = null;
        renderItems();
        return;
      }
      selectedUid = current.uid;
      renderDetail();
      return;
    }
    const hit = hitTarget(event.clientX, event.clientY);
    const found = locate(current.uid);
    if (!found) return;
    if (!hit) return;
    if (hit.type === "sell") {
      tone(300, 0.08, "square", 0.03);
      afterMutation(AC.sellPiece(state, found.zone, found.index));
      return;
    }
    const res = AC.movePiece(state, { zone: found.zone, index: found.index }, { zone: hit.type, index: hit.index });
    if (!res.ok) toast(res.reason);
    else tone(480, 0.05, "sine", 0.03);
    renderAll();
  }

  function onKey(event) {
    if (event.repeat || !started) return;
    if (event.key === "Escape" && (modal === "codex" || modal === "help")) {
      modal = null;
      renderModal();
      return;
    }
    if (!state || busy || modal || state.itemDraft || state.phase !== "planning") return;
    const key = event.key.toLowerCase();
    if (key === "f") { event.preventDefault(); afterMutation(AC.refreshShop(state)); tone(700, 0.04, "square", 0.02); }
    else if (key === "d") { event.preventDefault(); afterMutation(AC.buyXp(state)); }
    else if (key === "l") { event.preventDefault(); afterMutation(AC.toggleLock(state)); }
    else if (key === " " || key === "enter") { event.preventDefault(); fight(); }
    else if (key === "e") {
      const found = locate(selectedUid);
      if (found) afterMutation(AC.sellPiece(state, found.zone, found.index));
    }
  }

  function bind() {
    $("units").addEventListener("pointerdown", onPointerDown);
    $("bench").addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", function () {
      if (state && !busy) {
        renderHexes();
        renderUnits();
      }
    });
    $("bench").addEventListener("dblclick", function (event) {
      const token = event.target.closest("[data-zone='bench']");
      if (!token || busy || !state || state.phase !== "planning") return;
      if (state.player.board.filter(Boolean).length >= state.player.level) {
        toast("上场人数已满");
        return;
      }
      const empty = state.player.board.findIndex(function (piece) { return !piece; });
      if (empty < 0) return;
      afterMutation(AC.movePiece(state, { zone: "bench", index: Number(token.dataset.index) }, { zone: "board", index: empty }));
    });
    document.addEventListener("contextmenu", function (event) {
      const token = event.target.closest("[data-zone]");
      if (!token || !state || busy || state.phase !== "planning") return;
      event.preventDefault();
      afterMutation(AC.sellPiece(state, token.dataset.zone, Number(token.dataset.index)));
    });
    $("dock").addEventListener("click", function (event) {
      if (!state || busy || state.phase !== "planning") return;
      const shop = event.target.closest("[data-shop]");
      if (shop) {
        const res = AC.buyFromShop(state, Number(shop.dataset.shop));
        if (!res.ok) {
          toast(res.reason);
          shop.classList.add("shake");
          return;
        }
        tone(880, 0.06, "triangle", 0.04);
        renderAll();
        return;
      }
      const button = event.target.closest("button");
      if (!button) return;
      if (button.id === "btn-fight") fight();
      if (button.id === "btn-refresh") { afterMutation(AC.refreshShop(state)); tone(700, 0.04, "square", 0.02); }
      if (button.id === "btn-xp") afterMutation(AC.buyXp(state));
      if (button.id === "btn-lock") afterMutation(AC.toggleLock(state));
    });
    $("items").addEventListener("click", function (event) {
      const chip = event.target.closest("[data-arm]");
      if (!chip || busy) return;
      const index = Number(chip.dataset.arm);
      armItem = armItem === index ? null : index;
      renderItems();
    });
    $("right").addEventListener("click", function (event) {
      if (!state || busy || state.phase !== "planning") return;
      if (event.target.closest("[data-sell]")) {
        const found = locate(selectedUid);
        if (found) afterMutation(AC.sellPiece(state, found.zone, found.index));
      }
      const unequip = event.target.closest("[data-unequip]");
      if (unequip) {
        const found = locate(selectedUid);
        if (found) afterMutation(AC.unequipItem(state, found.zone, found.index, Number(unequip.dataset.unequip)));
      }
    });
    $("top").addEventListener("click", function (event) {
      if (event.target.closest("#btn-mute")) {
        muted = !muted;
        renderTop();
        return;
      }
      if (event.target.closest("#btn-codex")) { modal = "codex"; renderModal(); }
      if (event.target.closest("#btn-help")) { modal = "help"; renderModal(); }
    });
    $("units").addEventListener("pointerover", function (event) {
      const token = event.target.closest("[data-uid]");
      if (!token || !token.dataset.zone) return;
      hoverUid = token.dataset.uid;
      if (!drag) renderDetail();
    });
    $("modal").addEventListener("click", function (event) {
      if (event.target.closest("#btn-start") || event.target.closest("#btn-again")) {
        startGame();
        return;
      }
      if (event.target.closest("#btn-close-modal")) {
        modal = null;
        renderModal();
        return;
      }
      const cost = event.target.closest("[data-cost]");
      if (cost && modal === "codex") {
        codexCost = Number(cost.dataset.cost);
        renderModal();
        return;
      }
      const draft = event.target.closest("[data-draft]");
      if (draft && state && state.itemDraft) {
        afterMutation(AC.takeItem(state, Number(draft.dataset.draft)));
        tone(560, 0.1, "triangle", 0.04);
        return;
      }
      if (event.target.id === "modal" && (modal === "codex" || modal === "help")) {
        modal = null;
        renderModal();
      }
    });
    $("btn-skip").addEventListener("click", function () {
      if (skipFight) skipFight();
    });
  }

  bind();
  renderModal();
})();
