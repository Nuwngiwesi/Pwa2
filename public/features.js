// LYNKO — extra client features: last seen, notifications (push), voice calls, Lynko AI (Groq).
// Loaded by chat.html after the main script; the main script calls F.init() once Pusher is connected.
(() => {
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}), keepalive: true });
const nm = id => (contacts.get(id) || {}).username || 'Someone';
let cfg = {}, ps = null, ac = null;

// ───────────────────────── sounds ─────────────────────────
function beep(f, d, v = .08) {
  try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(ac.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + d); o.stop(ac.currentTime + d); } catch {}
}
let ringT = null;
function ringStart(kind) {
  ringStop();
  const go = () => { if (kind == 'in') { beep(660, .3); setTimeout(() => beep(880, .3), 380); navigator.vibrate?.([300, 150, 300]) } else beep(440, .8, .05) };
  go(); ringT = setInterval(go, kind == 'in' ? 2200 : 3000);
}
function ringStop() { clearInterval(ringT); ringT = null; navigator.vibrate?.(0) }

// ───────────────────────── presence / last seen ─────────────────────────
const presence = new Map();   // id -> {online, ts, hidden, at}
let pingT = null;
const ping = off => { try { if (off) navigator.sendBeacon('/api/ping?off=1'); else post('/api/ping').catch(() => {}) } catch {} };
function pingStart() { ping(); clearInterval(pingT); pingT = setInterval(() => { if (!document.hidden) ping() }, 25000) }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInterval(pingT); ping(true); typingStop() }
  else if (me) { pingStart(); if (cur && contacts.has(cur)) seenLoad(cur) }
});
addEventListener('pagehide', () => { if (!me) return; ping(true); if (Call.cid) try { navigator.sendBeacon('/api/call', new Blob([JSON.stringify({ type: 'end', cid: Call.cid })], { type: 'application/json' })) } catch {} });
const dayName = t => { const d = new Date(t), n = new Date(); if (d.toDateString() == n.toDateString()) return 'today'; if (d.toDateString() == new Date(n - 864e5).toDateString()) return 'yesterday'; return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) };
function pres(id) {
  const p = presence.get(id); if (!p || me.hideSeen) return '';
  if (p.hidden) return '';
  if (p.online) return 'online';
  return p.ts ? `last seen ${dayName(p.ts)} at ${hm(p.ts)}` : '';
}
async function seenLoad(id) {
  if (!id || id == 'official' || id == 'ai') return;
  try { const d = await api('/api/seen/' + id); presence.set(id, d); if (cur == id) setSub() } catch {}
}
let seenT = null;
function seenPoll() { clearInterval(seenT); seenT = setInterval(() => { if (!document.hidden && cur && contacts.has(cur)) seenLoad(cur) }, 20000) }

// ───────────────────────── typing (instant + stop) ─────────────────────────
let tyLast = 0, tyIdle = null, tyTo = null;
function typingSend(stop) { if (!tyTo) return; post('/api/typing', { to: tyTo, stop: !!stop }).catch(() => {}) }
function typingStop() { clearTimeout(tyIdle); if (tyTo && tyLast) typingSend(true); tyLast = 0; tyTo = null }
function typingInput() {
  if (!cur || !contacts.has(cur)) return;
  if (!$('txt').value.trim()) return typingStop();
  const n = Date.now();
  if (tyTo != cur) { typingStop(); tyTo = cur }
  if (n - tyLast > 2500) { tyLast = n; typingSend(false) }           // first key = sent immediately, then every 2.5s
  clearTimeout(tyIdle); tyIdle = setTimeout(typingStop, 3500);       // paused typing -> indicator disappears on their side
}
function typingEvent(d) {
  clearTimeout(typingT[d.from]);
  if (d.stop) delete typingT[d.from]; else { typingT[d.from] = setTimeout(() => { delete typingT[d.from]; setSub(); renderList() }, 4000); const p = presence.get(d.from); if (p) p.online = true }
  if (d.from == cur) setSub(); renderList();
}

