# GitHub Secrets Setup

Add the following secrets to your GitHub repository before the workflow can run.

## How to add a secret

1. Go to your GitHub repository
2. Click **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Enter the name and value, then click **Add secret**

---

## Required Secrets

### `NEXT_PUBLIC_SUPABASE_URL`
- **Where to find it:** Supabase dashboard > Settings > API > Project URL
- Example format: `https://xxxxxxxxxxxx.supabase.co`

### `SUPABASE_SERVICE_ROLE_KEY`
- **Where to find it:** Supabase dashboard > Settings > API > Project API keys > `service_role`
- **Keep this secret** — it bypasses Row Level Security and has full database access

### `GEMINI_API_KEY`
- **Where to find it:** [Google AI Studio](https://aistudio.google.com) > Get API key
- Create a new key or copy an existing one
