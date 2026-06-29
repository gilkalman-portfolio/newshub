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
- **Scraper Service:** Python FastAPI + Scrapling on Railway — scrapes sources without RSS

## Key Files
- `app/api/stocks/route.ts` — prices + news API (Polygon V3 + Yahoo RSS fallback)
- `app/api/twits/route.ts` — StockTwits via Apify
- `app/stocks/page.tsx` — watchlist page (localStorage, auto-refresh)
- `app/page.tsx` — main news feed
- `app/actions.ts` — server actions (Supabase fetch, summarization)
- `lib/rss.ts` — 79 RSS sources across 6 categories
- `scripts/fetch.ts` — daily ETL: RSS + Scraper Service → Gemini → Supabase
- `scraper-service/main.py` — Scrapling microservice (Reddit, GitHub Trending, N12, Funder)

## Refresh Cadence (stocks page)
| Data | Interval |
|------|----------|
| Prices | 2 min |
| News | 10 min |
| StockTwits | 24 hr |

## News Pipeline (scripts/fetch.ts)
Runs daily (cron or manually). Flow:
1. Fetch 79 RSS sources in parallel
2. Fetch Scraper Service (if `SCRAPER_SERVICE_URL` is set) in parallel with RSS
3. Merge candidates, cap at 40 per category
4. Dedup against Supabase
5. Batch-summarise with Gemini 2.5 Flash → Hebrew
6. Insert to Supabase, prune old articles

## Scraper Service (scraper-service/)
Python FastAPI + [Scrapling](https://github.com/d4vinci/Scrapling) deployed on Railway.
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

**To deploy:** push `scraper-service/` as a Railway service (Dockerfile included).
**To test locally:** `cd scraper-service && pip install -r requirements.txt && scrapling install && uvicorn main:app --reload`

## News Coverage Fix
Polygon has sparse coverage for small/mid-cap tickers (e.g. SLS, QUBT, CYTK).
Logic: Polygon V3 with 30-day filter → if <2 results, fallback to Yahoo Finance RSS.

## Env Vars
**Vercel / scripts:**
`POLYGON_API_KEY`, `APIFY_TOKEN`, `OPENROUTER_API_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SCRAPER_SERVICE_URL` ← Railway URL of the scraper service (optional; pipeline works without it)
