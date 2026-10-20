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

## Video

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_LIVEKIT_URL` | Multi-user WebRTC |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit token minting |

Without LiveKit, a player still gets a local camera preview. Other seats show initials. Camera failure does not remove someone from the hand.
