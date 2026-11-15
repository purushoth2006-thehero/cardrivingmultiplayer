/* Main loop, chase camera, HUD updates and boot. */
(function () {
  const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(62, 1, .5, 2600);
  G.scene = scene; G.fx = new A.FX(scene); G.aud = new A.Audio();
  const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();

  const coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  let fpsEma = 16, qTimer = 0, lowQ = false;
  let steer = 0, fov = 62, boardT = 0, lastNitro = false, lastLapShown = 0, wrongShown = 0, driftShown = false, lastSpeed = -1;
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();

  /* ---------- menu wiring ---------- */
  try { const n = localStorage.getItem('apex.name'); if (n) $('nm').value = n; } catch (e) { }
  A.UI.bindInput();
  A.UI.buildMenu((what) => { if (what === 'map') G.loadMap(A.UI.sel.map); else G.showcase(); });
  $('startBtn').onclick = () => G.startRace();
  $('againBtn').onclick = () => G.startRace();
  $('menuBtn').onclick = () => G.toMenu();
  A.Net.onLobby = (n) => {
    $('onDot').classList.toggle('live', !!n.room);
    $('onTxt').textContent = n.room ? n.online + (n.online === 1 ? ' driver' : ' drivers') + ' online · ' + n.remotes.length + ' on your track' : 'Solo mode: racing AI drivers. Multiplayer needs a signed-in viewer.';
  };
  G.loadMap(A.UI.sel.map);
  A.Net.init().then(() => { A.Net.watchBoard(A.MAPS[A.UI.sel.map].id, (rows) => G.boardRows(rows)); });

  /* ---------- race helpers ---------- */
  function playerInput(dt) {
    const I = A.UI.input, target = I.left - I.right; /* +steer raises heading, which turns toward screen-left */
    steer += (target - steer) * Math.min(1, dt * (target ? 8 : 12));
    const thr = I.up || (coarse && !I.down) ? 1 : 0; /* touch screens accelerate automatically */
    return { thr, brk: I.down, steer, nitro: !!I.nitro, drift: !!I.drift };
  }

  function collide(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, min = 2.7;
    if (d2 >= min * min || d2 < 1e-4) return;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (min - d) / 2;
    const aSim = !a.remote, bSim = !b.remote;
    if (aSim) { a.x -= nx * push * (bSim ? 1 : 2); a.z -= nz * push * (bSim ? 1 : 2); }
    if (bSim) { b.x += nx * push * (aSim ? 1 : 2); b.z += nz * push * (aSim ? 1 : 2); }
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) { const j = -rv * .6; if (aSim) { a.vx -= nx * j * (bSim ? .5 : 1); a.vz -= nz * j * (bSim ? .5 : 1); } if (bSim) { b.vx += nx * j * (aSim ? .5 : 1); b.vz += nz * j * (aSim ? .5 : 1); }
      if ((a === G.me || b === G.me) && -rv > 4) { G.shake = Math.max(G.shake, .5); G.fx.sparks((a.x + b.x) / 2, (a.z + b.z) / 2); G.aud.thud(); } }
  }

  function resetCar(r) {
    const tr = G.track, i = r.idx; r.x = tr.P[i].x; r.z = tr.P[i].z; r.h = Math.atan2(tr.T[i].x, tr.T[i].z); r.vx = r.vz = 0; r.speed = 0; r.drifting = false; r.offroad = false;
  }

  function stepRace(dt) {
    const sub = Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / sub;
    const me = G.me, racing = G.mode !== 'count';
    for (let k = 0; k < sub; k++) {
      if (racing) G.t += h;
      for (const r of G.racers) {
        if (r.remote) continue;
        let inp;
        if (!racing) { inp = { thr: 0, brk: 0, steer: 0, nitro: false, drift: false }; r.vx = r.vz = 0; }
        else if (r === me && !me.finished) inp = playerInput(h);
        else inp = r.think(h, { t: G.t });
        if (r === me) { r.steerVis = steer; r.accelVis = (inp.thr - inp.brk) * 10; }
        else { r.steerVis = inp.steer; }
        r.update(h, inp, G.laps, G.t);
      }
      const L = G.racers;
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) collide(L[i], L[j]);
    }
    if ((A.UI.input.reset || me.needsReset) && racing) { A.UI.input.reset = 0; me.needsReset = false; resetCar(me); A.UI.toast('Back on track', 'var(--mute)'); }
  }

  /* ---------- camera ---------- */
  function chase(dt, me) {
    const sp = Math.abs(me.speed), va = Math.atan2(me.vx, me.vz), ang = me.h + (sp > 10 ? A.angDiff(va, me.h) * .4 : 0);
    const back = 8.2 + sp * .028, sx = Math.sin(ang), sz = Math.cos(ang);
    const tx = me.x - sx * back, tz = me.z - sz * back, ty = 3.1 + sp * .008;
    const k = G.cam ? 1 - Math.exp(-dt * 8) : 1; G.cam = true;
    camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
    let sh = G.shake * .35 + (me.usingNitro ? .05 : 0) + sp / 70 * .01; G.shake = Math.max(0, G.shake - dt * 2.2);
    cam.position.set(camPos.x + (Math.random() - .5) * sh, camPos.y + (Math.random() - .5) * sh, camPos.z + (Math.random() - .5) * sh);
    look.set(me.x + Math.sin(me.h) * 9, 1.3, me.z + Math.cos(me.h) * 9); cam.lookAt(look);
    const tf = 62 + A.clamp(sp / 70, 0, 1) * 9 + (me.usingNitro ? 10 : 0); fov += (tf - fov) * Math.min(1, dt * 4); cam.fov = fov; cam.updateProjectionMatrix();
  }

  /* ---------- HUD ---------- */
  function hud(dt, now) {
    const me = G.me, tr = G.track;
    const kmh = Math.round(Math.abs(me.speed) * 3.6); if (kmh !== lastSpeed) { lastSpeed = kmh; $('speed').firstChild.nodeValue = String(kmh); }
    $('nitro').firstElementChild.style.transform = 'scaleX(' + (me.nitro / 100).toFixed(3) + ')'; $('nitro').classList.toggle('on', me.usingNitro);
    $('streaks').classList.toggle('on', me.usingNitro);
    const order = G.order(), rank = order.indexOf(me) + 1, lap = A.clamp(Math.floor(me.total / tr.N) + 1, 1, G.laps);
    $('pos').textContent = rank + '/' + G.racers.length; $('boardLap').textContent = 'Lap ' + lap + '/' + G.laps;
    $('lapt').textContent = me.total >= 0 && !me.finished ? A.fmt(G.t - me.lapStart) : '0:00.00';
    const best = Math.min(me.bestLap, A.Net.localBest(A.MAPS[A.UI.sel.map].id)); $('best').textContent = isFinite(best) ? A.fmt(best) : '--';
    A.UI.drawMini(G.racers, me);
    boardT -= dt; if (boardT <= 0) { boardT = .2; A.UI.drawBoard(order, me, G.laps, G.t); }
    if (me.usingNitro && !lastNitro) { A.UI.toast('Nitro', 'var(--nitro)'); G.aud.blip(520, .2); } lastNitro = me.usingNitro;
    if (me.drifting && me.driftTime > 1.2 && !driftShown) { driftShown = true; A.UI.toast('Drift +nitro', 'var(--amber)'); } if (!me.drifting) driftShown = false;
    if (me.newLap != null) { const t = me.newLap; me.newLap = null; if (!me.finished) { A.UI.toast(t <= me.bestLap + 1e-6 ? 'Best lap ' + A.fmt(t) : 'Lap ' + A.fmt(t), t <= me.bestLap + 1e-6 ? 'var(--good)' : 'var(--ink)'); G.aud.blip(880, .18); } }
    if (me.wrong > 1.5 && now - wrongShown > 2) { wrongShown = now; A.UI.toast('Wrong way', 'var(--danger)'); }
    if (me.finished && !G.doneAt) { G.doneAt = G.t + 2.2; A.UI.toast('Finish', 'var(--good)'); }
    if (G.mode === 'race' && G.doneAt && G.t >= G.doneAt) G.finishRace();
  }

  /* ---------- frame loop ---------- */
  let prev = performance.now();
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const raw = (nowMs - prev) / 1000, dt = Math.min(.12, raw); prev = nowMs;
    const w = G.world;
    /* adaptive quality: slow devices drop resolution and shadows so the game keeps real-time speed */
    fpsEma += (raw * 1000 - fpsEma) * .05; qTimer += raw;
    if (!lowQ && qTimer > 3 && fpsEma > 30) { lowQ = true; A.lowQ = true; renderer.setPixelRatio(1); resize(); if (w) { w.userData.sunL.castShadow = false; } }
    if (G.mode === 'menu') {
      G.orbit += dt * .3; const s = G.show, a = G.orbit;
      if (s) { s.rotation.y += dt * .0; cam.position.set(s.position.x + Math.sin(a) * 9, 3.4, s.position.z + Math.cos(a) * 9); cam.lookAt(s.position.x, 1, s.position.z); if (w) { w.userData.sunL.position.set(s.position.x - 60, 90, s.position.z - 40); w.userData.sunL.target.position.copy(s.position); } }
      cam.fov = 55; cam.updateProjectionMatrix();
      for (const wh of (s ? s.userData.wheels : [])) wh.wh.rotation.x += dt * 6;
    } else {
      const me = G.me;
      if (G.mode === 'count') {
        G.count -= dt; const n = Math.ceil(G.count);
        if (n !== G.lastTick && n >= 1 && n <= 3) { G.lastTick = n; A.UI.count(String(n)); G.aud.blip(440, .15); }
        if (G.count <= 0) { G.mode = 'race'; A.UI.count('GO'); G.aud.blip(880, .4); setTimeout(() => A.UI.hideCount(), 900); lastNitro = false; }
      }
      if (G.mode !== 'menu') G.syncRemotes(dt);
      stepRace(dt);
      for (const r of G.racers) { r.render(dt); G.fx.car(r, dt); if (r.hit > .15 && !r.remote) { G.fx.sparks(r.x, r.z); if (r === me) { G.shake = Math.max(G.shake, r.hit); G.aud.thud(); } } r.hit = 0; }
      G.fx.update(dt); chase(dt, me);
      if (w) { w.userData.sunL.position.set(me.x - 60, 90, me.z - 40); w.userData.sunL.target.position.set(me.x, 0, me.z); }
      hud(dt, G.t);
      A.Net.send(me, { name: G.name }, nowMs);
      G.aud.tune(Math.abs(me.speed), me.def.top, A.UI.input.up * (me.finished ? 0 : 1), me.usingNitro, me.drifting);
    }
    if (w) w.userData.sky.position.copy(cam.position);
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
})();
