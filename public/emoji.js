// LYNKO CHAT: cute emoji picker (😊 button in the composer). Uses native emoji → Apple style on iPhone.
(function () {
  const CATS = {
    '🕘': null,
    '🥰': '😀 😃 😄 😁 😆 🥹 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤗 🤭 🫢 🤫 🤔 🫡 😏 😒 🙄 😬 😮‍💨 😴 🤤 😪 😵‍💫 🥴 🤒 🤕 🥳 🥸 😎 🤓 🥺 😢 😭 😤 😡 😱 😨 😰 🫠 🫣',
    '💖': '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💖 💗 💓 💞 💕 💘 💝 💟 ❣️ 💔 ❤️‍🔥 💌 💋 🫶 💐 🌹 🌷 🌸 🌺 🌼 🪷 💫 ✨ ⭐ 🌟 🎀',
    '🧸': '🧸 🎀 🍓 🍒 🍑 🍭 🍬 🍰 🧁 🎂 🍩 🍪 🍫 🍦 🧋 🍼 🌈 ☁️ 🌙 ☀️ ⛅ 🫧 🎈 🎁 🎉 🎊 🪩 🪄 🔮 🧿 🩷 🩵 🩶 🛍️ 👑 💎 💍 👛 🩰 🪞 🕊️ 🦢',
    '🐰': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦉 🦋 🐝 🐞 🐢 🐙 🦄 🐬 🐳 🐠 🦭 🦦 🦥 🐿️ 🦔',
    '👍': '👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🫶 🤲 🙏 🤝 💅 💪 🫂 👀 🧠 🫦',
    '🍕': '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🌽 🥕 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🌮 🌯 🍜 🍝 🍣 🍙 🍚 🍡 🍦 🍩 🍪 ☕ 🧃 🥤 🍹',
    '⚽': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱 🏓 🎮 🎧 🎤 🎵 🎶 🎬 📸 📱 💻 🚗 ✈️ 🏖️ 🏝️ 🌍 🎂 🔥 💯 ✅ ❌ ⚡ 💥 💤 💢 💬 💭'
  };
  const rec = () => { try { return JSON.parse(localStorage.getItem('lk_emo') || '[]'); } catch { return []; } };
  const push = e => { try { localStorage.setItem('lk_emo', JSON.stringify([e, ...rec().filter(x => x !== e)].slice(0, 24))); } catch {} };

  function init() {
    const pill = document.querySelector('.pill'), txt = document.getElementById('txt'), comp = document.getElementById('comp');
    if (!pill || !txt || !comp || document.getElementById('emoBtn')) return;
    const st = document.createElement('style');
    st.textContent = '#emoBtn{width:40px;height:46px;font-size:21px;flex:none;background:none;border:0;cursor:pointer}' +
      '#emoP{flex:none;margin:6px 10px 0;border-radius:20px;background:rgba(36,11,29,.97);border:1px solid rgba(255,255,255,.16);overflow:hidden}' +
      '#emoT{display:flex;gap:2px;padding:6px 6px 0;overflow-x:auto}#emoT button{flex:none;background:none;border:0;font-size:22px;padding:6px 10px;border-radius:12px;cursor:pointer}' +
      '#emoT button.on{background:rgba(255,92,138,.28)}#emoG{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;padding:8px;height:204px;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
      '#emoG button{background:none;border:0;font-size:27px;line-height:1.25;padding:3px 0;border-radius:10px;cursor:pointer}#emoG button:active{background:rgba(255,255,255,.14);transform:scale(1.2)}' +
      '#emoG p{grid-column:1/-1;text-align:center;color:#d6a6ba;font-size:13px;margin-top:70px}';
    document.head.appendChild(st);
    const b = document.createElement('button');
    b.id = 'emoBtn'; b.type = 'button'; b.textContent = '😊'; b.setAttribute('aria-label', 'Emoji');
    pill.insertBefore(b, txt);
    const p = document.createElement('div'); p.id = 'emoP'; p.hidden = true;
    p.innerHTML = '<div id="emoT"></div><div id="emoG"></div>';
    comp.parentNode.insertBefore(p, comp);
    const T = p.querySelector('#emoT'), G = p.querySelector('#emoG');
    let cur = '🥰';
    const draw = k => {
      cur = k;
      [...T.children].forEach(x => x.classList.toggle('on', x.dataset.k === k));
      const list = k === '🕘' ? rec() : CATS[k].split(' ');
      G.innerHTML = list.length ? '' : '<p>Me thanata thama emoji nene 🕘</p>';
      list.forEach(e => { const x = document.createElement('button'); x.type = 'button'; x.textContent = e; G.appendChild(x); });
      G.scrollTop = 0;
    };
    Object.keys(CATS).forEach(k => { const x = document.createElement('button'); x.type = 'button'; x.dataset.k = k; x.textContent = k; T.appendChild(x); });
    T.onclick = e => { const x = e.target.closest('button'); if (x) draw(x.dataset.k); };
    G.onclick = e => {
      const x = e.target.closest('button'); if (!x) return;
      const s = txt.selectionStart == null ? txt.value.length : txt.selectionStart, en = txt.selectionEnd == null ? s : txt.selectionEnd;
      txt.value = txt.value.slice(0, s) + x.textContent + txt.value.slice(en);
      txt.selectionStart = txt.selectionEnd = s + x.textContent.length;
      txt.dispatchEvent(new Event('input', { bubbles: true }));
      push(x.textContent);
    };
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => { p.hidden = !p.hidden; if (!p.hidden) draw(rec().length ? '🕘' : cur); };
    txt.addEventListener('focus', () => { p.hidden = true; });
  }
  addEventListener('load', () => setTimeout(init, 300));
})();
