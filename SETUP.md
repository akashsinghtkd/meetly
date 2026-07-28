# Cloud sync + web app — setup

Meetly is a **SaaS team workspace**: after sign-in you create or join a
**teamspace**, then projects / meetings / tasks live inside it and can be shared
with teammates (Owner / Admin / Member / Viewer).

Desktop and web do **not** share localStorage — they sync via Supabase.

**Where Mac desktop stores data (local cache):**
- Meetings / projects / tasks → Tauri WebView `localStorage`
- Audio WAVs → `~/Library/Application Support/com.aimeeting.recorder/recordings/`

## 0. Local DB in Docker (recommended for sync on this machine)

Docker must be running. Then:

```bash
./start.sh          # choose 4) start db
# or:
npm run db:start
```

This starts local Supabase, applies migrations under `supabase/migrations/`
(`0001_init` + `0002_teamspaces`), and writes `.env.local`.
Studio UI: <http://127.0.0.1:54323>.

Then restart **desktop** and **web**, sign in, create a teamspace (or accept an
invite link `/?invite=TOKEN`), and use **Team** in the sidebar to invite people.

```bash
npm run db:stop     # stop Docker stack
npm run db:status   # show URLs / keys
```

### Teamspaces (SaaS tenancy)
- **Create teamspace** — required after signup if you have none
- **Invite** — Admin/Owner invites by email; share the invite link
- **Switcher** — sidebar dropdown to switch teamspaces
- **Roles** — owner, admin, member (edit), viewer (read-only)
- **Billing** — Team → Plan & usage (Free / Team / Business). Without Stripe keys,
  Activate works in **dev mode**. See [SAAS.md](SAAS.md) for Stripe deploy steps.

## 1. Or use a hosted Supabase project
1. Go to <https://supabase.com> → **New project** (free tier is fine).
2. Once it's ready, open **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Create the database schema
In the Supabase dashboard → **SQL Editor** → run, in order:
1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
2. [`supabase/migrations/0002_teamspaces.sql`](supabase/migrations/0002_teamspaces.sql)

This creates the `projects`, `meetings`, `tasks`, `usage_records` tables, a private
`recordings` storage bucket, and **Row-Level Security** so each user only sees
their own data.

## 3. Auth
Email/password sign-up works out of the box. In **Authentication → Providers**
the **Email** provider is enabled by default. (For quick testing you can turn off
"Confirm email" under Authentication → Providers → Email.)

## 4. Point the app at your project
Create `.env.local` in the project root (copy from [`.env.example`](.env.example)):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Restart the app. It now shows a **sign-in screen**; create an account and your
data syncs to the cloud. Leaving these unset returns to local-only mode.

## 5. Run the web app
The web app is the **same** frontend, minus recording (auto-disabled in the
browser).

```bash
npm run dev       # local web preview at http://localhost:1420
npm run build     # static build in dist/ — deploy to any static host
```

Deploy `dist/` (with the same two env vars) to **Vercel**, Netlify, Cloudflare
Pages, etc. Sign in with the same account to see your meetings, notes, projects,
and tasks from anywhere.

## 6. Windows desktop
Tauri builds Windows from the same code. **Must be built on Windows** (or Windows
CI) — you can't cross-compile the installer from macOS:

```bash
# on a Windows machine:
npm install
npm run app         # dev
npm run app:build   # → .msi / .exe installer (in src-tauri/target/release/bundle)
```

**System audio on Windows works with zero install.** The app captures the
speaker output in **WASAPI loopback** mode — in Settings → System audio you'll
see your output device listed as `… (loopback)`; pick it to record the other
participants. (No BlackHole/virtual device needed, unlike macOS.)

Prerequisites on Windows: the Rust toolchain, Node, and the **WebView2** runtime
(preinstalled on Windows 11; the Tauri installer bundles it otherwise).

> The loopback capture code is `cfg`-gated to Windows, so it compiles only in a
> Windows build — test it there.

---

### What syncs
Projects, meetings (incl. transcripts, summaries, action items), tasks, and the
cost ledger. Audio files stay local for now; uploading them to the `recordings`
bucket (so the web app can play them back) is the next increment.

### Notes
- Sync is **row-level last-write-wins**. On first sign-in, if the cloud is empty
  your local data seeds it; otherwise the app adopts the cloud state.
- API keys (OpenAI/Deepgram) stay in local settings and are **not** synced.
