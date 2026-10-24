// Familiar Faces: web port of TFF Face Drop (the arcade cabinet game in This Feels Familiar).
// 11 faces, devil (smallest) to UwU (biggest), drop into a box; two of the same merge into the next one up.
// Rules, layout numbers and art are the cabinet's. The game is drawn on a 2048 x 1536 canvas (the cabinet's 4:3
// screen) that is fitted to the window; in portrait the whole page is rotated so it always plays landscape.
(() => {
  "use strict";

  // ---------------- layout (the cabinet's facedrop_layout.json, canvas px, origin top-left) ----------------
  const CW = 2048, CH = 1536;
  const VH = 1280;                                       // rows shown: the HUD ends ~1246; the hint strip below is cropped so the game scales up
  const MPP = 0.00103736499364676;                       // metres per canvas px (the box is 1.0 m wide)
  const BOX = [545.0717703349283, 307.444976076555, 1509.0526315789473, 1215.0813397129186];
  const TITLE = [1027.0622009569379, 741.2631578947369];
  const SCORE = [278.6602870813397, 391.82775119617224];
  const BOARD_ROWS = [556.0956937799043, 621.6267942583731, 692.0574162679425, 763.1004784688995, 829.2440191387559, 895.3875598086124, 961.5311004784689, 1027.6746411483252, 1093.8181818181818, 1159.3492822966507];
  const BOARD_X = { icon: 185.89473684210526, name: 225.89473684210526, score: 477.42583732057415 };
  const BOARD_ICON = 48;
  const NEXT = { cx: 1777.3014354066986, cy: 490.9186602870813, d: 227.2918660287081 };
  const AFTER = { cx: 1777.3014354066986, cy: 852.8708133971292, d: 235.86602870813385 };
  const BTN_COMBOS = [1545.799043062201, 1003.1770334928229, 1767.5023923444976, 1235.9043062200956];
  const BTN_SETTINGS = [1787.1004784688994, 1003.1770334928229, 2008.8038277511962, 1235.9043062200956];
  const SETTINGS_BTNS = [
    [718.5917703349282, 497.444976076555, 1335.5517703349283, 605.444976076555],
    [718.5917703349282, 647.444976076555, 1335.5517703349283, 755.444976076555],
    [718.5917703349282, 797.444976076555, 1335.5517703349283, 905.444976076555],
  ];
  const RADII = [0.034, 0.046, 0.061, 0.071, 0.088, 0.109, 0.124, 0.146, 0.168, 0.189, 0.218];
  const RANKS = 11;
  const ART = 1 / 0.78;                                   // the picture is drawn 1/0.78 of the ball (room for ears)

  // stage metres (x right, y up); from the cabinet build report
  const BOX_L = -0.497, BOX_R = 0.503, BOX_B = -0.464, BOX_T = 0.478, DANGER_Y = 0.258, DROP_Y = 0.368;
  const PX = (x) => BOX[0] + (x - BOX_L) / MPP;
  const PY = (y) => BOX[3] - (y - BOX_B) / MPP;
  const POOL = 64;

  const CREAM = "#f7e6da";
  const STORE_RUNS = "ff_runs", STORE_SOUND = "ff_sound";

  // ---------------- assets ----------------
  // an image, retried a few times (a dropped request on a flaky phone connection must not leave the game on "loading")
  const img = (src, tries = 4) => new Promise((ok, bad) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => tries > 1 ? setTimeout(() => img(src + (src.includes("?") ? "" : "?r=") + tries, tries - 1).then(ok, bad), 400) : bad(new Error("could not load " + src));
    i.src = src;
  });
  const A = {};
  let audioCtx = null, soundOn = true;
  const clips = {};

  async function loadAudio() {
    const names = ["drop", "merge", "big", "over", "start", "click"];
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    await Promise.all(names.map(async (n) => {
      try {
        const buf = await (await fetch(`assets/fd_${n}.wav`)).arrayBuffer();
        clips[n] = await audioCtx.decodeAudioData(buf);
      } catch (e) { /* no sound for this clip */ }
    }));
  }
  function play(name, pitch = 1) {
    if (!soundOn || !audioCtx || !clips[name]) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const s = audioCtx.createBufferSource();
    s.buffer = clips[name];
    s.playbackRate.value = pitch;
    s.connect(audioCtx.destination);
    s.start();
  }

  // ---------------- state ----------------
  const IDLE = 0, PLAYING = 1, OVER = 2;
  let state = IDLE;
  let faces = [];                                        // {rank, x, y, vx, vy, ang, av, born, landed, pop}
  let score = 0, heldRank = -1, nextRank = -1, afterRank = -1;
  let cursorX = (BOX_L + BOX_R) / 2, heldX = cursorX;
  let dropReadyAt = 0, overTimer = 0, dangerLevel = 0, checkAt = 0;
  let maxRankThisGame = 0;
  let showCombos = false, showSettings = false;
  let runs = [];
  let coarse = matchMedia("(pointer: coarse)").matches;
  let now = 0;
  let pointerDown = false, pointerId = -1, pointerInBox = false;
  let fullscreenTried = false;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndRank = () => Math.floor(Math.random() * 5);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function loadStore() {
    try {
      runs = JSON.parse(localStorage.getItem(STORE_RUNS) || "[]");
      if (!Array.isArray(runs)) runs = [];
      const s = localStorage.getItem(STORE_SOUND);
      if (s !== null) soundOn = s === "1";
    } catch (e) { runs = []; }
  }
  function saveRun() {
    runs.push({ s: score, f: maxRankThisGame, t: Date.now() });
    runs.sort((a, b) => b.s - a.s || a.t - b.t);
    runs = runs.slice(0, 10);
    try { localStorage.setItem(STORE_RUNS, JSON.stringify(runs)); } catch (e) { /* private mode */ }
  }

  // ---------------- the game ----------------
  function startGame() {
    faces = [];
    score = 0; maxRankThisGame = 0; overTimer = 0; dangerLevel = 0;
    heldRank = rndRank(); nextRank = rndRank(); afterRank = rndRank();
    cursorX = heldX = (BOX_L + BOX_R) / 2;
    dropReadyAt = now + 0.35;
    state = PLAYING;
    play("start");
  }

  function drop() {
    if (state !== PLAYING || now < dropReadyAt || heldRank < 0) return;
    if (faces.length >= POOL) { gameOver(); return; }
    const r = RADII[heldRank];
    const x = clamp(cursorX, BOX_L + r + 0.002, BOX_R - r - 0.002);
    spawn(heldRank, x, DROP_Y, 0, 0, false);
    heldRank = nextRank; nextRank = afterRank; afterRank = rndRank();
    dropReadyAt = now + 0.55;
    play("drop");
  }

  function spawn(rank, x, y, vx, vy, pop) {
    faces.push({ rank, x, y, vx, vy, ang: rnd(-12, 12) * Math.PI / 180, av: 0, born: now, landed: pop, pop: pop ? 0 : 1 });
  }

  function merge(a, b) {
    const r = a.rank;
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, vx = (a.vx + b.vx) / 2, vy = (a.vy + b.vy) / 2;
    faces.splice(faces.indexOf(a), 1);
    faces.splice(faces.indexOf(b), 1);
    if (r === RANKS - 1) {
      score += 100;                                     // two of the biggest: both pop, bonus
      play("big");
    } else {
      const k = r + 1;
      if (faces.length < POOL) spawn(k, x, y, vx, vy, true);
      score += k * (k + 1) / 2;
      if (k > maxRankThisGame) maxRankThisGame = k;
      if (k >= RANKS - 2) play("big"); else play("merge", 1.25 - 0.05 * k);
    }
  }

  function gameOver() {
    if (state !== PLAYING) return;
    state = OVER;
    for (const f of faces) { f.vx = 0; f.vy = 0; f.av = 0; }
    saveRun();
    play("over");
  }

  // ---------------- physics (2D circles; the cabinet's Unity numbers: bounce 0.08, friction 0.22, mass = diameter x 10) ----------------
  const GRAVITY = 9.81, BOUNCE = 0.08, FRICTION = 0.22, ANG_DRAG = 0.4;
  const SUBSTEPS = 6, ITERS = 3;
  let merges = [];

  function invMass(f) { return 1 / (RADII[f.rank] * 20); }

  function wall(f, nx, ny, pen) {
    // a static wall with inward normal (nx, ny) overlapping the face by pen
    const r = RADII[f.rank], im = invMass(f), ii = im * 2.5;         // solid sphere: I = 0.4 m r^2
    f.x += nx * pen; f.y += ny * pen;
    const vn = f.vx * nx + f.vy * ny;
    if (vn < 0) {
      const j = -(1 + BOUNCE) * vn / im;
      f.vx += j * im * nx; f.vy += j * im * ny;
      const tx = -ny, ty = nx;
      const relT = f.vx * tx + f.vy * ty - f.av * r;
      let jt = -relT / (im + ii * r * r);
      const maxF = FRICTION * j;
      jt = clamp(jt, -maxF, maxF);
      f.vx += jt * im * tx; f.vy += jt * im * ty;
      f.av += -jt * r * ii;
    }
    f.landed = true;
  }

  function pair(a, b) {
    const ra = RADII[a.rank], rb = RADII[b.rank];
    let dx = b.x - a.x, dy = b.y - a.y;
    let d2 = dx * dx + dy * dy;
    const minD = ra + rb;
    if (d2 >= (minD + 0.0015) * (minD + 0.0015)) return;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { dx = 0; dy = 1; d = 1e-6; }
    const nx = dx / d, ny = dy / d;
    a.landed = true; b.landed = true;
    if (a.rank === b.rank && state === PLAYING) { merges.push([a, b]); return; }
    const pen = minD - d;
    if (pen <= 0) return;
    const ima = invMass(a), imb = invMass(b), isum = ima + imb;
    const corr = Math.max(pen - 0.0005, 0) * 0.6;
    a.x -= nx * corr * ima / isum; a.y -= ny * corr * ima / isum;
    b.x += nx * corr * imb / isum; b.y += ny * corr * imb / isum;
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const j = -(1 + BOUNCE) * vn / isum;
    a.vx -= j * ima * nx; a.vy -= j * ima * ny;
    b.vx += j * imb * nx; b.vy += j * imb * ny;
    const tx = -ny, ty = nx;
    const iia = ima * 2.5, iib = imb * 2.5;
    const relT = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty - b.av * rb - a.av * ra;
    let jt = -relT / (isum + iia * ra * ra + iib * rb * rb);
    const maxF = FRICTION * j;
    jt = clamp(jt, -maxF, maxF);
    a.vx -= jt * ima * tx; a.vy -= jt * ima * ty;
    b.vx += jt * imb * tx; b.vy += jt * imb * ty;
    a.av += -jt * ra * iia; b.av += -jt * rb * iib;
  }

  function step(dt) {
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const f of faces) {
        f.vy -= GRAVITY * h;
        f.x += f.vx * h; f.y += f.vy * h;
        f.ang += f.av * h;
        f.av *= Math.max(0, 1 - ANG_DRAG * h);
      }
      for (let it = 0; it < ITERS; it++) {
        merges.length = 0;
        const n = faces.length;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pair(faces[i], faces[j]);
        for (const f of faces) {
          const r = RADII[f.rank];
          if (f.x - r < BOX_L) wall(f, 1, 0, BOX_L - (f.x - r));
          if (f.x + r > BOX_R) wall(f, -1, 0, (f.x + r) - BOX_R);
          if (f.y - r < BOX_B) wall(f, 0, 1, BOX_B - (f.y - r));
        }
        if (merges.length) {
          const gone = new Set();
          for (const [a, b] of merges) {
            if (gone.has(a) || gone.has(b)) continue;
            gone.add(a); gone.add(b);
            merge(a, b);
          }
          if (state !== PLAYING) return;
        }
      }
    }
  }

  // 10 x a second: the danger line and game over (the cabinet's rule: a settled face over the line for 2 s)
  function check(dt) {
    let over = false, close = false;
    for (const f of faces) {
      if (!f.landed || now - f.born < 0.8) continue;
      const top = f.y + RADII[f.rank];
      if (top > DANGER_Y) over = true;
      else if (top > DANGER_Y - 0.08) close = true;
    }
    dangerLevel = over ? 1 : close ? 0.5 : 0;
    if (state !== PLAYING) return;
    overTimer = over ? overTimer + dt : 0;
    if (overTimer > 2) gameOver();
  }

  // ---------------- input ----------------
  const inRect = (r, x, y) => x >= r[0] && y >= r[1] && x <= r[2] && y <= r[3];

  function press(x, y) {
    // a tap / click at canvas px (x, y): overlays first, then the buttons, then the game
    if (showCombos) { showCombos = false; play("click"); return; }
    if (showSettings) {
      if (inRect(SETTINGS_BTNS[0], x, y)) { soundOn = !soundOn; try { localStorage.setItem(STORE_SOUND, soundOn ? "1" : "0"); } catch (e) { /* ignore */ } }
      else if (inRect(SETTINGS_BTNS[1], x, y)) { showSettings = false; startGame(); }
      else if (inRect(SETTINGS_BTNS[2], x, y)) { showSettings = false; toggleFullscreen(); }
      else showSettings = false;
      play("click");
      return;
    }
    if (inRect(BTN_COMBOS, x, y)) { showCombos = true; play("click"); return; }
    if (inRect(BTN_SETTINGS, x, y)) { showSettings = true; play("click"); return; }
    if (state === PLAYING) { drop(); return; }
    goImmersive();
    startGame();
  }

  function aimTo(x) {
    if (state !== PLAYING) return;
    const r = heldRank >= 0 ? RADII[heldRank] : 0;
    cursorX = clamp(BOX_L + (x - BOX[0]) * MPP, BOX_L + r + 0.002, BOX_R - r - 0.002);
  }

  function canFullscreen() { return !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen); }
  function toggleFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: "hide" });
    if (p && p.then) p.then(lockLandscape).catch(() => {});
    else lockLandscape();
  }
  function lockLandscape() {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); } catch (e) { /* not allowed here */ }
  }
  // on a phone / tablet, the first START also asks for fullscreen + landscape (only works inside a user gesture)
  function goImmersive() {
    if (fullscreenTried || !coarse) return;
    fullscreenTried = true;
    if (matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches) { lockLandscape(); return; }
    if (canFullscreen()) toggleFullscreen();
  }

  // ---------------- fitting the window (always landscape) ----------------
  const stage = document.getElementById("stage");
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let portrait = false, scale = 1, offX = 0, offY = 0, winW = 1, winH = 1, dpr = 1;

  function fit() {
    winW = window.innerWidth; winH = window.innerHeight;
    portrait = winH > winW;
    const vw = portrait ? winH : winW, vh = portrait ? winW : winH;
    stage.style.width = vw + "px"; stage.style.height = vh + "px";
    stage.style.transform = portrait ? `translate(${winW}px, 0) rotate(90deg)` : "none";
    scale = Math.min(vw / CW, vh / VH);
    const cw = CW * scale, ch = VH * scale;
    offX = (vw - cw) / 2; offY = (vh - ch) / 2;
    canvas.style.left = offX + "px"; canvas.style.top = offY + "px";
    canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  }
  // client px -> canvas px, through the rotation and the letterbox
  function toCanvas(cx, cy) {
    const ex = portrait ? cy : cx, ey = portrait ? winW - cx : cy;
    return [(ex - offX) / scale, (ey - offY) / scale];
  }

  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", () => setTimeout(fit, 50));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", fit);

  canvas.addEventListener("pointerdown", (e) => {
    if (pointerDown) return;
    coarse = e.pointerType !== "mouse";
    pointerDown = true; pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / already gone */ }
    const [x, y] = toCanvas(e.clientX, e.clientY);
    pointerInBox = inRect(BOX, x, y) || (y < BOX[1] && x > BOX[0] && x < BOX[2]);
    if (pointerInBox) aimTo(x);
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  });
  canvas.addEventListener("pointermove", (e) => {
    const [x, y] = toCanvas(e.clientX, e.clientY);
    if (pointerDown && e.pointerId === pointerId) { if (pointerInBox) aimTo(x); return; }
    if (e.pointerType === "mouse" && !pointerDown && !showCombos && !showSettings && (inRect(BOX, x, y) || (y < BOX[1] && x > BOX[0] && x < BOX[2]))) aimTo(x);
  });
  const up = (e) => {
    if (!pointerDown || e.pointerId !== pointerId) return;
    pointerDown = false;
    if (e.type === "pointercancel") return;
    const [x, y] = toCanvas(e.clientX, e.clientY);
    if (pointerInBox && state === PLAYING && !showCombos && !showSettings) aimTo(x);
    press(x, y);
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  const keys = {};
  window.addEventListener("keydown", (e) => {
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (showCombos || showSettings) { showCombos = showSettings = false; play("click"); }
      else if (state === PLAYING) drop();
      else startGame();
    } else if (e.code === "Escape") { showCombos = showSettings = false; }
    else if (e.code === "KeyM") { soundOn = !soundOn; try { localStorage.setItem(STORE_SOUND, soundOn ? "1" : "0"); } catch (err) { /* ignore */ } }
    else if (e.code === "KeyF") toggleFullscreen();
    else if (e.code === "KeyC") showCombos = !showCombos;
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  // ---------------- drawing ----------------
  function cell(rank) { const c = rank % 4, r = 3 - Math.floor(rank / 4); return [c * 512, r * 512]; }
  function drawFace(rank, cx, cy, size, ang) {
    const [sx, sy] = cell(rank);
    ctx.save();
    ctx.translate(cx, cy);
    if (ang) ctx.rotate(ang);
    ctx.drawImage(A.faces, sx, sy, 512, 512, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  function font(weight, px) { return `${weight} ${px}px InterX, system-ui, sans-serif`; }
  function text(str, x, y, weight, px, align = "center", color = CREAM, spacing = 0) {
    ctx.font = font(weight, px);
    ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillStyle = color;
    if ("letterSpacing" in ctx) ctx.letterSpacing = spacing + "px";
    ctx.fillText(str, x, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }
  function fitText(str, maxW, weight, px) {
    ctx.font = font(weight, px);
    if (ctx.measureText(str).width <= maxW) return str;
    let s = str;
    while (s.length > 1 && ctx.measureText(s + "...").width > maxW) s = s.slice(0, -1);
    return s.trim() + "...";
  }
  const fmt = (n) => n.toLocaleString("en-US");
  const dateShort = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const actWord = () => coarse ? "tap" : "click";

  function draw() {
    ctx.setTransform(canvas.width / CW, 0, 0, canvas.height / VH, 0, 0);
    ctx.drawImage(A.screen, 0, 0, CW, CH);

    // --- the box: aim line, held face, faces, danger line ---
    const boxW = BOX[2] - BOX[0];
    const showHeld = state === PLAYING && heldRank >= 0 && now >= dropReadyAt - 0.3;
    if (showHeld) {
      heldX += (cursorX - heldX) * (coarse && pointerDown ? 0.75 : 1);
      const hx = PX(heldX), hy = PY(DROP_Y);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 5; ctx.setLineDash([12, 12]);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, BOX[3] - 4); ctx.stroke();
      ctx.restore();
    }
    for (const f of faces) {
      if (f.pop < 1) f.pop = Math.min(1, f.pop + dtFrame / 0.14);
      const e = 1 - (1 - f.pop) * (1 - f.pop);
      const d = RADII[f.rank] * 2 * (0.62 + 0.38 * e) / MPP;
      drawFace(f.rank, PX(f.x), PY(f.y), d * ART, -f.ang);
    }
    if (showHeld) drawFace(heldRank, PX(heldX), PY(DROP_Y), RADII[heldRank] * 2 / MPP * ART, 0);
    if (dangerLevel > 0 && state === PLAYING) {
      const pulse = dangerLevel >= 1 ? 0.55 + 0.45 * Math.sin(now * 12) : 0.35;
      const hgt = 0.03 * (0.6 + pulse) / MPP, y = PY(DANGER_Y);
      const g = ctx.createLinearGradient(0, y - hgt / 2, 0, y + hgt / 2);
      g.addColorStop(0, "rgba(255,90,150,0)"); g.addColorStop(0.5, `rgba(255,90,150,${0.5 + 0.4 * pulse})`); g.addColorStop(1, "rgba(255,90,150,0)");
      ctx.fillStyle = g; ctx.fillRect(BOX[0] + 6, y - hgt / 2, boxW - 12, hgt);
    }

    // --- SCORE ---
    text(state === IDLE ? "0" : fmt(score), SCORE[0], SCORE[1], 800, 74);

    // --- SCOREBOARD: your saved best runs on this device ---
    for (let i = 0; i < 10; i++) {
      const run = runs[i];
      if (!run) continue;
      const y = BOARD_ROWS[i];
      drawFace(clamp(run.f || 0, 0, RANKS - 1), BOARD_X.icon, y, BOARD_ICON, 0);
      text(dateShort(run.t), BOARD_X.name, y, 600, 23, "left");
      text(fmt(run.s), BOARD_X.score, y, 600, 23, "right");
    }

    // --- NEXT / AFTER (the biggest droppable, rank 4, at 70 % of the panel) ---
    if (state === PLAYING) {
      for (const [p, r] of [[NEXT, nextRank], [AFTER, afterRank]]) {
        if (r < 0) continue;
        const s = p.d * (0.36 + 0.34 * RADII[r] / RADII[4]);
        drawFace(r, p.cx, p.cy, s, 0);
      }
    }

    // --- banner over the box ---
    if (state !== PLAYING) {
      const rw = boxW + 38, rh = 250;
      ctx.drawImage(A.ribbon, TITLE[0] - rw / 2, TITLE[1] - rh / 2, rw, rh);
      const l1 = state === OVER ? "GAME FINISHED" : "READY?";
      const l2 = state === OVER ? "FINAL SCORE " + fmt(score) + (coarse ? "  ·  TAP TO PLAY AGAIN" : "  ·  CLICK TO PLAY AGAIN") : (coarse ? "TAP HERE TO PLAY" : "CLICK HERE TO PLAY");
      text(l1, TITLE[0], TITLE[1] - 28, 800, 64, "center", CREAM, 4);
      text(l2, TITLE[0], TITLE[1] + 38, 800, 31, "center", CREAM, 3);
    }

    // --- overlays ---
    if (showCombos) ctx.drawImage(A.combos, BOX[0], BOX[1], boxW, BOX[3] - BOX[1]);
    if (showSettings) {
      ctx.drawImage(A.settings, BOX[0], BOX[1], boxW, BOX[3] - BOX[1]);
      const fs = document.fullscreenElement || document.webkitFullscreenElement;
      const labels = [soundOn ? "SOUND: ON" : "SOUND: OFF", "NEW GAME", canFullscreen() ? (fs ? "EXIT FULLSCREEN" : "FULLSCREEN") : "CLOSE"];
      SETTINGS_BTNS.forEach((b, i) => text(labels[i], (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 600, 36, "center", CREAM, 2));
      text(actWord() + " anywhere else to close", (BOX[0] + BOX[2]) / 2, BOX[3] - 62, 600, 21, "center", "#dcc8eb");
    }
    // the "point here + pull the trigger to close" line is baked into the COMBOS art; cover it with the web wording
    if (showCombos) {
      ctx.fillStyle = "#140a26";
      ctx.fillRect(BOX[0] + 200, BOX[3] - 84, boxW - 400, 42);
      text(actWord() + " anywhere to close", (BOX[0] + BOX[2]) / 2, BOX[3] - 62, 600, 21, "center", "#dcc8eb");
    }
  }

  // ---------------- frame ----------------
  let last = 0, dtFrame = 1 / 60;
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60);
    last = t; dtFrame = dt; now = t / 1000;
    if (state === PLAYING) {
      if (keys.ArrowLeft) aimTo(PX(cursorX) - 700 * dt);
      if (keys.ArrowRight) aimTo(PX(cursorX) + 700 * dt);
      step(dt);
    }
    if (now >= checkAt) { checkAt = now + 0.1; check(0.1); }
    draw();
  }

  // ---------------- boot ----------------
  async function boot() {
    loadStore();
    fit();
    const fonts = document.fonts ? Promise.all([document.fonts.load("800 64px InterX"), document.fonts.load("600 32px InterX")]).catch(() => {}) : Promise.resolve();
    const [screen_, faces_, combos_, settings_, ribbon_] = await Promise.all([
      img("assets/screen.jpg"), img("assets/faces.webp"), img("assets/combos.webp"), img("assets/settings.webp"), img("assets/ribbon.webp"), fonts,
    ]);
    A.screen = screen_; A.faces = faces_; A.combos = combos_; A.settings = settings_; A.ribbon = ribbon_;
    loadAudio();                                             // sounds arrive when they arrive
    document.getElementById("boot").classList.add("hide");
    requestAnimationFrame(frame);
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
  boot().catch(() => { document.getElementById("boot").textContent = "couldn't load, tap to retry"; document.body.addEventListener("click", () => location.reload(), { once: true }); });
})();
