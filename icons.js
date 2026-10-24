// Builds the app icons from the LYNKO CHAT logo (resizes it with sharp).
// Logo source: public/icons/logo.(png|jpg)  →  else ICON_URL env  →  else the default URL below.
// If anything fails, the built-in fallback icons in /public/icons are served instead.
const fs = require('fs'), path = require('path');
const REMOTE = process.env.ICON_URL || 'https://cloud.laksidu.site/stream/hQLQEJiIax/lynko-chat-logo-500kb.jpg';
const BG = '#1a0713';
const SPEC = { 'icon-192.png': [192, 0], 'icon-512.png': [512, 0], 'maskable-512.png': [512, 1], 'apple-touch-icon.png': [180, 1] };
let sharp = null; try { sharp = require('sharp'); } catch { console.warn('⚠ sharp not installed — using fallback icons'); }
const built = new Map();
let srcP = null;

function source() {
  return srcP || (srcP = (async () => {
    for (const f of ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp']) {
      const p = path.join(__dirname, 'public/icons', f);
      if (fs.existsSync(p)) return fs.readFileSync(p);
    }
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
    try { const r = await fetch(REMOTE, { signal: ctl.signal }); if (!r.ok) throw 0; return Buffer.from(await r.arrayBuffer()); }
    finally { clearTimeout(t); }
  })().catch(() => { srcP = null; return null; }));
}

async function build(name) {
  if (built.has(name)) return built.get(name);
  const spec = SPEC[name]; if (!spec || !sharp) return null;
  const src = await source(); if (!src) return null;
  const [size, pad] = spec;
  let out;
  if (!pad) out = await sharp(src).resize(size, size, { fit: 'cover' }).png().toBuffer();
  else {   // maskable / iOS: logo sits on a solid background (safe zone)
    const inner = Math.round(size * (name === 'apple-touch-icon.png' ? 1 : 0.8));
    const logo = await sharp(src).resize(inner, inner, { fit: 'cover' }).png().toBuffer();
    out = await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
      .composite([{ input: logo, gravity: 'centre' }]).flatten({ background: BG }).png().toBuffer();
  }
  built.set(name, out); return out;
}

module.exports = async (req, res, next) => {
  try {
    const b = await build(req.params.name);
    if (!b) return next();
    res.set('Cache-Control', 'public, max-age=86400').type('png').send(b);
  } catch (e) { console.error('icon build failed', e.message); next(); }
};
