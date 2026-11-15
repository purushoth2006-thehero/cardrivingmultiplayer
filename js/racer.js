/* Car meshes, arcade physics (grip, drift, nitro) and AI drivers. */
A.nameSprite = function (text, color) {
  const t = A.canvasTex(256, 64, (g, w, h) => {
    g.font = '700 30px Chakra Petch, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(8,10,18,.7)'; const tw = Math.min(240, g.measureText(text).width + 24); g.fillRect((w - tw) / 2, 10, tw, 44);
    g.fillStyle = color; g.fillText(text, w / 2, 33, 230);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(6, 1.5, 1); s.position.y = 3.2; s.renderOrder = 10; return s;
};

A.buildCar = function (def, tint) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const col = tint != null ? tint : def.color;
  const dims = { wedge: [2.0, .55, 4.3, .5], compact: [1.9, .6, 3.8, .55], long: [2.1, .55, 4.8, .45] }[def.body];
  const [w, h, l, ch] = dims;
  const paint = new THREE.MeshStandardMaterial({ color: col, metalness: .55, roughness: .3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0f18, metalness: .3, roughness: .5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1424, metalness: .9, roughness: .1 });
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; body.add(m); return m; };
  mk(new THREE.BoxGeometry(w, h, l), paint, 0, .55 + h / 2, 0);
  const hood = mk(new THREE.BoxGeometry(w * .9, h * .5, l * .3), paint, 0, .55 + h * .85, l * .3); hood.rotation.x = -.12;
  mk(new THREE.BoxGeometry(w * .78, ch, l * .38), glass, 0, .55 + h + ch / 2, -l * .06);
  mk(new THREE.BoxGeometry(w * 1.05, .08, .5), dark, 0, .5, l / 2 + .05);
  mk(new THREE.BoxGeometry(w * 1.12, .09, .75), dark, 0, 1.35 + (def.body === 'compact' ? 0 : .1), -l / 2 + .1);
  for (const s of [-1, 1]) { mk(new THREE.BoxGeometry(.1, .45, .5), dark, s * w * .45, 1.15, -l / 2 + .15); }
  const stripe = mk(new THREE.BoxGeometry(.34, .02, l * 1.01), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, .56 + h + .005, 0);
  const head = new THREE.MeshBasicMaterial({ color: 0xfff4d0 }), tail = new THREE.MeshBasicMaterial({ color: 0xff2030 });
  for (const s of [-1, 1]) { mk(new THREE.BoxGeometry(.5, .15, .08), head, s * w * .32, .72, l / 2 + .01); mk(new THREE.BoxGeometry(.55, .13, .08), tail, s * w * .33, .78, -l / 2 - .01); }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * .9, l * .9), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = .06; g.add(glow);
  const wg = new THREE.CylinderGeometry(.42, .42, .36, 16); wg.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wh = new THREE.Mesh(wg, dark); wh.position.set(sx * (w / 2 + .02), .42, sz * l * .32); wh.castShadow = true;
    const holder = new THREE.Group(); holder.position.copy(wh.position); wh.position.set(0, 0, 0); holder.add(wh); g.add(holder); wheels.push({ holder, wh, front: sz > 0 });
  }
  const flames = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(.22, 2.4, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
    f.rotation.x = -Math.PI / 2; f.position.set(s * w * .28, .7, -l / 2 - 1.3); f.visible = false; g.add(f); flames.push(f);
  }
  g.userData = { body, wheels, flames, length: l, width: w };
  return g;
};

