// Lynko Bot SDK — no dependencies, Node.js 18+.  Works like a tiny Telegram bot library.
class Bot {
  constructor(token, baseUrl) {
    if (!/^\d{8}:[\w-]{30,}$/.test(token || '')) throw new Error('BOT_TOKEN is missing or wrong (it looks like 12345678:AbCd...)');
    if (!baseUrl) throw new Error('LYNKO_URL is missing (your Lynko site, e.g. https://lynko.example.com)');
    this.api = `${baseUrl.replace(/\/+$/, '')}/bot${token}`;
    this.cmds = new Map(); this.textH = []; this.startH = null; this.offset = 0; this.running = false; this.me = null;
  }
  async call(method, body, ms = 15000) {
    const r = await fetch(`${this.api}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(ms) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) { const e = new Error(d.description || 'HTTP ' + r.status); e.code = d.error_code || r.status; e.retry = d.parameters && d.parameters.retry_after; throw e; }
    return d.result;
  }
  command(name, fn) { this.cmds.set(name.toLowerCase().replace(/^\//, ''), fn); return this; }   // bot.command('start', ctx => ...)
  on(type, fn) { if (type === 'text') this.textH.push(fn); return this; }                         // bot.on('text', ctx => ...)
  ctx(m) {
    const chat = m.chat.id;
    return { message: m, text: m.text || '', from: m.from, chatId: chat, bot: this,
      reply: t => this.call('sendMessage', { chat_id: chat, text: String(t) }),
      typing: () => this.call('sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {}) };
  }
  async handle(m) {
    const c = this.ctx(m), t = (m.text || '').trim(), mt = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(t);
    if (mt) { c.args = (mt[2] || '').trim(); const f = this.cmds.get(mt[1].toLowerCase()); if (f) return f(c); }
    for (const f of this.textH) await f(c);
  }
  async launch() {
    this.me = await this.call('getMe');
    console.log(`✔ Bot started: ${this.me.first_name} (@${this.me.username}) · ID ${this.me.id}`);
    this.running = true; let wait = 1000;
    while (this.running) {
      try {
        // long polling: the server holds the request open up to 25 s, so an idle bot uses almost no data
        const ups = await this.call('getUpdates', { offset: this.offset, timeout: 25 }, 40000); wait = 1000;
        for (const u of ups) {
          this.offset = u.update_id + 1;
          if (u.message) try { await this.handle(u.message); } catch (e) { console.error('handler error:', e.message); }
        }
      } catch (e) {
        if (e.code === 401) { console.error('✖ Token rejected (revoked or wrong). Fix BOT_TOKEN and restart.'); process.exit(1); }
        console.error('connection problem:', e.message, `— retry in ${Math.round(wait / 1000)}s`);
        await new Promise(r => setTimeout(r, (e.retry ? e.retry * 1000 : wait))); wait = Math.min(wait * 2, 30000);
      }
    }
  }
  stop() { this.running = false; }
}
module.exports = { Bot };
