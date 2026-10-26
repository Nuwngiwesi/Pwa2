// Telegram-style bots for Lynko: @BotFather (makes bots + tokens) and a Bot HTTP API.
//   POST/GET  /bot<TOKEN>/getMe | getUpdates | sendMessage | sendChatAction
// A bot is a normal account (bot:true) whose key pair is kept on the server, so the existing
// end-to-end chat code in the app works unchanged. NOTE: bot chats are readable by the server + the bot owner's script.
const crypto = require('crypto');
const subtle = crypto.webcrypto.subtle;
const b64 = b => Buffer.from(b).toString('base64');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const HANDLE = /^[a-z][a-z0-9_]*bot$/;
const MAX_BOTS = 10, MAX_TEXT = 4096;

module.exports = function bots({ app, C, seal, unseal, fire, conv, push, ObjectId, log }) {
  const ids = new Set();        // every bot id (so normal chats never touch the bot code = no extra DB reads)
  const botCache = new Map();   // id -> bot doc
  const keyCache = new Map();   // botId:userId -> AES key
  const waiters = new Map();    // botId -> long-poll in progress
  const state = new Map();      // BotFather conversations: userId -> { step, ... }
  const sends = new Map(), fails = new Map();
  let father = null, lastUid = 0;
  const nextUid = () => (lastUid = Math.max(lastUid + 1, Date.now() * 1000));

  // ───────── crypto (same scheme as the app: ECDH P-256 -> AES-GCM) ─────────
  async function newKeys() {
    const k = await subtle.generateKey(ECDH, true, ['deriveKey']);
    return { pub: JSON.stringify(await subtle.exportKey('jwk', k.publicKey)), priv: JSON.stringify(await subtle.exportKey('jwk', k.privateKey)) };
  }
  async function shared(bot, uid) {
    const ck = bot.id + ':' + uid; let key = keyCache.get(ck); if (key) return key;
    const u = await C.U.findOne({ id: uid }, { projection: { pub: 1 } }); if (!u || !u.pub) throw new Error('unknown user');
    const pub = await subtle.importKey('jwk', JSON.parse(u.pub), ECDH, false, []);
    const priv = await subtle.importKey('jwk', JSON.parse(unseal(bot.bpriv).toString()), ECDH, false, ['deriveKey']);
    key = await subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    if (keyCache.size > 5000) keyCache.clear(); keyCache.set(ck, key); return key;
  }
  async function getBot(id) {
    id = String(id || ''); if (!ids.has(id)) return null;
    let b = botCache.get(id); if (b) return b;
    b = await C.U.findOne({ id, bot: true }); if (b) { if (botCache.size > 2000) botCache.clear(); botCache.set(id, b); }
    return b;
  }

  // ───────── bot -> user message ─────────
  async function sendFrom(bot, uid, text) {
    text = String(text == null ? '' : text).slice(0, MAX_TEXT);
    const iv = crypto.randomBytes(12), key = await shared(bot, uid);
    const ct = Buffer.from(await subtle.encrypt({ name: 'AES-GCM', iv }, key, Buffer.from(JSON.stringify({ k: 'text', v: text }))));
    const _id = new ObjectId(), now = new Date();
    await C.M.insertOne({ _id, conv: conv(bot.id, uid), from: bot.id, to: uid, kind: 'text', iv: b64(iv), ct: seal(ct), createdAt: now });
    const m = { id: _id.toString(), from: bot.id, to: uid, kind: 'text', iv: b64(iv), bIv: null, ct: ct.toString('base64'), media: false, r: false, rx: {}, ts: now.toISOString() };
    fire([uid], 'msg', m.ct.length < 6000 ? m : { id: m.id, from: m.from, to: m.to });   // big ones: the phone fetches them (Pusher max 10 KB)
    push(uid, { type: 'msg', title: bot.username, body: 'New message', tag: 'm' + bot.id, from: bot.id });
    return m;
  }

  // ───────── user -> bot message (called by server.js after it is saved) ─────────
  async function incoming({ from, to, kind, iv, ct, id, ts, name }) {
    const bot = await getBot(to); if (!bot || kind !== 'text') return;
    let p; try { p = JSON.parse(Buffer.from(await subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64') }, await shared(bot, from), Buffer.from(ct, 'base64'))).toString()); } catch { return; }
    const text = String((p && p.v) || '').slice(0, MAX_TEXT); if (!text) return;
    if (bot.system) return fatherHandle(from, text);
    if (await C.B.countDocuments({ bot: bot.id }, { limit: 1001 }) > 1000) return;   // bot is offline for too long: stop queueing
    const uid = nextUid(), user = { id: Number(from), is_bot: false, first_name: name || 'User' };
    await C.B.insertOne({ bot: bot.id, uid, ts: new Date(), upd: { update_id: uid,
      message: { message_id: id, from: user, chat: { id: Number(from), type: 'private', first_name: user.first_name }, date: Math.floor(ts.getTime() / 1000), text } } });
    const w = waiters.get(bot.id); if (w) w.done();   // wake the long-poll
  }

  // ───────── Bot HTTP API ─────────
  const ok = (res, result) => res.json({ ok: true, result });
  const err = (res, code, description, extra) => res.status(code).json({ ok: false, error_code: code, description, ...(extra ? { parameters: extra } : {}) });
  const pub = b => ({ id: Number(b.id), is_bot: true, first_name: b.username, username: b.handle });

  async function botAuth(req, res, next) {
    const t = String(req.params.token || ''), m = /^(\d{8}):([A-Za-z0-9_-]{30,60})$/.exec(t), ip = req.ip, n = fails.get(ip) || 0;
    if (n > 30) return err(res, 429, 'Too Many Requests: wrong tokens, wait 10 minutes');
    const bot = m && await getBot(m[1]);
    if (!bot || bot.system || !crypto.timingSafeEqual(Buffer.from(sha(t)), Buffer.from(bot.tokenHash))) {
      fails.set(ip, n + 1); setTimeout(() => { const x = fails.get(ip); if (x > 1) fails.set(ip, x - 1); else fails.delete(ip); }, 6e5).unref();
      return err(res, 401, 'Unauthorized');
    }
    req.bot = bot; next();
  }
  const methods = {
    getMe: async (bot, p, res) => ok(res, pub(bot)),
    async getUpdates(bot, p, res, req) {
      const offset = Number(p.offset) || 0, limit = Math.min(100, Math.max(1, Number(p.limit) || 100)), timeout = Math.min(30, Math.max(0, Number(p.timeout) || 0));
      if (offset) await C.B.deleteMany({ bot: bot.id, uid: { $lt: offset } });   // confirms everything before `offset`
      const read = () => C.B.find({ bot: bot.id, uid: { $gte: offset } }).sort({ uid: 1 }).limit(limit).toArray();
      let rows = await read();
      if (!rows.length && timeout) {   // long polling: one open request instead of a request every second = very little data
        const old = waiters.get(bot.id); if (old) old.done();
        await new Promise(resolve => {
          const w = { done() { clearTimeout(t); if (waiters.get(bot.id) === w) waiters.delete(bot.id); req.removeListener('close', w.done); resolve(); } };
          const t = setTimeout(() => w.done(), timeout * 1000); waiters.set(bot.id, w); req.on('close', w.done);
        });
        rows = req.socket.destroyed ? [] : await read();
      }
      if (!res.headersSent) ok(res, rows.map(r => r.upd));
    },
    async sendMessage(bot, p, res) {
      const chat = String(p.chat_id || ''), text = String(p.text == null ? '' : p.text);
      if (!/^\d{8}$/.test(chat)) return err(res, 400, 'Bad Request: chat_id is invalid');
      if (!text.trim()) return err(res, 400, 'Bad Request: message text is empty');
      const now = Date.now(), a = (sends.get(bot.id) || []).filter(t => now - t < 1000); a.push(now); sends.set(bot.id, a);
      if (a.length > 30) return err(res, 429, 'Too Many Requests: retry after 1', { retry_after: 1 });
      const u = await C.U.findOne({ id: chat, contacts: bot.id, bot: { $ne: true } }, { projection: { id: 1, username: 1 } });
      if (!u) return err(res, 403, 'Forbidden: the user has not started this bot (they must search it and send a message first)');
      const m = await sendFrom(bot, chat, text);
      ok(res, { message_id: m.id, from: pub(bot), chat: { id: Number(chat), type: 'private', first_name: u.username }, date: Math.floor(Date.now() / 1000), text: text.slice(0, MAX_TEXT) });
    },
    async sendChatAction(bot, p, res) {   // shows "typing…" in the user's chat for ~4 s
      const chat = String(p.chat_id || ''); if (!/^\d{8}$/.test(chat)) return err(res, 400, 'Bad Request: chat_id is invalid');
      fire([chat], 'typing', { from: bot.id }); ok(res, true);
    },
  };
  app.all('/bot:token/:method', botAuth, async (req, res) => {
    const fn = methods[req.params.method];
    if (!fn) return err(res, 404, 'Not Found');
    try { await fn(req.bot, { ...req.query, ...(req.body || {}) }, res, req); }
    catch (e) { log && log('bot-api', e); if (!res.headersSent) err(res, 500, 'Internal Server Error'); }
  });

  // ───────── @BotFather ─────────
  async function createBot(owner, name, handle) {
    let id; do { id = String(crypto.randomInt(10000000, 99999999)); } while (await C.U.findOne({ id }, { projection: { _id: 1 } }));
    const token = id + ':' + crypto.randomBytes(26).toString('base64url'), k = await newKeys();
    await C.U.insertOne({ id, username: name, handle, bot: true, owner, tokenHash: sha(token), tokenEnc: seal(Buffer.from(token)),
      pub: k.pub, bpriv: seal(Buffer.from(k.priv)), about: 'Bot', dpv: 0, contacts: [], createdAt: new Date() });
    ids.add(id); return { id, token };
  }
  const tokenOf = b => unseal(b.tokenEnc).toString();
  const line = b => `• ${b.username} — @${b.handle}  (ID ${b.id})`;
  const HELP = 'I can help you create and manage bots.\n\n/newbot — create a new bot\n/mybots — list your bots\n/token @username — show a bot’s token\n/revoke @username — make a new token (old one stops working)\n/setname @username New Name — rename a bot\n/deletebot @username — delete a bot\n/cancel — cancel the current step';

  async function fatherHandle(uid, text) {
    const say = s => sendFrom(father, uid, s), t = text.trim(), st = state.get(uid);
    if (st && !t.startsWith('/')) {
      if (st.step === 'name') {
        const n = t.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30); if (!n) return say('Please send a name for your bot.');
        state.set(uid, { step: 'user', name: n });
        return say('Good. Now choose a username for your bot. It must end in "bot" — for example tetris_bot or TetrisBot. Letters, numbers and underscores only, 5–32 characters.');
      }
      if (st.step === 'user') {
        const h = t.replace(/^@/, '').toLowerCase();
        if (h.length < 5 || h.length > 32 || !HANDLE.test(h)) return say('Invalid username. It must end in "bot", start with a letter, use only a–z, 0–9 and _, and be 5–32 characters. Try another one.');
        if (h === 'botfather' || await C.U.findOne({ handle: h }, { projection: { _id: 1 } })) return say('Sorry, this username is already taken. Please try something different.');
        state.delete(uid);
        const b = await createBot(uid, st.name, h);
        return say(`Done! Congratulations on your new bot. Search for it with @${h} in the Add contact box.\n\nBot ID: ${b.id}\n\nToken (use it in your Node.js panel):\n${b.token}\n\nKeep your token secure — anyone who has it can control your bot. Use /revoke if it leaks.`);
      }
      if (st.step === 'del') {
        state.delete(uid);
        if (t.toLowerCase() !== 'yes') return say('Okay, nothing was deleted.');
        await C.U.deleteOne({ id: st.id, owner: uid }); ids.delete(st.id); botCache.delete(st.id);
        await C.U.updateMany({ contacts: st.id }, { $pull: { contacts: st.id } }); await C.B.deleteMany({ bot: st.id });
        return say(`Bot @${st.handle} was deleted.`);
      }
    }
    state.delete(uid);
    const [cmd, ...rest] = t.split(/\s+/), arg = rest.join(' ');
    const mine = () => C.U.find({ owner: uid, bot: true }).toArray();
    const pick = async a => {   // "@handle" -> that bot; no argument + exactly one bot -> that bot
      const l = await mine(), h = String(a || '').trim().split(/\s+/)[0].replace(/^@/, '').toLowerCase();
      if (!l.length) { await say('You have no bots yet. Send /newbot to create one.'); return null; }
      const b = h ? l.find(x => x.handle === h) : (l.length === 1 ? l[0] : null);
      if (!b) { await say((h ? 'I could not find that bot.' : 'Which bot? Send the command with its username, e.g. ' + cmd + ' @' + l[0].handle) + '\n\n' + l.map(line).join('\n')); return null; }
      return b;
    };
    switch (cmd.toLowerCase().replace(/@botfather$/, '')) {
      case '/start': case '/help': return say(HELP);
      case '/cancel': return say('Okay, cancelled. Send /newbot to create a bot.');
      case '/newbot': {
        if ((await C.U.countDocuments({ owner: uid, bot: true })) >= MAX_BOTS) return say(`You already have ${MAX_BOTS} bots, that is the limit. Delete one with /deletebot first.`);
        state.set(uid, { step: 'name' }); return say('Alright, a new bot. How are we going to call it? Please choose a name for your bot.');
      }
      case '/mybots': { const l = await mine(); return say(l.length ? 'Your bots:\n\n' + l.map(line).join('\n') + '\n\nUse /token @username to see a token.' : 'You have no bots yet. Send /newbot to create one.'); }
      case '/token': { const b = await pick(arg); return b && say(`Token for @${b.handle}\nBot ID: ${b.id}\n\n${tokenOf(b)}`); }
      case '/revoke': {
        const b = await pick(arg); if (!b) return;
        const token = b.id + ':' + crypto.randomBytes(26).toString('base64url');
        await C.U.updateOne({ id: b.id }, { $set: { tokenHash: sha(token), tokenEnc: seal(Buffer.from(token)) } }); botCache.delete(b.id);
        return say(`New token for @${b.handle}:\n\n${token}\n\nThe old token no longer works. Update it in your Node.js panel.`);
      }
      case '/setname': {
        const b = await pick(arg); if (!b) return;
        const n = arg.trim().split(/\s+/).slice(1).join(' ').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
        if (!n) return say('Send it like this: /setname @' + b.handle + ' New Name');
        await C.U.updateOne({ id: b.id }, { $set: { username: n } }); botCache.delete(b.id); fire([uid], 'prof', {});
        return say(`Done. @${b.handle} is now called "${n}". People may need to reopen the app to see it.`);
      }
      case '/deletebot': { const b = await pick(arg); if (!b) return; state.set(uid, { step: 'del', id: b.id, handle: b.handle }); return say(`Are you sure you want to delete @${b.handle}? This cannot be undone. Send "yes" to confirm, or /cancel.`); }
      default: return say('I did not understand that. Send /help to see what I can do.');
    }
  }

  async function init() {
    C.B = C.db.collection('botupd');
    await C.B.createIndex({ bot: 1, uid: 1 }); await C.B.createIndex({ ts: 1 }, { expireAfterSeconds: 86400 });
    await C.U.createIndex({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: 'string' } } });
    for (const b of await C.U.find({ bot: true }, { projection: { id: 1 } }).toArray()) ids.add(b.id);
    father = await C.U.findOne({ handle: 'botfather' });
    if (!father) {
      let id; do { id = String(crypto.randomInt(10000000, 99999999)); } while (await C.U.findOne({ id }, { projection: { _id: 1 } }));
      const k = await newKeys();
      await C.U.insertOne({ id, username: 'BotFather', handle: 'botfather', bot: true, system: true, pub: k.pub, bpriv: seal(Buffer.from(k.priv)), about: 'I can help you create and manage bots', dpv: 0, contacts: [], createdAt: new Date() });
      father = await C.U.findOne({ id }); ids.add(id);
    }
    botCache.set(father.id, father);
    console.log(`✔ bots ready · @botfather = ${father.id} · ${ids.size - 1} bot(s)`);
  }

  return { init, incoming, isBot: id => ids.has(String(id)) };
};
