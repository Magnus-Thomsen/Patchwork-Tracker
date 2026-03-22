# 🧵 Patchwork Tracker

A web app for tracking scores, stats, and records for the [Patchwork](https://lookout-spiele.de/en/games/patchwork.html) board game by Uwe Rosenberg.

**[→ Open the app](https://graceful-souffle-409005.netlify.app)** 

![Dashboard showing leaderboard and score trend chart](https://placehold.co/900x500/2C1A0E/D4A017?text=Patchwork+Tracker&font=playfair-display)

---

## Features

- 📊 **Dashboard** — leaderboard, global stats, and a live score trend chart
- 🎲 **Log matches** — auto-calculates score from buttons earned, empty spaces, and the 7×7 bonus tile
- 📈 **Charts** — score over time per player, head-to-head comparison with win record
- 🏅 **Records** — hall of fame tracking 9 fun stats (highest score, longest win streak, biggest comeback, and more)
- 🔄 **Real-time sync** via Supabase — works across all your devices
- 📴 **Offline support** — loads from cache when you have no signal
- 📱 **Installable PWA** — add to your phone's home screen for quick access

---

## Running Your Own Instance

This is a single-file app (`index.html`) with no build step. You just need free hosting and a free Supabase database.

### 1. Fork or clone this repo

```bash
git clone https://github.com/your-username/patchwork-tracker.git
cd patchwork-tracker
```

### 2. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project
2. Wait ~1 minute for it to provision
3. Go to **SQL Editor → New query**, paste the SQL below, and click **Run**:

```sql
create table if not exists pw_players (
  id text primary key,
  name text not null,
  color text not null,
  created_at timestamptz default now()
);

create table if not exists pw_matches (
  id text primary key,
  date text not null,
  players jsonb not null,
  created_at timestamptz default now()
);

alter table pw_players enable row level security;
alter table pw_matches enable row level security;

create policy "public read players"   on pw_players for select using (true);
create policy "public insert players" on pw_players for insert with check (true);
create policy "public delete players" on pw_players for delete using (true);

create policy "public read matches"   on pw_matches for select using (true);
create policy "public insert matches" on pw_matches for insert with check (true);
create policy "public delete matches" on pw_matches for delete using (true);
```

4. Go to **Project Settings → API** and copy your **Project URL** and **anon/public key** — you'll need these in a moment.

> ⚠️ **Note on security:** The RLS policies above allow public read/write access — fine for a personal app shared with friends. If you want to restrict access, you can add Supabase Auth and update the policies accordingly.

### 3. Deploy to Netlify

#### Option A — Deploy from GitHub (recommended)

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. Connect to GitHub and select this repo
3. Leave all build settings blank (no build command, no publish directory needed — it serves `index.html` directly)
4. Click **Deploy site**

Netlify will redeploy automatically every time you push to the main branch.

#### Option B — Drag and drop

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the `index.html` file onto the page
3. Done — you get an instant URL

### 4. Connect Supabase in the app

When you first open the app, a setup screen will appear asking for your Supabase credentials:

- **Project URL** — e.g. `https://abcdefgh.supabase.co`
- **Anon / public key** — the long `eyJ...` string from Project Settings → API

The app stores these in your browser's `localStorage`. Each device that opens the app will go through this one-time setup, after which they all read from and write to the same Supabase database.

### 5. Add to your phone's home screen

**iPhone (Safari):** Tap the Share button → *Add to Home Screen*

**Android (Chrome):** Tap the three-dot menu → *Install app* or *Add to Home Screen*

The app will appear as an icon and open in full-screen mode like a native app.

---

## Using without Supabase (local-only mode)

If you just want to try the app without setting up Supabase, tap **"Continue without sync"** on the setup screen. Data is stored in your browser's `localStorage` and won't sync across devices or persist if you clear your browser data.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — single file, no framework |
| Charts | [Chart.js 4](https://www.chartjs.org/) |
| Database | [Supabase](https://supabase.com) (free tier) |
| Hosting | [Netlify](https://netlify.com) (free tier) |
| Offline | Service Worker + Cache API |

---

## License

MIT — do whatever you like with it.
