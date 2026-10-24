// Admin panel + monitoring for LYNKO CHAT.
//   · /admin            -> dashboard (login with ADMIN_USER / ADMIN_PASS from env)
//   · daily counters    -> `stats` collection (requests, messages, sign-ups, errors ...)
//   · error log         -> `errors` collection (server, client and process errors, auto-deleted after 14 days)
//   · official channel  -> `official` collection (messages every account sees in "Lynko Official")
// The admin can NEVER read chats: messages are end-to-end encrypted, this file never touches them.
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = function monitor({ secret, pusher, store, C }) {
  const ADMIN_USER = process.env.ADMIN_USER || '', ADMIN_PASS = process.env.ADMIN_PASS || '';
  const ON = !!(ADMIN_USER && ADMIN_PASS);
  const COOKIE = 'lynko_admin';
  const TZ = (process.env.STATS_TZ_OFFSET ? +process.env.STATS_TZ_OFFSET : 330) * 60000;   // default Sri Lanka (UTC+5:30)
  const dayKey = (t = Date.now()) => new Date(t + TZ).toISOString().slice(0, 10);
  const dayStart = k => new Date(Date.parse(k + 'T00:00:00Z') - TZ);
  const version = crypto.createHash('sha256').update(ADMIN_USER + '\0' + ADMIN_PASS).digest('hex').slice(0, 16);

  if (!ON) console.warn('⚠ /admin is disabled: set ADMIN_USER and ADMIN_PASS in the environment');
  else if (ADMIN_PASS.length < 8) console.warn('⚠ ADMIN_PASS is short — use at least 8 characters');

  // ── counters (kept in memory, flushed to Mongo every 30 s) ──
  let buf = {};
  const count = (k, n = 1) => { buf[k] = (buf[k] || 0) + n; };
  async function flush() {
    const b = buf; if (!C.D || !Object.keys(b).length) return;
    buf = {};
    try { await C.D.updateOne({ _id: dayKey() }, { $inc: b }, { upsert: true }); }
    catch { for (const k in b) buf[k] = (buf[k] || 0) + b[k]; }   // try again next time
  }

  // ── error log ──
  const ring = [];                 // last 50, also readable when Mongo is down
  let clientBudget = 300, budgetT = Date.now();
  function logError(src, err, extra = {}) {
    const msg = String((err && err.message) || err || 'Unknown error').slice(0, 300);
    const doc = { ts: new Date(), src, msg, stack: String((err && err.stack) || extra.stack || '').slice(0, 2000),
      path: String(extra.path || '').slice(0, 160), method: String(extra.method || '').slice(0, 8), user: String(extra.user || '').slice(0, 12) };
    count('errors');
    ring.push(doc); if (ring.length > 50) ring.shift();
    if (C.E) C.E.insertOne({ ...doc }).catch(() => {});
  }
  const clientTries = new Map();
  function clientError(req, res) {      // POST /api/log-error  (browser reports; no login needed because login pages fail too)
    const ip = req.ip, n = (clientTries.get(ip) || 0) + 1; clientTries.set(ip, n);
    if (Date.now() - budgetT > 36e5) { budgetT = Date.now(); clientBudget = 300; }
    if (n > 30 || clientBudget <= 0) return res.status(204).end();
    clientBudget--;
    const b = req.body || {};
    logError('client', { message: b.msg, stack: b.stack }, { path: b.page, user: req.u && req.u.id });
    res.status(204).end();
  }
  setInterval(() => clientTries.clear(), 6e5).unref();

  // ── "last seen" (at most one write per user per 2 minutes) ──
  const seen = new Map();
  function touch(uid) {
    const n = Date.now();
    if (n - (seen.get(uid) || 0) < 12e4) return;
    seen.set(uid, n); if (seen.size > 5e4) seen.clear();
    if (C.U) C.U.updateOne({ id: uid }, { $set: { lastSeen: new Date(n) } }).catch(() => {});
  }

  const requests = (req, res, next) => {
    const p = req.path;
    if (p === '/health') return next();
    if (p.startsWith('/api/')) count('api'); else if (p === '/' || p === '/chat') count('pages');
    res.on('finish', () => { if (res.statusCode >= 500) count('err5xx'); });
    next();
  };

  // ── admin session ──
  const cookieOf = req => ((req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '=')) || '').slice(COOKIE.length + 1);
  const authed = req => { try { const d = jwt.verify(cookieOf(req), secret); return d.adm === 1 && d.v === version; } catch { return false; } };
  const fails = new Map();
  setInterval(() => { const o = Date.now() - 9e5; for (const [k, v] of fails) if (v.t < o) fails.delete(k); }, 9e5).unref();
  const blocked = ip => { const f = fails.get(ip); return !!f && f.n >= 6 && Date.now() - f.t < 9e5; };
  const fail = ip => { const f = fails.get(ip), n = Date.now(); if (!f || n - f.t > 9e5) fails.set(ip, { n: 1, t: n }); else { f.n++; f.t = n; } };
  const hdr = res => res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  const guard = (req, res, next) => {
    if (!ON) return res.status(404).end();
    hdr(res);
    if (!authed(req)) return res.status(401).json({ error: 'Login required' });
    if (req.method !== 'GET' && req.get('x-admin') !== '1') return res.status(403).json({ error: 'Bad request' });
    next();
  };
  const oid = id => { try { return new ObjectId(String(id)); } catch { return null; } };

  function mount(app) {
    app.get('/admin', (q, r) => { if (!ON) return r.status(404).end(); hdr(r); r.sendFile(path.join(__dirname, 'admin.html')); });
    app.get('/admin/api/session', (q, r) => { if (!ON) return r.status(404).end(); hdr(r); r.json({ ok: authed(q) }); });
    app.post('/admin/api/login', (req, res) => {
      if (!ON) return res.status(404).end();
      hdr(res);
      if (blocked(req.ip)) return res.status(429).json({ error: 'Too many wrong tries. Wait 15 minutes.' });
      const { username, password } = req.body || {};
      const a = same(username || '', ADMIN_USER), b = same(password || '', ADMIN_PASS);
      if (!(a && b)) { fail(req.ip); return res.status(401).json({ error: 'Wrong username or password' }); }
      fails.delete(req.ip);
      res.cookie(COOKIE, jwt.sign({ adm: 1, v: version }, secret, { expiresIn: '12h' }),
        { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/admin', maxAge: 12 * 36e5 });
      res.json({ ok: 1 });
    });
    app.post('/admin/api/logout', (q, r) => { r.clearCookie(COOKIE, { path: '/admin' }); r.json({ ok: 1 }); });

    // ── overview ──
    app.get('/admin/api/overview', guard, async (req, res) => {
      const now = Date.now(), today = dayStart(dayKey()), keys = [];
      for (let i = 13; i >= 0; i--) keys.push(dayKey(now - i * 864e5));
      const t0 = Date.now();
      const [users, newToday, new7, online, dau, wau, msgs, statuses, official, err24, errAll, rows] = await Promise.all([
        C.U.estimatedDocumentCount(),
        C.U.countDocuments({ createdAt: { $gte: today } }),
        C.U.countDocuments({ createdAt: { $gte: new Date(now - 7 * 864e5) } }),
        C.U.countDocuments({ lastSeen: { $gte: new Date(now - 5 * 6e4) } }),
        C.U.countDocuments({ lastSeen: { $gte: new Date(now - 864e5) } }),
        C.U.countDocuments({ lastSeen: { $gte: new Date(now - 7 * 864e5) } }),
        C.M.estimatedDocumentCount(), C.S.estimatedDocumentCount(), C.O.estimatedDocumentCount(),
        C.E.countDocuments({ ts: { $gte: new Date(now - 864e5) } }), C.E.estimatedDocumentCount(),
        C.D.find({ _id: { $in: keys } }).toArray()]);
      const ping = Date.now() - t0, by = new Map(rows.map(r => [r._id, r])), cur = dayKey();
      const series = keys.map(k => { const r = { ...(by.get(k) || {}) }; if (k === cur) for (const x in buf) r[x] = (r[x] || 0) + buf[x];
        return { d: k, reg: r.reg || 0, msg: r.msg || 0, req: (r.api || 0) + (r.pages || 0), err: r.errors || 0, login: r.login || 0, status: r.status || 0, media: r.media || 0 }; });
      const mem = process.memoryUsage();
      res.json({ users, newToday, new7, online, dau, wau, msgs, statuses, official, err24, errAll, series,
        sys: { ping, uptime: Math.round(process.uptime()), rss: mem.rss, node: process.version, env: process.env.NODE_ENV || 'development',
          storage: store ? store.name : null, pusher: !!process.env.PUSHER_KEY, tz: TZ / 6e4 } });
    });

    // ── users (public profile data only) ──
    app.get('/admin/api/users', guard, async (req, res) => {
      const q = String(req.query.q || '').trim().toLowerCase().slice(0, 20);
      const f = q ? (/^\d+$/.test(q) ? { id: { $regex: '^' + esc(q) } } : { username: { $regex: '^' + esc(q) } }) : {};
      const list = await C.U.find(f, { projection: { _id: 0, id: 1, username: 1, createdAt: 1, lastSeen: 1, dpv: 1 } }).sort({ createdAt: -1 }).limit(40).toArray();
      res.json(list);
    });

    // ── errors ──
    app.get('/admin/api/errors', guard, async (req, res) => {
      let list;
      try {
        list = await C.E.aggregate([{ $sort: { ts: -1 } }, { $limit: 3000 },
          { $group: { _id: { src: '$src', msg: '$msg', path: '$path' }, n: { $sum: 1 }, last: { $first: '$ts' }, first: { $last: '$ts' }, stack: { $first: '$stack' } } },
          { $sort: { last: -1 } }, { $limit: 100 }]).toArray();
        list = list.map(x => ({ src: x._id.src, msg: x._id.msg, path: x._id.path, n: x.n, last: x.last, first: x.first, stack: x.stack }));
      } catch { list = ring.slice().reverse().map(x => ({ src: x.src, msg: x.msg, path: x.path, n: 1, last: x.ts, first: x.ts, stack: x.stack })); }
      res.json(list);
    });
    app.post('/admin/api/errors/clear', guard, async (req, res) => {
      const b = req.body || {}, f = typeof b.msg === 'string' ? { src: String(b.src), msg: b.msg, path: String(b.path || '') } : {};
      const r = await C.E.deleteMany(f); if (!Object.keys(f).length) ring.length = 0;
      res.json({ deleted: r.deletedCount });
    });

    // ── official channel ──
    const oOut = m => ({ id: m._id.toString(), t: m.t, ts: m.ts.toISOString() });
    app.get('/admin/api/official', guard, async (q, r) => r.json((await C.O.find().sort({ ts: -1 }).limit(200).toArray()).map(oOut)));
    app.post('/admin/api/official', guard, async (req, res) => {
      const t = String((req.body || {}).text || '').replace(/\r\n/g, '\n').trim();
      if (!t) return res.status(400).json({ error: 'Write a message first' });
      if (t.length > 1500) return res.status(400).json({ error: 'Max 1500 characters' });
      const doc = { t, ts: new Date() }, r = await C.O.insertOne(doc), m = oOut({ ...doc, _id: r.insertedId });
      count('official');
      pusher.trigger('official', 'omsg', m).catch(() => {});
      res.json(m);
    });
    app.delete('/admin/api/official/:id', guard, async (req, res) => {
      const _id = oid(req.params.id); if (!_id) return res.status(400).json({ error: 'Bad id' });
      const r = await C.O.deleteOne({ _id });
      if (r.deletedCount) pusher.trigger('official', 'odel', { id: req.params.id }).catch(() => {});
      res.json({ ok: 1 });
    });
  }

  return { count, logError, clientError, touch, requests, mount, flush, dayKey };
};
