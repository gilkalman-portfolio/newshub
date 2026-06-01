import { NextRequest, NextResponse } from 'next/server';

const KEY  = process.env.POLYGON_API_KEY;
const BASE = 'https://api.polygon.io';

export interface StockNews {
  id: string;
  title: string;
  article_url: string;
  published_utc: string;
  publisher: { name: string };
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface StockSnapshot {
  ticker: string;
  price: number;
  changePerc: number;
  change: number;
  prevClose: number;
}

export interface StockData {
  ticker: string;
  snapshot: StockSnapshot | null;
  news: StockNews[];
  error?: string;
}

async function fetchSnapshot(ticker: string): Promise<StockSnapshot | null> {
  try {
    // Try real-time snapshot first (works during market hours)
    const snapRes = await fetch(
      `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${KEY}`,
      { next: { revalidate: 60 } }
    );
    const snapJson = await snapRes.json();
    const t = snapJson?.ticker;

    if (t && (t.day?.c || t.lastTrade?.p)) {
      return {
        ticker,
        price:      t.day?.c ?? t.lastTrade?.p ?? 0,
        changePerc: t.todaysChangePerc ?? 0,
        change:     t.todaysChange ?? 0,
        prevClose:  t.prevDay?.c ?? 0,
      };
    }

    // Fallback: previous day close (works when market is closed)
    const prevRes = await fetch(
      `${BASE}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${KEY}`,
      { next: { revalidate: 3600 } }
    );
    const prevJson = await prevRes.json();
    const r = prevJson?.results?.[0];
    if (!r) return null;

    return {
      ticker,
      price:      r.c ?? 0,
      changePerc: r.o ? ((r.c - r.o) / r.o) * 100 : 0,
      change:     r.o ? r.c - r.o : 0,
      prevClose:  r.o ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchNews(ticker: string): Promise<StockNews[]> {
  try {
    const res = await fetch(
      `${BASE}/v2/reference/news?ticker=${ticker}&limit=5&order=desc&apiKey=${KEY}`,
      { next: { revalidate: 300 } }
    );
    const json = await res.json();
    return (json?.results ?? []).map((a: any) => ({
      id:            a.id,
      title:         a.title,
      article_url:   a.article_url,
      published_utc: a.published_utc,
      publisher:     a.publisher ?? { name: 'Unknown' },
      sentiment:     a.insights?.find((i: any) => i.ticker === ticker)?.sentiment ?? 'neutral',
    }));
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  if (!KEY) {
    return NextResponse.json({ error: 'POLYGON_API_KEY not set' }, { status: 500 });
  }

  const raw = req.nextUrl.searchParams.get('tickers') ?? '';
  const tickers = raw
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 12); // cap at 12 tickers

  if (!tickers.length) {
    return NextResponse.json([] as StockData[]);
  }

  const results: StockData[] = await Promise.all(
    tickers.map(async (ticker) => {
      const [snapshot, news] = await Promise.all([
        fetchSnapshot(ticker),
        fetchNews(ticker),
      ]);
      return { ticker, snapshot, news };
    })
  );

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
  });
}
