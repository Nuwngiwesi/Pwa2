require('dotenv').config();
const express = require('express'), crypto = require('crypto'), path = require('path'), compression = require('compression');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), Pusher = require('pusher');
const { MongoClient, ObjectId } = require('mongodb');
const https = require('https'), fs = require('fs');

const SECRET = process.env.SESSION_SECRET;
const MK = Buffer.from(process.env.MESSAGE_KEY || '', 'base64');
if (!SECRET) { console.error('✖ SESSION_SECRET is not set'); process.exit(1); }
if (MK.length !== 32) { console.error('✖ MESSAGE_KEY must be 32 random bytes in base64 (node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))")'); process.exit(1); }
if (SECRET.length < 32) console.warn('⚠ SESSION_SECRET is short — use 32+ random characters');
if (process.env.ADMIN_PASS && process.env.ADMIN_PASS.length < 12) console.warn('⚠ ADMIN_PASS is weak — use 12+ characters');
const pusher = new Pusher({ appId: process.env.PUSHER_APP_ID, key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET, cluster: process.env.PUSHER_CLUSTER, useTLS: true, timeout: 8000,
  agent: new https.Agent({ keepAlive: true, maxSockets: 64 }) });   // reuse the connection: realtime events leave ~150 ms sooner

const C = {};   // collections shared with admin.js (filled once Mongo is connected)
const store = require('./storage');
const mon = require('./admin')({ secret: SECRET, pusher, store, C });
process.on('unhandledRejection', e => { console.error('unhandledRejection', e); mon.logError('process', e); });
process.on('uncaughtException', e => { console.error('uncaughtException', e); mon.logError('process', e); setTimeout(() => process.exit(1), 800); });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => mon.flush().finally(() => process.exit(0)));

const app = express();
app.set('trust proxy', 1);
app.use(mon.requests);
// ── security headers (CSP only lets the page talk to itself + Pusher; no framing; mic/camera only for this origin) ──
const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline' https://js.pusher.com https://challenges.cloudflare.com", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:", "media-src 'self' blob: data:", "connect-src 'self' https://*.pusher.com wss://*.pusher.com https://challenges.cloudflare.com", "frame-src https://challenges.cloudflare.com",
  "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
app.use((q, r, n) => {
  const h = String(q.headers.host || ''), ws = /^[\w.-]+(:\d+)?$/.test(h) ? ` wss://${h} ws://${h}` : '';   // call audio relay (WebSocket to this same server)
  r.set({ 'Content-Security-Policy': CSP.replace("connect-src 'self'", "connect-src 'self'" + ws), 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'microphone=(self), camera=(self), geolocation=(), payment=(), usb=(), bluetooth=()', 'Cross-Origin-Opener-Policy': 'same-origin' });
  if (q.secure) r.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  n();
});
app.use(compression({ filter: (q, r) => !q.path.startsWith('/api/blob') && !q.path.startsWith('/api/ai') && compression.filter(q, r) }));
app.use(express.json({ limit: '1mb' }));   // media no longer travels as JSON
app.use(express.urlencoded({ extended: false }));

const raw = b => Buffer.isBuffer(b) ? b : Buffer.from(b.buffer.subarray(0, b.length()));
const seal = b => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', MK, iv);
  const e = Buffer.concat([c.update(b), c.final()]); return Buffer.concat([iv, c.getAuthTag(), e]); };
const unseal = bin => { const b = raw(bin); const d = crypto.createDecipheriv('aes-256-gcm', MK, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]); };

const tok = req => ((req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('lynko=')) || '').slice(6);
const auth = (req, res, next) => { try { req.u = jwt.verify(tok(req), SECRET); mon.touch(req.u.id); next(); } catch { res.status(401).json({ error: 'Login required' }); } };
const give = (res, u) => res.cookie('lynko', jwt.sign({ id: u.id, u: u.username }, SECRET, { expiresIn: '30d' }),
  { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' || !!res.req.secure, maxAge: 30 * 864e5 });
// ── Cloudflare Turnstile (bot / credential-stuffing shield for login + register) ──
const TS_SITE = process.env.TURNSTILE_SITE_KEY, TS_SECRET = process.env.TURNSTILE_SECRET;
if (!TS_SITE || !TS_SECRET) console.warn('⚠ Cloudflare Turnstile is OFF — set TURNSTILE_SITE_KEY + TURNSTILE_SECRET to protect login/register');
async function human(req) {
  if (!TS_SITE || !TS_SECRET) return true;
  const t = String((req.body || {}).cf || ''); if (!t || t.length > 2048) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST',
      body: new URLSearchParams({ secret: TS_SECRET, response: t, remoteip: req.ip }), signal: AbortSignal.timeout(6000) });
    return !!(await r.json()).success;
  } catch (e) { console.error('turnstile', e.message); return false; }   // can't verify -> fail closed
}
// ── per-ACCOUNT guess limit (the per-IP limit alone is beaten by rotating IPs): 8 wrong tries -> 15 min lock ──
const acct = new Map();
const acctLocked = k => { const a = acct.get(k); return !!(a && a.until > Date.now()); };
const acctFail = k => { const n = Date.now(); let a = acct.get(k); if (!a || n - a.t > 15 * 6e4) a = { n: 0, until: 0, t: n }; a.n++; a.t = n; if (a.n >= 8) a.until = n + 15 * 6e4; acct.set(k, a); if (acct.size > 1e4) acct.clear(); };
const acctOk = k => acct.delete(k);
const DUMMY_HASH = bcrypt.hashSync('lynko-dummy', 12);   // compared when the account doesn't exist, so timing doesn't reveal who has an account
const tries = new Map();
const limited = ip => { const n = (tries.get(ip) || 0) + 1; tries.set(ip, n); setTimeout(() => tries.delete(ip), 6e5); return n > 15; };
const chan = id => 'private-u-' + id;
const conv = (a, b) => [a, b].sort().join(':');
const fire = (ids, ev, data) => { if (ids.length) pusher.trigger(ids.map(chan), ev, data).catch(() => {}); };
const PUB = { _id: 0, id: 1, username: 1, pub: 1, about: 1, dpv: 1 };
// phone numbers: digits only, local "0xxxxxxxxx" -> DEFAULT_CC + rest. The browser applies the same rule (cc comes from /api/config).
const CC = String(process.env.DEFAULT_CC || '94').replace(/\D/g, '');
const normPhone = raw => { let d = String(raw || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = CC + d.slice(1); return /^\d{8,15}$/.test(d) ? d : null; };

// ── web push: message / call alerts even when the app is closed (messages stay E2E, so alerts carry no text) ──
let webpush = null;
try {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush = require('web-push');
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  } else console.warn('⚠ Push alerts disabled (set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY — run: npm run vapid)');
} catch (e) { console.warn('⚠ web-push not available:', e.message); webpush = null; }
async function push(uid, payload, force) {
  if (!webpush) return false;
  try {
    const u = await U.findOne({ id: uid }, { projection: { push: 1, on: 1, lastSeen: 1 } });
    if (!u || !u.push || !u.push.length) return false;
    // app is open and visible on the receiver -> realtime channel already delivers it
    if (!force && payload.type === 'msg' && u.on && u.lastSeen && Date.now() - u.lastSeen < 45e3) return false;
    const body = JSON.stringify(payload), opt = { TTL: payload.type === 'call' ? 30 : 86400, urgency: 'high' };
    const r = await Promise.all(u.push.map(sub => webpush.sendNotification(sub, body, opt).then(() => true, e => {
      // 404/410 = subscription gone; 401/403 = it was made with a different VAPID key -> drop it, the phone re-subscribes the next time the app opens
      if ([401, 403, 404, 410].includes(e.statusCode)) U.updateOne({ id: uid }, { $pull: { push: { endpoint: sub.endpoint } } }).catch(() => {});
      console.warn('push failed', e.statusCode || '', String(e.body || e.message).slice(0, 160), '·', (sub.endpoint || '').slice(0, 48));
      return false;
    })));
    return r.some(Boolean);
  } catch (e) { console.error('push', e.message); return false; }
}

