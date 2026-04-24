# Setup — Multiplayer Flappy Bird (Supabase + Vercel edition)

Replica of [SangwanNishant/Multiplayer-Flappy-Bird](https://github.com/SangwanNishant/Multiplayer-Flappy-Bird) with a fully working split-screen multiplayer, separate SOLO / MULTIPLAYER leaderboards, and **Supabase** (Postgres + Auth + Realtime) as the only backend service. Deployable to **Vercel** out of the box.

## Why this is different from the original

The original project used Socket.IO with an in-memory `rooms` map on a single Node server. That pattern doesn't work on Vercel: each request lands on a different serverless instance, so the "waiting room" for matchmaking gets lost between the two players' requests.

This version replaces Socket.IO entirely:

- **Matchmaking** is 100% client-side over a **Supabase Realtime Presence** channel (`lobby:mp`). No database, no server call, no migration. Pairing is done with a deterministic age-based algorithm over the presence state.
- **In-match communication** runs over a **Supabase Realtime Broadcast channel** (`match:<matchId>`), browser-to-browser through Supabase's servers — Vercel never sees a WebSocket.
- **Physics** runs on the `left` player's browser (the host). The `right` player sends flap events and renders the state it receives. No server loop needed.

## 1. Install prerequisites

- **Node.js 18+** (tested with Node 20)
- A **Supabase** account (free tier is fine) — <https://supabase.com>

## 2. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Pick any name (e.g. `flappy-bird`), set a strong database password, and pick the region nearest to you.
3. Wait ~1 min for the project to provision.
4. In the left sidebar click **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. You should see `Success. No rows returned`. This creates `profiles`, `leaderboards`, `match_queue`, the RPC, the triggers, and the RLS policies in one shot.
5. In **Authentication → Providers → Email**, confirm that **Email** provider is enabled. You do **not** need to configure SMTP — the server uses `email_confirm: true` and a fake internal domain, so no real email is ever sent.
6. **Optional** — if you'd rather run the migration from the command line, copy the pooler URL from **Project Settings → Database → Connection pooling → Session pooler** into `.env` as `SUPABASE_DB_URL`, then run `npm run migrate`. The "direct" connection string is IPv6-only on the free tier, so use the pooler host (`aws-0-<region>.pooler.supabase.com`).

### (Optional) Disable email confirmation globally

Because users sign in with usernames (mapped to synthetic `<username>@flappy.local` addresses), real emails are never sent. The server already auto-confirms accounts via `email_confirm: true`, so you don't need to change anything. But if you ever want to permit self-serve signup from the browser in the future, turn off **Authentication → Settings → Enable email confirmations**.

## 3. Install dependencies

```bash
cd "flappy bird multiplayer"
npm install
```

## 4. Configure environment

Copy `.env.example` to `.env` and fill in the values from your Supabase project (Settings → API):

```bash
cp .env.example .env
```

Edit `.env`:

- `SUPABASE_URL` — e.g. `https://abcdefghijkl.supabase.co`
- `SUPABASE_ANON_KEY` — the `anon public` key
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` secret key (**server only — never expose to the browser**)
- `AUTH_EMAIL_DOMAIN` — leave as `flappy.local` unless you have a reason to change it

## 5. Run the server

```bash
npm start        # runs `node server.js`
# or
npm run dev      # runs `nodemon server.js` (auto-reload)
```

Server listens on **<http://localhost:3050>**.

## 6. Open in browser

- **<http://localhost:3050/>** — main menu (signup / login / guest)
- **<http://localhost:3050/leaderboard>** — top-10 scores (toggle SOLO / MULTIPLAYER)

---

## How the Supabase integration works

| Concern | Implementation |
|---|---|
| User accounts | `auth.users` (managed by Supabase Auth) |
| Per-user data | `public.profiles` — 1:1 with `auth.users`, holds `username`, `highest_solo`, `highest_multiplayer` |
| Top-10 rows | `public.leaderboards` — one row per `(username, mode)` |
| Signup | `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } })` — a DB trigger inserts the matching profile |
| Login | `supabase.auth.signInWithPassword({ email, password })` — returns an access token stored client-side in `sessionStorage.authToken` |
| Username → email | `username.toLowerCase() + '@' + AUTH_EMAIL_DOMAIN`. Users never see this. |
| Score writes | Server uses the **service role** key which bypasses RLS |
| Guest users | No Supabase account; the server just mints an opaque random token. Guest high scores are stored on the `leaderboards` table under `GUEST_xxxx` usernames if they crack the top 10 |

### Schema at a glance

```sql
profiles(id uuid pk → auth.users, username text unique,
         highest_solo int, highest_multiplayer int, created_at)
leaderboards(id bigserial pk, username text, score int,
             mode text check in ('SOLO','MULTIPLAYER'),
             unique(username, mode), created_at, updated_at)
