'use strict';
// ================= yardımcılar =================
const $ = (s) => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const linear = (t) => t;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Takım formaları (server.js KIT_COUNT ile aynı sayıda olmalı)
const KITS = [
  { name: 'Sarı-Kırmızı', a: '#facc15', b: '#dc2626' },
  { name: 'Sarı-Lacivert', a: '#facc15', b: '#1e3a8a' },
  { name: 'Siyah-Beyaz', a: '#111111', b: '#f5f5f5' },
  { name: 'Bordo-Mavi', a: '#7f1d1d', b: '#38bdf8' },
  { name: 'Yeşil-Beyaz', a: '#15803d', b: '#f5f5f5' },
];
const JERSEY = 'M12 4 L4 9 L1 18 L8 21 L9 37 L31 37 L32 21 L39 18 L36 9 L28 4 Q20 9 12 4Z';
function jerseySvg(i) {
  const k = KITS[i] || KITS[0];
  const stripes = [4, 12, 20, 28, 36].map((x) => `<rect x="${x}" width="4" height="40" fill="${k.b}"/>`).join('');
  return `<svg viewBox="0 0 40 40"><defs><clipPath id="jc${i}"><path d="${JERSEY}"/></clipPath></defs>` +
    `<g clip-path="url(#jc${i})"><rect width="40" height="40" fill="${k.a}"/>${stripes}</g>` +
    `<path d="${JERSEY}" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.4"/></svg>`;
}
const CELL_NAMES = ['Sol Üst', 'Orta Üst', 'Sağ Üst', 'Sol Alt', 'Orta Alt', 'Sağ Alt'];
const GX = 62, GY = 42, CW = 92, CH = 69;          // kale içi geometri
const SPOT = { x: 200, y: 292 };                     // penaltı noktası
const KEEPER_HOME = { x: 200, y: 142 };
const cellCenter = (i) => ({ x: GX + CW * ((i % 3) + 0.5), y: GY + CH * (Math.floor(i / 3) + 0.5) });

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ================= ses =================
const sfx = (() => {
  let ctx = null;
  let on = store.get('snd') !== '0';
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f, d, type = 'sine', v = 0.2, f2) {
    const c = on && ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d);
  }
  function noise(d, freq, v = 0.3, q = 0.8) {
    const c = on && ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * d);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(), t = c.currentTime;
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(v, t + d * 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  }
  return {
    unlock: ac,
    tick: () => tone(1200, 0.04, 'square', 0.04),
    kick: () => { tone(150, 0.2, 'sine', 0.6, 45); noise(0.08, 900, 0.3); },
    whistle: () => { tone(2700, 0.28, 'square', 0.035); setTimeout(() => tone(2700, 0.45, 'square', 0.035), 320); },
    cheer: () => { noise(2.4, 1100, 0.4, 0.4); noise(2.0, 2400, 0.15, 0.6); },
    ooh: () => { noise(1.4, 450, 0.3, 1.2); },
    save: () => { tone(260, 0.12, 'triangle', 0.35, 120); noise(1.3, 650, 0.25, 0.9); },
    toggle() { on = !on; store.set('snd', on ? '1' : '0'); return on; },
    get on() { return on; },
  };
})();
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
$('#sound').textContent = sfx.on ? '🔊' : '🔇';
$('#sound').onclick = () => { $('#sound').textContent = sfx.toggle() ? '🔊' : '🔇'; };

// ================= bağlantı =================
let ws = null;
let S = null;                 // son durum
let lastKickNo = -1;
let localPicks = [];
let animSeq = 0;
let animating = false;
let animToken = 0;
let endAt = 0;
let autoJoinTried = false;

function myName() { return ($('#name').value || '').trim() || 'Oyuncu'; }
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { $('#conn').classList.add('hidden'); send({ type: 'hello', pid: store.get('pid'), name: myName() }); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
  ws.onclose = () => { $('#conn').classList.remove('hidden'); setTimeout(connect, 1200); };
}

function handle(m) {
  if (m.type === 'welcome') store.set('pid', m.pid);
  else if (m.type === 'home') goHome();
  else if (m.type === 'error') toast(m.msg);
  else if (m.type === 'state') onState(m);
}

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
}