A.Racer = class {
  constructor(def, track, opts) {
    this.def = def; this.tr = track; this.name = opts.name; this.bot = !!opts.bot; this.remote = !!opts.remote; this.id = opts.id || Math.random().toString(36).slice(2);
    this.skill = opts.skill || 1; this.lane = opts.lane || 0; this.mesh = A.buildCar(def, opts.tint);
    if (!opts.me) { this.tag = A.nameSprite(this.name, this.bot ? '#b9c3de' : '#35e0ff'); this.mesh.add(this.tag); }
    this.reset(opts.slot || 0);
  }
  reset(slot) {
    const tr = this.tr, N = tr.N, back = 4 + slot * 2.6, i = (N - Math.round(back / tr.ds) + N) % N;
    const side = (slot % 2 ? 1 : -1) * tr.W * .42;
    this.x = tr.P[i].x + tr.R[i].x * side; this.z = tr.P[i].z + tr.R[i].z * side;
    this.h = Math.atan2(tr.T[i].x, tr.T[i].z); this.vx = this.vz = 0;
    this.idx = i; this.prevI = i; this.total = -Math.round(back / tr.ds); this.off = side;
    this.nitro = 55; this.drifting = false; this.finished = false; this.finishT = 0; this.lapStart = 0; this.laps = []; this.bestLap = Infinity;
    this.slip = 0; this.speed = 0; this.offroad = false; this.hit = 0; this.wrong = 0; this.usingNitro = false; this.roll = 0; this.wheelSpin = 0;
    this.lastLap = -1; this.driftTime = 0;
  }
  get progress() { return this.total / this.tr.N; }

  update(dt, inp, laps, now) {
    const d = this.def, tr = this.tr, sk = this.skill;
    const sin = Math.sin(this.h), cos = Math.cos(this.h), fx = sin, fz = cos, rx = cos, rz = -sin;
    let vf = this.vx * fx + this.vz * fz, vl = this.vx * rx + this.vz * rz;
    const thr = inp.thr, brk = inp.brk, st = inp.steer;
    /* drift state */
    const wantDrift = inp.drift && Math.abs(vf) > 22 && Math.abs(st) > .15;
    if (wantDrift) this.drifting = true; else if (!inp.drift || Math.abs(vf) < 16) this.drifting = false;
    /* nitro */
    this.usingNitro = !!(inp.nitro && this.nitro > 0 && vf > 6 && !this.finished);
    let top = d.top * sk, acc = d.acc * (this.bot ? .92 : 1);
    if (this.offroad) { top *= .45; }
    if (this.usingNitro) { top *= 1.34; acc *= 2.1; this.nitro = Math.max(0, this.nitro - 26 / d.nitro * dt); }
    if (this.drifting && vf > 25) { this.nitro = Math.min(100, this.nitro + 15 * d.drift * dt); this.driftTime += dt; } else this.driftTime = 0;
    this.nitro = Math.min(100, this.nitro + 1.4 * dt);
    /* longitudinal */
    if (thr > 0) { const k = A.clamp(vf / top, 0, 1.2); vf += acc * thr * (1 - k * k) * dt; if (vf > top) vf -= (vf - top) * 1.6 * dt; }
    if (brk > 0) { if (vf > 1) vf -= 58 * brk * dt; else vf = Math.max(-16, vf - 16 * brk * dt); }
    vf -= vf * (this.offroad ? 1.2 : .1) * dt;
    if (thr === 0 && brk === 0 && Math.abs(vf) < 2) vf *= .9;
    /* steering */
    const sp = Math.abs(vf), authority = A.clamp(sp / 9, 0, 1) / (1 + sp / 85);
    const turn = st * d.turn * authority * (this.drifting ? 1.45 : 1) * (vf < 0 ? -1 : 1);
    this.h += turn * dt;
    /* lateral grip: lower while drifting so the car slides */
    const grip = this.drifting ? d.grip * .2 : d.grip * (this.offroad ? .6 : 1);
    const nsin = Math.sin(this.h), ncos = Math.cos(this.h);
    /* re-project world velocity on the new heading */
    const wx = fx * vf + rx * vl, wz = fz * vf + rz * vl;
    let nf = wx * nsin + wz * ncos, nl = wx * ncos - wz * nsin;
    nl *= Math.exp(-grip * dt);
    if (this.drifting) nf *= (1 - .12 * dt);
    this.vx = nsin * nf + ncos * nl; this.vz = ncos * nf - nsin * nl;
    this.speed = nf; this.slip = Math.atan2(nl, Math.max(8, Math.abs(nf)));
    this.x += this.vx * dt; this.z += this.vz * dt;
    /* track relations */
    const n = tr.nearest(this.x, this.z, this.idx);
    this.idx = n.i; this.off = n.off; this.offroad = Math.abs(n.off) > tr.W + .3;
    const lim = tr.W + 1.8, r = tr.R[n.i];
    if (Math.abs(n.off) > lim) {
      const s = Math.sign(n.off), over = Math.abs(n.off) - lim;
      this.x -= r.x * s * over; this.z -= r.z * s * over;
      const vn = this.vx * r.x * s + this.vz * r.z * s;
      if (vn > 0) { this.vx -= r.x * s * vn * 1.1; this.vz -= r.z * s * vn * 1.1; this.hit = Math.max(this.hit, Math.min(1, vn / 25)); const k = 1 - Math.min(.2, vn / 120); this.vx *= k; this.vz *= k; }
    }
    /* while touching a barrier, ease the car's heading toward the track direction so it slides along the wall */
    if (Math.abs(n.off) > lim - .6) { const th = Math.atan2(tr.T[n.i].x, tr.T[n.i].z); this.h += A.angDiff(th, this.h) * Math.min(1, dt * 4); }
    /* stuck detection: gas held but barely moving */
    if (inp.thr > 0 && Math.abs(nf) < 2 && !this.finished) this.stuck = (this.stuck || 0) + dt; else this.stuck = 0;
    if (this.stuck > 2.2) { this.needsReset = true; this.stuck = 0; }
    let di = n.i - this.prevI; if (di < -tr.N / 2) di += tr.N; if (di > tr.N / 2) di -= tr.N;
    this.total += di; this.prevI = n.i;
    this.wrong = (di < 0 && this.speed > 3) ? this.wrong + dt : Math.max(0, this.wrong - dt * 2);
    /* lap bookkeeping */
    const lapNow = Math.floor(this.total / tr.N);
    if (lapNow > this.lastLap && this.lastLap >= -1 && this.total >= 0) {
      if (lapNow >= 1) { const t = now - this.lapStart; this.laps.push(t); if (t < this.bestLap) this.bestLap = t; this.newLap = t; }
      this.lapStart = now; this.lastLap = lapNow;
      if (lapNow >= laps && !this.finished) { this.finished = true; this.finishT = now; }
    }
    this.wheelSpin += nf * dt / .42;
  }

  /* AI: aim at a look-ahead point and brake for upcoming curvature */
  think(dt, ctx) {
    const tr = this.tr, N = tr.N, sp = Math.max(this.speed, 5), sk = this.skill;
    if (this.finished) return { thr: 0, brk: .6, steer: 0, nitro: false, drift: false };
    const look = Math.round(A.clamp(7 + sp * .26, 8, 30));
    const it = (this.idx + look) % N, p = tr.P[it], r = tr.R[it];
    const o = this.lane * tr.W * .5;
    const tx = p.x + r.x * o, tz = p.z + r.z * o;
    const want = Math.atan2(tx - this.x, tz - this.z), err = A.angDiff(want, this.h);
    const steer = A.clamp(err * 2.4, -1, 1);
    let kmax = 0; const span = Math.round(10 + sp * .9);
    for (let j = 4; j < span; j += 3) kmax = Math.max(kmax, tr.curv[(this.idx + j) % N]);
    const vmax = Math.min(this.def.top * 1.3, Math.sqrt(A.clamp(20 * sk, 12, 30) / Math.max(kmax, 1e-4)));
    const over = sp - vmax;
    let thr = over < 0 ? 1 : 0, brk = over > 4 ? A.clamp(over / 16, .2, 1) : 0;
    if (this.offroad) { thr = .6; brk = 0; }
    const straight = kmax < .0035 && Math.abs(err) < .1;
    const nitro = straight && this.nitro > 35 && sk > .9 && (ctx.t % 7 < 4.6 + (this.lane + 1));
    const drift = Math.abs(steer) > .75 && sp > 34 && over < 6;
    return { thr, brk, steer, nitro, drift };
  }

  /* sync the mesh with physical state */
  render(dt, camAhead) {
    const m = this.mesh, ud = m.userData;
    m.position.set(this.x, 0, this.z);
    m.rotation.y = this.h + (this.drifting ? -this.slip * .35 : 0);
    const tgtRoll = A.clamp(-this.slip * 1.2 - (this.steerVis || 0) * .05, -.25, .25);
    this.roll += (tgtRoll - this.roll) * Math.min(1, dt * 8);
    ud.body.rotation.z = this.roll; ud.body.rotation.x = -A.clamp((this.accelVis || 0) * .004, -.05, .05);
    for (const w of ud.wheels) { w.wh.rotation.x = this.wheelSpin; w.holder.rotation.y = w.front ? (this.steerVis || 0) * .4 : 0; }
    for (const f of ud.flames) { f.visible = this.usingNitro; if (f.visible) { const s = 1 + Math.random() * .5; f.scale.set(s, s, s); f.material.color.setHex(Math.random() < .5 ? 0x35e0ff : 0xaaf4ff); } }
  }
};
