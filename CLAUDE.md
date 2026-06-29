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
  - X API (Twitter) — investor quotes (Burry, Ackman, Wood, Druckenmiller)

## Key Files
- `app/api/stocks/route.ts` — prices + news API (Polygon V3 + Yahoo RSS fallback)
- `app/api/twits/route.ts` — StockTwits via Apify
- `app/api/quotes/route.ts` — GET quotes from Supabase, POST fetches from X API
- `app/stocks/page.tsx` — watchlist page (localStorage, auto-refresh)
- `app/page.tsx` — main news feed
- `app/quotes/page.tsx` — quotes archive page (/quotes)
- `app/actions.ts` — server actions (Supabase fetch, summarization)
- `components/QuoteItem.tsx` — quote card component
- `lib/types.ts` — Quote interface + INVESTOR_CONFIG (handles, colors, firms)

## Refresh Cadence (stocks page)
| Data | Interval |
|------|----------|
| Prices | 2 min |
| News | 10 min |
| StockTwits | 24 hr |

## Quotes Column
- Displayed as a 6th narrower column (0.7fr) in the main news grid
- Client-side fetch from Supabase every 15 min via GET /api/quotes
- New tweets loaded by calling POST /api/quotes (hits X API, upserts to Supabase)
- Investors tracked: `INVESTOR_CONFIG` in `lib/types.ts` — add/remove handles there
- Archive page at `/quotes` (server component, revalidates every 15 min)
- Supabase table: `quotes` (id, author_name, author_handle, author_firm, tweet_id, text, tweeted_at, fetched_at)

## News Coverage Fix
Polygon has sparse coverage for small/mid-cap tickers (e.g. SLS, QUBT, CYTK).
Logic: Polygon V3 with 30-day filter → if <2 results, fallback to Yahoo Finance RSS.

## Env Vars
`POLYGON_API_KEY`, `APIFY_TOKEN`, `OPENROUTER_API_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`X_BEARER_TOKEN`
