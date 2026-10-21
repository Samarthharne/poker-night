# Poker Night

Invite-only **play-money** Texas Hold'em for a private group. Virtual chips only — no deposits, withdrawals, cash prizes, or payment processing.

Friends join in a desktop, laptop, or mobile browser. There is no native app.

## Access model

Only the application owner can create rooms. Everyone else joins with an invitation link:

`https://YOUR_DOMAIN/room/<invitation-token>`

The token is random and stored as a hash. Regenerating or revoking it stops new joins. A valid invitation does not grant administrator access.

## Run locally

```bash
npm install
cp .env.example .env.local
```

Set these in `.env.local` before signing in:

- `ADMIN_EMAIL` — the owner email
- `ADMIN_PASSWORD` — the owner password
- `ADMIN_SESSION_SECRET` — at least 16 random characters

```bash
npm run dev
```

1. Open [http://localhost:3000/admin/login](http://localhost:3000/admin/login) and sign in.
2. Create a room and copy the invitation link.
3. Open that link in another browser, enter a display name, and join.
4. From the admin room page, copy the invitation link and start the game once at least two players are seated.
5. When a match ends, use **Restart match** on that admin page. **Add chips** increases one player's stack. **Deal again with current chips** starts another match without resetting those balances.

Public room creation is disabled. `POST /api/rooms` returns 403.

## Play by sharing a link

Friends do not need an account. They only need the invitation link.

1. Sign in at `/admin/login`.
2. Create a room. The page shows a link like `https://YOUR_DOMAIN/room/<invitation-token>`.
3. Send that link. Each person opens it, enters a display name, and joins.
4. Press **Start game** on the admin room page.

The same link keeps working until you revoke it or the room expires.

## Deploy on Netlify

Netlify runs this app as serverless functions. Live tables are stored in Netlify Blobs so every browser sees the same cards, pot, and chip counts. Share `https://<your-site>.netlify.app/room/<invitation-token>` after you deploy.

1. Push this repo to GitHub and import it at [app.netlify.com](https://app.netlify.com).
2. The build command is `npm run build` (`netlify.toml` already selects the Next.js plugin and Node 20).
3. In Site configuration → Environment variables, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` (at least 16 random characters).
4. Deploy, then open `https://<your-site>.netlify.app/admin/login`.
5. Make the project **Public** or friends cannot open invitation links. In Netlify: **Project configuration → General → Visitor access → Project visibility → Public**. A private site shows Netlify’s robot “Page not found” page instead of the poker table.
6. Create a room and send the invitation link to the players.

On the same Wi-Fi you can skip Netlify: run `npm run dev` and share `http://<your-computer-ip>:3000/room/<invitation-token>`.

## Supabase Auth (production)

1. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
2. In the Supabase dashboard, create **one** Auth user for the owner. Do not enable public sign-up in the app.
3. Run `supabase/migrations/20261010000000_admin_access.sql`.
4. Insert the owner:

```sql
insert into admin_roles (user_id, role)
values ('<auth user uuid>', 'owner');
```

5. Set `ADMIN_EMAIL` to that user's email and keep `ADMIN_SESSION_SECRET` server-side.

Sign-in then uses Supabase Auth. The server issues an httpOnly admin cookie only after the user is the configured owner or has an `admin_roles` row. Players cannot promote themselves.

The service-role key stays on the server. Row Level Security is enabled with no public write policies.

Live hand state is authoritative in the Next.js server process so every browser sees the same cards, pot, and turn. Restarting the server clears open tables. Room metadata tables are ready for Supabase when you want them persisted.

## Face and voice (WebRTC)

Poker Night uses a **full mesh** of browser `RTCPeerConnection`s (one per remote seat, up to 6 players). The Netlify app never carries camera or microphone media. It only delivers signaling (offers, answers, ICE) and short-lived ICE server lists.

### Signaling across Netlify instances

In-memory SSE is not enough: two browsers often hit different serverless instances. Offers, answers, and ICE candidates are stored in a **Netlify Blobs** inbox (`poker-rtc`) with strong consistency, unique message ids, expiry, and acknowledgements. Each client polls `GET /api/rooms/<code>/signals` and acks delivered ids.

If `NEXT_PUBLIC_SUPABASE_URL` is set, members also subscribe to a hashed Supabase Realtime broadcast channel returned by `GET /api/rooms/<code>/webrtc/ice`. That is a fast path only. The blob inbox remains the source of truth after a refresh.

SDP and ICE never go into the public poker snapshot. `cameraEnabled` / `microphoneEnabled` on a seat are the player's reported device toggles, not proof that another laptop is receiving media.

### TURN (required for different Wi-Fi or mobile data)

A reachable TURN server is a **deployment prerequisite**. Frontend changes cannot provision a relay. Public STUN is enough for some same-LAN calls; it is not enough when friends are on different Wi-Fi or 4G/5G.

This project is set up for **Metered TURN**. The browser never calls Metered. The server fetches ICE servers from Metered, then returns only `urls` / `username` / `credential` to room members.

| Variable | Purpose |
| --- | --- |
| `METERED_DOMAIN` | Metered app host from your Metered dashboard (do not commit the value) |
| `METERED_API_KEY` | Metered TURN REST API key. **Server only. Never `NEXT_PUBLIC_`. Do not commit the value.** |

Set both on Netlify → Site configuration → Environment variables, then **redeploy**. Locally they go in `.env.local`.

If Metered is not used, you can instead set a generic TURN service:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_STUN_URLS` | Optional comma/space-separated STUN URLs |
| `TURN_URLS` | Server-only TURN URLs. Example: `turn:turn.example:3478,turn:turn.example:3478?transport=tcp,turns:turn.example:443?transport=tcp` |
| `TURN_SECRET` | coturn REST shared secret. **Never** use `NEXT_PUBLIC_` |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Static TURN login if the provider does not use coturn REST |
| `TURN_TTL_SECONDS` | Credential lifetime (default 21600) |

`turns:` on port 443 is TLS TURN. `turn:` plus `?transport=tcp` is TCP TURN. Do not assume port 443 is TLS unless the URL scheme is `turns:`.

Members fetch ICE servers from `GET /api/webrtc/ice-servers?code=...` (room membership required) **before** any `RTCPeerConnection` is created. Credentials refresh at half TTL. The coturn/provider secret is never sent to the browser.

Without TURN, the diagnostic panel shows `ice missing-turn`. Same-Wi-Fi may still work via host/srflx. Cross-network calls should not be treated as supported.

### Relay-only diagnostic

In development (or with `NEXT_PUBLIC_WEBRTC_DEBUG=1`), open **Relay only**. That sets `iceTransportPolicy: "relay"`. If video/audio then work, TURN credentials and the TURN host are good. If it fails, TURN is unreachable, firewalled, or mis-authed — not a poker bug.

### Diagnostics

The panel shows ICE fetch status, connection/ICE/signaling state, selected pair type (`host` / `srflx` / `relay`), transport (`udp` / `tcp`), whether a video frame arrived, and retry count. Copy Diagnostic Report is sanitized (no SDP, no secrets).

### Test two devices

1. Set TURN on Netlify and redeploy, or run `npm run dev` for same-machine signaling tests.
2. Open the invitation on two browsers. Allow camera and microphone on **both**.
3. Same Wi-Fi: expect host or srflx. Different Wi-Fi or mobile data: expect `relay` if TURN works.
4. Use **Tap to enable audio** if the browser blocks autoplay.
5. Use **Relay only** to prove TURN independently of STUN.

Mesh scale: this design is for a 6-max table. An SFU is the next step for larger rooms.
