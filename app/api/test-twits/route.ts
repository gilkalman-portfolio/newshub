import { NextResponse } from 'next/server';

const TICKERS = ['AAPL', 'NVDA', 'TSLA'];

export const dynamic = 'force-dynamic';

export async function GET() {
  const globalStart = Date.now();

  const results = await Promise.all(TICKERS.map(async ticker => {
    const t0 = Date.now();
    try {
      const res = await fetch(
        `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      );
      const ms = Date.now() - t0;
      if (!res.ok) return { ticker, ok: false, status: res.status, ms };
      const data = await res.json();
      const sample = data.messages?.[0];
      return {
        ticker,
        ok: true,
        status: res.status,
        messageCount: data.messages?.length ?? 0,
        ms,
        sample: sample ? {
          user: sample.user?.username,
          body: sample.body?.slice(0, 100),
          sentiment: sample.entities?.sentiment?.basic ?? null,
          created_at: sample.created_at,
        } : null,
      };
    } catch (e: any) {
      return { ticker, ok: false, error: e.message, ms: Date.now() - t0 };
    }
  }));

  return NextResponse.json({
    env: 'vercel',
    totalMs: Date.now() - globalStart,
    tickers: results,
  });
}