// ───────────────────────── notifications ─────────────────────────
const notifOK = () => 'Notification' in window && 'serviceWorker' in navigator;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode:standalone)').matches || navigator.standalone;
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)) };
async function pushSub() {
  if (!notifOK() || !cfg.vapid || Notification.permission != 'granted' || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) {   // made with an older / different VAPID key (e.g. keys were regenerated) -> the push service rejects every alert: start fresh
      const cur = sub.options && sub.options.applicationServerKey, want = b64u(cfg.vapid);
      if (cur && (cur.byteLength != want.length || new Uint8Array(cur).some((v, i) => v != want[i]))) { await sub.unsubscribe().catch(() => {}); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(cfg.vapid) });
    await api('/api/push/subscribe', 'POST', { sub: sub.toJSON() });
  } catch (e) { console.warn('push', e.message) }
}
async function notifOn() {
  if (!notifOK()) return toast('This browser can’t show notifications');
  if (isIOS && !standalone) return toast('iPhone: tap Share → Add to Home Screen, then open the app from there');
  const r = await Notification.requestPermission();
  if (r != 'granted') { toast('Notifications are blocked — allow them in browser settings'); return nbar() }
  await pushSub(); nbar(); toast('Notifications on ♥');
  try { await api('/api/push/test', 'POST', {}) } catch (e) { toast('Alerts could not be sent: ' + e.message) }   // you should see a test alert in a moment
}
function nbar() {
  const b = $('nbar'); if (!b) return;
  b.hidden = !(notifOK() && Notification.permission == 'default' && !localStorage.getItem('nb_x'));
}
async function showOS(title, body, tag, url) {
  if (!notifOK() || Notification.permission != 'granted') return;
  try { const reg = await navigator.serviceWorker.ready;
    reg.showNotification(title, { body, tag, renotify: true, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url }, vibrate: [200, 100, 200] }) } catch {}
}
let banT = null;
function banner(title, text, go) {
  document.querySelector('.nbn')?.remove(); clearTimeout(banT);
  const d = document.createElement('button'); d.className = 'nbn'; d.innerHTML = `<b>${E(title)}</b><span>${E(text)}</span>`;
  d.onclick = () => { d.remove(); go() }; document.body.appendChild(d); banT = setTimeout(() => d.remove(), 4500);
}
// called by the main script for every incoming message
async function notify(peer, d) {
  if (d.from == me.id) return;
  const lk = LOCK.chat.has(peer);   // locked chats never show a name or text
  let text = 'New message';
  if (!lk) try { const p = await payload(d); text = pvText(p) } catch {}
  if (document.hidden) { showOS(lk ? 'LYNKO CHAT' : nm(peer), lk ? 'You have a new message' : 'New message', lk ? 'lk' : 'm' + peer, '/chat?c=' + peer); return }
  if (peer != cur) { beep(880, .12); banner(lk ? 'LYNKO CHAT' : nm(peer), lk ? 'You have a new message' : text, () => openChat(peer)) }
}

