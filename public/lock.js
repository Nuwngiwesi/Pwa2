// LYNKO — app lock (password on every reopen) + WhatsApp-style "Locked chats".
// Loaded in chat.html before the main script. The main script waits for LOCK.ready before it touches any key.
(() => {
const enc = new TextEncoder(), dec = new TextDecoder();
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const uid = () => localStorage.getItem('lynko_id') || '';
const $ = id => document.getElementById(id);
const say = t => { try { toast(t) } catch { alert(t) } };

// ───────────── password check (works offline: decrypts the stored encrypted key) ─────────────
async function kdf(pw, salt) {
  const m = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 150000 }, m, 256);
}
async function checkPw(pw) {   // -> private key JSON, or null if the password is wrong
  try {
    const e = JSON.parse(localStorage.getItem('lynko_enc')), id = localStorage.getItem('lynko_ident');
    const wk = await crypto.subtle.importKey('raw', await kdf(pw, 'wrap:' + id), 'AES-GCM', false, ['decrypt']);
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, wk, unb64(e.ct)));
  } catch { return null }
}
// slow down guessing: 5 free tries, then 30 s, 60 s, 90 s … (max 10 min)
const tryKey = k => 'lk_try_' + k;
const tries = k => { try { return JSON.parse(localStorage.getItem(tryKey(k)) || '{"n":0,"until":0}') } catch { return { n: 0, until: 0 } } };
const wait = k => Math.max(0, Math.ceil((tries(k).until - Date.now()) / 1000));
const fail = k => { const t = tries(k); t.n++; if (t.n >= 5) t.until = Date.now() + Math.min(600, (t.n - 4) * 30) * 1000; localStorage.setItem(tryKey(k), JSON.stringify(t)) };
const clear = k => localStorage.removeItem(tryKey(k));

// ───────────── lock screen ─────────────
let locked = false, resolveReady;
const ready = new Promise(r => resolveReady = r);
const style = document.createElement('style');
style.textContent = `#lockov{position:fixed;top:0;right:0;bottom:0;left:0;z-index:1000;background:radial-gradient(900px 700px at 50% 0%,#4a0f3a,#14040f);display:flex;align-items:center;justify-content:center;padding:24px}
#lockov[hidden]{display:none}.lkc{width:min(100%,360px);text-align:center;display:grid;gap:12px}
.lkc .lklogo{font:italic 700 40px 'Fraunces',serif;color:#fff}.lkc .lklogo i{color:#ff5c8a;font-style:normal}
.lkc .lkav{width:84px;height:84px;border-radius:50%;margin:6px auto 0;display:grid;place-items:center;font-size:36px;font-weight:700;color:#fff;background:linear-gradient(135deg,#ff5c8a,#c14bff)}
.lkc h3{margin:0;color:#fff;font-size:20px}.lkc p{margin:0;color:#c9a3b8;font-size:14px}
.lkc input{width:100%;font:16px 'DM Sans',sans-serif;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:14px 16px;outline:0;text-align:center}
.lkc input:focus{border-color:#ff5c8a}.lkc .lkgo{padding:14px;border-radius:14px;font-weight:700;color:#fff;background:linear-gradient(135deg,#ff5c8a,#c14bff)}
.lkc .lkgo:disabled{opacity:.6}#lkerr{min-height:20px;color:#ff8aa5;font-size:14px}.lkc .lkout{color:#c9a3b8;font-size:14px;padding:8px;text-decoration:underline}`;
document.head.appendChild(style);
const ov = document.createElement('div'); ov.id = 'lockov'; ov.hidden = true;
ov.innerHTML = `<form class="lkc" id="lkform" autocomplete="on"><div class="lklogo">Lynko<i>♥</i></div><div class="lkav" id="lkav"></div><h3 id="lkn"></h3><p>Enter your password to open the app</p>
<input id="lkuser" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0"><input id="lkp" type="password" name="password" placeholder="Password" autocomplete="current-password"><button class="lkgo" id="lkgo" type="button">Unlock</button><div id="lkerr"></div><button class="lkout" id="lkout" type="button">Not you? Log out</button></form>`;
ov.querySelector('form').onsubmit = e => { e.preventDefault(); unlock() };
document.body.appendChild(ov);

