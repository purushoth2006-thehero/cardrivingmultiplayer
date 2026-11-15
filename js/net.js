/* Multiplayer through the room capability (live car state) and db capability (best-lap leaderboard). Everything degrades to solo play. */
A.Net = {
  room: null, db: null, uid: null, ready: false, map: null, remotes: [], online: 1, onLobby: null, unsubBoard: null, lastSend: 0,

  async init() {
    const use = window.claude && window.claude.use; if (!use) { this.notify(); return; }
    try { const u = await window.claude.use('user'); if (u) this.uid = await u.id(); } catch (e) { }
    try { this.db = await window.claude.use('db'); } catch (e) { this.db = null; }
    try {
      this.room = await window.claude.use('room');
      if (this.room) {
        this.room.onPeers((ch) => this.peersChanged(ch.peers), () => { this.room = null; this.notify(); });
        this.ready = true;
      }
    } catch (e) { this.room = null; }
    this.notify();
  },

  notify() { if (this.onLobby) this.onLobby(this); },

  peersChanged(peers) {
    const viewers = peers.filter(p => p.kind === 'viewer');
    this.online = Math.max(1, viewers.length);
    this.remotes = viewers.filter(p => !p.isMe && p.presence && p.presence.m && p.presence.m === this.map);
    this.notify();
  },

  /* publish my state, at most about 14 times a second */
  p2pLive() { return !this.room && A.P2P.status === 'live'; },

  send(r, extra, now) {
    if (now - this.lastSend < 70) return;
    const live = this.p2pLive(); if (!this.room && !live) return; this.lastSend = now;
    const q = (v, k) => Math.round(v * k) / k;
    const pr = Object.assign({ m: this.map, x: q(r.x, 10), z: q(r.z, 10), h: q(r.h, 100), s: q(r.speed, 10), n: r.usingNitro ? 1 : 0, d: r.drifting ? 1 : 0, c: A.CARS.indexOf(r.def), nm: extra.name, t: q(r.total, 10), f: r.finished ? 1 : 0, ft: q(r.finishT || 0, 100), bl: r.bestLap < 1e8 ? q(r.bestLap, 100) : 0 }, extra.more || {});
    if (this.room) this.room.presence(pr).catch(() => { }); else A.P2P.sendState(pr);
  },

  setLobby(name) {
    this.map = null;
    if (this.room) this.room.presence({ m: null, nm: name, x: null, z: null, t: null }).catch(() => { });
    else if (this.p2pLive()) { A.P2P.sendState({ m: null, nm: name }); this.p2pRefresh(); }
  },
  setMap(id, name) {
    this.map = id;
    if (this.room) { this.room.presence({ m: id, nm: name }).catch(() => { }); this.peersChanged(this.room.peers()); }
    else if (this.p2pLive()) { A.P2P.sendState({ m: id, nm: name }); this.p2pRefresh(); }
  },

  /* room-code mode: rebuild the remote list from the P2P state table, dropping players silent for 6 s */
  p2pRefresh() {
    const P = A.P2P, now = Date.now(), arr = [];
    for (const id in P.state) { const s = P.state[id]; if (now - s.at > 6000) continue; arr.push({ peer: id, kind: 'viewer', isMe: false, presence: s.presence }); }
    this.online = P.status === 'live' ? 1 + arr.length : 1;
    this.remotes = P.status === 'live' ? arr.filter(p => p.presence && p.presence.m && p.presence.m === this.map) : [];
    this.notify();
  },

  localBest(map) { try { const v = parseFloat(localStorage.getItem('apex.best.' + map)); return isFinite(v) ? v : Infinity; } catch (e) { return Infinity; } },
  saveLocal(map, t) { try { if (t < this.localBest(map)) localStorage.setItem('apex.best.' + map, String(t)); } catch (e) { } },

  async submit(map, ms, carName, name) {
    this.saveLocal(map, ms);
    if (!this.db || !this.uid) return false;
    try {
      const ref = this.db.collection('board_' + map).doc(this.uid), s = await ref.get();
      if (!s.exists || ms < (s.data().ms || 1e9)) await ref.set({ name: String(name).slice(0, 14), ms, car: carName, at: Date.now() });
      return true;
    } catch (e) { return false; }
  },

  watchBoard(map, cb) {
    if (this.unsubBoard) { this.unsubBoard(); this.unsubBoard = null; }
    if (!this.db) { cb(null); return; }
    try {
      this.unsubBoard = this.db.collection('board_' + map).orderBy('ms', 'asc').limit(8).onSnapshot(
        (snap) => cb(snap.docs.map(d => Object.assign({ id: d.id }, d.data()))), () => cb(null));
    } catch (e) { cb(null); }
  },
};

