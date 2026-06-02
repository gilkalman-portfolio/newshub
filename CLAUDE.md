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
  - Apify — StockTwits scraping (once/day)
  - OpenRouter (Gemini 2.5 Flash) — article summarization

## Key Files
- `app/api/stocks/route.ts` — prices + news API (Polygon V3 + Yahoo RSS fallback)
- `app/api/twits/route.ts` — StockTwits via Apify
- `app/stocks/page.tsx` — watchlist page (localStorage, auto-refresh)
- `app/page.tsx` — main news feed
- `app/actions.ts` — server actions (Supabase fetch, summarization)

## Refresh Cadence (stocks page)
| Data | Interval |
|------|----------|
| Prices | 2 min |
| News | 10 min |
| StockTwits | 24 hr |

## News Coverage Fix
Polygon has sparse coverage for small/mid-cap tickers (e.g. SLS, QUBT, CYTK).
Logic: Polygon V3 with 30-day filter → if <2 results, fallback to Yahoo Finance RSS.

## Env Vars
`POLYGON_API_KEY`, `APIFY_TOKEN`, `OPENROUTER_API_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
