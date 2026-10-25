// LYNKO CHAT: registers the service worker, install button (Android + iOS), offline pill.
(function () {
  // report JS errors to the admin panel (max 5 per page, never throws)
  let sent = 0;
  const report = (msg, stack) => {
    msg = String(msg || '');
    if (sent >= 5 || !msg || msg === 'auth' || /^Script error|ResizeObserver|Failed to fetch|Load failed|NetworkError/i.test(msg)) return;
    sent++;
    try { navigator.sendBeacon('/api/log-error', new Blob([JSON.stringify({ msg: msg.slice(0, 300), stack: String(stack || '').slice(0, 1500), page: location.pathname })], { type: 'application/json' })); } catch {}
  };
  addEventListener('error', e => report(e.message, e.error && e.error.stack));
  addEventListener('unhandledrejection', e => report(e.reason && e.reason.message || e.reason, e.reason && e.reason.stack));
  // ── automatic updates: a new deploy reaches installed apps by itself (no re-install, no manual refresh) ──
  if ('serviceWorker' in navigator) {
    let hadCtl = !!navigator.serviceWorker.controller, pend = false;
    const safe = () => !(window.F && F.inCall && F.inCall()) && !(typeof rc !== 'undefined' && rc) && !document.querySelector('.pvw,.tst,.sv')
      && !(document.getElementById('txt') && document.getElementById('txt').value.trim());      // never interrupt a call, a recording or a half-written message
    const reload = () => {
      if (!pend || !safe()) return;
      let last = 0; try { last = +sessionStorage.getItem('lk_ur') || 0; } catch {}
      if (Date.now() - last < 60e3) return;                               // loop guard
      try { sessionStorage.setItem('lk_ur', Date.now()); sessionStorage.setItem('lk_reload', '1'); } catch {}      // lk_reload: keep the unlocked key, no password prompt
      location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadCtl) { hadCtl = true; return; } pend = true; reload(); setInterval(reload, 5000); });
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
      const chk = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { chk(); reload(); } });
      setInterval(chk, 30 * 60e3); setTimeout(chk, 4000);
    }).catch(() => {}));
  }

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone || /LynkoApp/.test(ua);
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  addEventListener('appinstalled', () => { deferred = null; const b = document.getElementById('inst'); if (b) b.hidden = true; });

  function sheet(title, steps) {
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding:12px;font:500 15px "DM Sans",system-ui,sans-serif';
    o.innerHTML = '<div style="width:100%;max-width:440px;background:#240b1d;color:#fff0f5;border:1px solid rgba(255,255,255,.16);border-radius:22px;padding:22px 20px calc(20px + env(safe-area-inset-bottom))"><h3 style="margin:0 0 12px;font-size:18px"></h3><ol style="margin:0 0 16px;padding-left:20px;line-height:1.7;color:#ffd9e6"></ol><button style="width:100%;border:0;border-radius:14px;padding:13px;font:700 15px inherit;color:#fff;background:linear-gradient(135deg,#ff5c8a,#c14bff);cursor:pointer">OK</button></div>';
    o.querySelector('h3').textContent = title;
    o.querySelector('ol').innerHTML = steps.map(s => '<li>' + s + '</li>').join('');
    o.onclick = e => { if (e.target === o || e.target.tagName === 'BUTTON') o.remove(); };
    document.body.appendChild(o);
  }

  const isAndroid = /android/i.test(ua);
  window.lynkoInstall = async function () {
    if (isAndroid && !standalone) {            // Android: download the real APK (public/lynko.apk) when it exists
      try {
        const r = await fetch('/lynko.apk', { method: 'HEAD', cache: 'no-store' });
        if (r.ok) {
          const a = document.createElement('a'); a.href = '/lynko.apk'; a.download = 'LYNKO-CHAT.apk'; document.body.appendChild(a); a.click(); a.remove();
          return sheet('APK eka download wenawa 📥', [
            'Download eka iwara unata passe notification eka / Downloads eke <b>LYNKO-CHAT.apk</b> open karanna',
            'Phone eka ahuwoth <b>Allow from this source</b> on karanna',
            '<b>Install</b> thotanna — LYNKO CHAT app eka hadenawa ✅']);
        }
      } catch {}
    }
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch {} deferred = null; return; }
    if (isIOS) return sheet('iPhone / iPad ekata install karanna', [
      'Safari eke me page eka open karanna (Chrome nam ⋯ → Open in Safari)',
      'Pahala <b>Share ⬆</b> button eka thotanna',
      '<b>Add to Home Screen</b> thotanna',
      '<b>Add</b> thotanna — LYNKO CHAT icon eka home screen ekata enawa ✅']);
    sheet('Install karanna', [
      'Browser menu eka (⋮) open karanna',
      '<b>Install app</b> / <b>Add to Home screen</b> thotanna',
      'Confirm karanna — LYNKO CHAT app eka add wenawa ✅',
      '<i>Facebook/Instagram wage in-app browser nam, Chrome eke open karanna.</i>']);
  };

  addEventListener('load', () => {
    const onLogin = location.pathname === '/' || location.pathname === '/index.html';
    if (!standalone) {
      if (onLogin) {                                   // button inside the login card
        const b = document.getElementById('inst');
        if (b) { b.hidden = false; b.onclick = window.lynkoInstall; }
      } else {                                         // chat page: dismissible bottom banner
        let hide = 0; try { hide = +localStorage.getItem('lynko-install-dismissed') || 0; } catch {}
        if (hide < Date.now()) {
          const bar = document.createElement('div');
          const side = document.querySelector('.side'), nav = side && side.querySelector('.nav');
          const look = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:rgba(36,11,29,.97);border:1px solid rgba(255,255,255,.18);color:#fff0f5;font:500 14px "DM Sans",system-ui,sans-serif';
          // in the chat page the banner is a normal row above the bottom nav (never on top of it); other pages keep the floating bar
          bar.style.cssText = nav ? look + ';flex:none;margin:6px 10px' : look + ';position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99999;box-shadow:0 12px 40px rgba(0,0,0,.5);max-width:460px;margin:0 auto';
          bar.innerHTML = '<img src="/icons/icon-192.png" width="40" height="40" style="border-radius:10px"><div style="flex:1;line-height:1.3"><b>LYNKO CHAT app</b><div style="font-size:12px;color:#d6a6ba">Home screen ekata add karanna</div></div><button id="lyGo" style="border:0;border-radius:12px;padding:10px 16px;font:700 14px inherit;color:#fff;background:linear-gradient(135deg,#ff5c8a,#c14bff);cursor:pointer">Install</button><button id="lyX" aria-label="Close" style="border:0;background:none;color:#d6a6ba;font-size:20px;cursor:pointer">✕</button>';
          if (nav) side.insertBefore(bar, nav); else document.body.appendChild(bar);
          bar.querySelector('#lyGo').onclick = () => { window.lynkoInstall(); };
          bar.querySelector('#lyX').onclick = () => { bar.remove(); try { localStorage.setItem('lynko-install-dismissed', Date.now() + 7 * 864e5); } catch {} };
        }
      }
    }
    // offline pill
    const pill = document.createElement('div');
    pill.textContent = '📴 Offline — saved chats pennanawa';
    pill.style.cssText = 'position:fixed;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:100001;padding:6px 14px;border-radius:99px;background:rgba(36,11,29,.95);border:1px solid rgba(255,255,255,.2);color:#ffd9e6;font:500 12.5px "DM Sans",system-ui,sans-serif;pointer-events:none';
    const sync = () => { if (navigator.onLine) pill.remove(); else document.body.appendChild(pill); };
    addEventListener('online', sync); addEventListener('offline', sync); sync();
  });
})();