// ── Lynko AI (Groq) ──
const GROQ_KEY = process.env.GROQ_API_KEY, GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
let goodModel = '';   // the model that last worked (skips retired ones)
const aiHits = new Map();
const aiLimited = id => { const n = Date.now(), a = (aiHits.get(id) || []).filter(t => n - t < 6e4); a.push(n); aiHits.set(id, a); if (aiHits.size > 5e3) aiHits.clear(); return a.length > 20; };

let relay = null;
let U, M, S, K;   // users, messages, statuses, calls  (media is NOT in Mongo any more)

// ── media storage (encrypted files only; see storage.js) ──
if (!store) console.warn('⚠ No media storage configured: photo / video / voice sending is disabled (set S3_BUCKET + S3_ENDPOINT + S3_ACCESS_KEY + S3_SECRET_KEY)');
else if (store.check) store.check().then(() => console.log('✔ media bucket reachable'), e => console.error('✖ media bucket check FAILED — voice/photos will not send:', e.name + ': ' + e.message));
const mine = (uid, k) => typeof k === 'string' && k.startsWith(`u/${uid}/`) && /^u\/\d{8}\/[\w-]{6,40}$/.test(k);
const delObj = k => store && store.del(k).catch(() => {});

// async errors -> JSON 500 (never crash)
for (const m of ['get', 'post', 'delete']) { const o = app[m].bind(app);
  app[m] = (p, ...h) => h.length ? o(p, ...h.map(f => f.constructor.name === 'AsyncFunction'
    ? (q, r, n) => f(q, r, n).catch(e => { console.error(e); mon.logError('server', e, { path: (q.route && q.route.path) || q.path, method: q.method, user: q.u && q.u.id }); if (!r.headersSent) r.status(500).json({ error: 'Server error' }); }) : f)) : o(p); }

// every deploy gets a new version id; it is put into the script URLs of the pages, so phones never keep running an old lock.js / install.js
const VER = String(process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA || Date.now()).slice(0, 12);
const pageCache = {};
const page = f => (q, r) => { if (!pageCache[f]) pageCache[f] = fs.readFileSync(path.join(__dirname, f), 'utf8').split('{{V}}').join(VER); r.set('Cache-Control', 'no-cache').type('html').send(pageCache[f]); };
app.get('/health', (q, r) => r.type('text').send('ok'));   // for UptimeRobot (no DB, no login)
mon.mount(app);                                           // /admin + /admin/api/*
app.post('/api/log-error', mon.clientError);              // browser error reports (rate limited)
app.get('/', page('index.html'));
app.get('/chat', page('chat.html'));
// Terms / Privacy: full page for links, fragment for the in-app viewer
const LEGAL = n => fs.readFileSync(path.join(__dirname, 'legal', n + '.html'), 'utf8');
const legalPage = n => (q, r) => r.set('Cache-Control', 'no-cache').type('html').send('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LYNKO CHAT</title><style>body{margin:0;background:#1a0713;color:#fff0f5;font:16px/1.6 system-ui,sans-serif}main{max-width:680px;margin:auto;padding:24px 20px 60px}h1{font-size:28px}h2{font-size:18px;color:#ffb38a;margin-top:26px}.d{color:#d6a6ba;font-size:13px}a{color:#ff8fb1}</style></head><body><main><a href="/">← LYNKO CHAT</a>' + LEGAL(n) + '</main></body></html>');
app.get('/terms', legalPage('terms')); app.get('/privacy', legalPage('privacy'));
app.get('/api/legal/:n', (q, r) => { if (!['terms', 'privacy'].includes(q.params.n)) return r.status(404).end(); r.set('Cache-Control', 'no-cache').type('html').send(LEGAL(q.params.n)); });
// PWA files (installable app)
app.get('/sw.js', (q, r) => { r.set('Cache-Control', 'no-cache'); r.type('js').sendFile(path.join(__dirname, 'public/sw.js')); });
app.get('/features.js', (q, r) => { r.set('Cache-Control', 'no-cache'); r.type('js').sendFile(path.join(__dirname, 'public/features.js')); });
app.get('/icons/:name', require('./icons'));   // LYNKO CHAT logo -> app icons
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', index: false,
  setHeaders: (r, f) => { if (/\.(js|json|html)$/.test(f)) r.set('Cache-Control', 'no-cache'); } }));   // lock.js / install.js fixes reach everyone at once
app.get('/api/config', (q, r) => r.json({ turnstile: TS_SITE && TS_SECRET ? TS_SITE : null, key: process.env.PUSHER_KEY, cluster: process.env.PUSHER_CLUSTER, cc: CC, vapid: webpush ? process.env.VAPID_PUBLIC_KEY : null, ai: !!GROQ_KEY }));

