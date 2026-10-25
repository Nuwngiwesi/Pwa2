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
  window.LX = { help, legal };
})();
