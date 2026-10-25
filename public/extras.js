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

  // ───────────── Movie Bot (TMDB: info only) ─────────────
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const botSt = document.createElement('style');
  botSt.textContent = '.lx .card{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:#33152a;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:8px;margin:6px 0;color:#fff0f5;font:inherit;cursor:pointer}' +
    '.lx .card img,.lx .ph{width:52px;height:78px;border-radius:10px;object-fit:cover;background:#4a1d3d;flex:none}.lx .card small{display:block;color:#d6a6ba}' +
    '.lx .det{background:#33152a;border-radius:18px;overflow:hidden;margin:8px 0}.lx .det .hd{display:flex;gap:12px;padding:12px}.lx .det .hd img{width:110px;border-radius:12px;flex:none}' +
    '.lx .det p{margin:6px 12px;font-size:14.5px;color:#ffd9e6}.lx .det .lbl{color:#d6a6ba;font-size:12px;margin:8px 12px 0;text-transform:uppercase;letter-spacing:.4px}' +
    '.lx .det a{display:inline-block;margin:8px 12px 12px;padding:10px 16px;border-radius:14px;background:linear-gradient(135deg,#ff5c8a,#c14bff);color:#fff;text-decoration:none;font-weight:700}' +
    '#lxAi{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:30;width:54px;height:54px;border:0;border-radius:18px;font-size:26px;cursor:pointer;color:#fff;background:linear-gradient(135deg,#7f5cff,#ff5c8a);box-shadow:0 8px 24px rgba(127,92,255,.45)}#lxAi:active{transform:scale(.94)}#lxAi[hidden]{display:none}';
  document.head.appendChild(botSt);
  const poster = (p, sz) => p ? '<img loading="lazy" alt="" src="/api/movies/img/' + sz + p + '">' : '<div class="ph"></div>';
  const getJ = async u => { const r = await fetch(u); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d; };
  function movies() {
    const o = mk('🎬 Movie Bot');
    o.insertAdjacentHTML('beforeend', '<div class="bd" id="mvb"></div><div class="in"><input id="mvi" placeholder="Search a movie or series…" maxlength="80" enterkeyhint="search"><button id="mvs">Search</button></div>');
    const bd = o.querySelector('#mvb'), inp = o.querySelector('#mvi'); let busy = false;
    const bub = (c, t) => { const d = document.createElement('div'); d.className = 'm ' + c; d.textContent = t; bd.appendChild(d); bd.scrollTop = bd.scrollHeight; return d; };
    bub('a', 'Hi! 🎬 Movie ekak hari series ekak hari nama type karanna — poster, rating, cast, trailer, kohe balanna puluwandha kiyala pennannam.\n(Info witharai — movie download karanne na.)');
    async function search(q) {
      q = q.trim(); if (!q || busy) return; busy = true; inp.value = ''; bub('u', q); const w = bub('a', 'Searching…');
      try {
        const r = await getJ('/api/movies/search?q=' + encodeURIComponent(q));
        if (!r.length) { w.textContent = 'Mukuth hambuna na 😕 Wena namakin try karanna.'; busy = false; return; }
        w.textContent = 'Mewa hambuna — thotanna:';
        r.forEach(x => { const b = document.createElement('button'); b.className = 'card'; b.innerHTML = poster(x.poster, 'w92') + '<div><b>' + esc(x.title) + '</b> ' + esc(x.year ? '(' + x.year + ')' : '') + '<small>' + (x.type == 'tv' ? '📺 Series' : '🎬 Movie') + (x.rating ? ' · ⭐ ' + x.rating : '') + '</small></div>'; b.onclick = () => details(x); bd.appendChild(b); });
      } catch (e) { w.textContent = '⚠️ ' + e.message; }
      bd.scrollTop = bd.scrollHeight; busy = false;
    }
    async function details(x) {
      if (busy) return; busy = true; bub('u', x.title); const w = bub('a', 'Loading…');
      try {
        const d = await getJ('/api/movies/' + x.type + '/' + x.id); w.remove();
        const el = document.createElement('div'); el.className = 'det';
        const wh = d.where ? [d.where.stream.length ? 'Stream: ' + d.where.stream.join(', ') : '', d.where.rent.length ? 'Rent: ' + d.where.rent.join(', ') : '', d.where.buy.length ? 'Buy: ' + d.where.buy.join(', ') : ''].filter(Boolean).join(' · ') + ' (' + d.where.region + ')' : '';
        el.innerHTML = '<div class="hd">' + poster(d.poster, 'w342') + '<div><b style="font-size:18px">' + esc(d.title) + '</b><br><span style="color:#d6a6ba">' + esc([d.year, d.runtime ? d.runtime + ' min' : '', d.seasons ? d.seasons + ' season' + (d.seasons > 1 ? 's' : '') : ''].filter(Boolean).join(' · ')) + '</span><br>' + (d.rating ? '⭐ ' + d.rating + ' <span style="color:#d6a6ba">(' + d.votes + ')</span><br>' : '') + '<span style="color:#d6a6ba">' + esc(d.genres.join(', ')) + '</span></div></div>' +
          (d.tagline ? '<p><i>' + esc(d.tagline) + '</i></p>' : '') + (d.overview ? '<div class="lbl">Story</div><p>' + esc(d.overview) + '</p>' : '') +
          (d.director ? '<div class="lbl">Director</div><p>' + esc(d.director) + '</p>' : '') + (d.cast.length ? '<div class="lbl">Cast</div><p>' + esc(d.cast.join(', ')) + '</p>' : '') +
          (wh ? '<div class="lbl">Where to watch</div><p>' + esc(wh) + '</p>' : '<div class="lbl">Where to watch</div><p>No info for your region.</p>') +
          (d.trailer ? '<a href="' + esc(d.trailer) + '" target="_blank" rel="noopener">▶ Watch trailer</a>' : '') + '<div class="lbl" style="margin-bottom:10px">Data: TMDB</div>';
        bd.appendChild(el);
      } catch (e) { w.textContent = '⚠️ ' + e.message; }
      bd.scrollTop = bd.scrollHeight; busy = false;
    }
    o.querySelector('#mvs').onclick = () => search(inp.value);
    inp.addEventListener('keydown', e => { if (e.key == 'Enter') search(inp.value); });
    setTimeout(() => inp.focus(), 100);
  }
  const botShown = (qs, flt) => (flt == 'all' || !flt) && (!qs || 'movie bot'.includes(qs));
  const botItem = () => {
    const b = document.createElement('button'); b.className = 'item';
    b.innerHTML = '<div class="av" style="background:linear-gradient(135deg,#ff9f0a,#ff5c8a);font-size:20px">🎬</div><div class="n"><div class="r1"><b>Movie Bot<i class="tag" style="background:#ff9f0a">BOT</i></b><time></time></div><div class="r2"><span class="pv">Search movies &amp; series 🎬</span></div></div>';
    b.onclick = movies; return b;
  };
  window.LX = { help, legal, movies, botShown, botItem };

  // floating ✨ Lynko AI button (like Meta AI in WhatsApp) — only on the chat list
  addEventListener('load', () => {
    const f = document.createElement('button'); f.id = 'lxAi'; f.hidden = true; f.type = 'button'; f.textContent = '✨'; f.setAttribute('aria-label', 'Lynko AI');
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
