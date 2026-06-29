# NewsHub — Claude Code Guide

## Deploy
This project is deployed on **Vercel** via Git. Push to `main` to deploy.
After every code change, commit and push so changes go live.

## Stack
- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS (light theme)
- **DB:** Supabase (Postgres)
- **APIs:**
  - Polygon.io — stock prices (`/v2/snapshot`) and news (`/v3/reference/news`)
  - Yahoo Finance RSS — fallback news for tickers with sparse Polygon coverage
  - Apify — StockTwits scraping (once/day, free tier)
  - OpenRouter (Gemini 2.5 Flash) — article summarization
  - X API (Twitter) — investor quotes (Burry, Ackman, Wood, Druckenmiller)
- **Scraper Service:** Python FastAPI + Scrapling (runs inside GitHub Actions) — scrapes sources without RSS

## Key Files
- `app/api/stocks/route.ts` — prices + news API (Polygon V3 + Yahoo RSS fallback)
- `app/api/twits/route.ts` — StockTwits via Apify
- `app/api/quotes/route.ts` — GET quotes from Supabase, POST fetches from X API
- `app/api/cron/quotes/route.ts` — Vercel Cron endpoint (calls POST /api/quotes every hour)
- `app/stocks/page.tsx` — watchlist page (localStorage, auto-refresh)
- `app/page.tsx` — main news feed
- `app/quotes/page.tsx` — quotes archive page (/quotes)
- `app/actions.ts` — server actions (Supabase fetch, summarization)
- `components/QuoteItem.tsx` — quote card component
- `lib/rss.ts` — 79 RSS sources across 6 categories
- `lib/types.ts` — Quote interface + INVESTOR_CONFIG (handles, colors, firms)
- `scripts/fetch.ts` — ETL: RSS + Scraper Service → Gemini → Supabase
- `scraper-service/main.py` — Scrapling microservice (Reddit, GitHub Trending, N12, Funder)
- `vercel.json` — Vercel Cron schedule

## Refresh Cadence (stocks page)
| Data | Interval |
|------|----------|
| Prices | 2 min |
| News | 10 min |
| StockTwits | 24 hr |

## Quotes Column
- Displayed as a 6th narrower column (0.7fr) in the main news grid
- Client-side fetch from Supabase every 15 min via GET /api/quotes
- New tweets loaded by Vercel Cron every hour via GET /api/cron/quotes → POST /api/quotes
- Investors tracked: `INVESTOR_CONFIG` in `lib/types.ts` — add/remove handles there
- Archive page at `/quotes` (server component, revalidates every 15 min)
- Supabase table: `quotes` (id, author_name, author_handle, author_firm, tweet_id, text, tweeted_at, fetched_at)
- ⚠️ X API free tier is very limited — Vercel Cron runs hourly but only ~1,500 reads/month

## News Pipeline (scripts/fetch.ts)
Runs every 4h via GitHub Actions. Flow:
1. Fetch 79 RSS sources in parallel
2. Fetch Scraper Service (if `SCRAPER_SERVICE_URL` is set) in parallel with RSS
3. Merge candidates, cap at 40 per category
4. Dedup against Supabase
5. Batch-summarise with Gemini 2.5 Flash → Hebrew
6. Insert to Supabase, prune old articles

## Scraper Service (scraper-service/)
Python FastAPI + [Scrapling](https://github.com/d4vinci/Scrapling) — runs locally inside the GitHub Actions job (no always-on cost).
Scrapes sources that block RSS or have no feed at all.

| Source | Method | Category |
|--------|--------|----------|
| Reddit r/investing | httpx JSON API | economy |
| Reddit r/technology | httpx JSON API | tech |
| Reddit r/artificial | httpx JSON API | ai-builders |
| Reddit r/worldnews | httpx JSON API | news |
| GitHub Trending | StealthyFetcher | ai-builders |
| Funder.co.il | StealthyFetcher | ai-builders (israel) |
| N12.co.il | StealthyFetcher | news (israel) |

**To test locally:** `cd scraper-service && pip install -r requirements.txt && scrapling install && uvicorn main:app --reload`

## News Coverage Fix
Polygon has sparse coverage for small/mid-cap tickers (e.g. SLS, QUBT, CYTK).
Logic: Polygon V3 with 30-day filter → if <2 results, fallback to Yahoo Finance RSS.

## Env Vars
**Vercel / scripts:**
`POLYGON_API_KEY`, `APIFY_TOKEN`, `OPENROUTER_API_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`REVALIDATE_SECRET`, `SITE_URL`,
`SCRAPER_SERVICE_URL` ← set automatically to `http://127.0.0.1:8000` in GitHub Actions

**Investor Quotes:**
`X_BEARER_TOKEN` ← Twitter/X API v2 Bearer token (required for POST /api/quotes)
`CRON_SECRET` ← Vercel Cron secret (set in Vercel dashboard, auto-injected into cron requests)

Tracked investors: Michael Burry, Bill Ackman, Cathie Wood, Stanley Druckenmiller.
