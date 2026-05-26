# Supabase Setup — Hebrew News HUB

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (free tier is sufficient).
2. Click **New project**, choose a name (e.g. `newshub`) and a strong database password.
3. Select the region closest to your users and wait for the project to provision (~1 min).

## 2. Run the Migration

1. In the Supabase dashboard open **SQL Editor** (left sidebar).
2. Click **New query**, paste the entire contents of `migrations/001_init.sql`, and click **Run**.
3. You should see `Success. No rows returned` — that confirms the table, indexes, RLS policy, and cleanup function were all created.

## 3. Copy Your API Keys

Go to **Settings → API** and copy:

| Key | Where to use |
|-----|-------------|
| `Project URL` | `SUPABASE_URL` in `.env.local` |
| `anon` / `public` key | `SUPABASE_ANON_KEY` in `.env.local` |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` — GitHub Actions secret only |

> **Warning:** The `service_role` key bypasses Row Level Security. Never expose it in client-side code or commit it to the repo.

## 4. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in the three values:

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Add `SUPABASE_SERVICE_ROLE_KEY` as a secret in **GitHub → Settings → Secrets and variables → Actions** so the ingestor workflow can write to the DB without exposing the key.

## 5. (Optional) Enable Auto-Cleanup via pg_cron

Articles older than 7 days are pruned by the `prune_old_articles()` function.
To run it automatically every day at 04:00 UTC:

1. Go to **Database → Extensions** and enable **pg_cron**.
2. In the SQL Editor run the commented-out `cron.schedule(...)` block at the bottom of `001_init.sql`.
3. Verify with `SELECT * FROM cron.job;`.

Without pg_cron you can call `SELECT prune_old_articles();` manually or from a scheduled GitHub Actions workflow.
