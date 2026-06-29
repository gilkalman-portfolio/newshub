import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Vercel Pro max for serverless functions

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID    = 'automation-lab~stocktwits-scraper';
const APIFY_URL   = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`;

export interface StockTwit {
  id:          string;
  body:        string;
  createdAt:   string;
  username:    string;
  sentiment:   'Bullish' | 'Bearish' | null;
  priceTarget: number | null;
  url:         string;
}

export interface TwitsResult {
  ticker: string;
  twits:  StockTwit[];
  error?: string;
}

export async function GET(req: NextRequest) {
  if (!APIFY_TOKEN) {
    return NextResponse.json({ error: 'APIFY_TOKEN not set' }, { status: 500 });
  }

  const raw     = req.nextUrl.searchParams.get('tickers') ?? '';
  const tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 12);

  if (!tickers.length) return NextResponse.json([] as TwitsResult[]);

  // Abort the fetch after 50s — must be less than maxDuration (60s) so Vercel
  // has time to return the response before killing the function
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);

  try {
    // Single Apify run for all tickers — much cheaper than one run per ticker
    // timeout=45 tells Apify to return partial results after 45s rather than
    // running indefinitely; keeps us well within the 50s fetch abort signal
    const res = await fetch(
      `${APIFY_URL}?token=${APIFY_TOKEN}&timeout=45&memoryMbytes=256`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode:        'symbol',
          symbols:     tickers,
          maxMessages: 8,
        }),
        signal: controller.signal,
        next: { revalidate: 3600 },
      }
    );

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      console.error('[twits] Apify error:', res.status, text);
      return NextResponse.json(
        tickers.map(t => ({ ticker: t, twits: [], error: `Apify ${res.status}` })),
        { status: 200 }
      );
    }

    const raw_items: any[] = await res.json();

    // Group messages by ticker symbol
    const grouped: Record<string, StockTwit[]> = {};
    for (const ticker of tickers) grouped[ticker] = [];

    for (const item of raw_items) {
      const itemSymbols: string[] = (item.symbols ?? []).map((s: any) =>
        typeof s === 'string' ? s : s?.symbol ?? ''
      );

      for (const ticker of tickers) {
        if (itemSymbols.includes(ticker) && grouped[ticker].length < 8) {
          grouped[ticker].push({
            id:          String(item.messageId ?? item.id ?? Math.random()),
            body:        item.body ?? '',
            createdAt:   item.createdAt ?? item.created_at ?? '',
            username:    item.username ?? item.userName ?? 'unknown',
            sentiment:   item.sentiment ?? null,
            priceTarget: item.priceTarget ?? null,
            url:         item.url ?? `https://stocktwits.com/symbol/${ticker}`,
          });
        }
      }
    }

    const results: TwitsResult[] = tickers.map(ticker => ({
      ticker,
      twits: grouped[ticker],
    }));

    return NextResponse.json(results, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
    });

  } catch (err: any) {
    clearTimeout(timer);
    console.error('[twits] fetch failed:', err.message);
    return NextResponse.json(
      tickers.map(t => ({ ticker: t, twits: [], error: err.message })),
      { status: 200 }
    );
  }
}
