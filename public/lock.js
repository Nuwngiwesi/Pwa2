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
ov.innerHTML = `<div class="lkc"><div class="lklogo">Lynko<i>♥</i></div><div class="lkav" id="lkav"></div><h3 id="lkn"></h3><p>Enter your password to open the app</p>
<input id="lkp" type="password" placeholder="Password" autocomplete="current-password"><button class="lkgo" id="lkgo">Unlock</button><div id="lkerr"></div><button class="lkout" id="lkout">Not you? Log out</button></div>`;
document.body.appendChild(ov);

function show() {
  locked = true; ov.hidden = false;
  const n = localStorage.getItem('lynko_name') || '';
  $('lkn').textContent = n; $('lkav').textContent = (n || '♥')[0].toUpperCase(); $('lkp').value = ''; $('lkerr').textContent = '';
  setTimeout(() => $('lkp').focus(), 60);
}
async function unlock() {
  const w = wait('app'); if (w) { $('lkerr').textContent = `Too many tries. Wait ${w}s`; return }
  const pw = $('lkp').value; if (!pw) return;
  $('lkgo').disabled = true; $('lkerr').textContent = '';
  const priv = await checkPw(pw);
  $('lkgo').disabled = false;
  if (!priv) { fail('app'); $('lkp').value = ''; const w2 = wait('app'); $('lkerr').textContent = w2 ? `Wrong password. Wait ${w2}s` : 'Wrong password'; return }
  clear('app'); sessionStorage.setItem('lynko_priv', priv);
  locked = false; ov.hidden = true; $('lkp').value = ''; resolveReady();
}
$('lkgo').onclick = unlock; $('lkp').addEventListener('keydown', e => { if (e.key == 'Enter') unlock() });
$('lkout').onclick = async () => {
  if (!confirm('Log out of this phone? You will need your password to log in again.')) return;
  try { await fetch('/api/logout', { method: 'POST' }) } catch {}
  localStorage.removeItem('lynko_enc'); sessionStorage.clear(); try { await caches.delete('lynko-api-v2') } catch {} location.href = '/';
};

// first load: no unlocked key in this session = the app was closed -> ask for the password
if (!localStorage.getItem('lynko_enc')) resolveReady();                 // not logged in: main script sends you to the login page
else if (sessionStorage.getItem('lynko_priv')) resolveReady();          // same session (e.g. opened from a notification while running)
else show();

// ───────────── lock again after leaving the app ─────────────
const AFTER = { now: 10e3, '1m': 60e3, '10m': 600e3 };      // "right away" keeps a 10 s grace for the camera / file picker
const grace = () => AFTER[localStorage.getItem('lk_after') || 'now'] ?? 10e3;
document.addEventListener('click', e => { if (e.target && e.target.type == 'file') sessionStorage.setItem('lk_skip', Date.now() + 180e3) }, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (!locked) sessionStorage.setItem('lk_hid', Date.now()); return }
  const h = +sessionStorage.getItem('lk_hid') || 0; sessionStorage.removeItem('lk_hid');
  if (!h || locked || !localStorage.getItem('lynko_enc')) return;
  const away = Date.now() - h, busy = window.F && F.inCall && F.inCall();
  if (away > 10e3 && chat.open) chat.relock();                            // locked chats close quickly
  if (away > grace() && Date.now() > (+sessionStorage.getItem('lk_skip') || 0) && !busy) { chat.relock(); show() }
});
addEventListener('pagehide', () => { sessionStorage.removeItem('lynko_priv') });   // closing the app forgets the unlocked key

