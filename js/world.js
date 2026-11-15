/* Builds the road, barriers, sky and scenery for a track. */
A.canvasTex = function (w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
};

A.ribbon = function (tr, o0, o1, y0, y1, uvScale, flip) {
  const { P, R, N } = tr, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const k = i % N, p = P[k], r = R[k];
    pos.push(p.x + r.x * o0, y0, p.z + r.z * o0, p.x + r.x * o1, y1, p.z + r.z * o1);
    const v = i * tr.ds / uvScale;
    uv.push(0, v, 1, v);
    if (i < N) { const a = i * 2; if (flip) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};

A.buildWorld = function (scene, tr) {
  const d = tr.def, W = tr.W, grp = new THREE.Group(), C = (h) => new THREE.Color(h);
  scene.fog = new THREE.FogExp2(d.fog, d.fogD);

  /* sky dome */
  const skyTex = A.canvasTex(8, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#' + C(d.sky[0]).getHexString()); gr.addColorStop(.55, '#' + C(d.sky[1]).getHexString()); gr.addColorStop(1, '#' + C(d.sky[2]).getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'sky'; grp.add(sky);
  if (d.stars) {
    const sp = [], rnd = A.rand;
    for (let i = 0; i < 500; i++) { const a = rnd() * 6.28, e = rnd() * 1.2 + .1, r = 1300; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const st = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, fog: false })); st.name = 'stars'; grp.add(st);
  }
  const sun = new THREE.Mesh(new THREE.CircleGeometry(d.style === 'city' ? 70 : 110, 32), new THREE.MeshBasicMaterial({ color: d.style === 'city' ? 0xff6bd6 : d.style === 'canyon' ? 0xffe2a0 : 0xffffff, fog: false, transparent: true, opacity: d.style === 'frost' ? .8 : .95 }));
  sun.position.set(-700, 190, -1000); sun.lookAt(0, 0, 0); sun.name = 'sunDisc'; grp.add(sun);

  /* ground */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: d.ground }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; grp.add(ground);

  /* road */
  const roadTex = A.canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = d.road; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * .05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(8, 0, 5, h); g.fillRect(w - 13, 0, 5, h);
    g.fillStyle = 'rgba(255,200,60,.9)'; g.fillRect(w / 2 - 3, 0, 6, h * .5);
  }, true);
  roadTex.repeat.set(1, 1);
  const road = new THREE.Mesh(A.ribbon(tr, -W, W, 0.03, 0.03, 24), new THREE.MeshLambertMaterial({ map: roadTex }));
  road.receiveShadow = true; grp.add(road);

  const curbTex = A.canvasTex(16, 64, (g) => { g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 16, 32); g.fillStyle = '#d8283a'; g.fillRect(0, 32, 16, 32); }, true);
  const cm = new THREE.MeshLambertMaterial({ map: curbTex });
  grp.add(new THREE.Mesh(A.ribbon(tr, -W - 1.3, -W, 0.05, 0.05, 5), cm));
  grp.add(new THREE.Mesh(A.ribbon(tr, W, W + 1.3, 0.05, 0.05, 5), cm));

  /* barriers: glowing top rail + wall */
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x20242e, side: THREE.DoubleSide });
  const railMat = new THREE.MeshBasicMaterial({ color: d.accent, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const o = s * (W + 2.2);
    grp.add(new THREE.Mesh(A.ribbon(tr, o, o, 0, 1.1, 1000, true), wallMat));
    grp.add(new THREE.Mesh(A.ribbon(tr, o, o, 1.05, 1.3, 1000, true), railMat));
  }

  /* start / finish gantry */
  const sl = tr.P[0], st = tr.T[0], sr = tr.R[0], ang = Math.atan2(st.x, st.z);
  const chk = A.canvasTex(128, 32, (g) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * 8, y * 8, 8, 8); } });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 3), new THREE.MeshBasicMaterial({ map: chk }));
  line.rotation.x = -Math.PI / 2; line.rotation.z = ang; line.position.set(sl.x, 0.07, sl.z); grp.add(line);
  const gm = new THREE.MeshLambertMaterial({ color: 0x1b1f2b }), gb = new THREE.MeshBasicMaterial({ color: d.accent2 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 11, 1.2), gm); p.position.set(sl.x + sr.x * s * (W + 2.5), 5.5, sl.z + sr.z * s * (W + 2.5)); grp.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((W + 2.5) * 2, 1.6, 1), gm); beam.position.set(sl.x, 11, sl.z); beam.rotation.y = ang + Math.PI / 2 * 0; beam.lookAt(sl.x + st.x, 11, sl.z + st.z); grp.add(beam);
  const strip = new THREE.Mesh(new THREE.BoxGeometry((W + 2.5) * 2 - 1, .35, 1.05), gb); strip.position.copy(beam.position); strip.quaternion.copy(beam.quaternion); strip.position.y -= .4; grp.add(strip);

  /* scenery, only where it is clear of the road */
  const clear = (x, z, m) => { for (let i = 0; i < tr.N; i += 6) { const p = tr.P[i], dx = x - p.x, dz = z - p.z; if (dx * dx + dz * dz < m * m) return false; } return true; };
  const place = (count, spread, minD, fn) => { let n = 0, tries = 0; while (n < count && tries++ < count * 12) { const a = A.rand() * 6.28, r = A.rand() * spread, x = Math.cos(a) * r * 1.25, z = Math.sin(a) * r * 1.1; if (clear(x, z, minD)) { fn(x, z, n); n++; } } };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), col = new THREE.Color();

  if (d.style === 'city') {
    const win = A.canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#10131f'; g.fillRect(0, 0, w, h); for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 10) { if (Math.random() < .55) { g.fillStyle = Math.random() < .5 ? '#ffe9a8' : '#7fe8ff'; g.fillRect(x, y, 5, 4); } } }, true);
    const bm = new THREE.MeshLambertMaterial({ map: win, emissiveMap: win, emissive: 0xffffff });
    const geo = new THREE.BoxGeometry(1, 1, 1), im = new THREE.InstancedMesh(geo, bm, 260); let c = 0;
    place(260, 760, W + 28, (x, z) => { const h = 30 + A.rand() * 120, w = 16 + A.rand() * 24; pv.set(x, h / 2, z); sv.set(w, h, w); q.setFromEuler(e.set(0, A.rand() * 3, 0)); im.setMatrixAt(c, m4.compose(pv, q, sv)); im.setColorAt(c, col.setHSL(.55 + A.rand() * .35, .5, .75)); c++; });
    im.count = c; grp.add(im);
    const pm = new THREE.MeshBasicMaterial({ color: d.accent }), pm2 = new THREE.MeshBasicMaterial({ color: d.accent2 });
    for (let i = 0; i < tr.N; i += 18) { const s = (i / 18) % 2 ? 1 : -1, p = tr.P[i], r = tr.R[i], o = s * (W + 4.5); const m = new THREE.Mesh(new THREE.BoxGeometry(.35, 7, .35), s > 0 ? pm : pm2); m.position.set(p.x + r.x * o, 3.5, p.z + r.z * o); grp.add(m); }
  } else if (d.style === 'canyon') {
    const geo = new THREE.ConeGeometry(1, 1, 7), mt = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const im = new THREE.InstancedMesh(geo, mt, 220); let c = 0;
    place(220, 820, W + 22, (x, z) => { const h = 25 + A.rand() * 80, w = 14 + A.rand() * 30; pv.set(x, h / 2 - 1, z); sv.set(w, h, w * (.7 + A.rand() * .6)); q.setFromEuler(e.set(0, A.rand() * 6, 0)); im.setMatrixAt(c, m4.compose(pv, q, sv)); im.setColorAt(c, col.setHSL(.04 + A.rand() * .04, .55, .28 + A.rand() * .18)); c++; });
    im.count = c; grp.add(im);
    const bg = new THREE.BoxGeometry(1, 1, 1), bi = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ color: 0xffffff }), 60); c = 0;
    place(60, 600, W + 14, (x, z) => { const s = 3 + A.rand() * 7; pv.set(x, s / 2, z); sv.set(s, s, s); q.setFromEuler(e.set(A.rand(), A.rand() * 6, A.rand())); bi.setMatrixAt(c, m4.compose(pv, q, sv)); bi.setColorAt(c, col.setHSL(.05, .5, .22)); c++; });
    bi.count = c; grp.add(bi);
  } else {
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), 420);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.25, .35, 1, 6), new THREE.MeshLambertMaterial({ color: 0x4a3425 }), 420); let c = 0;
    place(420, 700, W + 9, (x, z) => { const h = 9 + A.rand() * 14, w = 3.5 + A.rand() * 3; pv.set(x, h * .5 + 2.5, z); sv.set(w, h, w); q.identity(); cone.setMatrixAt(c, m4.compose(pv, q, sv)); cone.setColorAt(c, col.setHSL(.38 + A.rand() * .05, .4, .18 + A.rand() * .12)); pv.set(x, 1.5, z); sv.set(1, 3, 1); trunk.setMatrixAt(c, m4.compose(pv, q, sv)); c++; });
    cone.count = trunk.count = c; grp.add(cone, trunk);
    const hills = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshLambertMaterial({ color: 0xf4f9ff, flatShading: true }), 40); c = 0;
    place(40, 1100, W + 60, (x, z) => { const h = 60 + A.rand() * 90, w = 80 + A.rand() * 90; pv.set(x, h / 2, z); sv.set(w, h, w); q.setFromEuler(e.set(0, A.rand() * 6, 0)); hills.setMatrixAt(c, m4.compose(pv, q, sv)); c++; });
    hills.count = c; grp.add(hills);
  }

  /* lights */
  const hemi = new THREE.HemisphereLight(d.style === 'city' ? 0x7a7cff : 0xffffff, d.ground, d.style === 'city' ? .75 : .9); grp.add(hemi);
  const sunL = new THREE.DirectionalLight(d.style === 'city' ? 0x9aa4ff : 0xfff0d8, d.sun); sunL.position.set(-60, 90, -40);
  sunL.castShadow = !A.lowQ; sunL.shadow.mapSize.set(1024, 1024);
  const sc = sunL.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 10; sc.far = 260;
  grp.add(sunL, sunL.target);
  grp.userData = { sunL, sky, roadTex };
  scene.add(grp);
  return grp;
};

A.disposeWorld = function (scene, grp) {
  scene.remove(grp);
  grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { ['map', 'emissiveMap'].forEach(k => m[k] && m[k].dispose()); m.dispose(); }); } });
};