// ── accounts ──
app.post('/api/register', async (req, res) => {
  const { phone, name, auth: a, pub, encPriv } = req.body || {};
  const ph = normPhone(phone), nm = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
  if (!ph || ph !== String(phone)) return res.status(400).json({ error: 'Enter a valid phone number' });
  if (!nm) return res.status(400).json({ error: 'Enter your name' });
  if (!/^[0-9a-f]{64}$/.test(a || '') || !pub || !encPriv) return res.status(400).json({ error: 'Bad request' });
  if (limited(req.ip)) return res.status(429).json({ error: 'Too many tries. Wait a few minutes.' });
  if (!(await human(req))) return res.status(403).json({ error: 'Security check failed. Please try again.' });
  let id; do { id = String(crypto.randomInt(10000000, 99999999)); } while (await U.findOne({ id }));
  try { await U.insertOne({ id, phone: ph, username: nm, hash: await bcrypt.hash(a, 12), pub, encPriv, about: '', dpv: 0, contacts: [], createdAt: new Date() }); }
  catch (e) { return res.status(409).json({ error: 'This number is already registered. Log in instead.' }); }
  mon.count('reg'); give(res, { id, username: nm }); res.json({ id, username: nm });
});
app.post('/api/login', async (req, res) => {
  if (limited(req.ip)) return res.status(429).json({ error: 'Too many tries. Wait a few minutes.' });
  if (!(await human(req))) return res.status(403).json({ error: 'Security check failed. Please try again.' });
  const b = req.body || {}; let u = null;
  const key = 'a:' + (b.phone ? normPhone(b.phone) || 'x' : String(b.username || '').toLowerCase().slice(0, 40));
  if (acctLocked(key)) return res.status(429).json({ error: 'Too many wrong tries for this account. Wait 15 minutes.' });
  if (b.phone) { const ph = normPhone(b.phone); if (ph) u = await U.findOne({ phone: ph }); }
  else if (b.username) u = await U.findOne({ username: String(b.username).toLowerCase(), phone: { $exists: false } });   // accounts made before number login
  const okPw = await bcrypt.compare(String(b.auth || ''), u ? u.hash : DUMMY_HASH);
  if (!u || !okPw) { acctFail(key); mon.count('loginFail'); return res.status(401).json({ error: 'Wrong number or password' }); }
  acctOk(key); mon.count('login'); give(res, u); res.json({ id: u.id, username: u.username, pub: u.pub, encPriv: u.encPriv });
});
app.post('/api/logout', (q, r) => { r.clearCookie('lynko'); r.json({ ok: 1 }); });

app.get('/api/me', auth, async (req, res) => {
  const me = await U.findOne({ id: req.u.id });
  if (!me) return res.status(401).json({ error: 'Login required' });
  const contacts = await U.find({ id: { $in: me.contacts } }, { projection: PUB }).toArray();
  res.json({ id: me.id, username: me.username, phone: me.phone || null, pub: me.pub, about: me.about || '', dpv: me.dpv || 0, hideSeen: !!me.hideSeen, contacts });
});
app.post('/api/contacts', auth, async (req, res) => {
  const raw = String(req.body.id || '').trim();
  let p = /^\d{8}$/.test(raw) ? await U.findOne({ id: raw }, { projection: PUB }) : null;
  if (!p) { const ph = normPhone(raw); if (ph) p = await U.findOne({ phone: ph }, { projection: PUB }); }
  if (!p || p.id === req.u.id) return res.status(404).json({ error: 'No user with that number or ID' });
  await Promise.all([U.updateOne({ id: req.u.id }, { $addToSet: { contacts: p.id } }), U.updateOne({ id: p.id }, { $addToSet: { contacts: req.u.id } })]);
  res.json(p);
});

// ── profile: DP + about ──
app.post('/api/profile', auth, async (req, res) => {
  const set = {};
  if (typeof req.body.about === 'string') set.about = req.body.about.slice(0, 120);
  if (typeof req.body.hideSeen === 'boolean') set.hideSeen = req.body.hideSeen;
  if (req.body.dp) {
    if (String(req.body.dp).length > 150000) return res.status(400).json({ error: 'Photo too large' });
    set.dp = Buffer.from(req.body.dp, 'base64'); set.dpv = Date.now();
  }
  await U.updateOne({ id: req.u.id }, { $set: set });
  const u = await U.findOne({ id: req.u.id }, { projection: { contacts: 1, about: 1, dpv: 1 } });
  fire(u.contacts, 'prof', { id: req.u.id });
  res.json({ about: u.about, dpv: u.dpv });
});
app.get('/api/dp/:id', auth, async (req, res) => {
  const u = await U.findOne({ id: req.params.id }, { projection: { dp: 1 } });
  if (!u || !u.dp) return res.status(404).end();
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' }); res.send(raw(u.dp));
});

// ── messages (server only sees ciphertext) ──
const out = m => ({ id: m._id.toString(), from: m.from, to: m.to, kind: m.kind, iv: m.iv, bIv: m.bIv || null,
  ct: unseal(m.ct).toString('base64'), media: !!m.bkey, r: !!m.r, rx: m.rx || {}, ts: m.createdAt.toISOString() });