function goHome() {
  S = null;
  cancelAnim();
  show('home');
  const code = new URLSearchParams(location.search).get('room');
  if (code && !autoJoinTried) {
    autoJoinTried = true;
    $('#code').value = code.toUpperCase();
    if (store.get('name')) send({ type: 'join', code, name: myName() });
  }
}

// ================= ana menü =================
$('#name').value = store.get('name') || '';
$('#name').addEventListener('input', () => store.set('name', $('#name').value.trim()));
function needName() {
  if (!$('#name').value.trim()) { toast('Önce adını yaz 🙂'); $('#name').focus(); return true; }
  return false;
}
for (const b of document.querySelectorAll('[data-create]')) {
  b.onclick = () => { if (needName()) return; send({ type: 'create', mode: b.dataset.create, name: myName() }); };
}
$('#joinBtn').onclick = () => {
  if (needName()) return;
  const code = $('#code').value.trim().toUpperCase();
  if (code.length !== 4) return toast('4 haneli oda kodunu gir');
  send({ type: 'join', code, name: myName() });
};
$('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#joinBtn').click(); });

// ================= lobi =================
const SLOT_LABELS = {
  '0B': 'Oyuncu 1', '1B': 'Oyuncu 2',
  '0S': 'A Takımı · 🎯 Şutör', '0K': 'A Takımı · 🧤 Kaleci',
  '1S': 'B Takımı · 🎯 Şutör', '1K': 'B Takımı · 🧤 Kaleci',
};
function slotList(mode) {
  return mode === '2v2' ? [[0, 'S'], [1, 'S'], [0, 'K'], [1, 'K']] : [[0, 'B'], [1, 'B']];
}

