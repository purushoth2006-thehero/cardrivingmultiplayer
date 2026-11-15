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
  send(r, extra, now) {
    if (!this.room || now - this.lastSend < 70) return; this.lastSend = now;
    const q = (v, k) => Math.round(v * k) / k;
    this.room.presence(Object.assign({ m: this.map, x: q(r.x, 10), z: q(r.z, 10), h: q(r.h, 100), s: q(r.speed, 10), n: r.usingNitro ? 1 : 0, d: r.drifting ? 1 : 0, c: A.CARS.indexOf(r.def), nm: extra.name, t: q(r.total, 10), f: r.finished ? 1 : 0, ft: q(r.finishT || 0, 100), bl: r.bestLap < 1e8 ? q(r.bestLap, 100) : 0 }, extra.more || {})).catch(() => { });
  },

  setLobby(name) { if (this.room) this.room.presence({ m: null, nm: name, x: null, z: null, t: null }).catch(() => { }); this.map = null; },
  setMap(id, name) { this.map = id; if (this.room) { this.room.presence({ m: id, nm: name }).catch(() => { }); this.peersChanged(this.room.peers()); } },

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