app.get('/api/chats', auth, async (req, res) => {   // last message + unread per chat
  const me = await U.findOne({ id: req.u.id }, { projection: { contacts: 1 } });
  const r = await M.aggregate([{ $match: { conv: { $in: me.contacts.map(c => conv(c, req.u.id)) } } }, { $sort: { createdAt: -1 } },
    { $group: { _id: '$conv', last: { $first: '$$ROOT' }, unread: { $sum: { $cond: [{ $and: [{ $eq: ['$to', req.u.id] }, { $ne: ['$r', true] }] }, 1, 0] } } } }]).toArray();
  res.json(r.map(x => ({ peer: x.last.from === req.u.id ? x.last.to : x.last.from, unread: x.unread, last: out(x.last) })));
});
app.get('/api/messages', auth, async (req, res) => {
  const q = { conv: conv(req.u.id, String(req.query.with)) };
  if (req.query.after) q.createdAt = { $gt: new Date(req.query.after) };
  res.json((await M.find(q).sort({ createdAt: 1 }).limit(300).toArray()).map(out));
});
// raw encrypted bytes straight to the bucket (no base64, no Mongo)
app.post('/api/media', auth, express.raw({ type: 'application/octet-stream', limit: '20mb' }), async (req, res) => {
  if (!store) return res.status(503).json({ error: 'Media storage is not configured on the server' });
  if (!Buffer.isBuffer(req.body) || req.body.length < 29) return res.status(400).json({ error: 'Empty file' });
  try { const key = await store.put(req.u.id, req.body); mon.count('media'); res.json({ key }); }
  catch (e) { console.error('media upload:', e.message); mon.logError('storage', e, { path: '/api/media', user: req.u.id }); res.status(502).json({ error: 'Media storage error — check the bucket settings (see server log)' }); }
});
// sender->receiver pairs already known to exist + linked as contacts: skips 3 DB round-trips on every message after the first
const linked = new Set();
app.post('/api/messages', auth, async (req, res) => {
  const { kind, iv, ct, bIv, bkey, tmp } = req.body || {}, to = String((req.body || {}).to || ''), me = req.u.id;
  if (!['text', 'img', 'vid', 'aud'].includes(kind) || !iv || !ct || String(ct).length > 40000) return res.status(400).json({ error: 'Bad message' });
  const pair = me + '>' + to, known = linked.has(pair);
  if (!known && !(await U.findOne({ id: to }, { projection: { _id: 1 } }))) return res.status(404).json({ error: 'User not found' });
  const cbuf = Buffer.from(ct, 'base64'), _id = new ObjectId(), now = new Date();
  const doc = { _id, conv: conv(me, to), from: me, to, kind, iv, ct: seal(cbuf), createdAt: now };
  if (kind !== 'text') {
    if (!mine(me, bkey) || !bIv) return res.status(400).json({ error: 'Missing media' });
    Object.assign(doc, { bkey, bIv: String(bIv) });
  }
  const m = { id: _id.toString(), from: me, to, kind, iv, bIv: doc.bIv || null, ct: cbuf.toString('base64'), media: !!doc.bkey, r: false, rx: {}, ts: now.toISOString() };
  if (typeof tmp === 'string' && /^t[\w]{3,24}$/.test(tmp)) m.tmp = tmp;   // lets the sender's own phone match this event to its pending bubble
  const small = m.ct.length < 6000, evt = small ? m : { id: m.id, from: m.from, to: m.to };
  // small messages (all text) are pushed to the receiver IMMEDIATELY, in parallel with the database write
  if (small) fire([me, to], 'msg', evt);
  try {
    await Promise.all([M.insertOne(doc), ...(known ? [] : [U.updateOne({ id: me }, { $addToSet: { contacts: to } }), U.updateOne({ id: to }, { $addToSet: { contacts: me } })])]);
  } catch (e) {
    if (small) fire([me, to], 'del', { id: m.id });   // write failed: take the early message back
    throw e;
  }
  if (!known) { if (linked.size > 1e5) linked.clear(); linked.add(pair); }
  mon.count('msg');
  if (!small) fire([me, to], 'msg', evt);   // big (media) events carry no ciphertext: receivers fetch it, so only announce after it is saved
  push(to, { type: 'msg', title: req.u.u, body: kind === 'text' ? 'New message' : kind === 'img' ? '📷 Photo' : kind === 'aud' ? '🎤 Voice message' : '🎥 Video', tag: 'm' + me, from: me });
  res.json(m);
});
app.get('/api/blob/:id', auth, async (req, res) => {
  let m; try { m = await M.findOne({ _id: new ObjectId(req.params.id) }); } catch {}
  if (!m || !m.bkey || !store || (m.from !== req.u.id && m.to !== req.u.id)) return res.status(404).end();
  await store.send(m.bkey, res, { 'X-IV': m.bIv, 'Cache-Control': 'private, max-age=3600' });
});
app.delete('/api/messages/:id', auth, async (req, res) => {
  let m; try { m = await M.findOne({ _id: new ObjectId(req.params.id) }); } catch {}
  if (!m || m.from !== req.u.id) return res.status(403).json({ error: 'Only the sender can delete' });
  await M.deleteOne({ _id: m._id });
  if (m.bkey) delObj(m.bkey);
  fire([m.from, m.to], 'del', { id: req.params.id });
  res.json({ ok: 1 });
});
app.post('/api/read', auth, async (req, res) => {
  const w = String(req.body.with);
  const r = await M.updateMany({ conv: conv(req.u.id, w), to: req.u.id, r: { $ne: true } }, { $set: { r: true } });
  if (r.modifiedCount) fire([w], 'read', { by: req.u.id });
  res.json({ ok: 1 });
});
app.post('/api/typing', auth, (req, res) => { fire([String(req.body.to)], 'typing', { from: req.u.id, stop: !!req.body.stop }); res.status(204).end(); });
const EMO = ['❤️', '😍', '🥰', '😘', '😂', '😢', '🔥', '👍'];
app.post('/api/react', auth, async (req, res) => {
  let m; try { m = await M.findOne({ _id: new ObjectId(req.body.id) }); } catch {}
  if (!m || (m.from !== req.u.id && m.to !== req.u.id) || !EMO.includes(req.body.e)) return res.status(400).json({ error: 'Bad reaction' });
  const k = 'rx.' + req.u.id, same = m.rx && m.rx[req.u.id] === req.body.e;
  const n = await M.findOneAndUpdate({ _id: m._id }, same ? { $unset: { [k]: 1 } } : { $set: { [k]: req.body.e } }, { returnDocument: 'after' });
  const rx = (n && n.rx) || (n && n.value && n.value.rx) || {};
  fire([m.from, m.to], 'rx', { id: req.body.id, rx, by: req.u.id });
  res.json({ rx });
});

// ── status (24h, end-to-end encrypted: one random key per status, wrapped for every contact) ──
const sOut = (s, uid) => ({ id: s._id.toString(), from: s.from, ts: s.createdAt.toISOString(), iv: s.iv, ct: unseal(s.ct).toString('base64'),
  wk: (s.keys || {})[uid] || null, media: !!s.bkey, bIv: s.bIv || null, seen: !!(s.views || {})[uid],
  ...(s.from === uid ? { views: Object.entries(s.views || {}).map(([id, t]) => ({ id, ts: new Date(t).toISOString() })) } : {}) });
const sGet = async id => { try { return await S.findOne({ _id: new ObjectId(id) }); } catch { return null; } };