// ───────────────────────── voice calls ─────────────────────────
const Call = { st: 'idle', cid: null, peer: null, pc: null, stream: null, offer: null, t0: 0, tick: null, to: null, muted: false, out: false };
const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
let iceCache = null;
const ice = async () => iceCache || (iceCache = await api('/api/ice').catch(() => [{ urls: 'stun:stun.l.google.com:19302' }]));
// Waits until the phone has found its addresses. On mobile data the RELAY address (TURN) is the one that matters and it arrives last,
// so we wait for it (up to 9 s) instead of cutting off after 3 s like before.
const relayIn = pc => /typ relay/.test((pc.localDescription && pc.localDescription.sdp) || '');
const gathered = pc => new Promise(r => {
  if (pc.iceGatheringState == 'complete') return r();
  let done = false; const fin = () => { if (done) return; done = true; clearTimeout(t); clearTimeout(g); r() };
  const t = setTimeout(fin, 9000); let g = null;
  pc.addEventListener('icecandidate', e => { if (e.candidate && /typ relay/.test(e.candidate.candidate) && !g) g = setTimeout(fin, 700) });
  pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState == 'complete') fin() });
});
// Call setup (SDP: DTLS fingerprint + network addresses) is sealed with the same end-to-end key as chat messages (ECDH -> AES-GCM),
// bound to the call id / direction / sender. The server only relays ciphertext, so it can't read your IP or swap in its own fingerprint.
const sealSdp = async (peer, cid, t, sdp) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`lynko-call|${cid}|${t}|${me.id}`) }, await shared(peer), new TextEncoder().encode(sdp));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
};
const openSdp = async (peer, cid, t, box) => {
  const o = JSON.parse(box); if (o.v !== 1) throw new Error('bad version');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv), additionalData: new TextEncoder().encode(`lynko-call|${cid}|${t}|${peer}`) }, await shared(peer), unb64(o.ct));
  return new TextDecoder().decode(pt);
};
// "Protect IP address in calls" (Settings): force relay-only ICE when the server offers a TURN relay
const RELAYK = () => 'lynko_relay:' + me.id;
let relayOK = null;
const relayAvail = async () => { if (relayOK !== null) return relayOK; try { relayOK = (await ice()).some(x => [].concat(x.urls).some(u => /^turns?:/i.test(u))) } catch { relayOK = false } return relayOK };
const relayGet = () => localStorage.getItem(RELAYK()) == '1';
const relaySet = v => localStorage.setItem(RELAYK(), v ? '1' : '0');
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function callUI(state) {
  let o = $('callov');
  if (!o) {
    o = document.createElement('div'); o.id = 'callov'; o.className = 'callov';
    o.innerHTML = '<div class="cav"></div><h2 id="cnm"></h2><p id="cst"></p><small id="cenc" style="color:#9be7b0">🔒 End-to-end encrypted</small><div class="cbt" id="cbt"></div><audio id="rau" autoplay playsinline></audio>';
    document.body.appendChild(o);
  }
  const c = contacts.get(Call.peer) || { id: Call.peer, username: '?' };
  o.querySelector('.cav').innerHTML = av(c, 'big'); $('cnm').textContent = c.username;
  const b = $('cbt');
  if (state == 'incoming') b.innerHTML = '<button class="cbn no" id="cno">✕<small>Decline</small></button><button class="cbn ok" id="cok">📞<small>Accept</small></button>';
  else b.innerHTML = `<button class="cbn mu${Call.muted ? ' on' : ''}" id="cmu">${Call.muted ? '🔇' : '🎙'}<small>${Call.muted ? 'Unmute' : 'Mute'}</small></button><button class="cbn no" id="cend">📞<small>End</small></button>`;
  if ($('cno')) { $('cno').onclick = () => callReject(); $('cok').onclick = () => callAccept() }
  if ($('cend')) $('cend').onclick = () => callEnd();
  if ($('cmu')) $('cmu').onclick = () => { Call.muted = !Call.muted; Call.stream?.getAudioTracks().forEach(t => t.enabled = !Call.muted); callUI(Call.st) };
  o.hidden = false;
}
const callStatus = t => { const e = $('cst'); if (e) e.textContent = t };
function pcMake(stream) {
  return ice().then(servers => {
    return relayAvail().then(rel => {
    const pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: relayGet() && rel ? 'relay' : 'all', bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });   // one transport = smaller setup, fewer candidates
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.ontrack = e => { const a = $('rau'); if (a) { a.srcObject = e.streams[0]; a.play().catch(() => {}) } };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState == 'connected') { relayStop(); if (Call.st != 'active') callActive(); }
      if (pc.connectionState == 'failed') { if (Call.pc == pc && RLY.ws) relayEngage(); else callDone('Call failed — ' + (relayIn(pc) ? 'could not connect (relay used)' : 'no relay address found'), true); }
      if (pc.connectionState == 'disconnected') setTimeout(() => { if (Call.pc == pc && pc.connectionState == 'disconnected' && !RLY.send) callDone('Connection lost', true) }, 7000);
    };
    return pc;
    });
  });
}