```

## Route map (from `server.js`)

| Method | Path | What it does |
|---|---|---|
| GET  | `/`                   | `main-menu.html` |
| GET  | `/start`              | `start.html` (signup / login forms) |
| GET  | `/guest`              | Returns a guest token (JSON) |
| GET  | `/guest-game`         | `game-guest.html` |
| GET  | `/user`               | `user-menu.html` (logged-in dashboard) |
| GET  | `/user-game`          | `user-game.html` |
| GET  | `/option-mode-guest`  | `game_mode.html` (solo vs multiplayer) |
| GET  | `/multiplayer`        | `multiplayer.html` |
| GET  | `/split-screen-game`  | `split_screen.html` |
| GET  | `/leaderboard`        | `leaderboard.html` |
| POST | `/signup`             | Creates user in Supabase, returns access token |
| POST | `/login`              | Signs in, returns access token |
| POST | `/submit-score`       | Upserts score for `(username, mode)`, returns top-10 |
| GET  | `/leaderboard-data?mode=SOLO\|MULTIPLAYER` | Returns top-10 for a mode |

## Quick smoke-test

```bash
# Create a user
curl -X POST http://localhost:3050/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"hunter22"}'

# Submit a SOLO score
curl -X POST http://localhost:3050/submit-score \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","score":42,"mode":"SOLO"}'

# Submit a MULTIPLAYER score (same user)
curl -X POST http://localhost:3050/submit-score \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","score":7,"mode":"MULTIPLAYER"}'

# Fetch both leaderboards
curl "http://localhost:3050/leaderboard-data?mode=SOLO"
curl "http://localhost:3050/leaderboard-data?mode=MULTIPLAYER"
```

## Wiping test data

If you want to reset accounts:

- **Auth users:** Supabase dashboard → **Authentication → Users → delete**. The `profiles` row is removed automatically by the `on delete cascade`.
- **Guest leaderboard rows:** run `delete from public.leaderboards where username like 'GUEST_%';` in the SQL editor.
- **Stuck matchmaking queue:** run `delete from public.match_queue;` in the SQL editor.

---

## Deploying to Vercel

This project is laid out so Vercel "just works":

- `public/` is served as static assets directly by Vercel's CDN.
- `api/index.js` is the single serverless function. It requires `server.js` and hands Vercel the Express app.
- `vercel.json` rewrites the human-readable routes (`/signup`, `/login`, `/find-match`, `/leaderboard-data`, `/config`, etc.) to `api/index`.

### Steps

1. Push this folder to GitHub.
2. On <https://vercel.com> → **Add new project → Import** your repo.
3. **Framework preset:** Other. Leave the build command empty; output dir auto-detected from `vercel.json`.
4. Under **Environment Variables**, add **all four**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AUTH_EMAIL_DOMAIN` = `flappy.local`
5. Click **Deploy**.

That's it. You do **not** need to set a `PORT` — Vercel ignores `app.listen()` because `require.main !== module` inside a serverless function.

### How multiplayer works on Vercel

When two browsers open `/split-screen-game`:

1. Each client fetches `/config` (Vercel serverless function) to get the Supabase URL + anon key.
2. Each client opens a **Supabase Realtime Presence** channel `lobby:mp` and tracks itself with `{ id, name, joinedAt }`.
3. On every presence update, all clients sort the lobby by `joinedAt` (stable, deterministic). The oldest client is the "host" and waits; any other client sends a `pair_request` broadcast to the oldest.
4. The oldest accepts the FIRST `pair_request` it sees and replies with `pair_accept`. Both clients untrack the lobby and join a private channel `match:<matchId>`.
5. The `left` client (host) runs the physics loop at 60 Hz and broadcasts state at ~30 Hz. The `right` client (peer) sends flap events back.
6. When both birds die, each client submits its score to `/submit-score`.

Vercel only handles ≤100 ms HTTP requests (config, submit-score, login, etc.). All real-time traffic flows directly between browsers through Supabase Realtime — Vercel never sees a WebSocket.

### Troubleshooting on Vercel

- **404 on every page** → Make sure `vercel.json` is committed.
- **500 on `/signup`, `/login`, `/submit-score`, or `/config`** → Check the function logs (Vercel → Deployments → Functions → logs). 99% of the time this is missing env vars. All four of `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_EMAIL_DOMAIN` must be set.
- **"SEARCHING..." never finishes** → Open the browser console on both tabs. You should see `[mm] lobby status: SUBSCRIBED` in both, followed by `[mm] sending pair_request to ...` on the second one and `[mm] received pair_request from ...` on the first. If you see `CHANNEL_ERROR`, Realtime isn't reachable from the browser — check that your Supabase project has Realtime enabled (default on) and that the anon key in `/config` matches the one shown in Supabase → Settings → API.
- **Score doesn't save** → Check that the `profiles` and `leaderboards` tables exist (run `supabase/schema.sql` in the Supabase SQL editor once if you haven't).