app.post('/api/status', auth, async (req, res) => {
  const { iv, ct, keys, bkey, bIv } = req.body || {};
  if (!iv || !ct || String(ct).length > 20000 || !keys || typeof keys !== 'object') return res.status(400).json({ error: 'Bad status' });
  const me = await U.findOne({ id: req.u.id }, { projection: { contacts: 1 } });
  const wk = {};
  for (const id of [...me.contacts, req.u.id]) { const w = keys[id];
    if (w && typeof w.iv === 'string' && typeof w.ct === 'string' && w.ct.length < 400) wk[id] = { iv: w.iv, ct: w.ct }; }
  if (!wk[req.u.id]) return res.status(400).json({ error: 'Bad status' });
  if (await S.countDocuments({ from: req.u.id }) >= 30) return res.status(400).json({ error: 'Too many active statuses (max 30)' });
  const doc = { from: req.u.id, createdAt: new Date(), iv: String(iv), ct: seal(Buffer.from(ct, 'base64')), keys: wk, views: {} };
  if (bkey) { if (!mine(req.u.id, bkey) || !bIv) return res.status(400).json({ error: 'Missing media' }); Object.assign(doc, { bkey, bIv: String(bIv) }); }
  const r = await S.insertOne(doc); mon.count('status');
  fire(Object.keys(wk), 'status', { from: req.u.id });
  res.json(sOut({ ...doc, _id: r.insertedId }, req.u.id));
});
app.get('/api/statuses', auth, async (req, res) => {
  const me = await U.findOne({ id: req.u.id }, { projection: { contacts: 1 } });
  const q = { createdAt: { $gt: new Date(Date.now() - 864e5) },
    $or: [{ from: req.u.id }, { from: { $in: me.contacts }, ['keys.' + req.u.id]: { $exists: true } }] };
  res.json((await S.find(q).sort({ createdAt: 1 }).limit(300).toArray()).map(s => sOut(s, req.u.id)));
});
app.post('/api/status/:id/view', auth, async (req, res) => {
  const s = await sGet(req.params.id);
  if (!s || s.from === req.u.id || !(s.keys || {})[req.u.id]) return res.status(404).end();
  const r = await S.updateOne({ _id: s._id, ['views.' + req.u.id]: { $exists: false } }, { $set: { ['views.' + req.u.id]: new Date() } });
  if (r.modifiedCount) fire([s.from], 'sview', { id: req.params.id, by: req.u.id });
  res.json({ ok: 1 });
});
app.get('/api/status/:id/blob', auth, async (req, res) => {
  const s = await sGet(req.params.id);
  if (!s || !s.bkey || !store || (s.from !== req.u.id && !(s.keys || {})[req.u.id])) return res.status(404).end();
  await store.send(s.bkey, res, { 'Cache-Control': 'private, max-age=3600' });
});
app.delete('/api/status/:id', auth, async (req, res) => {
  const s = await sGet(req.params.id);
  if (!s || s.from !== req.u.id) return res.status(403).json({ error: 'Only the owner can delete' });
  await S.deleteOne({ _id: s._id }); if (s.bkey) delObj(s.bkey);
  fire(Object.keys(s.keys || {}), 'sdel', { id: req.params.id });
  res.json({ ok: 1 });
});

// ── official channel (plain text from the admin panel; every account sees it, nobody can reply) ──
app.get('/api/official', auth, async (req, res) => {
  const [list, me] = await Promise.all([C.O.find().sort({ ts: -1 }).limit(100).toArray(), U.findOne({ id: req.u.id }, { projection: { offRead: 1 } })]);
  list.reverse();
  const rd = me && me.offRead;
  const unread = rd ? await C.O.countDocuments({ ts: { $gt: rd } }) : (list.length ? 1 : 0);
  res.json({ msgs: list.map(m => ({ id: m._id.toString(), t: m.t, ts: m.ts.toISOString() })), unread });
});
app.post('/api/official/read', auth, async (req, res) => { await U.updateOne({ id: req.u.id }, { $set: { offRead: new Date() } }); res.json({ ok: 1 }); });


// ── presence: online / last seen (heartbeat from the open app) ──
app.post('/api/ping', auth, async (req, res) => {
  await U.updateOne({ id: req.u.id }, { $set: { lastSeen: new Date(), on: req.query.off !== '1' } }); res.status(204).end();
});
app.get('/api/seen/:id', auth, async (req, res) => {
  const [p, me] = await Promise.all([U.findOne({ id: req.params.id, contacts: req.u.id }, { projection: { lastSeen: 1, on: 1, hideSeen: 1 } }),
    U.findOne({ id: req.u.id }, { projection: { hideSeen: 1 } })]);
  if (!p) return res.status(404).end();
  if (p.hideSeen || (me && me.hideSeen)) return res.json({ hidden: 1 });   // hide yours = you can't see theirs (like WhatsApp)
  res.json({ online: !!p.on && !!p.lastSeen && Date.now() - p.lastSeen < 45e3, ts: p.lastSeen ? p.lastSeen.toISOString() : null });
});