// ───────────────────────── audio relay fallback (works on every network, no TURN needed) ─────────────────────────
// If the direct phone-to-phone path can't be made in a few seconds, voice goes through the server instead: 16 kHz mu-law audio, each 40 ms
// frame sealed with the same end-to-end key as chat (AES-GCM). The server only forwards ciphertext it cannot read.
const RLY = { ws: null, ctx: null, src: null, proc: null, send: false, key: null, next: 0, pend: [], acc: 0, cnt: 0, ph: 0, tries: 0, fb: null };
const RATE = 16000, FRAME = 640;
const ulawEnc = x => { let sg = (x >> 8) & 0x80; if (sg) x = -x; if (x > 32635) x = 32635; x += 0x84; let e = 7; for (let m = 0x4000; (x & m) == 0 && e > 0; m >>= 1) e--; return (~(sg | (e << 4) | ((x >> (e + 3)) & 0x0F))) & 0xFF };
const ulawDec = u => { u = ~u & 0xFF; const t = (((u & 0x0F) << 3) + 0x84) << ((u >> 4) & 7); return (u & 0x80) ? 0x84 - t : t - 0x84 };
const pcConnected = () => !!(Call.pc && Call.pc.connectionState == 'connected');
function rlyCtx() {   // call this from a tap (Call / Accept): browsers only start audio after one
  try { if (!RLY.ctx || RLY.ctx.state == 'closed') RLY.ctx = new (window.AudioContext || window.webkitAudioContext)(); RLY.ctx.resume().catch(() => {}); } catch {}
}
function relayOpen() {
  if (!window.WebSocket || !Call.cid || (RLY.ws && RLY.ws.readyState < 2)) return;
  const cid = Call.cid;
  try {
    const ws = RLY.ws = new WebSocket((location.protocol == 'https:' ? 'wss://' : 'ws://') + location.host + '/api/relay?cid=' + cid);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = ev => { if (typeof ev.data != 'string') relayPlay(ev.data) };
    ws.onclose = () => {   // dropped while the call is still on: reconnect (a few tries)
      if (RLY.ws !== ws) return; RLY.ws = null;
      if (Call.cid == cid && Call.st != 'idle' && RLY.send && RLY.tries++ < 5) setTimeout(() => { if (Call.cid == cid) relayOpen() }, 800);
    };
  } catch {}
}
async function relayEngage() {   // start sending our voice through the server
  if (RLY.send || Call.st == 'idle' || Call.st == 'incoming' || !Call.stream || pcConnected()) return;
  relayOpen(); rlyCtx();
  try {
    RLY.key = await shared(Call.peer);
    if (!RLY.ctx) return;
    if (!RLY.proc) {
      const c = RLY.ctx; RLY.src = c.createMediaStreamSource(Call.stream); RLY.proc = c.createScriptProcessor(2048, 1, 1);
      const mute = c.createGain(); mute.gain.value = 0; RLY.src.connect(RLY.proc); RLY.proc.connect(mute); mute.connect(c.destination);
      const ratio = c.sampleRate / RATE;
      RLY.proc.onaudioprocess = e => {
        if (!RLY.send) return;
        const inp = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < inp.length; i++) {   // average down to 16 kHz, keeping the fractional position between blocks
          RLY.acc += inp[i]; RLY.cnt++; RLY.ph += 1;
          if (RLY.ph >= ratio) { RLY.ph -= ratio; RLY.pend.push(RLY.acc / RLY.cnt); RLY.acc = 0; RLY.cnt = 0; }
        }
        while (RLY.pend.length >= FRAME) {
          const f = RLY.pend.splice(0, FRAME), u = new Uint8Array(FRAME);
          for (let i = 0; i < FRAME; i++) u[i] = ulawEnc(Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767))));
          relaySend(u);
        }
      };
    }
    RLY.send = true; RLY.tries = 0;
    if (Call.st != 'active') callStatus('Connecting via server…');
  } catch (e) { console.warn('relay', e.message) }
}
async function relaySend(u) {
  const ws = RLY.ws, cid = Call.cid;
  if (!ws || ws.readyState != 1 || !RLY.key || !cid) return;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('lynko-audio|' + cid) }, RLY.key, u));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    if (ws.readyState == 1 && ws.bufferedAmount < 65536) ws.send(out);
  } catch {}
}
async function relayPlay(buf) {
  const cid = Call.cid; if (!cid || Call.st == 'idle' || Call.st == 'incoming' || pcConnected()) return;
  try {
    if (!RLY.key) RLY.key = await shared(Call.peer);
    if (!RLY.send) relayEngage();   // the other phone already uses the server: do the same so both directions work
    const b = new Uint8Array(buf); if (b.length < 29) return;
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12), additionalData: new TextEncoder().encode('lynko-audio|' + cid) }, RLY.key, b.subarray(12)));
    const c = RLY.ctx; if (!c) return;
    const ab = c.createBuffer(1, pt.length, RATE), d = ab.getChannelData(0);
    for (let i = 0; i < pt.length; i++) d[i] = ulawDec(pt[i]) / 32768;
    const src = c.createBufferSource(); src.buffer = ab; src.connect(c.destination);
    const now = c.currentTime;
    if (RLY.next < now + 0.04) RLY.next = now + 0.18;     // small cushion against network jitter
    if (RLY.next > now + 0.8) return;                      // way behind: drop this frame instead of growing a delay
    src.start(RLY.next); RLY.next += pt.length / RATE;
    if (Call.st != 'active') callActive();
  } catch {}
}
function relayStop() { RLY.send = false; RLY.pend = []; RLY.acc = RLY.cnt = RLY.ph = 0 }   // the direct path worked
function relayClose() {
  relayStop(); clearTimeout(RLY.fb);
  try { RLY.proc && (RLY.proc.onaudioprocess = null, RLY.proc.disconnect()); RLY.src && RLY.src.disconnect() } catch {}
  RLY.proc = RLY.src = RLY.key = null; RLY.next = 0;
  try { const w = RLY.ws; RLY.ws = null; w && w.close() } catch {}
}
const relayLater = () => { clearTimeout(RLY.fb); RLY.fb = setTimeout(() => { if (Call.st != 'idle' && !pcConnected()) relayEngage() }, 5000) };
const mic = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
function callActive() {
  Call.st = 'active'; ringStop(); clearTimeout(Call.to); Call.t0 = Date.now(); callUI('active');
  clearInterval(Call.hb); const cid = Call.cid; Call.hb = setInterval(() => { if (Call.cid == cid) post('/api/call', { type: 'hb', cid }).catch(() => {}) }, 25000);
  clearInterval(Call.tick); const t = () => callStatus(mmss(Math.round((Date.now() - Call.t0) / 1000))); t(); Call.tick = setInterval(t, 1000);
}
function callDone(msg, notifyPeer) {
  if (notifyPeer && Call.cid) post('/api/call', { type: 'end', cid: Call.cid }).catch(() => {});
  ringStop(); clearTimeout(Call.to); clearInterval(Call.tick); clearInterval(Call.hb); relayClose();
  Call.pc?.close(); Call.stream?.getTracks().forEach(t => t.stop());
  Object.assign(Call, { st: 'idle', cid: null, peer: null, pc: null, stream: null, offer: null, muted: false, out: false });
  const o = $('callov'); if (o) { o.hidden = true; const a = $('rau'); if (a) a.srcObject = null }
  navigator.serviceWorker?.ready.then(r => r.getNotifications({ tag: 'call' }).then(l => l.forEach(n => n.close()))).catch(() => {});
  if (msg) toast(msg); loadCalls();
}
async function callStart(peer) {
  if (Call.st != 'idle') return toast('You’re already in a call');
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return toast('Calls aren’t supported in this browser');
  if (!navigator.onLine) return toast('No internet');
  Call.st = 'calling'; Call.peer = peer; Call.cid = rid(); Call.out = true; callUI('calling'); callStatus('Starting…'); rlyCtx();
  try {
    Call.stream = await mic();
  } catch { callDone('Allow the microphone to make calls'); return }
  try {
    const pc = Call.pc = await pcMake(Call.stream);
    await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
    const r = await api('/api/call', 'POST', { type: 'offer', to: peer, cid: Call.cid, sdp: await sealSdp(peer, Call.cid, 'offer', JSON.stringify(pc.localDescription)) });
    if (r.busy) return callDone(nm(peer) + ' is on another call');
    relayOpen(); callStatus('Ringing…'); ringStart('out');
    Call.to = setTimeout(() => callDone('No answer', true), 45000);
  } catch (e) { callDone('Couldn’t start the call: ' + e.message, !!Call.cid) }
}
function callIncoming(d) {
  if (Call.st != 'idle') { post('/api/call', { type: 'reject', cid: d.cid }).catch(() => {}); return }   // busy
  Object.assign(Call, { st: 'incoming', cid: d.cid, peer: d.from, offer: d.sdp, out: false });
  callUI('incoming'); callStatus('Incoming voice call…'); ringStart('in');
  if (document.hidden) showOS(LOCK.chat.has(d.from) ? 'LYNKO CHAT' : nm(d.from), 'Incoming voice call', 'call', '/chat?call=1');
  clearTimeout(Call.to); Call.to = setTimeout(() => { if (Call.st == 'incoming') callDone('') }, 45000);
}
async function callAccept() {
  if (Call.st != 'incoming') return;
  ringStop(); clearTimeout(Call.to); rlyCtx(); callStatus('Connecting…'); Call.st = 'connecting'; callUI('active'); callStatus('Connecting…');
  try { Call.stream = await mic() } catch { callReject(); return toast('Allow the microphone to answer calls') }
  try {
    const pc = Call.pc = await pcMake(Call.stream);
    let off; try { off = await openSdp(Call.peer, Call.cid, 'offer', Call.offer) } catch { return callDone('Couldn’t verify this call’s security — call refused', true) }
    await pc.setRemoteDescription(JSON.parse(off));
    await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
    await api('/api/call', 'POST', { type: 'answer', cid: Call.cid, sdp: await sealSdp(Call.peer, Call.cid, 'answer', JSON.stringify(pc.localDescription)) });
    relayOpen(); relayLater();
    Call.to = setTimeout(() => { if (Call.st == 'connecting') callDone('Couldn’t connect — ' + (Call.pc && relayIn(Call.pc) ? 'relay used' : 'no relay address (TURN not reachable)'), true) }, 30000);
  } catch (e) { callDone('Couldn’t answer: ' + e.message, true) }
}
function callReject() { if (Call.cid) post('/api/call', { type: 'reject', cid: Call.cid }).catch(() => {}); callDone('') }
function callEnd() { callDone('', true) }
async function callEvent(d) {
  if (d.t == 'offer') return d.sdp ? callIncoming(d) : callPending();   // big setups are not in the realtime event: fetch the ringing call
  if (d.cid != Call.cid) return;
  if (d.t == 'answer' && Call.pc && Call.out) {
    try {
      if (!d.sdp) for (let i = 0; i < 5 && !d.sdp; i++) { d.sdp = (await api('/api/call/' + Call.cid + '/answer')).sdp; if (!d.sdp) await new Promise(r => setTimeout(r, 400)) }
      await Call.pc.setRemoteDescription(JSON.parse(await openSdp(Call.peer, Call.cid, 'answer', d.sdp))); Call.st = 'connecting'; callStatus('Connecting…'); ringStop(); clearTimeout(Call.to); relayOpen(); relayLater(); Call.to = setTimeout(() => { if (Call.st == 'connecting') callDone('Couldn’t connect — ' + (Call.pc && relayIn(Call.pc) ? 'relay used' : 'no relay address (TURN not reachable)'), true) }, 30000) }
    catch { callDone('Couldn’t connect', true) }
  } else if (d.t == 'reject') callDone(nm(Call.peer) + ' declined');
  else if (d.t == 'end') callDone(Call.st == 'active' ? 'Call ended' : Call.st == 'incoming' ? 'Missed call' : 'Call ended');
}
async function callPending() {
  try {
    const d = await api('/api/call/pending');
    if (d && d.sdp && Call.st == 'idle') { if (!contacts.has(d.from)) await loadContacts(); callIncoming({ cid: d.cid, from: d.from, sdp: d.sdp }) }
  } catch {}
}

