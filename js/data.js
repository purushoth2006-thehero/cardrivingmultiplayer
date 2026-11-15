/* Cars, maps and track construction. Everything hangs off the global A (Apex). */
const A = {};

A.CARS = [
  { id: 'vector', name: 'Vector GT', color: 0xff3d4f, top: 62, acc: 30, grip: 7.5, turn: 1.9, drift: 1.0, nitro: 1.0, body: 'wedge',
    blurb: 'Balanced all-rounder with sharp turn-in.', bars: [.7, .65, .7, .6] },
  { id: 'bolt', name: 'Bolt R', color: 0x2fb8ff, top: 58, acc: 37, grip: 8.8, turn: 2.1, drift: 0.8, nitro: 1.2, body: 'compact',
    blurb: 'Quick off the line, big nitro tank, grips hard.', bars: [.55, .9, .85, .85] },
  { id: 'titan', name: 'Titan X', color: 0xffb020, top: 69, acc: 24, grip: 6.2, turn: 1.7, drift: 1.3, nitro: 0.9, body: 'long',
    blurb: 'Highest top speed. Slides a lot, so drift it.', bars: [.95, .4, .45, .55] },
];
A.STATS = ['Speed', 'Accel', 'Grip', 'Nitro'];

A.MAPS = [
  { id: 'neon', name: 'Neon District', blurb: 'Night city, tight chicanes, glowing towers.',
    R: 330, sx: 1, sz: 1, mods: [[.26, 3, 0.4], [.1, 5, 1.1]], width: 9,
    sky: [0x03040c, 0x16103a, 0x5b2a8a], fog: 0x0a0818, fogD: 0.0042, ground: 0x0b0e18, road: '#262a38',
    accent: 0x35e0ff, accent2: 0xff3df0, style: 'city', sun: 0.35, stars: true },
  { id: 'canyon', name: 'Red Canyon', blurb: 'Fast sweepers through sunset rock.',
    R: 360, sx: 1.35, sz: 0.9, mods: [[.2, 2, 1.0], [.13, 4, 0.2]], width: 10,
    sky: [0x2a1030, 0xd2562c, 0xffc36b], fog: 0xb4573a, fogD: 0.0032, ground: 0x7a3a22, road: '#3a3030',
    accent: 0xffb020, accent2: 0xff5a2c, style: 'canyon', sun: 1.1, stars: false },
  { id: 'frost', name: 'Frost Ridge', blurb: 'Snowy pines with a long winding loop.',
    R: 300, sx: 1, sz: 1.1, mods: [[.3, 4, 0.0], [.11, 3, 2.0]], width: 9,
    sky: [0x5f86b8, 0xa9c9e6, 0xeaf3fb], fog: 0xcfe0ee, fogD: 0.0036, ground: 0xe4eef6, road: '#41464e',
    accent: 0x2f8cff, accent2: 0xffffff, style: 'frost', sun: 0.9, stars: false },
];

A.rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
A.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
A.angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
A.fmt = (s) => { if (s == null || !isFinite(s)) return '--'; const m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(2).padStart(5, '0'); };

/* Build a closed loop from a polar curve with a few harmonics, so every map is a different but simple loop. */
A.buildTrack = function (def) {
  const pts = [], K = 28;
  for (let k = 0; k < K; k++) {
    const th = (k / K) * Math.PI * 2;
    let r = 1;
    for (const [a, m, ph] of def.mods) r += a * Math.sin(m * th + ph);
    pts.push(new THREE.Vector3(Math.cos(th) * r * def.R * def.sx, 0, Math.sin(th) * r * def.R * def.sz));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const N = 720;
  const P = curve.getSpacedPoints(N).slice(0, N);
  const T = P.map((p, i) => { const q = P[(i + 1) % N], t = q.clone().sub(p); t.y = 0; return t.normalize(); });
  const Rt = T.map(t => new THREE.Vector3(t.z, 0, -t.x));
  let len = 0; for (let i = 0; i < N; i++) len += P[i].distanceTo(P[(i + 1) % N]);
  const ds = len / N;
  const raw = T.map((t, i) => { const u = T[(i + 1) % N]; return Math.atan2(t.x * u.z - t.z * u.x, t.x * u.x + t.z * u.z) / ds; });
  const curv = raw.map((_, i) => { let s = 0; for (let j = -3; j <= 3; j++) s += Math.abs(raw[(i + j + N) % N]); return s / 7; });
  const tr = { def, P, T, R: Rt, N, W: def.width, len, ds, curv, raw };

  /* Nearest centreline sample to (x,z). Searches near the hint first, falls back to a full scan. */
  tr.nearest = function (x, z, hint) {
    let best = -1, bd = 1e9;
    const win = (i0, span) => {
      for (let o = -span; o <= span; o++) {
        const i = (i0 + o + N * 4) % N, p = P[i], dx = x - p.x, dz = z - p.z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    };
    if (hint != null) win(hint, 24);
    if (hint == null || bd > 70 * 70) { bd = 1e9; for (let i = 0; i < N; i += 3) { const p = P[i], dx = x - p.x, dz = z - p.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } win(best, 4); }
    const p = P[best], r = Rt[best];
    return { i: best, off: (x - p.x) * r.x + (z - p.z) * r.z, dist: Math.sqrt(bd) };
  };
  return tr;
};