// ── push subscriptions ──
app.post('/api/push/subscribe', auth, async (req, res) => {
  const s = req.body && req.body.sub;
  if (!s || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://') || s.endpoint.length > 600 || !s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string')
    return res.status(400).json({ error: 'Bad subscription' });
  await U.updateOne({ id: req.u.id }, { $pull: { push: { endpoint: s.endpoint } } });
  await U.updateOne({ id: req.u.id }, { $push: { push: { $each: [{ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }], $slice: -5 } } });
  res.json({ ok: 1 });
});
app.post('/api/push/test', auth, async (req, res) => {   // "Notifications on" sends this, so you immediately see if alerts reach the phone
  if (!webpush) return res.status(503).json({ error: 'Push is not set up on the server (VAPID keys)' });
  const ok = await push(req.u.id, { type: 'test', title: 'LYNKO CHAT', body: 'Notifications are working ♥', tag: 'test' }, true);
  res.json({ ok });
});
app.post('/api/push/unsubscribe', auth, async (req, res) => {
  await U.updateOne({ id: req.u.id }, { $pull: { push: { endpoint: String((req.body && req.body.endpoint) || '') } } }); res.json({ ok: 1 });
});

// ── voice calls (WebRTC audio only; this server only relays the handshake, audio goes phone-to-phone) ──
let iceCache = { t: 0, v: null };
async function iceServers() {   // STUN + a TURN relay: without a relay many mobile networks can't connect calls at all
  if (iceCache.v && Date.now() - iceCache.t < 10 * 6e4) return iceCache.v;
  const ice = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }], E = process.env;
  try {
    if (E.CF_TURN_KEY_ID && E.CF_TURN_API_TOKEN) {   // Cloudflare Realtime TURN (free tier)
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${E.CF_TURN_KEY_ID}/credentials/generate-ice-servers`, { method: 'POST',
        headers: { Authorization: 'Bearer ' + E.CF_TURN_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 86400 }), signal: AbortSignal.timeout(5000) });
      const j = await r.json(); if (r.ok && Array.isArray(j.iceServers)) ice.push(...j.iceServers); else console.warn('cloudflare turn:', r.status);
    } else if (E.METERED_DOMAIN && E.METERED_API_KEY) {   // Metered.ca TURN (free tier)
      const r = await fetch(`https://${E.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${encodeURIComponent(E.METERED_API_KEY)}`, { signal: AbortSignal.timeout(5000) });
      const j = await r.json().catch(() => null); if (r.ok && Array.isArray(j)) ice.push(...j); else console.warn('metered turn FAILED:', r.status, JSON.stringify(j).slice(0, 200));
    }
  } catch (e) { console.warn('turn lookup failed:', e.message); }
  if (E.TURN_URL) ice.push({ urls: E.TURN_URL.split(',').map(x => x.trim()), username: E.TURN_USER, credential: E.TURN_PASS });
  console.log('ICE servers:', ice.map(x => [].concat(x.urls).join(' ')).join(' | ').replace(/\?key=[^ |]*/g, ''));
  const hasTurn = ice.some(x => [].concat(x.urls).some(u => /^turns?:/i.test(u)));
  if (!hasTurn && E.PUBLIC_TURN !== '0') {   // last resort so calls work out of the box (shared, best-effort, can be slow / full)
    ice.push({ urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' });
    console.warn('⚠ Calls use the shared public TURN relay. For reliable calls on mobile data set CF_TURN_KEY_ID + CF_TURN_API_TOKEN (free, Cloudflare) or METERED_DOMAIN + METERED_API_KEY (free, Metered)');
  }
  iceCache = { t: hasTurn ? Date.now() : Date.now() - 9 * 6e4, v: ice }; return ice;   // no real TURN yet: look again after a minute
}
app.get('/api/ice', auth, async (q, r) => { r.set('Cache-Control', 'no-store'); r.json(await iceServers()); });
const CID = /^[a-f0-9]{16,32}$/;
const SDPMAX = 20000, EVMAX = 6500;   // Pusher drops events over 10 KB; bigger call setups are fetched by the other phone instead   // call setup now travels end-to-end encrypted (base64), so it is larger than raw SDP
const callHits = new Map();
const callLimited = id => { const n = Date.now(), a = (callHits.get(id) || []).filter(t => n - t < 6e4); a.push(n); callHits.set(id, a); if (callHits.size > 5e3) callHits.clear(); return a.length > 6; };
const secs = d => d.answeredAt ? Math.max(0, Math.round((Date.now() - d.answeredAt.getTime()) / 1000)) : 0;
app.post('/api/call', auth, async (req, res) => {
  const { type, cid, sdp } = req.body || {}, me = req.u.id;
  if (!CID.test(cid || '')) return res.status(400).json({ error: 'Bad call' });
  if (type === 'offer') {
    const to = String(req.body.to || '');
    if (typeof sdp !== 'string' || sdp.length > SDPMAX || to === me) return res.status(400).json({ error: 'Bad call' });
    if (callLimited(me)) return res.status(429).json({ error: 'Too many calls. Try again in a minute.' });
    if (!(await U.findOne({ id: to, contacts: me }, { projection: { _id: 1 } }))) return res.status(404).json({ error: 'User not found' });
    const nowT = Date.now();
    if (await K.findOne({ $and: [{ $or: [{ from: to }, { to }] }, { $or: [{ st: 'ringing', ts: { $gt: new Date(nowT - 60e3) } }, { st: 'active', hb: { $gt: new Date(nowT - 90e3) } }] }] })) return res.json({ busy: 1 });
    await K.updateMany({ st: { $in: ['ringing', 'active'] }, $or: [{ from: me }, { to: me }] }, { $set: { st: 'ended', ended: new Date() }, $unset: { offer: 1 } });   // your own leftover call records
    await K.insertOne({ cid, from: me, to, st: 'ringing', ts: new Date(), offer: sdp }); mon.count('call');
    fire([to], 'call', sdp.length <= EVMAX ? { t: 'offer', cid, from: me, sdp } : { t: 'offer', cid, from: me });
    push(to, { type: 'call', title: req.u.u, body: 'Incoming voice call', tag: 'call', from: me });
    return res.json({ ok: 1 });
  }
  const d = await K.findOne({ cid, $or: [{ from: me }, { to: me }] });
  if (!d) return res.status(404).json({ error: 'Call not found' });
  const other = d.from === me ? d.to : d.from;
  if (type === 'answer') {
    if (d.to !== me || d.st !== 'ringing' || typeof sdp !== 'string' || sdp.length > SDPMAX) return res.status(409).json({ error: 'Call is no longer ringing' });
    await K.updateOne({ cid }, { $set: { st: 'active', answeredAt: new Date(), hb: new Date(), answer: sdp }, $unset: { offer: 1 } });
    fire([other], 'call', sdp.length <= EVMAX ? { t: 'answer', cid, sdp } : { t: 'answer', cid }); return res.json({ ok: 1 });
  }
  if (type === 'hb') { await K.updateOne({ cid, st: 'active' }, { $set: { hb: new Date() } }); return res.json({ ok: 1 }); }
  if (type === 'reject' || type === 'end') {
    if (!['ringing', 'active'].includes(d.st)) return res.json({ ok: 1 });
    const st = d.st === 'ringing' ? (d.from === me ? 'missed' : 'declined') : 'ended';
    await K.updateOne({ cid }, { $set: { st, dur: secs(d), ended: new Date() }, $unset: { offer: 1, answer: 1 } });
    if (relay) relay.close(cid);
    fire([other], 'call', { t: type, cid });
    if (st === 'missed') push(d.to, { type: 'missed', title: 'Missed voice call', body: 'from ' + req.u.u, tag: 'missed' + d.from, from: d.from });
    return res.json({ ok: 1 });
  }
  res.status(400).json({ error: 'Bad call' });
});
app.get('/api/call/:cid/answer', auth, async (req, res) => {   // caller fetches the answer when it was too big for a realtime event
  if (!CID.test(req.params.cid)) return res.status(400).end();
  const d = await K.findOne({ cid: req.params.cid, from: req.u.id, st: 'active' }, { projection: { answer: 1 } });
  res.json({ sdp: (d && d.answer) || null });
});
app.get('/api/call/pending', auth, async (req, res) => {   // tapped a call alert while the app was closed
  const d = await K.findOne({ to: req.u.id, st: 'ringing', ts: { $gt: new Date(Date.now() - 45e3) } });
  res.json(d ? { cid: d.cid, from: d.from, sdp: d.offer, ts: d.ts.toISOString() } : null);
});
app.get('/api/calls', auth, async (req, res) => {
  const l = await K.find({ $or: [{ from: req.u.id }, { to: req.u.id }] }, { projection: { offer: 0, answer: 0 } }).sort({ ts: -1 }).limit(60).toArray();
  res.json(l.map(d => ({ cid: d.cid, peer: d.from === req.u.id ? d.to : d.from, out: d.from === req.u.id, st: d.st, dur: d.dur || 0, ts: d.ts.toISOString() })));
});

// ── Lynko AI: streams a Groq reply as plain text (history lives on the phone, nothing is stored here) ──
const APP_GUIDE = `
ABOUT THE LYNKO CHAT APP (you live inside it — explain any part of it when asked):
- Lynko is a private chat app (PWA: works in the browser and can be installed on the home screen: Android browser menu ⋮ → "Install app"; iPhone Safari Share → "Add to Home Screen").
- Accounts: you register with your phone number (Sri Lanka numbers like 07xxxxxxxx work), a name and a password. Every account also gets an 8-digit ID (Settings → "My ID", or Profile; tap it to copy).
- Add contact: menu (⋮) → "Add contact", then type their phone number or 8-digit ID. Once added, both people see each other.
- Bottom tabs: Chats, Status, Calls, Wallpaper, You (profile/settings). Chat list has a search box and filters: All, Unread, Locked 🔒.
- Messages: text, photos, videos and voice messages (hold the mic button to record). Long-press / tap a message for options: react with an emoji (❤️ 😍 🥰 😘 😂 😢 🔥 👍), Copy, and "Delete for everyone" (only your own messages). Ticks show sent/read. Typing indicator and "online / last seen" are shown.
- Privacy: messages, photos, voice, status and call setup are end-to-end encrypted; the server can't read them. Everything disappears after 24 hours (messages and statuses). The only thing that is NOT end-to-end encrypted is the chat with Lynko AI (that's you), because your messages go to the AI service; AI history stays only on the phone for 24 hours.
- Status: like WhatsApp status — post a photo/video, camera shot or text status; contacts see it for 24 hours; you can see who viewed it; contacts can reply or send ❤️.
- Voice calls: Calls tab or the 📞 button inside a chat. Audio only. Works over WiFi and mobile data (if the direct connection fails the call is carried through the server, still encrypted). Needs microphone permission. Settings may show "Protect IP address in calls".
- Notifications: Settings → Notifications (or the bar "Get alerts for new messages & calls" → Turn on). Allow the permission in the browser. They show only the sender's name, never the message text (because messages are encrypted). On iPhone the app must first be added to the Home Screen. If alerts don't come: check the browser/Android notification permission for the app, turn Notifications off and on again, and open the app once.
- Chat lock: Settings → Chat lock: set a code, then "Lock this chat" from the chat's ⋮ menu. Locked chats hide names and previews and are shown under the "Locked 🔒" filter. "Lock app" asks the password again after you leave the app (right away / 1 min / 10 min). "Hide app preview" blanks the app in the app switcher.
- Hide last seen & online: Settings or Profile. If you hide yours, you can't see others' either.
- Profile: change profile photo, "About" text, see your ID.
- Wallpaper: Wallpaper tab or ⋮ → Wallpaper (colors, or your own photo; it's saved only on your phone).
- Lynko Official: a verified channel with news from the Lynko team; you can read it but can't reply.
- Log out: menu ⋮ → Log out. If someone forgets the password, the account can't be recovered because of the encryption — say so honestly.
If asked something about the app that is not listed here, say you're not sure instead of inventing it.`;
const HELP_SYS = `You are the Lynko Help Center assistant inside the LYNKO CHAT app. Answer ONLY questions about using Lynko, briefly (max ~6 short lines or steps). Reply in the language the user writes in (Sinhala, Singlish, or English).
Facts: sign up/log in with phone number + password (8+ chars to register). Chats are end-to-end encrypted and vanish after 24 hours. Forgotten password = chats cannot be recovered. Add contact: Settings → Add contact (phone number or 8-digit ID; you can save a name). Rename a contact: open the chat → tap the name/photo → Rename, or ⋮ menu → Rename contact; the nickname is only on your phone. Profile photo/about: Settings → Profile. Hide last seen: Settings. Chat lock: Settings → Chat lock (locked chats open by typing the secret code in the search bar). Notifications: Settings → Notifications (iPhone: add the app to Home Screen first). Voice calls: phone icon in a chat; turn on 'Protect IP address in calls' in Settings for reliability. Status: Status tab. Wallpaper: Settings → Wallpaper. Emoji: 😊 button next to the message box. Install: Android → Install app button downloads the APK (allow install from this source); iPhone → Share → Add to Home Screen. Updates arrive automatically when you open the app. Lynko AI is optional (Settings) and not end-to-end encrypted. Terms and Privacy are in Settings.
If you don't know or it is an account/legal issue, say so and tell them the team can be reached through the Official channel. Never invent features.`;
const AI_SYS = (name) => `You are Lynko AI, the friendly assistant inside the Lynko chat app. You are chatting with ${name || 'a user'}. Now: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'full', timeStyle: 'short' })} (Sri Lanka time).

LANGUAGE (most important):
- Always answer in the language and style the user writes in. Sinhala script → reply in natural Sinhala script. "Singlish" (Sinhala typed in English letters, e.g. "mata help ekak oni") → reply in simple friendly Singlish the same way. English → English. Tamil → Tamil. If they mix, mix naturally. If they ask for another language, use it.
- Write Sinhala the way people really talk in chat: short, warm, simple words, correct spelling and grammar. Do not translate word-for-word from English. For tech words (app, notification, call, password, settings) keep the common English word inside the Sinhala sentence.
- Never switch into Chinese, Hindi, Arabic or any script the user did not use. Never output your reasoning or notes.

STYLE:
- Be quick and direct: answer first, then at most a little extra. Chat-sized replies, usually 1–5 short lines. For how-to questions give numbered steps (1. 2. 3.), one short line each.
- Plain text only: no markdown symbols (no **, #, backticks, tables). Emojis sparingly, only when they fit.
- Be honest. If you don't know, or it needs live info you can't see, say so briefly. Don't invent facts, links, numbers or app features. For medical, legal or money questions give general information and suggest asking a professional for decisions.
- Be kind and respectful. Don't help with anything harmful or illegal. Never claim to be Meta AI, ChatGPT or another brand — you are Lynko AI.
${APP_GUIDE}`;
app.post('/api/ai', auth, async (req, res) => {
  if (!GROQ_KEY) return res.status(503).json({ error: 'AI is not set up on the server (GROQ_API_KEY)' });
  if (aiLimited(req.u.id)) return res.status(429).json({ error: 'Slow down a little — try again in a minute' });
  const help = !!(req.body && req.body.help);
  const list = (Array.isArray(req.body && req.body.messages) ? req.body.messages : []).slice(-20)
    .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!list.length || list[list.length - 1].role !== 'user') return res.status(400).json({ error: 'Bad request' });
  const ac = new AbortController(); res.on('close', () => ac.abort());
  let r;
  const ask = model => {
    const oss = /gpt-oss/.test(model);   // gpt-oss "thinks" first: keep that short and hidden so the answer fits in the token limit
    return fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', signal: ac.signal,
      headers: { Authorization: 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true, temperature: 0.6, max_tokens: oss ? 2048 : 1024, ...(oss ? { reasoning_effort: 'low', include_reasoning: false } : {}),
        messages: [{ role: 'system', content: help ? HELP_SYS : AI_SYS(req.u.u) }, ...list] }) });
  };
  try {
    const order = [...new Set([goodModel, GROQ_MODEL, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'].filter(Boolean))];
    for (const model of order) {   // a retired / unavailable / rate-limited model falls through to the next one
      r = await ask(model);
      if (r.ok && r.body) { if (goodModel !== model) { goodModel = model; console.log('AI model in use:', model); } break; }
      const t = (await r.text().catch(() => '')).slice(0, 300); console.error('groq', model, r.status, t);
      if (model === goodModel) goodModel = '';
      if (r.status === 401) return res.status(502).json({ error: 'AI key is invalid — update GROQ_API_KEY on the server' });
      if (![400, 404, 429, 503].includes(r.status)) break;
    }
  } catch { return res.status(502).json({ error: 'AI is unreachable right now' }); }
  if (!r.ok || !r.body) return res.status(502).json({ error: r.status === 429 ? 'AI is busy, try again shortly' : 'AI error, try again' });
  mon.count('ai');
  res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  try { res.socket && res.socket.setNoDelay(true); } catch {}
  res.flushHeaders();
  const td = new TextDecoder(); let buf = '', wrote = 0;
  try {
    for await (const chunk of r.body) {
      buf += td.decode(chunk, { stream: true });
      let i; while ((i = buf.indexOf('\n')) > -1) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim(); if (d === '[DONE]') continue;
        try { const t = JSON.parse(d).choices[0].delta.content; if (t) { wrote = 1; res.write(t); } } catch {}
      }
    }
  } catch {}
  if (!wrote) res.write('Sorry, I couldn’t answer that. Please ask again.');
  res.end();
});