// ── Calls tab ──
let calls = [];
async function loadCalls() {
  try { calls = await api('/api/calls') } catch {}
  const last = +localStorage.getItem('calls_seen:' + me.id) || 0;
  const miss = calls.some(c => !c.out && c.st == 'missed' && new Date(c.ts) > last && !LOCK.chat.has(c.peer));
  if (tab == 'calls') { localStorage.setItem('calls_seen:' + me.id, Date.now()); $('cdot').hidden = true; renderCalls() } else $('cdot').hidden = !miss;
}
function renderCalls() {
  const l = $('list'); l.innerHTML = '';
  const h = document.createElement('div'); h.className = 'sec'; h.textContent = 'Voice calls · peer-to-peer'; l.appendChild(h);
  const rows = calls.filter(c => contacts.has(c.peer) && (!LOCK.chat.has(c.peer) || LOCK.chat.isOpen()));
  if (!rows.length) { const e = document.createElement('div'); e.className = 'empty'; e.innerHTML = 'No calls yet.<br>Open a chat and tap 📞 to start a voice call.'; l.appendChild(e); return }
  for (const c of rows) {
    const ct = contacts.get(c.peer), b = document.createElement('button'); b.className = 'item';
    const miss = !c.out && c.st == 'missed', arrow = c.out ? '↗' : miss ? '↙' : '↙';
    const sub = c.out ? (c.st == 'missed' ? 'No answer' : c.st == 'declined' ? 'Declined' : c.dur ? mmss(c.dur) : 'Outgoing') : miss ? 'Missed' : c.st == 'declined' ? 'Declined' : c.dur ? mmss(c.dur) : 'Incoming';
    b.innerHTML = `${av(ct)}<div class="n"><div class="r1"><b></b><time></time></div><div class="r2"><span class="pv"></span><i class="ccall">📞</i></div></div>`;
    b.querySelector('b').textContent = ct.username; if (miss) b.querySelector('b').style.color = '#ff6b81';
    const t = new Date(c.ts); b.querySelector('time').textContent = t.toDateString() == new Date().toDateString() ? hm(c.ts) : dayLbl(c.ts);
    const pv = b.querySelector('.pv'); pv.textContent = `${arrow} ${sub}`; if (miss) pv.style.color = '#ff6b81';
    b.onclick = () => callStart(c.peer); l.appendChild(b);
  }
}

