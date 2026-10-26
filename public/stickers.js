// LYNKO CHAT — cute & romantic sticker packs (original vector art, drawn in code: nothing to download).
// A sticker is sent as a tiny encrypted text message {k:'text', v:'😘', st:'bear-kiss'}; the receiver draws it from the id.
(function () {
  const INK = '#3b2a2a', FONT = "'Baloo 2','Comic Sans MS','Segoe UI',system-ui,sans-serif";
  const ST = ' stroke="rgba(110,50,60,.25)" stroke-width="1.6"';
  const heart = (x, y, s, c = '#ff4d7d') => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 6C-14-4-9-15 0-8 9-15 14-4 0 6Z" fill="${c}"/>`;
  const arc = (x, y, up) => `<path d="M${x - 6} ${y}Q${x} ${y + (up ? -8 : 8)} ${x + 6} ${y}" stroke="${INK}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3.8" fill="${INK}"/><circle cx="${x + 1.2}" cy="${y - 1.3}" r="1.2" fill="#fff"/>`;
  const tear = x => `<path d="M${x} 60q-4.5 7-.5 10 4.5-2 .5-10z" fill="#6ec6ff"/>`;
  const cap = (t, x, y, s = 15) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="${s}" fill="#e0245e" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${t}</text>`;

  const CH = {
    bear: { c: '#c98a5b', d: '#f6dcc2', nose: INK, muzzle: 1, ears: (c, d) => [33, 87].map(x => `<circle cx="${x}" cy="29" r="12" fill="${c}"${ST}/><circle cx="${x}" cy="30" r="6.5" fill="${d}"/>`).join('') },
    bunny: { c: '#fff6fa', d: '#ffc4d6', nose: '#ff7fa3', ears: (c, d) => [44, 76].map(x => `<ellipse cx="${x}" cy="17" rx="9" ry="22" fill="${c}"${ST}/><ellipse cx="${x}" cy="19" rx="4.6" ry="15" fill="${d}"/>`).join('') },
    cat: { c: '#ffb35c', d: '#fff0d9', nose: '#ff7fa3', whisk: 1, ears: c => `<path d="M28 46L29 12L55 30Z" fill="${c}"${ST}/><path d="M92 46L91 12L65 30Z" fill="${c}"${ST}/><path d="M33 36L34 21L46 29Z" fill="#ff9fb5"/><path d="M87 36L86 21L74 29Z" fill="#ff9fb5"/>` },
    chick: { c: '#ffe066', d: '#fff3b0', beak: 1, ears: c => `<path d="M52 27Q49 13 56 18Q60 7 64 18Q71 13 68 27Z" fill="${c}"${ST}/>` },
  };
  const KINDS = {   // kind -> [eyes, mouth, caption, emoji]
    luv: ['love', 'open', 'Love you', '😍'], kiss: ['happy', 'pucker', 'Muah!', '😘'], hug: ['happy', 'smile', 'Hug me', '🤗'], miss: ['cry', 'sad', 'Miss you', '🥺'],
    night: ['sleep', 'smile', 'Good night', '😴'], rose: ['wink', 'smile', 'For you', '🌹'], hi: ['happy', 'open', 'Hi baby', '👋'], bemine: ['dot', 'smile', 'Be mine', '💖'],
  };
  const moon = '<path d="M96 8a13 13 0 1 0 9 22 10 10 0 1 1-9-22z" fill="#ffd966"/>';
  const zz = '<text x="76" y="24" font-size="13" font-weight="800" fill="#7b6cff" font-family="' + FONT + '">z</text><text x="86" y="14" font-size="9" font-weight="800" fill="#7b6cff" font-family="' + FONT + '">z</text>';
  const PROPS = {
    luv: () => heart(92, 22, 2.1) + heart(22, 30, 1.1) + heart(102, 48, .9),
    kiss: () => heart(106, 46, 1.5) + heart(102, 14, 1) + heart(16, 22, .9),
    hug: () => heart(60, 9, 1.5) + heart(22, 22, .9) + heart(100, 22, .9),
    miss: () => heart(92, 24, 1.5, '#b7b3c9'),
    night: () => moon + zz,
    rose: () => '<path d="M91 118Q90 106 88 96" stroke="#3aa655" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M90 108q9-2 11-9-8 0-11 9z" fill="#4fc36a"/><circle cx="88" cy="90" r="9.5" fill="#ff3b6b"/><path d="M88 84q7 2 3.5 8-7 3-9-3" stroke="#c4194a" fill="none" stroke-width="1.8" stroke-linecap="round"/>' + heart(24, 24, 1),
    hi: (c) => `<ellipse cx="92" cy="76" rx="6.5" ry="11" transform="rotate(-38 92 76)" fill="${c}"${ST}/><path d="M101 55q5 3 4 9M106 49q7 4 6 12" stroke="#ff7fa3" stroke-width="3" fill="none" stroke-linecap="round"/>` + heart(24, 24, 1),
    bemine: () => heart(60, 100, 2.4) + heart(100, 26, 1) + heart(20, 34, .8),
  };
  function face(k, kind, C) {
    const [e, m] = KINDS[kind];
    let s = '';
    if (C.muzzle) s += `<ellipse cx="60" cy="66" rx="13" ry="9.5" fill="${C.d}"/>`;
    s += `<ellipse cx="37" cy="65" rx="6" ry="3.6" fill="#ff8fab" opacity=".6"/><ellipse cx="83" cy="65" rx="6" ry="3.6" fill="#ff8fab" opacity=".6"/>`;
    s += { love: heart(46, 54, .85, '#ff2d6f') + heart(74, 54, .85, '#ff2d6f'), happy: arc(46, 55, 1) + arc(74, 55, 1), sleep: arc(46, 53, 0) + arc(74, 53, 0),
      cry: dot(46, 54) + dot(74, 54) + tear(43) + tear(77), wink: dot(46, 54) + arc(74, 55, 1), dot: dot(46, 54) + dot(74, 54) }[e];
    if (C.beak) s += '<path d="M53 62Q60 58 67 62Q60 72 53 62Z" fill="#ff9f43"/>';
    else {
      s += `<ellipse cx="60" cy="62" rx="4" ry="3" fill="${C.nose}"/>`;
      if (C.whisk) s += '<path d="M30 62L16 58M30 68L16 70M90 62L104 58M90 68L104 70" stroke="#b07a4a" stroke-width="1.8" stroke-linecap="round"/>';
      s += { smile: `<path d="M53 67Q60 75 67 67" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
        open: '<path d="M52 66Q60 82 68 66Z" fill="#b8324f"/><path d="M55 74Q60 70 65 74Q60 79 55 74Z" fill="#ff8fa3"/>',
        pucker: '<ellipse cx="60" cy="70" rx="3.4" ry="4" fill="#ff4d7d"/>', sad: `<path d="M54 73Q60 66 66 73" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>` }[m];
    }
    return s;
  }
  function chr(k, kind, o) {
    o = o || {}; const C = CH[k], c = C.c, d = C.d;
    const arms = kind === 'hug' ? `<path d="M36 90Q60 118 84 90" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round"/>`
      : `<ellipse cx="37" cy="93" rx="7" ry="11" transform="rotate(15 37 93)" fill="${c}"${ST}/><ellipse cx="83" cy="93" rx="7" ry="11" transform="rotate(-15 83 93)" fill="${c}"${ST}/>`;
    return C.ears(c, d) + `<ellipse cx="60" cy="96" rx="22" ry="17" fill="${c}"${ST}/><ellipse cx="60" cy="100" rx="13" ry="10" fill="${d}"/><ellipse cx="46" cy="111" rx="9" ry="5.5" fill="${c}"${ST}/><ellipse cx="74" cy="111" rx="9" ry="5.5" fill="${c}"${ST}/>`
      + arms + `<circle cx="60" cy="56" r="32" fill="${c}"${ST}/>` + face(k, kind, C) + (o.noProps ? '' : PROPS[kind](c));
  }
  const svg = (vb, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="stkimg">${inner}</svg>`;
  const single = (k, kind) => svg('0 -8 120 146', chr(k, kind) + cap(KINDS[kind][2], 60, 131));
  const COUPLES = { bk: ['bear', 'bunny'], cc: ['cat', 'chick'] };
  const CKINDS = { kiss: ['kiss', 'Muah!', '😘'], hug: ['hug', 'Hug', '🤗'], love: ['luv', 'Love you', '😍'], night: ['night', 'Good night', '😴'] };
  function couple(p, kind) {
    const [a, b] = COUPLES[p], [face, text] = CKINDS[kind];
    const mid = { kiss: heart(80, 22, 2) + heart(62, 6, .9) + heart(100, 8, 1.1), hug: heart(80, 20, 2.3) + heart(56, 6, .9) + heart(104, 6, .9),
      love: heart(80, 20, 2.3) + heart(58, 6, .9) + heart(102, 8, 1), night: moon.replace('M96 8', 'M82 4') + '<text x="62" y="22" font-size="13" font-weight="800" fill="#7b6cff" font-family="' + FONT + '">z</text>' }[kind];
    return svg('0 -4 160 142', `<g transform="translate(16 24) scale(.7)">${chr(a, face, { noProps: 1 })}</g><g transform="translate(144 24) scale(-.7 .7)">${chr(b, face, { noProps: 1 })}</g>` + mid + cap(text, 80, 130));
  }
  const WORDS = [['I love', 'you'], ['Miss', 'you'], ['Muah!'], ['My', 'baby'], ['Forever'], ['Kiss', 'me'], ['Be', 'mine'], ['Only', 'you']];
  const WCOL = ['#ff4d7d', '#ff6f9c', '#e63e8a', '#f0527a', '#c850c0', '#ff5e8a', '#f0457f', '#ff4d9d'];
  const WEMO = ['❤️', '🥺', '😘', '👶', '♾️', '💋', '💍', '💞'];
  function word(i) {
    const L = WORDS[i], y0 = L.length > 1 ? 41 : 50;
    return svg('0 0 120 100', `<path transform="translate(60 68) scale(4.05)" d="M0 6C-14-4-9-15 0-8 9-15 14-4 0 6Z" fill="${WCOL[i]}"/><ellipse cx="34" cy="30" rx="9" ry="5" transform="rotate(-30 34 30)" fill="#fff" opacity=".35"/>`
      + L.map((t, j) => `<text x="60" y="${y0 + j * 19}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="${L.length > 1 ? 18 : 19}" fill="#fff" stroke="rgba(150,0,60,.55)" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${t}</text>`).join('')
      + heart(14, 22, .9, '#ff9fb5') + heart(108, 16, 1.1, '#ffb3c6') + heart(106, 84, .8, '#ff9fb5') + heart(12, 80, 1, '#ffb3c6'));
  }

  // ───────── registry: id -> {svg(), emoji} ─────────
  const REG = {}, PACKS = [];
  [['bear', '🐻', 'Bear'], ['bunny', '🐰', 'Bunny'], ['cat', '🐱', 'Kitty'], ['chick', '🐥', 'Baby chick']].forEach(([k, ic, name]) => {
    const ids = Object.keys(KINDS).map(kind => { const id = k + '-' + kind; REG[id] = { svg: () => single(k, kind), emoji: KINDS[kind][3] }; return id; });
    PACKS.push({ ic, name, ids });
  });
  const cids = [];
  Object.keys(COUPLES).forEach(p => Object.keys(CKINDS).forEach(kind => { const id = 'cp-' + p + '-' + kind; REG[id] = { svg: () => couple(p, kind), emoji: CKINDS[kind][2] }; cids.push(id); }));
  PACKS.push({ ic: '💞', name: 'Couples', ids: cids });
  PACKS.push({ ic: '💌', name: 'Love words', ids: WORDS.map((_, i) => { const id = 'w-' + i; REG[id] = { svg: () => word(i), emoji: WEMO[i] }; return id; }) });

  const cache = {};
  const html = id => cache[id] || (cache[id] = REG[id].svg());
  window.STK = {
    has: id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(REG, id),
    el(id) { const d = document.createElement('div'); d.className = 'stkbox'; d.innerHTML = html(id); return d; },
    emoji: id => REG[id].emoji,
  };

  // ───────── picker ─────────
  function init() {
    const emo = document.getElementById('emoBtn'), txt = document.getElementById('txt'), comp = document.getElementById('comp'), pill = document.querySelector('.pill');
    if (!emo || !txt || !comp || !pill || document.getElementById('stkBtn')) return false;
    const st = document.createElement('style');
    st.textContent = '.stkimg{display:block;width:100%;height:auto;filter:drop-shadow(1.5px 0 0 #fff) drop-shadow(-1.5px 0 0 #fff) drop-shadow(0 1.5px 0 #fff) drop-shadow(0 -1.5px 0 #fff)}' +
      '.b.stk{background:none!important;box-shadow:none!important;border:0!important;padding:2px 2px 0!important}.stkbox{width:132px;max-width:46vw}' +
      '.b.stk .tx,.b.stk .qt{display:none}' +
      '#stkBtn{width:40px;height:46px;font-size:21px;flex:none;background:none;border:0;cursor:pointer}' +
      '#stkP{flex:none;margin:6px 10px 0;border-radius:20px;background:rgba(36,11,29,.97);border:1px solid rgba(255,255,255,.16);overflow:hidden}' +
      '#stkT{display:flex;gap:2px;padding:6px 6px 0;overflow-x:auto}#stkT button{flex:none;background:none;border:0;font-size:22px;padding:6px 10px;border-radius:12px;cursor:pointer}#stkT button.on{background:rgba(255,92,138,.28)}' +
      '#stkG{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;height:230px;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
      '#stkG button{background:none;border:0;padding:2px;border-radius:12px;cursor:pointer}#stkG button:active{background:rgba(255,255,255,.14);transform:scale(1.08)}#stkG .stkimg{filter:none}';
    document.head.appendChild(st);
    const b = document.createElement('button'); b.id = 'stkBtn'; b.type = 'button'; b.textContent = '🧸'; b.setAttribute('aria-label', 'Stickers'); emo.after(b);
    const p = document.createElement('div'); p.id = 'stkP'; p.hidden = true; p.innerHTML = '<div id="stkT"></div><div id="stkG"></div>'; comp.parentNode.insertBefore(p, comp);
    const T = p.querySelector('#stkT'), G = p.querySelector('#stkG'); let on = 0;
    const draw = i => {
      on = i; [...T.children].forEach((x, j) => x.classList.toggle('on', j === i)); G.innerHTML = '';
      PACKS[i].ids.forEach(id => { const x = document.createElement('button'); x.type = 'button'; x.dataset.id = id; x.innerHTML = html(id); G.appendChild(x); });
      G.scrollTop = 0;
    };
    PACKS.forEach((k, i) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = k.ic; x.title = k.name; x.onclick = () => draw(i); T.appendChild(x); });
    G.onclick = e => {
      const x = e.target.closest('button'); if (!x || !STK.has(x.dataset.id)) return;
      if (typeof cur === 'undefined' || !cur || cur === 'ai' || cur === 'official') return typeof toast === 'function' && toast('Open a chat first');
      p.hidden = true; deliver('text', { k: 'text', v: REG[x.dataset.id].emoji, st: x.dataset.id });
    };
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => { p.hidden = !p.hidden; const ep = document.getElementById('emoP'); if (!p.hidden) { if (ep) ep.hidden = true; draw(on); } };
    emo.addEventListener('click', () => { p.hidden = true; });
    txt.addEventListener('focus', () => { p.hidden = true; });
    return true;
  }
  addEventListener('load', () => { let n = 0; const t = setInterval(() => { if (init() || ++n > 20) clearInterval(t); }, 300); });
})();
