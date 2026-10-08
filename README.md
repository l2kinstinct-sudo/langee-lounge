# Langee Lounge — LiveKit + real usernames + 32 NFL teams

A real Next.js app for **langee-lounge.vercel.app**, replacing the old root `index.html` demo.

## Features
- Supabase email/password registration with unique usernames (3–20 letters, numbers, underscores); email confirmation encouraged.
- Watch anonymously, but a confirmed user account is required to speak in LiveKit real-time chat.
- Chat sender name is taken from their signed LiveKit token, **not from a fakeable text field**.
- Each user's current-break NFL teams automatically appear next to their messages; one team = name/logo; multiple teams = three logos and `+N` expand menu.
- All 32 NFL teams, one spot each, with assignments stored in Supabase. Admin can give/reassign/remove teams by registered username.
- Authorized admin can Go Live with camera and microphone; viewers see LiveKit stream and audience count.
- Admin creates new breaks and resets available teams while retaining previous breaks/replay links.
- Admin uploads photo hits from phone to Supabase Storage.
- Duck Pond stays marked **Coming Next** until the Discord video pipeline is built.
- **No Stripe, no payment handling, no purchase button.**

## 1. Supabase setup (required)
1. Create a free project at https://supabase.com and save your DB password privately.
2. Supabase **SQL Editor** -> New query -> paste the entire contents of `supabase/schema.sql` -> **Run**.
3. Supabase **Authentication -> Providers -> Email**: ensure Email is enabled. Keep email confirmation enabled for verified accounts. Configure your site's redirect URL under **Authentication -> URL Configuration**: `https://langee-lounge.vercel.app` (update if you use a custom domain).
4. **Project Settings -> API** or **API Keys**: copy Project URL and the **publishable (or anon) key**. Also copy the **secret `service_role`** API key for Vercel **only**. NEVER put service_role into a public variable or chat.
5. Decide Langee's real email address. Set `ADMIN_EMAIL` to it in Vercel; he should sign up on the site and confirm his email just like any member. This is how the server recognizes the admin.

## 2. Set Vercel environment variables
**Settings -> Environment Variables** (Production; also Preview/Development if you use them):

| Name | Value | Vercel visibility |
|---|---|---|
| `LIVEKIT_API_KEY` | LiveKit API key | Secret |
| `LIVEKIT_API_SECRET` | LiveKit API secret | Secret |
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://langee-lounge-p9iqysr8.livekit.cloud` | **Config** / not Secret |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | **Config** / not Secret |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key | **Config** / not Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** secret | **Secret** |
| `ADMIN_EMAIL` | Email Langee will register with | Secret or Config |

**Security:** rotate the LiveKit API key if it has ever been posted publicly. Keep LiveKit secret, Supabase service_role key, and user passwords out of chat and GitHub. `NEXT_PUBLIC_` settings are safe-to-expose public connection details only.

## 3. Deploy: IMPORTANT — replace the old HTML structure
Your old GitHub repo contained a single `index.html` file. That won't run this app.

**Use GitHub's `Add file -> Upload files` after deleting the root `index.html`.** The *contents of this ZIP* must be at the repo root (not in a nested `langee-lounge-nextjs/` folder). Recommended files at repo root:

```
app/
  api/
  globals.css
  layout.tsx
  page.tsx
components/
lib/
public/
supabase/schema.sql
package.json
next.config.mjs
tsconfig.json
README.md
```

Vercel should detect **Next.js** automatically after the commit. Set **Framework Preset** = Next.js, **Root Directory** = `./` and **Build Command** = `next build` or leave defaults. Trigger a new deployment after adding variables.

For easiest GitHub upload: create the files using GitHub desktop (clone repo, delete old index.html, extract ZIP into repo, commit + push), or upload root contents via website in small groups. Dragging the **ZIP itself** into GitHub will not extract it into an app.

## Notes and limits
- Chat uses LiveKit real-time data channels; messages are **not saved** after stream session/reload. Messages sent before you join won't appear.
- Team assignments refresh automatically about every 12 seconds. People with 4+ teams see 3 logos and a `+N` menu showing the full list.
- Chats run in the stable `langee-main` room; the current break's assignments determine badges. Only the admin can broadcast.
- Hits uploads and teams depend on Supabase configuration and the SQL schema.
- Ponds and automatic Discord detection, payments, replay *recording*, chat moderation, and admin setup of external streaming software are **not yet implemented**.
- Free tiers have bandwidth and storage limits; streaming at scale may cost money.
- **Not yet production tested** until npm dependencies can be installed, build passes, and a real Supabase/LiveKit environment is connected.

## Local run
Node 20+: `npm install`; create `.env.local` from `.env.example` with your real variables, then `npm run dev`.
