import { NextRequest, NextResponse } from 'next/server';

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

  try {
    // Single Apify run for all tickers — much cheaper than one run per ticker
    const res = await fetch(
      `${APIFY_URL}?token=${APIFY_TOKEN}&timeout=90&memoryMbytes=256`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode:        'symbol',
          symbols:     tickers,
          maxMessages: 8,
        }),
        // Cache for 1h server-side — balance between freshness and Apify cost
        next: { revalidate: 3600 },
      }
    );

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
      // Each item has a `symbols` array — find which of our tickers it belongs to
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
    console.error('[twits] fetch failed:', err.message);
    return NextResponse.json(
      tickers.map(t => ({ ticker: t, twits: [], error: err.message })),
      { status: 200 }
    );
  }
}