/* Room-code multiplayer over WebRTC (PeerJS). The host's peer id is "apexrush-<CODE>". Friends connect to the host,
   which relays everyone's state to everyone else. Only used where the Claude runtime is absent (e.g. GitHub Pages). */
A.P2P = {
  peer: null, host: false, code: null, conns: {}, hostConn: null, state: {}, status: 'off', msg: '', myId: null, prefix: 'apexrush-', onStatus: null, onGo: null,
  available() { return !window.claude && typeof window.Peer === 'function'; },
  genCode() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; },
  setStatus(s, msg) { this.status = s; this.msg = msg; if (this.onStatus) this.onStatus(s, msg); A.Net.p2pRefresh(); },
  leave() {
    try { if (this.peer) this.peer.destroy(); } catch (e) { }
    this.peer = null; this.host = false; this.code = null; this.conns = {}; this.hostConn = null; this.state = {}; this.myId = null;
    if (this.status !== 'off') this.setStatus('off', '');
  },
  create(tries) {
    this.leave(); tries = tries || 0; const code = this.genCode(); this.setStatus('connecting', 'Creating room…');
    let peer; try { peer = this.peer = new window.Peer(this.prefix + code); } catch (e) { this.setStatus('error', 'Could not start online mode.'); return; }
    peer.on('open', (id) => { this.host = true; this.code = code; this.myId = id; this.setStatus('live', 'Room ' + code + ' is open. Share the code with your friends.'); });
    peer.on('connection', (c) => this.accept(c));
    peer.on('error', (e) => { if (e.type === 'unavailable-id' && tries < 4) this.create(tries + 1); else this.setStatus('error', 'Connection problem (' + e.type + '). Try again.'); });
  },
  join(code) {
    code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { this.setStatus('error', 'Type the room code first.'); return; }
    this.leave(); this.setStatus('connecting', 'Joining ' + code + '…');
    let peer; try { peer = this.peer = new window.Peer(); } catch (e) { this.setStatus('error', 'Could not start online mode.'); return; }
    peer.on('open', (id) => {
      this.myId = id;
      const c = this.hostConn = peer.connect(this.prefix + code, { reliable: true });
      c.on('open', () => { this.host = false; this.code = code; this.setStatus('live', 'Joined room ' + code + '. The host starts the race.'); });
      c.on('data', (d) => this.recv(d, c));
      c.on('close', () => { this.state = {}; this.setStatus('error', 'The host left the room.'); });
      setTimeout(() => { if (this.status === 'connecting') this.setStatus('error', 'Could not reach that room. Check the code.'); }, 10000);
    });
    peer.on('error', (e) => this.setStatus('error', e.type === 'peer-unavailable' ? 'Room not found. Check the code.' : 'Connection problem (' + e.type + '). Try again.'));
  },
  accept(c) {
    c.on('open', () => {
      this.conns[c.peer] = c;
      /* bring the newcomer up to date: host's own state plus everyone already here */
      try { if (this.lastP) c.send({ t: 's', id: this.myId, p: this.lastP }); for (const id in this.state) c.send({ t: 's', id, p: this.state[id].presence }); } catch (e) { }
      A.Net.p2pRefresh();
    });
    c.on('data', (d) => this.recv(d, c));
    c.on('close', () => this.drop(c.peer)); c.on('error', () => this.drop(c.peer));
  },
  drop(id) { delete this.conns[id]; delete this.state[id]; if (this.host) this.bcast({ t: 'x', id }); A.Net.p2pRefresh(); },
  recv(d, c) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 's' && typeof d.id === 'string' && d.p && typeof d.p === 'object') { this.state[d.id] = { presence: d.p, at: Date.now() }; if (this.host) this.bcast(d, c.peer); A.Net.p2pRefresh(); }
    else if (d.t === 'x') { delete this.state[d.id]; A.Net.p2pRefresh(); }
    else if (d.t === 'go' && !this.host && this.onGo) this.onGo(d);
  },
  bcast(d, except) { for (const id in this.conns) if (id !== except) { try { this.conns[id].send(d); } catch (e) { } } },
  sendState(p) {
    const d = { t: 's', id: this.myId, p }; this.lastP = p;
    if (this.host) this.bcast(d); else if (this.hostConn && this.hostConn.open) { try { this.hostConn.send(d); } catch (e) { } }
  },
  /* host only: tell everyone to start the same race */
  sendGo(info) { if (this.host) this.bcast(Object.assign({ t: 'go' }, info)); },
};
