import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

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

async function fetchSymbol(ticker: string): Promise<TwitsResult> {
  try {
    const res = await fetch(
      `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) {
      return { ticker, twits: [], error: `StockTwits ${res.status}` };
    }

    const data = await res.json();
    const messages: any[] = data.messages ?? [];

    const twits: StockTwit[] = messages.slice(0, 8).map((m: any) => ({
      id:          String(m.id),
      body:        m.body ?? '',
      createdAt:   m.created_at ?? '',
      username:    m.user?.username ?? 'unknown',
      sentiment:   m.entities?.sentiment?.basic ?? null,
      priceTarget: null,
      url:         `https://stocktwits.com/symbol/${ticker}`,
    }));

    return { ticker, twits };
  } catch (err: any) {
    return { ticker, twits: [], error: err.message };
  }
}

export async function GET(req: NextRequest) {
  const raw     = req.nextUrl.searchParams.get('tickers') ?? '';
  const tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 12);

  if (!tickers.length) return NextResponse.json([] as TwitsResult[]);

  const results = await Promise.all(tickers.map(fetchSymbol));

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
  });
}