// ───────────── Locked chats (like WhatsApp) ─────────────
const LKEY = () => 'lynko_locked:' + uid(), PKEY = () => 'lynko_cpin:' + uid();
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
const askPw = title => new Promise(res => {
  const o = document.createElement('div'); o.className = 'ov'; o.style.zIndex = 900;
  o.innerHTML = '<div class="dlg"><h3></h3><input type="password" autocomplete="current-password" placeholder="Password" style="width:100%"><div class="r"><button class="no">Cancel</button><button class="ok">OK</button></div></div>';
  o.querySelector('h3').textContent = title; document.body.appendChild(o);
  const i = o.querySelector('input'); i.focus(); const done = v => { o.remove(); res(v) };
  o.querySelector('.no').onclick = () => done(null); o.querySelector('.ok').onclick = () => done(i.value);
  i.addEventListener('keydown', e => { if (e.key == 'Enter') done(i.value) });
});
async function newPin() {
  const a = await ask('Create a chat-lock PIN (4–6 digits)', { pin: true, ok: 'Next' }); if (a === null) return false;
  if (!/^\d{4,6}$/.test(a)) { say('PIN must be 4–6 digits'); return false }
  const b = await ask('Repeat the PIN', { pin: true, ok: 'Save' }); if (b === null) return false;
  if (a !== b) { say('PINs don’t match'); return false }
  const salt = hex(crypto.getRandomValues(new Uint8Array(8)));
  localStorage.setItem(PKEY(), JSON.stringify({ s: salt, h: await sha(a + ':' + salt) })); clear('pin'); say('Chat-lock PIN saved'); return true;
}
const chat = {
  open: false,
  has: id => ids().has(id),
  count: () => ids().size,
  list: () => [...ids()],
  isOpen: () => chat.open,
  async gate() {   // true once the Locked chats folder is open
    if (chat.open) return true;
    if (!localStorage.getItem(PKEY())) { if (!(await newPin())) return false }
    else {
      const w = wait('pin'); if (w) { say(`Too many tries. Wait ${w}s`); return false }
      const p = await ask('Enter your chat-lock PIN', { pin: true }); if (p === null) return false;
      const rec = JSON.parse(localStorage.getItem(PKEY()));
      if (await sha(p + ':' + rec.s) !== rec.h) { fail('pin'); say(tries('pin').n >= 3 ? 'Wrong PIN · forgot it? Profile → Reset chat-lock PIN' : 'Wrong PIN'); return false }
      clear('pin');
    }
    chat.open = true; return true;
  },
  relock() {
    if (!chat.open) return; chat.open = false;
    try { if (cur && chat.has(cur)) closeChat(); if (flt == 'locked') renderList() } catch {}
  },
  async toggle(id) {   // ⋮ menu inside a chat
    if (!(await chat.gate())) return;
    const s = ids();
    if (s.has(id)) { s.delete(id); save(s); say('Chat unlocked'); renderList(); return }
    s.add(id); save(s); say('Chat locked · find it under Locked chats'); closeChat(); renderList();
  },
  row() {   // folder row shown at the top of the chat list
    const b = document.createElement('button'); b.className = 'item';
    b.innerHTML = '<div class="av" style="background:linear-gradient(135deg,#7f5cff,#ff5c8a);font-size:22px">🔒</div><div class="n"><div class="r1"><b>Locked chats</b></div><div class="r2"><span class="pv"></span></div></div>';
    b.querySelector('.pv').textContent = chat.count() + (chat.count() == 1 ? ' chat' : ' chats');
    b.onclick = async () => { if (await chat.gate()) document.querySelector('#chips [data-f=locked]').click() };
    return b;
  },
  async resetPin() {   // forgot the PIN: prove it's you with the account password
    const w = wait('app'); if (w) return say(`Too many tries. Wait ${w}s`);
    const pw = await askPw('Enter your account password'); if (pw === null) return;
    if (!(await checkPw(pw))) { fail('app'); return say('Wrong password') }
    clear('app'); if (await newPin()) chat.open = false;
  },
};
migrate();

window.LOCK = { ready, chat, checkPw, lock: show, setAfter: v => localStorage.setItem('lk_after', v), after: () => localStorage.getItem('lk_after') || 'now' };
})();
