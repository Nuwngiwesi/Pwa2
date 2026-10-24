# LYNKO CHAT

Run: `npm install && npm start` (copy `.env.example` to `.env` first).

## Admin panel — `/admin`
Set `ADMIN_USER` and `ADMIN_PASS` in the environment (Railway → Variables). If either is missing, `/admin` returns 404.
- **Overview** – accounts, online now, 24h/7d active, live messages, 14-day chart, system health
- **Official** – post / delete messages in the verified *Lynko Official* chat (every account sees it, nobody can reply)
- **Errors** – server, browser and process errors, grouped (kept 14 days)
- **Users** – recent / searchable accounts (username, ID, last seen only — chats are end-to-end encrypted and unreadable)

Wrong-password lockout: 6 tries / 15 min per IP. Session lasts 12 h; changing `ADMIN_PASS` logs everyone out.

## Realtime extras
- **Typing indicator** – sent on the first keystroke, refreshed every 2.5 s, cleared the moment you stop / send.
- **Last seen / online** – heartbeat every 25 s while the app is open. Profile → *Hide my last seen* hides yours (and theirs from you).
- **Notifications** – Web Push (works with the app closed). Needs `VAPID_*` keys (`npm run vapid`). Alerts show only the sender name because chats are end-to-end encrypted. iPhone: must be added to the Home Screen first.
- **Voice calls** (Calls tab, 📞 in a chat) – WebRTC audio only; the server just relays the handshake. For reliable calls on mobile data add a TURN server (`TURN_URL/USER/PASS`).
- **Lynko AI** – Groq-powered assistant chat; `GROQ_API_KEY` in env. Toggle in Profile. AI messages go to Groq (not end-to-end encrypted); history is kept only on the phone for 24 h.
