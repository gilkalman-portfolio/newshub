import { NextRequest, NextResponse } from 'next/server';
import Parser from 'rss-parser';

const KEY  = process.env.POLYGON_API_KEY;
const BASE = 'https://api.polygon.io';
const rssParser = new Parser({ timeout: 5000 });

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

async function fetchNewsFromPolygon(ticker: string): Promise<StockNews[]> {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${BASE}/v3/reference/news?ticker=${ticker}&limit=5&order=desc&published_utc.gte=${since}&apiKey=${KEY}`,
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

async function fetchNewsFromYahoo(ticker: string): Promise<StockNews[]> {
  try {
    const feed = await rssParser.parseURL(
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`
    );
    return (feed.items ?? []).slice(0, 5).map((item, i) => ({
      id:            `yahoo-${ticker}-${i}`,
      title:         item.title ?? '',
      article_url:   item.link ?? '',
      published_utc: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      publisher:     { name: 'Yahoo Finance' },
      sentiment:     'neutral' as const,
    }));
  } catch {
    return [];
  }
}

async function fetchNews(ticker: string): Promise<StockNews[]> {
  const polygonNews = await fetchNewsFromPolygon(ticker);
  if (polygonNews.length >= 2) return polygonNews;
  // Polygon has sparse coverage for this ticker — try Yahoo Finance RSS
  const yahooNews = await fetchNewsFromYahoo(ticker);
  if (yahooNews.length > 0) return yahooNews;
  return polygonNews; // return whatever Polygon had (even if old/empty)
}

// mode=prices  → only snapshot  (cache 2min)
// mode=news    → only news      (cache 10min)
// mode=all     → both           (default, first load)
export async function GET(req: NextRequest) {
  if (!KEY) {
    return NextResponse.json({ error: 'POLYGON_API_KEY not set' }, { status: 500 });
  }

  const raw    = req.nextUrl.searchParams.get('tickers') ?? '';
  const mode   = req.nextUrl.searchParams.get('mode') ?? 'all';
  const tickers = raw
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 12);

  if (!tickers.length) return NextResponse.json([] as StockData[]);

  const results: StockData[] = await Promise.all(
    tickers.map(async (ticker) => {
      const [snapshot, news] = await Promise.all([
        mode !== 'news' ? fetchSnapshot(ticker) : Promise.resolve(null),
        mode !== 'prices' ? fetchNews(ticker)   : Promise.resolve([]),
      ]);
      return { ticker, snapshot, news };
    })
  );

  // Cache header matches the mode
  const maxAge = mode === 'news' ? 600 : 120;
  return NextResponse.json(results, {
    headers: { 'Cache-Control': `s-maxage=${maxAge}, stale-while-revalidate=30` },
  });
}