app.post('/api/pusher/auth', auth, (req, res) => {
  const { socket_id, channel_name } = req.body;
  if (channel_name !== chan(req.u.id)) return res.status(403).end();
  res.send(pusher.authorizeChannel(socket_id, channel_name));
});

app.use((e, q, r, n) => {
  if (!e.type && !(e.status && e.status < 500)) mon.logError('server', e, { path: (q.route && q.route.path) || q.path, method: q.method, user: q.u && q.u.id });
  r.status(e.status || 500).json({ error: e.type === 'entity.too.large' ? 'File too large' : 'Server error' });
});

(async () => {
  const cl = await MongoClient.connect(process.env.MONGODB_URI, { maxPoolSize: 20, minPoolSize: 3, w: 1, retryWrites: true });   // w:1 = the server answers as soon as the primary has saved it
  const db = cl.db(process.env.MONGODB_DB || 'lynko');
  U = db.collection('users'); M = db.collection('messages'); S = db.collection('statuses'); K = db.collection('calls');
  Object.assign(C, { db, U, M, S, E: db.collection('errors'), D: db.collection('stats'), O: db.collection('official') });
  await U.createIndex({ id: 1 }, { unique: true }); try { await U.dropIndex('username_1'); } catch {} await U.createIndex({ username: 1 });
  const phoneIx = { unique: true, partialFilterExpression: { phone: { $type: 'string' } } };
  try { await U.createIndex({ phone: 1 }, phoneIx); }
  catch (e) { if (e.code !== 85 && e.code !== 86) throw e; try { await U.dropIndex('phone_1'); } catch {} await U.createIndex({ phone: 1 }, phoneIx); }   // an older phone index with different options: rebuild it
  await M.createIndex({ conv: 1, createdAt: 1 }); await M.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });
  await S.createIndex({ from: 1, createdAt: -1 }); await S.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });
  await U.createIndex({ createdAt: 1 }); await U.createIndex({ lastSeen: 1 });
  await K.createIndex({ cid: 1 }, { unique: true }); await K.createIndex({ from: 1, ts: -1 }); await K.createIndex({ to: 1, ts: -1 }); await K.createIndex({ ts: 1 }, { expireAfterSeconds: 30 * 86400 });
  setInterval(async () => {   // callers that vanished: ringing > 50s = missed; calls "active" > 4h = ended
    try {
      for (const d of await K.find({ st: 'ringing', ts: { $lt: new Date(Date.now() - 50e3) } }).limit(50).toArray()) {
        const r = await K.updateOne({ cid: d.cid, st: 'ringing' }, { $set: { st: 'missed', ended: new Date() }, $unset: { offer: 1 } });
        if (!r.modifiedCount) continue;
        fire([d.from, d.to], 'call', { t: 'end', cid: d.cid });
        const f = await U.findOne({ id: d.from }, { projection: { username: 1 } });
        push(d.to, { type: 'missed', title: 'Missed voice call', body: 'from ' + (f ? f.username : 'someone'), tag: 'missed' + d.from, from: d.from });
      }
      const dead = new Date(Date.now() - 100e3);   // active but no heartbeat for 100 s = the phone vanished
      for (const d of await K.find({ st: 'active', $or: [{ hb: { $lt: dead } }, { hb: { $exists: false }, answeredAt: { $lt: dead } }] }).limit(50).toArray()) {
        const r = await K.updateOne({ cid: d.cid, st: 'active' }, { $set: { st: 'ended', ended: new Date(), dur: secs(d) } });
        if (r.modifiedCount) { if (relay) relay.close(d.cid); fire([d.from, d.to], 'call', { t: 'end', cid: d.cid }); }
      }
    } catch (e) { console.error('call sweep', e.message); }
  }, 20e3).unref();
  await C.E.createIndex({ ts: 1 }, { expireAfterSeconds: 14 * 86400 }); await C.O.createIndex({ ts: 1 });
  if (!(await C.O.countDocuments({}, { limit: 1 }))) await C.O.insertOne({ t: 'Welcome to Lynko 💗\nThis is the official channel. News and updates from the Lynko team will appear here.', ts: new Date() });
  setInterval(mon.flush, 3e4);
  const srv = app.listen(process.env.PORT || 3000, () => console.log(`Lynko on :${process.env.PORT || 3000} · media: ${store ? store.name : 'DISABLED'}`));
  try {   // call audio relay: the fallback that makes voice calls work on every network, no TURN needed
    relay = require('./relay')(srv, { verify: t => jwt.verify(t, SECRET),
      findCall: (cid, uid) => K.findOne({ cid, st: { $in: ['ringing', 'active'] }, $or: [{ from: uid }, { to: uid }] }, { projection: { from: 1, to: 1 } }) });
    console.log('✔ call audio relay ready');
  } catch (e) { console.warn('⚠ call audio relay disabled:', e.message); }
  if (store) { store.sweep(); setInterval(store.sweep, 36e5); }
})().catch(e => { console.error(e); process.exit(1); });