function show() {
  locked = true; ov.hidden = false;
  const n = localStorage.getItem('lynko_name') || '';
  $('lkn').textContent = n; $('lkav').textContent = (n || '♥')[0].toUpperCase(); $('lkp').value = ''; $('lkerr').textContent = ''; $('lkuser').value = localStorage.getItem('lynko_ident') || '';
  setTimeout(() => $('lkp').focus(), 60);
}
async function unlock() {
  const w = wait('app'); if (w) { $('lkerr').textContent = `Too many tries. Wait ${w}s`; return }
  const pw = $('lkp').value; if (!pw) return;
  $('lkgo').disabled = true; $('lkerr').textContent = '';
  const priv = await checkPw(pw);
  $('lkgo').disabled = false;
  if (!priv) { fail('app'); $('lkp').value = ''; const w2 = wait('app'); $('lkerr').textContent = w2 ? `Wrong password. Wait ${w2}s` : 'Wrong password'; return }
  clear('app'); sessionStorage.setItem('lynko_priv', priv); if (stay()) localStorage.setItem('lynko_priv', priv);
  locked = false; ov.hidden = true; $('lkp').value = ''; try { const q = document.getElementById('q'); if (q && q.value) { q.value = ''; q.dispatchEvent(new Event('input')) } } catch {} resolveReady();
}
$('lkgo').onclick = unlock; $('lkp').addEventListener('keydown', e => { if (e.key == 'Enter') { e.preventDefault(); unlock() } });
$('lkout').onclick = async () => {
  if (!confirm('Log out of this phone? You will need your password to log in again.')) return;
  try { await fetch('/api/logout', { method: 'POST' }) } catch {}
  localStorage.removeItem('lynko_enc'); localStorage.removeItem('lynko_priv'); sessionStorage.clear(); try { await caches.delete('lynko-api-v2') } catch {} location.href = '/';
};

// first load: no unlocked key in this session = the app was closed -> ask for the password
const stay = () => (localStorage.getItem('lk_after') || 'never') === 'never';   // 'Lock app: Never' (default) = open straight away, no password
if (!localStorage.getItem('lynko_enc')) resolveReady();                 // not logged in: main script sends you to the login page
else if (sessionStorage.getItem('lynko_priv')) { if (stay()) localStorage.setItem('lynko_priv', sessionStorage.getItem('lynko_priv')); resolveReady() }   // same session
else if (stay() && localStorage.getItem('lynko_priv')) { sessionStorage.setItem('lynko_priv', localStorage.getItem('lynko_priv')); resolveReady() }   // app was closed: reopen without a password
else show();

// ───────────── lock again after leaving the app ─────────────
const AFTER = { never: Infinity, now: 10e3, '1m': 60e3, '10m': 600e3 };      // "right away" keeps a 10 s grace for the camera / file picker
const grace = () => AFTER[localStorage.getItem('lk_after') || 'never'] ?? Infinity;
document.addEventListener('click', e => { if (e.target && e.target.type == 'file') sessionStorage.setItem('lk_skip', Date.now() + 180e3) }, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (!locked) sessionStorage.setItem('lk_hid', Date.now()); return }
  const h = +sessionStorage.getItem('lk_hid') || 0; sessionStorage.removeItem('lk_hid');
  if (!h || locked || !localStorage.getItem('lynko_enc')) return;
  const away = Date.now() - h, busy = window.F && F.inCall && F.inCall();
  if (away > 10e3 && chat.open) chat.relock();                            // locked chats close quickly
  if (grace() !== Infinity && away > grace() && Date.now() > (+sessionStorage.getItem('lk_skip') || 0) && !busy) { chat.relock(); show() }
});
addEventListener('pagehide', () => { if (!stay() && sessionStorage.getItem('lk_reload') !== '1') sessionStorage.removeItem('lynko_priv') });   // closing the app forgets the unlocked key (except our own update-reload)
sessionStorage.removeItem('lk_reload');