function renderLobby() {
  $('#lobbyCode').textContent = S.code;
  $('#lobbyMode').textContent = S.mode === '2v2' ? '2v2 · Her takımda 1 şutör + 1 kaleci' : S.mode === 'bot' ? 'Bota karşı · Formanı seç ve başlat' : '1v1 · Sırayla şut & kaleci';
  $('#shareBtn').classList.toggle('hidden', S.mode === 'bot');
  $('#lobbyCode').classList.toggle('hidden', S.mode === 'bot');
  $('#lobbyCode').previousElementSibling.classList.toggle('hidden', S.mode === 'bot');
  $('#lobbyNotice').textContent = S.notice || '';
  const box = $('#slots');
  box.innerHTML = '';
  for (const [t, r] of slotList(S.mode)) {
    const p = S.players.find((x) => x.team === t && x.role === r);
    const d = document.createElement('div');
    d.className = `slot t${t}${p ? ' filled' : ''}${p && p.pid === S.you ? ' me' : ''}`;
    d.innerHTML = `<div class="lbl"><span class="kb">${jerseySvg(S.kits[t])}</span>${SLOT_LABELS[t + r]}</div>` + (p
      ? `<div class="who">${p.pid === S.hostId ? '👑 ' : ''}${esc(p.name)}${p.connected ? '' : ' 📴'}</div>`
      : `<div class="who empty">Boş · buraya geç</div>`);
    if (!p) d.onclick = () => send({ type: 'slot', team: t, role: r });
    box.appendChild(d);
  }
  renderKits();
  const full = slotList(S.mode).every(([t, r]) => S.players.some((x) => x.team === t && x.role === r));
  const host = S.hostId === S.you;
  $('#startBtn').classList.toggle('hidden', !host);
  $('#startBtn').disabled = !full;
  $('#waitNote').textContent = !full ? 'Oyuncular bekleniyor… Kodu arkadaşına gönder.' : host ? '' : 'Oda sahibinin başlatması bekleniyor…';
}
function renderKits() {
  const me = S.players.find((p) => p.pid === S.you);
  if (!me) return;
  const mine = S.kits[me.team], theirs = S.kits[1 - me.team];
  const bot = S.mode === 'bot';
  $('#kitsTitle').textContent = S.mode === '2v2' ? 'TAKIM FORMASI' : 'FORMANI SEÇ';
  const box = $('#kits');
  box.innerHTML = '';
  KITS.forEach((k, i) => {
    const b = document.createElement('button');
    const taken = !bot && i === theirs;
    b.className = 'kit' + (i === mine ? ' sel' : '') + (taken ? ' taken' : '');
    b.innerHTML = jerseySvg(i) + `<span>${k.name}</span>` + (i === mine ? '<small>Seçili</small>' : taken ? '<small>Rakip</small>' : '<small>&nbsp;</small>');
    b.onclick = () => {
      if (taken) return toast('Bu formayı rakip seçti');
      if (i !== mine) { sfx.tick(); send({ type: 'kit', kit: i }); }
    };
    box.appendChild(b);
  });
}
$('#startBtn').onclick = () => send({ type: 'start' });
$('#leaveLobby').onclick = () => send({ type: 'leave' });
$('#shareBtn').onclick = async () => {
  const url = `${location.origin}/?room=${S.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Penaltı Düellosu', text: `Oda kodu: ${S.code}`, url });
    else { await navigator.clipboard.writeText(url); toast('Link kopyalandı'); }
  } catch { toast(url); }
};

// ================= sahne kurulumu =================
(function buildCrowd() {
  const g = $('#crowd');
  const cols = ['#ef4444', '#3b82f6', '#facc15', '#f8fafc', '#22c55e', '#f97316', '#a855f7'];
  let h = '';
  for (let row = 0; row < 7; row++) {
    for (let x = 4 + (row % 2) * 5; x < 400; x += 10) {
      h += `<circle cx="${x + rand(-1.5, 1.5)}" cy="${48 + row * 11 + rand(-1, 1)}" r="${3.4 + rand(0, 1)}" fill="${pickOne(cols)}" opacity="${rand(0.35, 0.85).toFixed(2)}"/>`;
    }
  }
  g.innerHTML = h;
})();

const cellEls = [];
(function buildCells() {
  const g = $('#cells');
  for (let i = 0; i < 6; i++) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', GX + CW * (i % 3) + 1.5);
    r.setAttribute('y', GY + CH * Math.floor(i / 3) + 1.5);
    r.setAttribute('width', CW - 3);
    r.setAttribute('height', CH - 3);
    r.setAttribute('rx', 4);
    r.setAttribute('class', 'cell');
    r.addEventListener('pointerdown', (e) => { e.preventDefault(); tapCell(i); });
    g.appendChild(r);
    cellEls.push(r);
  }
})();

function setMarks(list) {
  // list: [{cell, icon, label}]
  $('#marks').innerHTML = list.map(({ cell, icon, label }) => {
    const c = cellCenter(cell);
    return `<text class="mark" x="${c.x}" y="${c.y + (label ? 2 : 8)}" text-anchor="middle">${icon}</text>` +
      (label ? `<text class="mark-sm" x="${c.x}" y="${c.y + 22}" text-anchor="middle">${label}</text>` : '');
  }).join('');
}

const ballEl = $('#ball'), shadowEl = $('#ballShadow'), keeperEl = $('#keeper'), netEl = $('#net');
function setBall(x, y, s = 1, rot = 0, op = 1) {
  ballEl.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(3)}) rotate(${rot.toFixed(0)})`);
  ballEl.style.opacity = op;
}
function setShadow(x, y, s = 1, op = 1) {
  shadowEl.setAttribute('cx', x.toFixed(1)); shadowEl.setAttribute('cy', y.toFixed(1));
  shadowEl.setAttribute('rx', (12 * s).toFixed(1)); shadowEl.setAttribute('ry', (4 * s).toFixed(1));
  shadowEl.style.opacity = op;
}
const shooterEl = $('#shooter');
const SHOOTER_HOME = { x: 150, y: 314 };
function setShooter(x, y, r = 0) {
  shooterEl.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${r.toFixed(1)})`);
}
function applyKits(shootingTeam) {
  if (!S || !S.kits) return;
  const ks = KITS[S.kits[shootingTeam]] || KITS[0], kk = KITS[S.kits[1 - shootingTeam]] || KITS[1];
  const paint = (id, k) => {
    document.querySelector(`#${id} .ka`).setAttribute('fill', k.a);
    document.querySelector(`#${id} .kb`).setAttribute('fill', k.b);
  };
  paint('kitS', ks); paint('kitK', kk);
  $('#sarms').setAttribute('stroke', ks.a);
  $('#sshorts').setAttribute('fill', ks.b);
  $('#ssocks').setAttribute('stroke', ks.a);
  $('#karms').setAttribute('stroke', kk.a);
  $('#kshorts').setAttribute('fill', kk.b);
}
function setKeeper(x, y, r = 0) {
  keeperEl.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${r.toFixed(1)})`);
}
function resetScene() {
  setBall(SPOT.x, SPOT.y);
  setShadow(SPOT.x, SPOT.y + 10);
  setKeeper(KEEPER_HOME.x, KEEPER_HOME.y, 0);
  setShooter(SHOOTER_HOME.x, SHOOTER_HOME.y);
  netEl.removeAttribute('transform');
  setMarks([]);
  cellEls.forEach((c) => c.setAttribute('class', 'cell'));
}

// ================= durum işleme =================
function onState(st) {
  S = st;
  if (st.phase === 'lobby') { cancelAnim(); hideOver(); show('lobby'); renderLobby(); return; }
  show('game');
  renderNames();
  applyKits(st.reveal && st.phase !== 'select' ? st.reveal.shootingTeam : st.shootingTeam);

  if (st.phase === 'select') {
    if (st.kickNo !== lastKickNo) {
      lastKickNo = st.kickNo;
      localPicks = [...st.myPicks];
      cancelAnim();
      hideOver();
      resetScene();
      if (st.myRole !== 'watch') { sfx.tick(); if (navigator.vibrate) navigator.vibrate(30); }
    }
    endAt = performance.now() + st.remaining;
    renderSelect();
  }

  if (st.reveal && st.reveal.seq !== animSeq && (st.phase === 'reveal' || st.phase === 'over')) {
    animSeq = st.reveal.seq;
    lastKickNo = st.reveal.kickNo;
    playReveal(st.reveal);
  }
  if (st.phase === 'over' && !animating) showOver();
  renderScore();
}

function teamName(t) {
  if (!S) return '';
  if (S.mode === '2v2') return t === 0 ? 'A Takımı' : 'B Takımı';
  const p = S.players.find((x) => x.team === t);
  return p ? p.name : t === 0 ? 'Oyuncu 1' : 'Oyuncu 2';
}
const nameOf = (pid) => { const p = S && S.players.find((x) => x.pid === pid); return p ? p.name : '?'; };

function renderNames() {
  $('#kb0').innerHTML = jerseySvg(S.kits[0]);
  $('#kb1').innerHTML = jerseySvg(S.kits[1]);
  $('#tn0').textContent = teamName(0) + (S.players.some((p) => p.team === 0 && p.pid === S.you) ? ' (sen)' : '');
  $('#tn1').textContent = teamName(1) + (S.players.some((p) => p.team === 1 && p.pid === S.you) ? ' (sen)' : '');
}

function renderScore() {
  if (!S) return;
  let score = S.score, kicks = S.kicks;
  if (animating && S.reveal) {
    score = S.reveal.scoreBefore;
    kicks = S.kicks.map((k, t) => (t === S.reveal.shootingTeam ? k.slice(0, -1) : k));
  }
  for (const t of [0, 1]) {
    const el = $('#sc' + t);
    if (el.textContent !== String(score[t])) {
      el.textContent = score[t];
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }
    const n = Math.max(5, kicks[0].length, kicks[1].length);
    const nowIdx = (S.phase === 'select' || animating) && S.shootingTeam === t ? kicks[t].length : -1;
    let h = '';
    for (let i = 0; i < n; i++) {
      const k = kicks[t][i];
      h += `<span class="dot ${k || ''}${i === nowIdx ? ' now' : ''}">${k === 'goal' ? '✓' : k ? '✕' : ''}</span>`;
    }
    $('#dots' + t).innerHTML = h;
  }
}

function iAmReady() {
  return S.myRole === 'shooter' ? S.ready.shooter : S.myRole === 'keeper' ? S.ready.keeper : false;
}

function renderSelect() {
  if (animating) return;
  const role = S.myRole;
  const ready = iAmReady();
  const shooter = nameOf(S.shooterPid), keeper = nameOf(S.keeperPid);
  const kickInfo = `${S.kicks[S.shootingTeam].length + 1}. atış`;

  if (role === 'shooter') $('#status').textContent = `🎯 Şut sırası sende! (${kickInfo})`;
  else if (role === 'keeper') $('#status').textContent = `🧤 Kaledesin! (${kickInfo})`;
  else $('#status').textContent = `👀 ${shooter} şut çekiyor, ${keeper} kalede`;

  $('#chipS').textContent = `🎯 ${shooter} ${S.ready.shooter ? '✓' : '…'}`;
  $('#chipK').textContent = `🧤 ${keeper} ${S.ready.keeper ? '✓' : '…'}`;
  $('#chipS').classList.toggle('ok', S.ready.shooter);
  $('#chipK').classList.toggle('ok', S.ready.keeper);
  $('.timer').classList.remove('off');

  const active = role !== 'watch' && !ready;
  cellEls.forEach((c, i) => {
    const picked = localPicks.includes(i);
    c.setAttribute('class', 'cell' + (active ? ' active' : '') + (picked ? (role === 'shooter' ? ' pick-s' : ' pick-k') : ''));
  });
  setMarks(localPicks.map((cell) => ({ cell, icon: role === 'shooter' ? '🎯' : '🧤' })));

  const btn = $('#readyBtn');
  btn.classList.toggle('hidden', role === 'watch');
  btn.disabled = ready || localPicks.length !== 3;
  btn.textContent = ready ? 'BEKLENİYOR…' : `HAZIR (${localPicks.length}/3)`;
  $('#hint').textContent = role === 'watch'
    ? 'Takım arkadaşın / rakibin seçim yapıyor…'
    : ready ? 'Rakip bekleniyor…'
    : role === 'shooter' ? 'Şut atmak istediğin 3 bölgeye dokun' : 'Kapatmak istediğin 3 bölgeye dokun';
}

function tapCell(i) {
  if (!S || S.phase !== 'select' || animating || S.myRole === 'watch' || iAmReady()) return;
  const idx = localPicks.indexOf(i);
  if (idx >= 0) localPicks.splice(idx, 1);
  else { localPicks.push(i); if (localPicks.length > 3) localPicks.shift(); }
  sfx.tick();
  send({ type: 'pick', cells: localPicks });
  renderSelect();
}
$('#readyBtn').onclick = () => {
  if (localPicks.length !== 3) return;
  send({ type: 'pick', cells: localPicks });
  send({ type: 'ready' });
  $('#readyBtn').disabled = true;
};

// zamanlayıcı + kalecinin bekleme hareketi
(function loop(now) {
  if (S && S.phase === 'select' && !animating) {
    const left = Math.max(0, endAt - now);
    $('#timerBar').style.transform = `scaleX(${(left / (S.selectMs || 20000)).toFixed(3)})`;
    $('#timerNum').textContent = Math.ceil(left / 1000);
    setKeeper(KEEPER_HOME.x + Math.sin(now / 380) * 7, KEEPER_HOME.y + Math.abs(Math.sin(now / 190)) * -2, 0);
  }
  requestAnimationFrame(loop);
})(performance.now());

// ================= animasyonlar =================
function tween(ms, fn, ease = easeOut) {
  const tok = animToken;
  return new Promise((res) => {
    const t0 = performance.now();
    function f(now) {
      if (tok !== animToken) return res();
      const t = Math.min(1, (now - t0) / ms);
      fn(ease(t), t);
      if (t < 1) requestAnimationFrame(f); else res();
    }
    requestAnimationFrame(f);
  });
}

function cancelAnim() {
  animToken++;
  animating = false;
  $('#bigText').classList.remove('show');
  $('#confetti').innerHTML = '';
}

async function playReveal(r) {
  cancelAnim();
  const tok = animToken;
  const alive = () => tok === animToken;
  animating = true;
  hideOver();
  $('#readyBtn').classList.add('hidden');
  $('.timer').classList.add('off');
  $('#hint').textContent = `${r.shooterName} 🎯  vs  🧤 ${r.keeperName}`;
  $('#status').textContent = 'Seçimler açıklanıyor…';
  $('#chipS').classList.add('ok'); $('#chipK').classList.add('ok');
  renderScore();

  // 1) seçimleri göster
  setKeeper(KEEPER_HOME.x, KEEPER_HOME.y, 0);
  const marks = [];
  for (let i = 0; i < 6; i++) {
    const k = r.keeperPicks.includes(i), s = r.shooterPicks.includes(i);
    let cls = 'cell';
    if (k && s) { cls += ' rv-block'; marks.push({ cell: i, icon: '🧤', label: 'TUTAR' }); }
    else if (s) { cls += ' rv-free'; marks.push({ cell: i, icon: '🎯', label: 'BOŞ' }); }
    else if (k) { cls += ' rv-keep'; marks.push({ cell: i, icon: '🧤' }); }
    cellEls[i].setAttribute('class', cls);
  }
  setMarks(marks);
  sfx.whistle();
  const free = r.segments.filter((s) => s.type === 'goal').length;
  $('#status').textContent = free === 0 ? '😱 Kaleci hepsini kapattı!' : `${free} boş bölge → %${free * 25} gol şansı`;
  await wait(1600); if (!alive()) return;

  // 2) şut animasyonu (sonuç sunucuda belirlendi)
  if (r.cell != null) cellEls[r.cell].setAttribute('class', cellEls[r.cell].getAttribute('class') + ' rv-hit');
  await shoot(r, alive); if (!alive()) return;

  animating = false;
  renderScore();
  if (S && S.phase === 'over') showOver();
}

function diveFor(cell) {
  const c = cellCenter(cell), col = cell % 3, row = Math.floor(cell / 3);
  if (col === 1) return row === 0 ? { x: 200, y: c.y + 46, r: 0 } : { x: 200, y: 150, r: 0 };
  const deg = (col === 0 ? -1 : 1) * (row === 0 ? 60 : 84);
  const rad = (deg * Math.PI) / 180;
  return { x: c.x - 46 * Math.sin(rad), y: c.y + 46 * Math.cos(rad), r: deg };
}

function bigText(txt, color) {
  const el = $('#bigText');
  el.textContent = txt;
  el.style.color = color;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

function confetti() {
  const box = $('#confetti');
  const cols = ['#facc15', '#22c55e', '#ef4444', '#3b82f6', '#fff', '#f97316'];
  let h = '';
  for (let i = 0; i < 60; i++) {
    h += `<i style="left:${rand(0, 100)}%;background:${pickOne(cols)};animation-duration:${rand(1.2, 2.4).toFixed(2)}s;animation-delay:${rand(0, 0.4).toFixed(2)}s;transform:rotate(${rand(0, 360)}deg)"></i>`;
  }
  box.innerHTML = h;
  setTimeout(() => { box.innerHTML = ''; }, 3000);
}

async function shoot(r, alive) {
  const kp = r.keeperPicks;
  let target, diveCell, after;
  if (r.outcome === 'goal') {
    const c = cellCenter(r.cell);
    target = { x: c.x + rand(-24, 24), y: c.y + rand(-16, 16) };
    diveCell = pickOne(kp);
  } else if (r.outcome === 'save') {
    const d = diveFor(r.cell), rad = (d.r * Math.PI) / 180;
    // topu kalecinin eldivenine gönder
    target = { x: d.x + 46 * Math.sin(rad), y: d.y - 46 * Math.cos(rad) };
    diveCell = r.cell;
  } else {
    if (r.outSide === 'left') target = { x: 40, y: rand(60, 165) };
    else if (r.outSide === 'right') target = { x: 360, y: rand(60, 165) };
    else target = { x: rand(90, 310), y: 24 };
    diveCell = pickOne(kp);
  }
  const dive = diveFor(diveCell);

  // koşu: top hafif titrer
  $('#status').textContent = `${r.shooterName} topun başında…`;
  setShooter(SHOOTER_HOME.x, SHOOTER_HOME.y);
  await tween(550, (e) => {
    setShooter(lerp(SHOOTER_HOME.x, 184, e), lerp(SHOOTER_HOME.y, 305, e) - Math.abs(Math.sin(e * Math.PI * 4)) * 3, 0);
  }, linear);
  if (!alive()) return;
  // vuruş anı: hafif öne eğilme
  tween(250, (e) => setShooter(184, 305, Math.sin(e * Math.PI) * 10));
  if (!alive()) return;
  sfx.kick();
  $('#status').textContent = 'ŞUT!';

  const FLY = 620;
  const ballFly = tween(FLY, (e) => {
    const x = lerp(SPOT.x, target.x, e);
    const y = lerp(SPOT.y, target.y, e) - Math.sin(e * Math.PI) * 30;
    setBall(x, y, lerp(1, 0.56, e), e * 900);
    setShadow(x, lerp(SPOT.y + 10, 184, e), lerp(1, 0.6, e), lerp(1, 0.5, e));
  }, (t) => 1 - Math.pow(1 - t, 1.6));
  const keeperDive = (async () => {
    await wait(110);
    await tween(430, (e) => {
      setKeeper(lerp(KEEPER_HOME.x, dive.x, e), lerp(KEEPER_HOME.y, dive.y, e) - Math.sin(e * Math.PI) * 10, lerp(0, dive.r, e));
    });
  })();
  await Promise.all([ballFly, keeperDive]);
  if (!alive()) return;

  if (r.outcome === 'goal') {
    const net = tween(500, (e, t) => {
      const amp = (1 - t) * 3;
      netEl.setAttribute('transform', `translate(${(Math.sin(t * 40) * amp).toFixed(2)},${(Math.cos(t * 33) * amp * 0.6).toFixed(2)})`);
    }, linear);
    const ball = tween(300, (e) => {
      setBall(lerp(target.x, target.x + (200 - target.x) * 0.12, e), lerp(target.y, target.y + 6, e), lerp(0.56, 0.46, e), 900 + e * 90);
    });
    bigText('GOOOL!', '#4ade80');
    confetti();
    sfx.cheer();
    if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
    $('#status').textContent = `⚽ ${r.shooterName} gol attı!`;
    await Promise.all([net, ball]);
    netEl.removeAttribute('transform');
    // top ağdan yere düşer
    await tween(450, (e) => setBall(target.x + (200 - target.x) * 0.12, lerp(target.y + 6, 172, e), 0.46, 990), (t) => t * t);
  } else if (r.outcome === 'save') {
    const col = r.cell % 3;
    const dir = col === 0 ? -1 : col === 2 ? 1 : pickOne([-1, 1]);
    bigText('KURTARDI!', '#60a5fa');
    sfx.save();
    if (navigator.vibrate) navigator.vibrate(80);
    $('#status').textContent = `🧤 ${r.keeperName} kurtardı!`;
    const end = { x: target.x + dir * rand(70, 110), y: rand(225, 260) };
    await tween(650, (e) => {
      const x = lerp(target.x, end.x, e);
      const y = lerp(target.y, end.y, e) - Math.sin(e * Math.PI) * 45;
      setBall(x, y, lerp(0.56, 0.85, e), 900 - e * 500);
      setShadow(x, lerp(184, end.y + 8, e), lerp(0.6, 0.85, e), 1);
    });
    // kaleci yere düşer
    await tween(300, (e) => {
      const fallY = Math.floor(r.cell / 3) === 0 && col !== 1 ? 165 : dive.y;
      setKeeper(dive.x, lerp(dive.y, fallY, e), dive.r * (col === 1 ? 1 : lerp(1, 1.25, e)));
    }, (t) => t * t);
  } else {
    bigText('DIŞARI!', '#e4e4e7');
    sfx.ooh();
    $('#status').textContent = `❌ ${r.shooterName} dışarı attı!`;
    const dx = target.x - SPOT.x, dy = target.y - SPOT.y, len = Math.hypot(dx, dy);
    await tween(420, (e) => {
      setBall(target.x + (dx / len) * 70 * e, target.y + (dy / len) * 70 * e, lerp(0.56, 0.45, e), 900 + e * 300, 1 - e);
      setShadow(target.x + (dx / len) * 70 * e, 184, 0.6, 0.5 * (1 - e));
    }, linear);
  }
  await wait(1100);
}

// ================= maç sonu =================
function showOver() {
  if (!S || S.phase !== 'over') return;
  const box = $('#overBox');
  const iWon = S.players.some((p) => p.pid === S.you && p.team === S.winner);
  const iPlay = S.players.some((p) => p.pid === S.you);
  $('#overTitle').textContent = `${teamName(S.winner)} kazandı!` + (iPlay ? (iWon ? ' 🎉' : ' 😢') : '');
  $('#overScore').textContent = `${S.score[0]} - ${S.score[1]}`;
  const host = S.hostId === S.you;
  $('#rematchBtn').classList.toggle('hidden', !host);
  $('#rematchNote').textContent = host ? '' : 'Rövanş için oda sahibi bekleniyor…';
  $('#readyBtn').classList.add('hidden');
  $('.timer').classList.add('off');
  $('#status').textContent = 'Maç bitti';
  $('#hint').textContent = '';
  if (box.classList.contains('hidden')) {
    box.classList.remove('hidden');
    if (iWon) { confetti(); sfx.cheer(); }
  }
}
function hideOver() { $('#overBox').classList.add('hidden'); }
$('#rematchBtn').onclick = () => send({ type: 'rematch' });
$('#homeBtn').onclick = () => send({ type: 'leave' });

// ================= başlat =================
resetScene();
show('home');
connect();
