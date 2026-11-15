/* Game state and race flow: map loading, grid setup, remote racers, standings, results. */
const G = A.G = { mode: 'menu', track: null, world: null, tracks: {}, racers: [], me: null, remotes: {}, laps: 3, t: 0, count: 0, show: null, orbit: 0, doneAt: 0, shake: 0, scene: null, fx: null, aud: null, name: 'Racer' };
const BOT_NAMES = ['Nova', 'Drift King', 'Kira', 'Turbo T', 'Mako', 'Zed', 'Rhea', 'Blaze'];
const medal = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

G.loadMap = function (i) {
  const def = A.MAPS[i];
  if (G.world) A.disposeWorld(G.scene, G.world);
  G.track = G.tracks[def.id] || (G.tracks[def.id] = A.buildTrack(def));
  G.world = A.buildWorld(G.scene, G.track);
  A.UI.setMini(G.track);
  G.showcase();
  A.Net.watchBoard(def.id, (rows) => G.boardRows(rows));
};

G.boardRows = function (rows) {
  const def = A.MAPS[A.UI.sel.map]; let out = rows && rows.map(r => ({ id: r.id, name: String(r.name || 'Racer').slice(0, 14), time: A.fmt(r.ms) }));
  const lb = A.Net.localBest(def.id);
  if (!out && isFinite(lb)) out = [{ id: 'me', name: 'You (this device)', time: A.fmt(lb) }];
  A.UI.renderTable($('menuBoard'), out, A.Net.uid);
};

G.showcase = function () {
  if (G.show) G.scene.remove(G.show);
  const tr = G.track, p = tr.P[0], t = tr.T[0];
  G.show = A.buildCar(A.CARS[A.UI.sel.car]); G.show.position.set(p.x, 0, p.z); G.show.rotation.y = Math.atan2(t.x, t.z);
  G.scene.add(G.show);
};

G.clearRacers = function () {
  for (const r of G.racers) G.scene.remove(r.mesh);
  G.racers = []; G.me = null; G.remotes = {}; G.fx.clear();
};

G.startRace = function () {
  G.aud.start();
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); window.focus(); } catch (e) { }
  const name = ($('nm').value.trim() || 'Racer').slice(0, 14); G.name = name;
  try { localStorage.setItem('apex.name', name); } catch (e) { }
  const def = A.MAPS[A.UI.sel.map]; G.laps = +$('laps').value;
  G.clearRacers(); if (G.show) { G.scene.remove(G.show); G.show = null; }
  A.Net.setMap(def.id, name);
  const nRem = A.Net.remotes.length, nBots = Math.max(2, 5 - nRem), tr = G.track;
  G.me = new A.Racer(A.CARS[A.UI.sel.car], tr, { name, me: true, slot: 2 });
  G.scene.add(G.me.mesh); G.racers.push(G.me);
  const slots = [0, 1, 3, 4, 5, 6, 7, 8].slice(0, nBots);
  slots.forEach((s, k) => {
    const cd = A.CARS[(k + 1 + A.UI.sel.car) % 3];
    const b = new A.Racer(cd, tr, { name: BOT_NAMES[k % BOT_NAMES.length], bot: true, slot: s, skill: .86 + A.rand() * .12, lane: (A.rand() - .5) * 1.4, tint: [0x7a5cff, 0x22cc88, 0xff7ab8, 0xe8e8f0, 0x39d0d0, 0xff8a3a, 0x9bdc3a, 0xc080ff][k % 8] });
    G.scene.add(b.mesh); G.racers.push(b);
  });
  $('menu').hidden = true; $('finish').hidden = true; $('hud').hidden = false;
  G.mode = 'count'; G.count = 3.6; G.t = 0; G.lastTick = 4; G.doneAt = 0; G.cam = null;
  const I = A.UI.input; for (const k in I) I[k] = 0;
};

G.syncRemotes = function (dt) {
  const list = A.Net.remotes, seen = {};
  for (const p of list) {
    const pr = p.presence || {}; if (pr.x == null) continue; seen[p.peer] = 1;
    let r = G.remotes[p.peer];
    if (!r) {
      r = G.remotes[p.peer] = new A.Racer(A.CARS[pr.c] || A.CARS[0], G.track, { name: String(pr.nm || 'Player').slice(0, 14), remote: true, id: p.peer, slot: 0 });
      r.x = +pr.x; r.z = +pr.z; r.h = +pr.h || 0; G.scene.add(r.mesh); G.racers.push(r);
    }
    const k = Math.min(1, dt * 10), dx = pr.x - r.x, dz = pr.z - r.z;
    if (dx * dx + dz * dz > 900) { r.x = pr.x; r.z = pr.z; } else { r.x += dx * k; r.z += dz * k; }
    r.h += A.angDiff(pr.h || 0, r.h) * k; r.speed = pr.s || 0; r.usingNitro = !!pr.n; r.drifting = !!pr.d; r.slip = r.drifting ? .25 : 0;
    r.total += ((pr.t || 0) - r.total) * k; r.name = String(pr.nm || 'Player').slice(0, 14); r.bestLap = pr.bl || Infinity;
    r.vx = Math.sin(r.h) * r.speed; r.vz = Math.cos(r.h) * r.speed; r.wheelSpin += r.speed * dt / .42;
    if (pr.f && !r.finished) { r.finished = true; r.finObs = G.t; }
  }
  for (const id in G.remotes) if (!seen[id]) { const r = G.remotes[id]; G.scene.remove(r.mesh); G.racers.splice(G.racers.indexOf(r), 1); delete G.remotes[id]; }
};

G.order = function () {
  const key = (r) => r.finished ? (r.finishT || r.finObs || 0) : 1e9;
  return G.racers.slice().sort((a, b) => { const fa = key(a), fb = key(b); if (fa !== fb) return fa - fb; return b.total - a.total; });
};

G.finishRace = function () {
  const me = G.me, order = G.order(), rank = order.indexOf(me) + 1;
  $('finTitle').innerHTML = rank === 1 ? 'You <em>win</em>' : medal[rank - 1] + ' <em>place</em>';
  const rows = order.map(r => ({ id: r === me ? 'me' : r.id, name: r.name + (r.bot ? '' : (r === me ? '' : ' ●')), time: r.finished ? A.fmt(r.finishT || r.finObs) : 'Lap ' + Math.min(G.laps, Math.max(1, Math.floor(r.total / G.track.N) + 1)) + '/' + G.laps }));
  A.UI.renderTable($('finList'), rows, 'me');
  const best = me.bestLap, def = A.MAPS[A.UI.sel.map];
  $('finNote').textContent = isFinite(best) ? 'Your best lap: ' + A.fmt(best) + '. Others may still be racing.' : '';
  if (isFinite(best)) A.Net.submit(def.id, best, me.def.name, G.name).then(ok => { if (ok) $('finNote').textContent += ' Submitted to the leaderboard.'; });
  $('finish').hidden = false; G.mode = 'done';
};

G.toMenu = function () {
  G.clearRacers(); G.aud.mute(); $('hud').hidden = true; $('finish').hidden = true; $('menu').hidden = false; $('count').hidden = true; $('streaks').classList.remove('on');
  G.mode = 'menu'; A.Net.setLobby(G.name); G.showcase(); G.cam = null;
};