// ───────────── Locked chats (WhatsApp-style, opened with a SECRET CODE typed in the search bar) ─────────────
const LKEY = () => 'lynko_locked:' + uid(), PKEY = () => 'lynko_cpin:' + uid(), HKEY = () => 'lynko_lkhide:' + uid();
const ids = () => { try { return new Set(JSON.parse(localStorage.getItem(LKEY()) || '[]')) } catch { return new Set() } };
function save(s) {
  localStorage.setItem(LKEY(), JSON.stringify([...s]));
  try { caches.open('lynko-lock').then(c => c.put('/__locked', new Response(JSON.stringify([...s]), { headers: { 'Content-Type': 'application/json' } }))) } catch {}   // the notification worker reads this
}
function migrate() {   // old per-chat PIN locks -> new Locked chats folder
  const u = uid(); if (!u) return; const s = ids(); let ch = false;
  for (const k of Object.keys(localStorage)) if (k.startsWith('lk:' + u + ':')) { s.add(k.split(':')[2]); localStorage.removeItem(k); ch = true }
  if (ch || !localStorage.getItem('lynko_lock_sync')) { save(s); localStorage.setItem('lynko_lock_sync', '1') }
}
const askPw = title => askText(title, { type: 'password', ph: 'Password', ok: 'OK', ac: 'current-password' });
// generic text dialog (the main script's ask() only does numeric PINs)
function askText(title, { type = 'password', ph = '', ok = 'OK', ac = 'off', note = '' } = {}) {
  return new Promise(res => {
    const o = document.createElement('div'); o.className = 'ov'; o.style.zIndex = 900;
    o.innerHTML = '<div class="dlg"><h3></h3><small class="lknote" style="color:#d6a6ba;line-height:1.5"></small><input style="width:100%" autocapitalize="off" autocorrect="off" spellcheck="false"><div class="r"><button class="no">Cancel</button><button class="ok"></button></div></div>';
    o.querySelector('h3').textContent = title; o.querySelector('.lknote').textContent = note; o.querySelector('.lknote').hidden = !note;
    o.querySelector('.ok').textContent = ok;
    const i = o.querySelector('input'); i.type = type; i.placeholder = ph; i.autocomplete = ac; document.body.appendChild(o); i.focus();
    const done = v => { o.remove(); res(v) };
    o.querySelector('.no').onclick = () => done(null); o.querySelector('.ok').onclick = () => done(i.value);
    i.addEventListener('keydown', e => { if (e.key == 'Enter') done(i.value) });
  });
}
// secret code = 4+ characters (letters / numbers / symbols). Stored as a salted PBKDF2 hash (v2). Old 4–6 digit PINs (sha256) still work and are upgraded on first use.
const MINCODE = 4;
async function hashCode(code, salt) { return hex(await kdf(code, 'chatlock:' + salt)) }
async function codeOk(code) {
  let rec; try { rec = JSON.parse(localStorage.getItem(PKEY()) || 'null') } catch {} if (!rec) return false;
  if (rec.v == 2) return (await hashCode(code, rec.s)) === rec.h;
  if ((await sha(code + ':' + rec.s)) === rec.h) { try { localStorage.setItem(PKEY(), JSON.stringify({ v: 2, s: rec.s, h: await hashCode(code, rec.s) })) } catch {} return true }   // legacy -> upgrade
  return false;
}
async function newCode(first) {
  const a = await askText(first ? 'Create a secret code' : 'New secret code', { type: 'password', ph: 'Secret code', ok: 'Next', ac: 'new-password',
    note: 'You will type this code in the search bar to open your Locked chats. At least 4 characters — letters, numbers or symbols. Don’t use your login password.' });
  if (a === null) return false;
  if (a.length < MINCODE) { say('Code must be at least 4 characters'); return false }
  if (a !== a.trim()) { say('No spaces at the start or end of the code'); return false }
  if (a.length > 40) { say('Code is too long (max 40)'); return false }
  const b = await askText('Repeat the secret code', { type: 'password', ph: 'Secret code', ok: 'Save', ac: 'new-password' });
  if (b === null) return false;
  if (a !== b) { say('Codes don’t match'); return false }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem(PKEY(), JSON.stringify({ v: 2, s: salt, h: await hashCode(a, salt) })); clear('pin');
  if (localStorage.getItem(HKEY()) === null) localStorage.setItem(HKEY(), '1');       // default: folder stays hidden until the code is typed
  say('Secret code saved'); return true;
}
// search-bar guard: typing a normal search must never lock you out, but guessing is still throttled (30 checks / minute)
let chk = [];
const throttled = () => { const n = Date.now(); chk = chk.filter(t => n - t < 6e4); if (chk.length >= 30) return true; chk.push(n); return false };
const chat = {
  open: false,
  has: id => ids().has(id),
  count: () => ids().size,
  list: () => [...ids()],
  isOpen: () => chat.open,
  hasCode: () => !!localStorage.getItem(PKEY()),
  setup: () => newCode(true),
  hidden: () => chat.hasCode() && localStorage.getItem(HKEY()) !== '0',           // folder/chip invisible until the code is typed
  setHidden: v => localStorage.setItem(HKEY(), v ? '1' : '0'),
  async tryCode(text) {   // called from the search bar. true = the text WAS the secret code and Locked chats are now open
    if (!chat.hasCode() || chat.open || text.length < MINCODE || text.length > 40) return false;
    if (wait('pin') || throttled()) return false;
    const ok = await codeOk(text);
    if (ok) { clear('pin'); chat.open = true }
    return ok;
  },
  async gate() {   // true once the Locked chats folder is open (used when opening a locked chat directly, e.g. from a notification)
    if (chat.open) return true;
    if (!chat.hasCode()) { if (!(await newCode(true))) return false }
    else {
      const w = wait('pin'); if (w) { say(`Too many tries. Wait ${w}s`); return false }
      const p = await askText('Enter your secret code', { type: 'password', ph: 'Secret code', ac: 'off' }); if (p === null) return false;
      if (!(await codeOk(p))) { fail('pin'); say(tries('pin').n >= 3 ? 'Wrong code · forgot it? Settings → Chat lock → Reset secret code' : 'Wrong code'); return false }
      clear('pin');
    }
    chat.open = true; return true;
  },
  relock() {
    if (!chat.open) return; chat.open = false;
    try { if (cur && chat.has(cur)) closeChat(); if (flt == 'locked') { flt = 'all'; document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x.dataset.f == 'all')) } if (window.syncChips) syncChips(); renderList() } catch {}
  },
  async toggle(id) {   // ⋮ menu inside a chat
    if (!chat.hasCode()) { if (!(await newCode(true))) return }
    else if (!chat.open && !(await chat.gate())) return;
    const s = ids();
    if (s.has(id)) { s.delete(id); save(s); say('Chat unlocked'); renderList(); return }
    s.add(id); save(s); chat.open = false;
    say(chat.hidden() ? 'Chat locked · type your secret code in the search bar to find it' : 'Chat locked · find it under Locked chats'); closeChat(); if (window.syncChips) syncChips(); renderList();
  },
  row() {   // folder row shown at the top of the chat list (only when not hidden)
    const b = document.createElement('button'); b.className = 'item';
    b.innerHTML = '<div class="av" style="background:linear-gradient(135deg,#7f5cff,#ff5c8a);font-size:22px">🔒</div><div class="n"><div class="r1"><b>Locked chats</b></div><div class="r2"><span class="pv"></span></div></div>';
    b.querySelector('.pv').textContent = chat.count() + (chat.count() == 1 ? ' chat' : ' chats');
    b.onclick = async () => { if (await chat.gate()) { if (window.syncChips) syncChips(); document.querySelector('#chips [data-f=locked]').click() } };
    return b;
  },
  async resetPin() {   // forgot the code (or want a new one): prove it's you with the account password
    const w = wait('app'); if (w) return say(`Too many tries. Wait ${w}s`);
    const pw = await askPw('Enter your account password'); if (pw === null) return;
    if (!(await checkPw(pw))) { fail('app'); return say('Wrong password') }
    clear('app'); await newCode(!chat.hasCode());
  },
  async removeCode() {   // turn the secret code off: every locked chat is unlocked again
    const pw = await askPw('Enter your account password'); if (pw === null) return;
    if (!(await checkPw(pw))) { fail('app'); return say('Wrong password') }
    clear('app'); localStorage.removeItem(PKEY()); localStorage.removeItem(HKEY()); save(new Set()); chat.open = false; say('Chat lock removed');
    if (window.syncChips) syncChips(); try { renderList() } catch {}
  },
};
migrate();