// ───────────────────────── Lynko AI (Groq) ─────────────────────────
const AIK = () => 'lynko_ai:' + me.id, AIO = () => 'lynko_ai_on:' + me.id;
const aiOn = () => !!cfg.ai && localStorage.getItem(AIO()) != '0';
let aiMsgs = [], aiBusy = false;
function aiLoad() { try { const d = JSON.parse(localStorage.getItem(AIK()) || '[]'); aiMsgs = d.filter(m => Date.now() - m.ts < 864e5) } catch { aiMsgs = [] } }
const aiSave = () => { try { localStorage.setItem(AIK(), JSON.stringify(aiMsgs.slice(-60))) } catch {} };
const aiAv = (cls = '') => `<div class="av ${cls}" style="background:linear-gradient(135deg,#7f5cff,#ff5c8a);font-size:${cls ? 34 : 20}px">✨</div>`;
function aiShown(qs, flt) { return aiOn() && flt != 'unread' && flt != 'locked' && 'lynko ai assistant'.includes(qs) }
function aiItem() {
  const b = document.createElement('button'), l = aiMsgs[aiMsgs.length - 1];
  b.className = 'item' + (cur == 'ai' ? ' on' : '');
  b.innerHTML = `${aiAv()}<div class="n"><div class="r1"><b>Lynko AI<i class="tag" style="background:#7f5cff">AI</i></b><time></time></div><div class="r2"><span class="pv"></span></div></div>`;
  b.querySelector('.pv').textContent = l ? (l.r == 'u' ? 'You: ' : '') + l.t.replace(/\s+/g, ' ') : 'Ask me anything ✨';
  if (l) b.querySelector('time').textContent = new Date(l.ts).toDateString() == new Date().toDateString() ? hm(l.ts) : dayLbl(l.ts);
  b.onclick = openAI; return b;
}
function aiBubble(m) {
  const box = $('msgs'), dl = new Date(m.ts).toDateString();
  if (dl != lastDay) { lastDay = dl; const c = document.createElement('div'); c.className = 'sys'; c.textContent = dayLbl(m.ts); box.appendChild(c) }
  const r = document.createElement('div'); r.className = 'row ' + (m.r == 'u' ? 'me' : 'them');
  const b = document.createElement('div'), t = document.createElement('div'), mt = document.createElement('span');
  b.className = 'b'; t.className = 'tx'; if (m.t) linkify(t, m.t); mt.className = 'meta'; mt.innerHTML = '<time></time>'; mt.firstChild.textContent = hm(m.ts);
  b.append(t, mt); r.appendChild(b); box.appendChild(r); return t;
}
function aiRender() {
  const box = $('msgs'); box.innerHTML = ''; lastDay = '';
  if (!aiMsgs.length) { const e = document.createElement('div'); e.className = 'sys'; e.textContent = 'Say hi to Lynko AI ✨ — ask anything, in any language'; box.appendChild(e) }
  aiMsgs.forEach(aiBubble); scrollEnd();
}
async function openAI() {
  if (!aiOn()) return;
  if (cur && cur != 'ai') unlocked.delete(cur);
  const first = !cur; cur = 'ai'; msgs = []; seen = new Set(); typingStop();
  history[first ? 'pushState' : 'replaceState']({ c: 1 }, '');
  $('app').classList.add('chatting'); ['head', 'msgs', 'comp'].forEach(x => $(x).hidden = false); $('attm').hidden = true; $('none').hidden = true;
  $('hn').textContent = 'Lynko AI'; $('hav').innerHTML = aiAv(); $('hs').className = ''; $('hs').textContent = 'AI assistant · not end-to-end encrypted';
  hdr(); aiLoad(); aiRender(); renderList();
}
async function aiSend(text) {
  text = (text || '').trim(); if (!text || aiBusy || cur != 'ai') return;
  aiBusy = true; $('txt').value = ''; grow();
  const um = { r: 'u', t: text, ts: Date.now() }; aiMsgs.push(um); aiBubble(um); scrollEnd();
  const am = { r: 'a', t: '', ts: Date.now() }, el = aiBubble(am); el.textContent = '…'; scrollEnd();
  $('hs').textContent = 'typing…'; $('hs').className = 'ty';
  const hist = aiMsgs.slice(-14).map(m => ({ role: m.r == 'u' ? 'user' : 'assistant', content: m.t }));
  try {
    const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: hist }) });
    if (r.status == 401) { leave(); return }
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'AI error') }
    // the text arrives in bursts; show it with a smooth typing flow instead of jumping (speeds up when it falls behind)
    const rd = r.body.getReader(), dc = new TextDecoder(); let acc = '', shown = 0, end = false, fin;
    const finished = new Promise(r => fin = r);
    const tick = () => {
      if (shown < acc.length) { shown = Math.min(acc.length, shown + Math.max(1, Math.ceil((acc.length - shown) / 10))); if (cur == 'ai') { el.textContent = aiClean(acc.slice(0, shown)); scrollEnd() } }
      if (end && shown >= acc.length) fin(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try { for (;;) { const { done, value } = await rd.read(); if (done) break; acc += dc.decode(value, { stream: true }) } } finally { end = true }
    await finished;
    am.t = aiClean(acc).trim() || '…'; am.ts = Date.now(); aiMsgs.push(am); if (cur == 'ai') { el.textContent = ''; linkify(el, am.t) }
  } catch (e) { el.parentElement.parentElement.remove(); toast(e.message) }
  aiSave(); aiBusy = false; if (cur == 'ai') { $('hs').className = ''; $('hs').textContent = 'AI assistant · not end-to-end encrypted' } renderList();
}
const aiClean = t => String(t).replace(/\*\*(.+?)\*\*/gs, '$1').replace(/^#{1,6}\s+/gm, '').replace(/`+/g, '').replace(/^\s*[-*]\s+/gm, '• ');   // models like markdown; this chat is plain text
function aiClear() { aiMsgs = []; aiSave(); if (cur == 'ai') aiRender(); renderList(); toast('AI chat cleared') }
function aiToggle(on) {
  localStorage.setItem(AIO(), on ? '1' : '0');
  if (!on && cur == 'ai') history.back();
  renderList();
}

// ───────────────────────── header / glue ─────────────────────────
function hdr() {
  const isC = !!cur && contacts.has(cur);
  $('hcall').hidden = !isC;
  $('att').hidden = cur == 'ai'; if (window.micVis) micVis();
  $('txt').placeholder = cur == 'ai' ? 'Ask Lynko AI…' : 'Message';
  if (isC) seenLoad(cur);
}
function init(o) {
  cfg = o.cfg || {}; ps = o.ps;
  o.ch.bind('call', callEvent);
  pingStart(); seenPoll(); nbar(); pushSub(); loadCalls(); callPending();
  const q = new URLSearchParams(location.search);
  if (q.get('c') && contacts.has(q.get('c'))) openChat(q.get('c'));
  if (q.has('c') || q.has('call')) history.replaceState(null, '', '/chat');
  navigator.serviceWorker?.addEventListener('message', e => {
    const d = e.data || {}; if (d.type != 'open') return;
    if (d.call) callPending(); else if (d.c && contacts.has(d.c)) openChat(d.c);
  });
  $('hcall').onclick = () => { if (cur && contacts.has(cur)) callStart(cur) };
  $('nbon').onclick = notifOn; $('nbx').onclick = () => { localStorage.setItem('nb_x', '1'); nbar() };
  ps.connection.bind('connected', () => { if (cur && contacts.has(cur)) seenLoad(cur) });
  aiLoad();
}

window.F = { inCall: () => Call.st != 'idle', init, pres, seenLoad, typingInput, typingStop, typingEvent, notify, hdr, notifOn, nbar,
  callStart, loadCalls, renderCalls, aiOn, aiShown, aiItem, openAI, aiSend, aiClear, aiToggle, relayAvail, relayGet, relaySet, relayState: () => relayOK, cfgAi: () => !!cfg.ai, notifState: () => (notifOK() ? Notification.permission : 'unsupported'), ping };
})();
