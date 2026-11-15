/* Menu, HUD, minimap, live board and input handling. */
const $ = (id) => document.getElementById(id);
A.UI = {
  sel: { car: 0, map: 0 },
  input: { up: 0, down: 0, left: 0, right: 0, drift: 0, nitro: 0, reset: 0 },

  buildMenu(onChange) {
    const cg = $('carGrid'), mg = $('mapGrid');
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    cg.innerHTML = ''; mg.innerHTML = '';
    A.CARS.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'card'; b.setAttribute('aria-pressed', i === this.sel.car);
      const bars = c.bars.map((v, k) => `<div class="bar">${A.STATS[k]}<span><b style="width:${Math.round(v * 100)}%"></b></span></div>`).join('');
      b.innerHTML = `<h3><i style="background:${hex(c.color)}"></i>${c.name}</h3><p>${c.blurb}</p><div class="bars">${bars}</div>`;
      b.onclick = () => { this.sel.car = i; [...cg.children].forEach((x, k) => x.setAttribute('aria-pressed', k === i)); onChange('car'); };
      cg.appendChild(b);
    });
    A.MAPS.forEach((m, i) => {
      const b = document.createElement('button'); b.className = 'card'; b.setAttribute('aria-pressed', i === this.sel.map);
      const sw = [m.sky[0], m.sky[2], m.accent].map(hex);
      b.innerHTML = `<h3><i style="background:linear-gradient(135deg,${sw[0]},${sw[1]})"></i>${m.name}</h3><p>${m.blurb}</p><div class="bars"><div class="bar">Length<span><b style="width:${Math.round(m.R * m.sx / 5.2)}%;background:${sw[2]}"></b></span></div></div>`;
      b.onclick = () => { this.sel.map = i; [...mg.children].forEach((x, k) => x.setAttribute('aria-pressed', k === i)); onChange('map'); };
      mg.appendChild(b);
    });
  },

  renderTable(el, rows, meId) {
    el.innerHTML = '';
    if (!rows || !rows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 3; td.style.color = 'var(--mute)'; td.textContent = rows ? 'No times yet. Set the first one.' : 'Shared leaderboard unavailable here. Your best lap is saved on this device.'; tr.appendChild(td); el.appendChild(tr); return; }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr'); if (meId && r.id === meId) tr.className = 'me';
      [String(i + 1), r.name || 'Racer', r.time].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
      el.appendChild(tr);
    });
  },

  toast(msg, color) { const t = $('toast'); t.textContent = msg; t.style.color = color || 'var(--amber)'; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); },
  count(txt) { const c = $('count'); c.hidden = false; c.textContent = txt; c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick'); },
  hideCount() { $('count').hidden = true; },

  /* minimap: track outline cached once per map */
  setMini(tr) {
    const cv = $('miniCv'), pad = 10; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of tr.P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const s = Math.min((cv.width - pad * 2) / (x1 - x0), (cv.height - pad * 2) / (z1 - z0));
    this.mini = { s, x0, z0, ox: (cv.width - (x1 - x0) * s) / 2, oz: (cv.height - (z1 - z0) * s) / 2 };
    const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height; const g = off.getContext('2d');
    g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = 'rgba(180,195,230,.55)'; g.beginPath();
    tr.P.forEach((p, i) => { const [a, b] = this.mp(p.x, p.z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); g.stroke();
    g.fillStyle = '#fff'; const [sx, sz] = this.mp(tr.P[0].x, tr.P[0].z); g.fillRect(sx - 4, sz - 1.5, 8, 3);
    this.miniBg = off;
  },
  mp(x, z) { const m = this.mini; return [m.ox + (x - m.x0) * m.s, m.oz + (z - m.z0) * m.s]; },
  drawMini(list, me) {
    const cv = $('miniCv'), g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); if (this.miniBg) g.drawImage(this.miniBg, 0, 0);
    for (const r of list) { if (r === me) continue; const [a, b] = this.mp(r.x, r.z); g.fillStyle = r.bot ? '#8d99b8' : '#35e0ff'; g.beginPath(); g.arc(a, b, 3, 0, 7); g.fill(); }
    const [a, b] = this.mp(me.x, me.z); g.fillStyle = '#ffb020'; g.beginPath(); g.arc(a, b, 4.6, 0, 7); g.fill();
  },

  drawBoard(sorted, me, laps, now) {
    const ol = $('boardList'); const top = sorted.slice(0, 6); if (!top.includes(me)) top[top.length - 1] = me;
    ol.innerHTML = '';
    top.forEach((r) => {
      const rank = sorted.indexOf(r) + 1, li = document.createElement('li'); if (r === me) li.className = 'me';
      const a = document.createElement('span'); a.textContent = rank;
      const n = document.createElement('span'); n.className = 'n'; n.textContent = r.name;
      if (!r.bot && !r.me) { const l = document.createElement('small'); l.className = 'live'; l.textContent = ' ●'; n.appendChild(l); }
      const t = document.createElement('small'); t.textContent = r.finished ? 'FIN' : (r.bestLap < 1e8 ? A.fmt(r.bestLap) : '');
      li.append(a, n, t); ol.appendChild(li);
    });
  },

  bindInput() {
    const I = this.input, map = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'drift', ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro', KeyR: 'reset' };
    addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; const k = map[e.code]; if (k) { I[k] = 1; e.preventDefault(); } });
    addEventListener('keyup', (e) => { const k = map[e.code]; if (k) I[k] = 0; });
    addEventListener('blur', () => { for (const k in I) I[k] = 0; });
    const tb = { tL: 'left', tR: 'right', tG: 'up', tB: 'down', tD: 'drift', tN: 'nitro' };
    for (const id in tb) {
      const el = $(id), k = tb[id];
      const on = (e) => { I[k] = 1; el.classList.add('active'); e.preventDefault(); }, off = (e) => { I[k] = 0; el.classList.remove('active'); e.preventDefault(); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    }
  },
};
