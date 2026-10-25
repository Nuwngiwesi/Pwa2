// Audio relay for voice calls: a fallback that works on ANY network (no TURN needed).
// Phones send already-encrypted audio frames over a WebSocket; this file only forwards them to the other person of the same call.
const { WebSocketServer } = require('ws');
const CID = /^[a-f0-9]{16,32}$/;

module.exports = function relay(server, { verify, findCall }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  const rooms = new Map();   // cid -> Map(userId -> ws)

  server.on('upgrade', async (req, sock, head) => {
    const fail = (code = 400) => { try { sock.write(`HTTP/1.1 ${code} Error\r\nConnection: close\r\n\r\n`); } catch {} sock.destroy(); };
    try {
      const u = new URL(req.url, 'http://x');
      if (u.pathname !== '/api/relay') return fail(404);
      const o = req.headers.origin;
      if (o) { let h = ''; try { h = new URL(o).host; } catch {} if (h !== req.headers.host) return fail(403); }   // same-site pages only
      const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('lynko=')) || '';
      let user; try { user = verify(cookie.slice(6)); } catch { return fail(401); }
      const cid = u.searchParams.get('cid') || '';
      if (!CID.test(cid)) return fail(400);
      const call = await findCall(cid, user.id);
      if (!call) return fail(404);
      const other = call.from === user.id ? call.to : call.from;
      wss.handleUpgrade(req, sock, head, ws => attach(ws, cid, user.id, other));
    } catch { fail(500); }
  });

  function attach(ws, cid, uid, other) {
    let room = rooms.get(cid); if (!room) rooms.set(cid, room = new Map());
    const old = room.get(uid); if (old && old !== ws) try { old.close(4000, 'replaced'); } catch {}
    room.set(uid, ws);
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    let n = 0, t0 = Date.now();
    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      const now = Date.now(); if (now - t0 > 1000) { t0 = now; n = 0; }
      if (++n > 120) return ws.close(4008, 'too fast');   // normal is ~25 frames / second
      const peer = room.get(other);
      if (peer && peer.readyState === 1) peer.send(data, { binary: true });
    });
    ws.on('close', () => { if (room.get(uid) === ws) room.delete(uid); if (!room.size) rooms.delete(cid); });
    ws.on('error', () => {});
    ws.send(JSON.stringify({ ready: 1 }));
  }

  const beat = setInterval(() => {
    for (const room of rooms.values()) for (const ws of room.values()) {
      if (!ws.isAlive) { try { ws.terminate(); } catch {} continue; }
      ws.isAlive = false; try { ws.ping(); } catch {}
    }
  }, 20000); beat.unref();

  return { close(cid) { const r = rooms.get(cid); if (r) for (const ws of r.values()) try { ws.close(1000, 'ended'); } catch {} } };
};
