/* Particle pool (smoke, sparks, nitro) and a small WebAudio engine. */
A.FX = class {
  constructor(scene) {
    this.scene = scene; this.pool = []; this.live = [];
    const mk = (hex) => A.canvasTex(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    });
    this.tex = mk();
    for (let i = 0; i < 160; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; scene.add(s); this.pool.push(s);
    }
  }
  emit(x, y, z, vx, vy, vz, color, life, size, grow, additive, op) {
    const s = this.pool.pop(); if (!s) return;
    s.visible = true; s.position.set(x, y, z); s.material.color.setHex(color); s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.opacity = op || .6; s.scale.set(size, size, 1);
    this.live.push({ s, vx, vy, vz, life, max: life, size, grow, op: op || .6 });
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]; p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; this.pool.push(p.s); this.live.splice(i, 1); continue; }
      const k = p.life / p.max; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      const sz = p.size + p.grow * (1 - k); p.s.scale.set(sz, sz, 1); p.s.material.opacity = p.op * k;
    }
  }
  /* per-frame emission for one car */
  car(c, dt) {
    const sin = Math.sin(c.h), cos = Math.cos(c.h), rear = -1.9;
    if (c.drifting && c.speed > 20 && Math.random() < dt * 60 * .9) {
      for (const s of [-1, 1]) this.emit(c.x + sin * rear + cos * s * .9, .35, c.z + cos * rear - sin * s * .9, (Math.random() - .5) * 2, 1.2, (Math.random() - .5) * 2, 0xd9dde8, .9, 1.4, 4, false, .5);
    }
    if (c.offroad && c.speed > 12 && Math.random() < dt * 40) this.emit(c.x, .3, c.z, (Math.random() - .5) * 3, 1.5, (Math.random() - .5) * 3, 0x9a8466, .8, 1.2, 3, false, .45);
    if (c.usingNitro && Math.random() < dt * 90) for (const s of [-1, 1]) this.emit(c.x + sin * (rear - 1.2) + cos * s * .6, .8, c.z + cos * (rear - 1.2) - sin * s * .6, -sin * 8, .3, -cos * 8, Math.random() < .5 ? 0x35e0ff : 0xffffff, .35, 1.1, -.6, true, .8);
  }
  sparks(x, z) { for (let i = 0; i < 8; i++) this.emit(x, 1, z, (Math.random() - .5) * 14, 3 + Math.random() * 5, (Math.random() - .5) * 14, 0xffc860, .45, .5, -.3, true, .95); }
  clear() { for (const p of this.live) { p.s.visible = false; this.pool.push(p.s); } this.live.length = 0; }
};

A.Audio = class {
  constructor() { this.ctx = null; this.on = false; }
  start() {
    if (this.ctx) { this.ctx.resume && this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const c = this.ctx = new C(), out = c.createGain(); out.gain.value = .22; out.connect(c.destination);
      this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square';
      this.f = c.createBiquadFilter(); this.f.type = 'lowpass'; this.f.frequency.value = 600;
      this.g = c.createGain(); this.g.gain.value = 0;
      this.o1.connect(this.f); this.o2.connect(this.f); this.f.connect(this.g); this.g.connect(out);
      this.o1.start(); this.o2.start();
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.ns = c.createBufferSource(); this.ns.buffer = buf; this.ns.loop = true;
      this.nf = c.createBiquadFilter(); this.nf.type = 'bandpass'; this.nf.frequency.value = 1800; this.ng = c.createGain(); this.ng.gain.value = 0;
      this.ns.connect(this.nf); this.nf.connect(this.ng); this.ng.connect(out); this.ns.start();
      this.out = out; this.on = true;
    } catch (e) { this.on = false; }
  }
  tune(speed, top, thr, nitro, drift) {
    if (!this.on) return; const t = this.ctx.currentTime, r = A.clamp(speed / top, 0, 1.4);
    const gear = (r * 5) % 1, f = 52 + r * 130 + gear * 38 + (nitro ? 30 : 0);
    this.o1.frequency.setTargetAtTime(f, t, .05); this.o2.frequency.setTargetAtTime(f * .5, t, .05);
    this.f.frequency.setTargetAtTime(400 + r * 1400 + thr * 500, t, .08);
    this.g.gain.setTargetAtTime(.35 + thr * .35, t, .08);
    this.ng.gain.setTargetAtTime(nitro ? .5 : drift ? .18 : r * .03, t, .06);
    this.nf.frequency.setTargetAtTime(nitro ? 2600 : 1600, t, .1);
  }
  mute() { if (this.on) this.g.gain.setTargetAtTime(0, this.ctx.currentTime, .05), this.ng.gain.setTargetAtTime(0, this.ctx.currentTime, .05); }
  blip(freq, dur) {
    if (!this.on) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = freq; g.gain.value = .25;
    o.connect(g); g.connect(this.out); o.start(); g.gain.setTargetAtTime(0, c.currentTime + dur * .6, dur * .15); o.stop(c.currentTime + dur + .1);
  }
  thud() { if (!this.on) return; this.ng.gain.setTargetAtTime(.6, this.ctx.currentTime, .005); }
};
