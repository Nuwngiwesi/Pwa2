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
    '.ov.sh{z-index:70}' +
    '.lx.ci .bar{justify-content:space-between;position:sticky;top:0;z-index:3}.lx.ci .bar b{flex:1;text-align:center}.lx.ci .bar .sp{width:62px}' +
    '.lx.ci .cin{padding:0 0 calc(30px + env(safe-area-inset-bottom));background:#120510}' +
    '.ci .hero{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 20px 4px}' +
    '.ci .bnw{position:absolute;left:0;right:0;top:0;height:190px;background:linear-gradient(135deg,#7f5cff,#ff5c8a);overflow:hidden;-webkit-mask-image:linear-gradient(#000 45%,transparent);mask-image:linear-gradient(#000 45%,transparent)}' +
    '.ci .bnw.nob{opacity:.4}.ci .bni{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .35s}.ci .bni.on{opacity:1}' +
    '.ci .avw{position:relative;margin-top:84px}.ci .av.big{width:112px;height:112px;font-size:46px;border:4px solid #120510;box-shadow:0 10px 28px rgba(0,0,0,.45)}' +
    '.ci h2{position:relative;margin:12px 0 2px;font-size:25px;font-weight:700;letter-spacing:-.3px;color:#fff0f5;max-width:100%;overflow-wrap:anywhere}' +
    '.ci .sub{position:relative;color:#d6a6ba;font-size:15px}.ci .sub:empty{display:none}' +
    '.ci .acts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:calc(100% - 32px);max-width:528px;margin:18px auto 14px}' +
    '.ci .acts button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px 10px;border:0;border-radius:14px;background:#240b1d;color:#ff7aa2;font-family:inherit;font-weight:600;font-size:12px;line-height:1.2;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.ci .acts button i{font-style:normal;font-size:23px;line-height:1}.ci .acts button:active{background:#33152a}' +
    '.ci .g{width:calc(100% - 32px);max-width:528px;margin:0 auto 12px;background:#240b1d;border-radius:14px;overflow:hidden}' +
    '.ci .ab{padding:12px 16px 14px}.ci .ab small{display:block;color:#d6a6ba;font-size:13px;margin-bottom:3px}.ci .ab div{font-size:16.5px;overflow-wrap:anywhere;white-space:pre-wrap}' +
    '.ci .rw{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:9px 14px;border:0;border-bottom:1px solid rgba(255,255,255,.12);background:none;color:#fff0f5;font:inherit;font-size:16.5px;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.ci .g>.rw:last-child{border-bottom:0}.ci .rw:active{background:rgba(255,255,255,.07)}.ci .rw.nc{cursor:default}.ci .rw.nc:active{background:none}' +
    '.ci .rw .ic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;font-size:17px;flex:none}' +
    '.ci .rw .t{flex:1;min-width:0}.ci .rw .t small{display:block;color:#d6a6ba;font-size:12.5px;line-height:1.35;margin-top:1px}' +
    '.ci .rw .v{color:#d6a6ba;font-size:15.5px;flex:none}.ci .rw.ch::after{content:"\\203A";color:#d6a6ba;font-size:24px;line-height:1;flex:none}' +
    '.ci .rw.red .t{color:#ff6b81}.ci .foot{width:calc(100% - 32px);max-width:528px;margin:4px auto 0;padding:0 16px;color:#d6a6ba;font-size:12.5px;line-height:1.45;text-align:center}' +
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

  // contact info page — WhatsApp (iOS) style: banner + big photo, name, action tiles, grouped cards, block / report
  function contact(c, a) {
    const o = document.createElement('div'); o.className = 'lx ci';
    o.innerHTML = '<div class="bar"><button data-x>‹ Back</button><b>Contact info</b><span class="sp"></span></div>' +
      '<div class="bd cin"><div class="hero"><div class="bnw nob"><img class="bni" alt="" decoding="async"></div><div class="avw"></div><h2></h2><div class="sub"></div><div class="sub n2"></div></div>' +
      '<div class="acts"></div><div class="g"><div class="ab"><small>About</small><div></div></div></div><div class="g info"></div><div class="g sec"></div><div class="g dng"></div>' +
      '<p class="foot">Messages and calls with this contact are end-to-end encrypted. Chats disappear after 24 hours.</p></div>';
    document.body.appendChild(o);
    const q = s => o.querySelector(s), close = f => () => { o.remove(); f && f(); };
    // banner: <img> fades in when decoded (the file is also pre-fetched + cached, so this is usually instant)
    if (c.bnv) { const im = q('.bni'); im.onload = () => { im.classList.add('on'); q('.bnw').classList.remove('nob'); }; im.src = '/api/banner/' + encodeURIComponent(c.id) + '?v=' + c.bnv; }
    q('.avw').innerHTML = a.avatar; q('h2').textContent = c.username;
    q('.sub').textContent = 'ID ' + c.id; q('.n2').textContent = c.orig && c.orig !== c.username ? 'Name on Lynko: ' + c.orig : '';
    q('.ab div').textContent = c.about || 'Hey there! I’m using Lynko';
    const acts = q('.acts');
    [['💬', 'Message', close()], ['📞', 'Call', close(a.call)], ['✏️', 'Edit', close(a.rename)], [a.locked ? '🔓' : '🔒', a.locked ? 'Unlock' : 'Lock', close(a.lock)]].forEach(([ic, t, f]) => {
      const b = document.createElement('button'); b.innerHTML = '<i></i><span></span>'; b.firstChild.textContent = ic; b.lastChild.textContent = t; b.onclick = f; acts.appendChild(b);
    });
    const row = (box, ic, bg, t, { sub = '', val = '', red = 0, chev = 0, nc = 0, on } = {}) => {
      const b = document.createElement(nc ? 'div' : 'button'); b.className = 'rw' + (chev ? ' ch' : '') + (red ? ' red' : '') + (nc ? ' nc' : '');
      b.innerHTML = '<span class="ic"></span><span class="t"><span></span><small></small></span><span class="v"></span>';
      b.children[0].style.background = bg; b.children[0].textContent = ic; b.querySelector('.t span').textContent = t;
      const sm = b.querySelector('small'); sub ? sm.textContent = sub : sm.remove(); b.querySelector('.v').textContent = val; if (!val) b.querySelector('.v').remove();
      if (on) b.onclick = on; q(box).appendChild(b); return b;
    };
    const idr = row('.info', '🆔', '#8e8e93', 'Lynko ID', { val: c.id });
    idr.onclick = () => { try { navigator.clipboard.writeText(c.id); } catch {} idr.querySelector('.v').textContent = 'Copied ✓'; };
    row('.info', '⏱', '#ff9f0a', 'Disappearing messages', { val: '24 hours', nc: 1 });
    row('.sec', '🔒', '#ff5c8a', 'Chat lock', { val: a.locked ? 'On' : 'Off', chev: 1, on: close(a.lock) });
    row('.sec', '🔐', '#34c759', 'Encryption', { sub: 'End-to-end encrypted. Tap to learn more.', chev: 1, on: () => { o.remove(); window.LX.legal && window.LX.legal('privacy'); } });
    if (a.block) row('.dng', '🚫', '#ff3b30', (a.blocked ? 'Unblock ' : 'Block ') + c.username, { red: 1, on: close(a.block) });
    if (a.report) row('.dng', '⚠️', '#ff9f0a', 'Report ' + c.username, { red: 1, on: close(a.report) });
    if (!q('.dng').children.length) q('.dng').remove();
    q('[data-x]').onclick = () => o.remove();
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
