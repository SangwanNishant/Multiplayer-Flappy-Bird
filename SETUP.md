# Local Setup — Multiplayer Flappy Bird (Supabase edition)

This is the replica of [SangwanNishant/Multiplayer-Flappy-Bird](https://github.com/SangwanNishant/Multiplayer-Flappy-Bird) with a working Socket.IO split-screen multiplayer, separate SOLO / MULTIPLAYER leaderboards, and **Supabase** (Postgres + Auth) instead of MongoDB + custom JWT.

## 1. Install prerequisites

- **Node.js 18+** (tested with Node 20)
- A **Supabase** account (free tier is fine) — <https://supabase.com>

## 2. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Pick any name (e.g. `flappy-bird`), set a strong database password (you won't need it for this app — the JS client uses API keys), and pick the region nearest to you.
3. Wait ~1 min for the project to provision.
4. In the left sidebar click **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. You should see `Success. No rows returned`.
5. In **Authentication → Providers → Email**, confirm that **Email** provider is enabled. You do **not** need to configure SMTP — the server uses `email_confirm: true` and a fake internal domain, so no real email is ever sent.

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
