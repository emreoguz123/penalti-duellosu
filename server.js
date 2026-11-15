'use strict';
// Penaltı Düellosu - oyun sunucusu (statik dosyalar + WebSocket)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, 'public');
const SELECT_MS = 20000;   // seçim süresi
const REVEAL_MS = 6000;    // seçimlerin gösterilmesi + şut animasyonu
const REGULATION = 5;
const KIT_COUNT = 5;       // forma sayısı (public/app.js KITS ile aynı)      // normal atış sayısı (her takım)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
const MAX_ROOMS = 3000;
const MAX_MSGS_PER_SEC = 20;

// ---------- statik dosya sunucusu ----------
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
};
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: sockets.size }));
  }
  if (p === '/') p = '/index.html';
  const fp = path.normalize(path.join(PUB, p));
  if (!fp.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404, SEC_HEADERS); return res.end('404'); }
    res.writeHead(200, {
      ...SEC_HEADERS,
      'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    if (fp.endsWith('index.html') && req.headers.host) {
      // Link önizlemeleri (WhatsApp vb.) için mutlak görsel adresi
      const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
      const host = String(req.headers.host).replace(/[^A-Za-z0-9.:\-]/g, '');
      data = Buffer.from(data.toString().replace('content="/icon-512.png"', `content="${proto}://${host}/icon-512.png"`));
    }
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

// ---------- oyun durumu ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const rooms = new Map();    // code -> room
const sockets = new Map();  // pid -> ws
const pidRoom = new Map();  // pid -> code

const rnd = (n) => crypto.randomInt(n);
function randId(len, abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') {
  let s = '';
  for (let i = 0; i < len; i++) s += abc[rnd(abc.length)];
  return s;
}
function newCode() { let c; do c = randId(4); while (rooms.has(c)); return c; }
function fillPicks(existing) {
  const s = new Set(existing);
  while (s.size < 3) s.add(rnd(6));
  return [...s];
}

// 1v1: her oyuncu hem şutör hem kaleci (B). 2v2: S = şutör, K = kaleci
function slotsFor(mode) {
  return mode === '2v2'
    ? [[0, 'S'], [1, 'S'], [0, 'K'], [1, 'K']]
    : [[0, 'B'], [1, 'B']];
}
const playersOf = (room) => [...room.players.values()];
const humans = (room) => playersOf(room).filter((p) => !p.bot);
function slotTaken(room, team, role) { return playersOf(room).some((p) => p.team === team && p.role === role); }
function freeSlot(room) {
  for (const [t, r] of slotsFor(room.mode)) if (!slotTaken(room, t, r)) return [t, r];
  return null;
}
function actors(room) {
  const st = room.shootingTeam;
  const all = playersOf(room);
  return {
    shooter: all.find((p) => p.team === st && (p.role === 'S' || p.role === 'B')),
    keeper: all.find((p) => p.team === 1 - st && (p.role === 'K' || p.role === 'B')),
  };
}
function roleOf(room, pid) {
  if (room.phase !== 'select' && room.phase !== 'reveal') return 'watch';
  const a = actors(room);
  if (a.shooter && a.shooter.pid === pid) return 'shooter';
  if (a.keeper && a.keeper.pid === pid) return 'keeper';
  return 'watch';
}

function view(room, pid) {
  const myRole = roleOf(room, pid);
  const s = room.sel;
  const a = actors(room);
  return {
    type: 'state',
    you: pid,
    code: room.code,
    mode: room.mode,
    hostId: room.hostId,
    phase: room.phase,
    notice: room.notice || '',
    players: playersOf(room).map((p) => ({
      pid: p.pid, name: p.name, team: p.team, role: p.role, bot: !!p.bot,
      connected: p.bot || sockets.has(p.pid),
    })),
    kits: room.kits,
    score: room.score,
    kicks: room.kicks,
    shootingTeam: room.shootingTeam,
    kickNo: room.kickId,
    shooterPid: a.shooter ? a.shooter.pid : null,
    keeperPid: a.keeper ? a.keeper.pid : null,
    myRole,
    myPicks: s && room.phase === 'select'
      ? (myRole === 'shooter' ? s.shooter : myRole === 'keeper' ? s.keeper : [])
      : [],
    ready: { shooter: !!(s && s.sReady), keeper: !!(s && s.kReady) },
    remaining: room.phase === 'select' ? Math.max(0, room.deadline - Date.now()) : 0,
    selectMs: SELECT_MS,
    reveal: room.phase === 'reveal' || room.phase === 'over' ? room.reveal : null,
    winner: room.winner,
  };
}

function send(pid, obj) {
  const ws = sockets.get(pid);
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(room) { for (const p of humans(room)) send(p.pid, view(room, p.pid)); }

function createRoom(mode, host) {
  const room = {
    code: newCode(), mode, hostId: host.pid, players: new Map(),
    phase: 'lobby', score: [0, 0], kicks: [[], []], shootingTeam: 0,
    kickId: 0, seq: 0, sel: null, deadline: 0, timer: null,
    reveal: null, winner: null, notice: '',
    kits: [0, 1],
  };
  rooms.set(room.code, room);
  return room;
}

function addPlayer(room, pid, name, bot = false) {
  const slot = freeSlot(room);
  if (!slot) return false;
  room.players.set(pid, { pid, name, team: slot[0], role: slot[1], bot });
  if (!bot) pidRoom.set(pid, room.code);
  return true;
}

function deleteRoom(room) {
  clearTimeout(room.timer);
  for (const p of humans(room)) if (pidRoom.get(p.pid) === room.code) pidRoom.delete(p.pid);
  rooms.delete(room.code);
}

function toLobby(room, notice) {
  clearTimeout(room.timer);
  room.phase = 'lobby';
  room.sel = null;
  room.reveal = null;
  room.winner = null;
  room.notice = notice || '';
}

function removePlayer(room, pid) {
  const p = room.players.get(pid);
  if (!p) return;
  room.players.delete(pid);
  if (pidRoom.get(pid) === room.code) pidRoom.delete(pid);
  if (humans(room).length === 0 || room.mode === 'bot') return deleteRoom(room);
  if (room.hostId === pid) room.hostId = humans(room)[0].pid;
  if (room.phase !== 'lobby') toLobby(room, `${p.name} oyundan ayrıldı.`);
  broadcast(room);
}

// ---------- oyun akışı ----------
function startGame(room) {
  room.score = [0, 0];
  room.kicks = [[], []];
  room.shootingTeam = 0;
  room.winner = null;
  room.notice = '';
  startSelect(room);
}

function startSelect(room) {
  clearTimeout(room.timer);
  room.phase = 'select';
  room.kickId++;
  room.sel = { shooter: [], keeper: [], sReady: false, kReady: false };
  room.reveal = null;
  room.deadline = Date.now() + SELECT_MS;
  room.timer = setTimeout(() => resolveKick(room), SELECT_MS + 250);
  const kick = room.kickId;
  const a = actors(room);
  for (const [who, p] of [['shooter', a.shooter], ['keeper', a.keeper]]) {
    if (p && p.bot) {
      setTimeout(() => {
        if (room.phase !== 'select' || room.kickId !== kick) return;
        room.sel[who] = fillPicks([]);
        room.sel[who === 'shooter' ? 'sReady' : 'kReady'] = true;
        checkBothReady(room);
      }, 1500 + rnd(3500));
    }
  }
  broadcast(room);
}

function checkBothReady(room) {
  if (room.sel.sReady && room.sel.kReady) resolveKick(room);
  else broadcast(room);
}

function resolveKick(room) {
  if (room.phase !== 'select') return;
  clearTimeout(room.timer);
  const sel = room.sel;
  const kp = fillPicks(sel.keeper);
  const sp = fillPicks(sel.shooter);
  // Çark: şutörün 3 seçimi (%25'er) + %25 dışarı
  const segments = sp.map((c) => ({ type: kp.includes(c) ? 'save' : 'goal', cell: c }));
  segments.push({ type: 'out', cell: null });
  const resultIndex = rnd(4);
  const seg = segments[resultIndex];
  const st = room.shootingTeam;
  const scoreBefore = [...room.score];
  if (seg.type === 'goal') room.score[st]++;
  room.kicks[st].push(seg.type);
  const a = actors(room);
  room.reveal = {
    seq: ++room.seq,
    kickNo: room.kickId,
    shootingTeam: st,
    shooterName: a.shooter ? a.shooter.name : '?',
    keeperName: a.keeper ? a.keeper.name : '?',
    keeperPicks: kp,
    shooterPicks: sp,
    segments,
    resultIndex,
    outcome: seg.type,
    cell: seg.cell,
    outSide: ['left', 'right', 'over'][rnd(3)],
    scoreBefore,
    scoreAfter: [...room.score],
  };
  room.phase = 'reveal';
  room.timer = setTimeout(() => afterReveal(room), REVEAL_MS);
  broadcast(room);
}

function isOver(room) {
  const t0 = room.kicks[0].length, t1 = room.kicks[1].length;
  const [s0, s1] = room.score;
  if (t0 <= REGULATION && t1 <= REGULATION && !(t0 === REGULATION && t1 === REGULATION)) {
    const r0 = REGULATION - t0, r1 = REGULATION - t1;
    return s0 + r0 < s1 || s1 + r1 < s0;
  }
  return t0 === t1 && s0 !== s1; // ani ölüm
}

function afterReveal(room) {
  if (isOver(room)) {
    room.phase = 'over';
    room.winner = room.score[0] > room.score[1] ? 0 : 1;
    broadcast(room);
    return;
  }
  room.shootingTeam = 1 - room.shootingTeam;
  startSelect(room);
}

// ---------- mesajlar ----------
function cleanName(n) {
  const s = String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 14);
  return s || 'Oyuncu';
}

function onMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.type !== 'string') return;

    if (m.type === 'hello') {
      let pid = typeof m.pid === 'string' && /^[A-Za-z0-9]{8,32}$/.test(m.pid) ? m.pid : randId(16);
      if (ws.pid && ws.pid !== pid && sockets.get(ws.pid) === ws) sockets.delete(ws.pid);
      ws.pid = pid;
      ws.name = cleanName(m.name);
      sockets.set(pid, ws);
      send(pid, { type: 'welcome', pid });
      const room = rooms.get(pidRoom.get(pid));
      if (room && room.players.has(pid)) {
        room.players.get(pid).name = ws.name;
        broadcast(room);
      } else send(pid, { type: 'home' });
      return;
    }

    const pid = ws.pid;
    if (!pid) return;
    if (typeof m.name === 'string') ws.name = cleanName(m.name);
    const room = rooms.get(pidRoom.get(pid));

    switch (m.type) {
      case 'create': {
        if (rooms.size >= MAX_ROOMS) return send(pid, { type: 'error', msg: 'Sunucu şu an çok yoğun, birazdan tekrar dene.' });
        if (room) removePlayer(room, pid);
        const mode = ['1v1', '2v2', 'bot'].includes(m.mode) ? m.mode : '1v1';
        const r = createRoom(mode, { pid });
        addPlayer(r, pid, ws.name);
        if (mode === 'bot') {
          addPlayer(r, 'bot' + randId(6), 'Robot', true);
          r.kits[1] = 2;
        }
        broadcast(r);
        break;
      }
      case 'join': {
        const code = String(m.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r || r.mode === 'bot') return send(pid, { type: 'error', msg: 'Oda bulunamadı.' });
        if (r.players.has(pid)) return broadcast(r);
        if (r.phase !== 'lobby') return send(pid, { type: 'error', msg: 'Oyun başlamış.' });
        if (!freeSlot(r)) return send(pid, { type: 'error', msg: 'Oda dolu.' });
        if (room) removePlayer(room, pid);
        addPlayer(r, pid, ws.name);
        broadcast(r);
        break;
      }
      case 'slot': {
        if (!room || room.phase !== 'lobby') return;
        const ok = slotsFor(room.mode).some(([t, r]) => t === m.team && r === m.role);
        if (!ok || slotTaken(room, m.team, m.role)) return;
        const p = room.players.get(pid);
        p.team = m.team; p.role = m.role;
        broadcast(room);
        break;
      }
      case 'kit': {
        if (!room || room.phase !== 'lobby') return;
        const k = m.kit, p = room.players.get(pid);
        if (!Number.isInteger(k) || k < 0 || k >= KIT_COUNT || !p) return;
        if (room.mode !== 'bot' && room.kits[1 - p.team] === k) return send(pid, { type: 'error', msg: 'Bu formayı rakip seçti.' });
        room.kits[p.team] = k;
        if (room.mode === 'bot' && room.kits[1] === k) room.kits[1] = (k + 1) % KIT_COUNT;
        broadcast(room);
        break;
      }
      case 'start': {
        if (!room || room.phase !== 'lobby' || room.hostId !== pid) return;
        if (freeSlot(room)) return send(pid, { type: 'error', msg: 'Tüm yerler dolmadan başlayamazsın.' });
        startGame(room);
        break;
      }
      case 'pick': {
        if (!room || room.phase !== 'select') return;
        const role = roleOf(room, pid);
        if (role === 'watch') return;
        if (role === 'shooter' ? room.sel.sReady : room.sel.kReady) return;
        const cells = Array.isArray(m.cells) ? m.cells : [];
        const uniq = [...new Set(cells.filter((c) => Number.isInteger(c) && c >= 0 && c < 6))].slice(0, 3);
        room.sel[role] = uniq;
        break;
      }
      case 'ready': {
        if (!room || room.phase !== 'select') return;
        const role = roleOf(room, pid);
        if (role === 'watch' || room.sel[role].length !== 3) return;
        room.sel[role === 'shooter' ? 'sReady' : 'kReady'] = true;
        checkBothReady(room);
        break;
      }
      case 'rematch': {
        if (!room || room.phase !== 'over' || room.hostId !== pid) return;
        if (room.mode === 'bot') startGame(room);
        else { toLobby(room, ''); broadcast(room); }
        break;
      }
      case 'leave': {
        if (room) removePlayer(room, pid);
        send(pid, { type: 'home' });
        break;
      }
    }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let winStart = Date.now(), count = 0;
  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - winStart > 1000) { winStart = now; count = 0; }
    if (++count > MAX_MSGS_PER_SEC) return;
    try { onMessage(ws, raw); } catch (e) { console.error('Mesaj hatası:', e); }
  });
  ws.on('error', () => {});

  ws.on('close', () => {
    const pid = ws.pid;
    if (!pid || sockets.get(pid) !== ws) return;
    sockets.delete(pid);
    const room = rooms.get(pidRoom.get(pid));
    if (!room) return;
    broadcast(room);
    // Uzun süre dönmezse temizle
    setTimeout(() => {
      if (sockets.has(pid) || !room.players.has(pid) || !rooms.has(room.code)) return;
      if (room.phase === 'lobby' || humans(room).every((p) => !sockets.has(p.pid))) removePlayer(room, pid);
    }, 90000);
  });
});

// Ölü bağlantıları temizle (mobil ağlar / proxy'ler için)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 25000);

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1012, 'restart');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚽ Penaltı Düellosu çalışıyor!\n`);
  console.log(`  Bu bilgisayarda:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Telefondan:       http://${i.address}:${PORT}`);
    }
  }
  console.log(`\n(Telefon ve bilgisayar aynı Wi-Fi ağında olmalı)\n`);
});
