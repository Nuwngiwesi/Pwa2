// LYNKO CHAT: Help center (AI) + Terms / Privacy viewer. window.LX = { help(), legal(name) }
(function () {
  const css = document.createElement('style');
  css.textContent = '.lx{position:fixed;inset:0;z-index:60;background:#120510;display:flex;flex-direction:column;color:#fff0f5;font:16px/1.5 "DM Sans",system-ui,sans-serif}' +
    '.lx .bar{display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top)) 12px 8px;background:rgba(18,5,16,.9);border-bottom:1px solid rgba(255,255,255,.12)}' +
    '.lx .bar button{background:none;border:0;color:#ff5c8a;font-size:17px;padding:8px 6px;cursor:pointer}.lx .bar b{font-size:17px}' +
    '.lx .bd{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 18px 24px}' +
    '.lx .bd h1{font-size:26px;margin:0 0 4px}.lx .bd h2{font-size:17px;color:#ffb38a;margin:22px 0 4px}.lx .bd p{margin:6px 0;color:#ffd9e6}.lx .bd .d{color:#d6a6ba;font-size:13px}' +
    '.lx .m{max-width:86%;margin:8px 0;padding:10px 13px;border-radius:18px;white-space:pre-wrap;word-break:break-word}.lx .m.u{margin-left:auto;background:linear-gradient(135deg,#ff5c8a,#c14bff);color:#fff}.lx .m.a{background:#33152a}' +
    '.lx .chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.lx .chips button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#ffd9e6;border-radius:99px;padding:8px 12px;font:inherit;font-size:14px;cursor:pointer}' +
    '.lx .in{display:flex;gap:8px;padding:8px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.12)}.lx .in input{flex:1;font:16px inherit;color:#fff0f5;background:#33152a;border:1px solid rgba(255,255,255,.14);border-radius:22px;padding:11px 16px;outline:0}' +
    '.lx .in button{border:0;border-radius:22px;padding:0 18px;font:700 15px inherit;color:#fff;background:linear-gradient(135deg,#ff5c8a,#c14bff);cursor:pointer}';
  document.head.appendChild(css);
  const mk = title => {
    const o = document.createElement('div'); o.className = 'lx';
    o.innerHTML = '<div class="bar"><button data-x>‹ Back</button><b></b></div>';
    o.querySelector('b').textContent = title; o.querySelector('[data-x]').onclick = () => o.remove();
    document.body.appendChild(o); return o;
  };
  addEventListener('popstate', () => document.querySelectorAll('.lx').forEach(x => x.remove()));

  function legal(name) {
    const o = mk(name == 'terms' ? 'Terms of Service' : 'Privacy Policy');
    const bd = document.createElement('div'); bd.className = 'bd'; bd.textContent = 'Loading…'; o.appendChild(bd);
    fetch('/api/legal/' + name).then(r => r.ok ? r.text() : Promise.reject()).then(h => { bd.innerHTML = h; }).catch(() => { bd.textContent = 'Could not load. Check your connection.'; });
  }

  function help() {
    const o = mk('🆘 Help center');
    o.insertAdjacentHTML('beforeend', '<div class="bd" id="lxb"></div><div class="in"><input id="lxi" placeholder="Ask anything about Lynko…" maxlength="400" enterkeyhint="send"><button id="lxs">Send</button></div>');
    const bd = o.querySelector('#lxb'), inp = o.querySelector('#lxi'), hist = [];
    const bub = (cls, t) => { const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = t; bd.appendChild(d); bd.scrollTop = bd.scrollHeight; return d; };
    bub('a', 'Hi! 👋 Mama Lynko Help Center eka. Oyata one deyak ahanna (Sinhala / English).');
    const ch = document.createElement('div'); ch.className = 'chips';
    ['Contact eka rename karanne kohomada?', 'APK eka install karanne kohomada?', 'Chat lock eka kohomada?', 'Messages 24h walin kenekata nadda?'].forEach(q => { const b = document.createElement('button'); b.textContent = q; b.onclick = () => { ch.remove(); send(q); }; ch.appendChild(b); });
    bd.appendChild(ch);
    let busy = false;
    async function send(t) {
      t = (t || '').trim(); if (!t || busy) return; busy = true; inp.value = '';
      bub('u', t); hist.push({ role: 'user', content: t });
      const el = bub('a', '…'); let acc = '';
      try {
        const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ help: true, messages: hist.slice(-10) }) });
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Help is not available right now'); }
        const rd = r.body.getReader(), dc = new TextDecoder();
        for (;;) { const { done, value } = await rd.read(); if (done) break; acc += dc.decode(value, { stream: true }); el.textContent = acc.replace(/\*\*/g, '') || '…'; bd.scrollTop = bd.scrollHeight; }
        hist.push({ role: 'assistant', content: acc });
      } catch (e) { el.textContent = '⚠️ ' + e.message; hist.pop(); }
      busy = false;
    }
    o.querySelector('#lxs').onclick = () => send(inp.value);
    inp.addEventListener('keydown', e => { if (e.key == 'Enter') send(inp.value); });
  }

  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st2 = document.createElement('style');
  st2.textContent = '.pbn{width:100%;aspect-ratio:3/1;border-radius:18px;background:linear-gradient(135deg,#7f5cff,#ff5c8a) center/cover;display:grid;place-items:center;color:#fff;font-size:13px;cursor:pointer;margin-bottom:-6px}' +
    '.lx.cr{background:#000;z-index:90}.lx .cs{flex:1;display:grid;place-items:center;padding:16px;touch-action:none}.lx .cb{overflow:hidden;background:#222;box-shadow:0 0 0 2000px rgba(0,0,0,.62);touch-action:none}.lx .cb.round{border-radius:50%}.lx .cb canvas{display:block;touch-action:none;cursor:grab}' +
    '.lx .zr{display:flex;align-items:center;gap:12px;padding:12px 22px calc(18px + env(safe-area-inset-bottom));color:#fff0f5}.lx .zr input{flex:1;accent-color:#ff5c8a}' +
    '.lx .pg .bn{height:150px;background:linear-gradient(135deg,#7f5cff,#ff5c8a) center/cover}.lx .pg .id{display:flex;flex-direction:column;align-items:center;margin-top:-52px;padding:0 20px;text-align:center}' +
    '.lx .pg .av.big{width:104px;height:104px;font-size:42px;border:4px solid #120510;box-shadow:0 8px 24px rgba(0,0,0,.4)}.lx .pg h2{margin:12px 0 2px;font-size:24px;color:#fff0f5}.lx .pg .ab{color:#ffd9e6;max-width:420px;margin:6px 0 14px}' +
    '.lx .pg .row{display:flex;gap:10px;justify-content:center;margin:6px 0 18px;flex-wrap:wrap}.lx .pg .row button{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff0f5;border-radius:16px;padding:11px 16px;font:600 14px inherit;cursor:pointer}' +
    '.lx .pg .box{margin:0 16px 12px;max-width:520px;align-self:center;background:#33152a;border-radius:16px;padding:12px 16px}.lx .pg .box small{display:block;color:#d6a6ba;font-size:12px;text-transform:uppercase;letter-spacing:.4px}' +
    '#lxAi{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:30;width:56px;height:56px;padding:0;overflow:hidden;border:2px solid rgba(255,255,255,.25);border-radius:19px;font-size:26px;cursor:pointer;color:#fff;background:linear-gradient(135deg,#7f5cff,#ff5c8a);box-shadow:0 8px 24px rgba(127,92,255,.45)}#lxAi img{width:100%;height:100%;object-fit:cover;display:block}#lxAi:active{transform:scale(.94)}#lxAi[hidden]{display:none}';
  document.head.appendChild(st2);

  // crop a picked photo: drag to move, slider / pinch to zoom → returns base64 JPEG (no prefix) or null
  function crop(file, ratio, outW, title) {
    return new Promise(async res => {
      let bm; try { bm = await createImageBitmap(file); } catch { return res(null); }
      const o = document.createElement('div'); o.className = 'lx cr';
      o.innerHTML = '<div class="bar"><button data-c>Cancel</button><b style="flex:1;text-align:center"></b><button data-ok style="font-weight:700">Use</button></div><div class="cs"><div class="cb' + (ratio == 1 ? ' round' : '') + '"><canvas></canvas></div></div><div class="zr"><span>🔍</span><input type="range" min="1" max="4" step="0.01" value="1"></div>';
      o.querySelector('b').textContent = title || 'Crop'; document.body.appendChild(o);
      const cs = o.querySelector('.cs'), cb = o.querySelector('.cb'), cv = o.querySelector('canvas'), zr = o.querySelector('input'), ctx = cv.getContext('2d');
      const bw = Math.min(cs.clientWidth - 32, ratio == 1 ? 320 : 640), bh = bw / ratio, dpr = Math.min(2, devicePixelRatio || 1);
      cb.style.width = bw + 'px'; cb.style.height = bh + 'px'; cv.width = bw * dpr; cv.height = bh * dpr; cv.style.width = bw + 'px'; cv.style.height = bh + 'px';
      const base = Math.max(bw / bm.width, bh / bm.height); let z = 1, cx = bm.width / 2, cy = bm.height / 2;
      const clamp = () => { const sw = bw / (base * z), sh = bh / (base * z); cx = Math.max(sw / 2, Math.min(bm.width - sw / 2, cx)); cy = Math.max(sh / 2, Math.min(bm.height - sh / 2, cy)); return [cx - sw / 2, cy - sh / 2, sw, sh]; };
      const draw = (c, w, h) => { const [sx, sy, sw, sh] = clamp(); c.drawImage(bm, sx, sy, sw, sh, 0, 0, w, h); };
      const paint = () => draw(ctx, cv.width, cv.height); paint();
      zr.oninput = () => { z = +zr.value; paint(); };
      const P = new Map(); let d0 = 0, z0 = 1;
      cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); P.set(e.pointerId, [e.clientX, e.clientY]); if (P.size == 2) { const [a, b] = [...P.values()]; d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); z0 = z; } };
      cv.onpointermove = e => {
        if (!P.has(e.pointerId)) return; const old = P.get(e.pointerId); P.set(e.pointerId, [e.clientX, e.clientY]);
        if (P.size == 2) { const [a, b] = [...P.values()]; z = Math.max(1, Math.min(4, z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / (d0 || 1))); zr.value = z; }
        else { cx -= (e.clientX - old[0]) / (base * z); cy -= (e.clientY - old[1]) / (base * z); }
        paint();
      };
      cv.onpointerup = cv.onpointercancel = e => P.delete(e.pointerId);
      cv.onwheel = e => { e.preventDefault(); z = Math.max(1, Math.min(4, z - e.deltaY / 500)); zr.value = z; paint(); };
      const close = v => { o.remove(); try { bm.close(); } catch {} res(v); };
      o.querySelector('[data-c]').onclick = () => close(null);
      o.querySelector('[data-ok]').onclick = () => {
        const out = document.createElement('canvas'); out.width = outW; out.height = Math.round(outW / ratio); draw(out.getContext('2d'), out.width, out.height);
        close(out.toDataURL('image/jpeg', ratio == 1 ? .85 : .78).split(',')[1]);
      };
    });
  }

  // contact info page: banner, big photo, name, about, ID, actions
  function contact(c, a) {
    const o = document.createElement('div'); o.className = 'lx';
    o.innerHTML = '<div class="bar"><button data-x>‹ Back</button><b>Contact info</b></div><div class="bd pg" style="padding:0;display:flex;flex-direction:column"><div class="bn"></div><div class="id"><div class="avw"></div><h2></h2><div class="nm2" style="color:#d6a6ba;font-size:13px"></div></div></div>';
    const pg = o.querySelector('.pg'); document.body.appendChild(o);
    if (c.bnv) o.querySelector('.bn').style.backgroundImage = 'url(/api/banner/' + encodeURIComponent(c.id) + '?v=' + c.bnv + ')';
    o.querySelector('.avw').innerHTML = a.avatar; o.querySelector('h2').textContent = c.username;
    if (c.orig && c.orig !== c.username) o.querySelector('.nm2').textContent = 'Name on Lynko: ' + c.orig;
    const mkBox = (l, t) => { const d = document.createElement('div'); d.className = 'box'; d.innerHTML = '<small></small><div></div>'; d.firstChild.textContent = l; d.lastChild.textContent = t; return d; };
    const row = document.createElement('div'); row.className = 'row';
    [['💬 Message', () => {}], ['📞 Call', a.call], ['✏️ Rename', a.rename], [a.locked ? '🔓 Unlock chat' : '🔒 Lock chat', a.lock]].forEach(([t, f]) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { o.remove(); f && f(); }; row.appendChild(b); });
    pg.appendChild(row); pg.appendChild(mkBox('About', c.about || 'Hey there! I’m using Lynko')); const idb = mkBox('Lynko ID · tap to copy', c.id); idb.onclick = () => { try { navigator.clipboard.writeText(c.id); } catch {} idb.firstChild.textContent = 'Copied ✓'; }; pg.appendChild(idb);
    o.querySelector('[data-x]').onclick = () => o.remove();
  }
  window.LX = { help, legal, crop, contact };

  // floating ✨ Lynko AI button (like Meta AI in WhatsApp) — only on the chat list
  addEventListener('load', () => {
    const f = document.createElement('button'); f.id = 'lxAi'; f.hidden = true; f.type = 'button'; f.innerHTML = '<img src="/img/ai.png" alt="">'; f.firstChild.onerror = () => { f.textContent = '✨'; }; f.setAttribute('aria-label', 'Lynko AI');
    f.onclick = () => { try { F.openAI(); } catch {} };
    document.body.appendChild(f);
    const upd = () => {
      let ok = false;
      try { ok = !!(window.F && F.aiOn()) && tab == 'chats' && !document.getElementById('app').classList.contains('chatting') && !document.getElementById('setov') && !document.querySelector('.lx,.ov,.pvw,.sv'); } catch {}
      f.hidden = !ok;
    };
    new MutationObserver(upd).observe(document.body, { childList: true });
    new MutationObserver(upd).observe(document.getElementById('app'), { attributes: true, attributeFilter: ['class'] });
    try { const st = setTab; setTab = function (t) { st(t); upd(); }; } catch {}
    setTimeout(upd, 800); setTimeout(upd, 2500);
  });
})();