// ───────────── privacy screen: hides the app contents in the app switcher ─────────────
const shield = document.createElement('div'); shield.id = 'lkshield'; shield.hidden = true;
shield.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:2000;background:#14040f;display:flex;align-items:center;justify-content:center;font:italic 700 40px Fraunces,serif;color:#fff';
shield.innerHTML = 'Lynko<i style="color:#ff5c8a;font-style:normal">♥</i>'; document.body.appendChild(shield);
const shieldOn = () => localStorage.getItem('lk_shield') !== '0';
const cover = () => { if (shieldOn() && localStorage.getItem('lynko_enc')) shield.hidden = false }, uncover = () => { shield.hidden = true };
document.addEventListener('visibilitychange', () => document.hidden ? cover() : uncover());
addEventListener('pagehide', cover); addEventListener('pageshow', uncover); addEventListener('focus', uncover);

window.LOCK = { ready, chat, checkPw, askText, shield: { get: shieldOn, set: v => localStorage.setItem('lk_shield', v ? '1' : '0') }, lock: show, setAfter: v => { localStorage.setItem('lk_after', v); if (v === 'never') { const p = sessionStorage.getItem('lynko_priv'); if (p) localStorage.setItem('lynko_priv', p) } else localStorage.removeItem('lynko_priv') }, after: () => localStorage.getItem('lk_after') || 'never' };
})();
