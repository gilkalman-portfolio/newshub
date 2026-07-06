'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { StockData } from '@/app/api/stocks/route';
import type { TwitsResult, StockTwit } from '@/app/api/twits/route';
import StockCard from '@/components/StockCard';

const STORAGE_KEY      = 'newshub_watchlist';
const DEFAULT_TICKERS  = ['AAPL', 'NVDA', 'TSLA'];
const PRICE_REFRESH_MS = 2  * 60_000;   // מחיר כל 2 דקות
const NEWS_REFRESH_MS  = 10 * 60_000;   // חדשות כל 10 דקות
const TWITS_REFRESH_MS = 24 * 60 * 60_000; // StockTwits פעם ביום

function loadWatchlist(): string[] {
  if (typeof window === 'undefined') return DEFAULT_TICKERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TICKERS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TICKERS;
  } catch {
    return DEFAULT_TICKERS;
  }
}

export default function StocksPage() {
  const [watchlist, setWatchlist]     = useState<string[]>([]);
  const [input, setInput]             = useState('');
  const [data, setData]               = useState<StockData[]>([]);
  const [twitsMap, setTwitsMap]       = useState<Record<string, StockTwit[]>>({});
  const [twitsLoading, setTwitsLoading] = useState(false);
  const [twitsError, setTwitsError]   = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => { setWatchlist(loadWatchlist()); }, []);

  useEffect(() => {
    if (watchlist.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  // ── Stocks (price + news) ─────────────────────────────────
  const fetchData = useCallback(async (tickers: string[], mode: 'all' | 'prices' | 'news' = 'all'): Promise<boolean> => {
    if (!tickers.length) { setData([]); return true; }
    if (mode === 'all') setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/stocks?tickers=${tickers.join(',')}&mode=${mode}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שגיאה בטעינה');
      if (mode === 'all') {
        setData(json);
      } else if (mode === 'prices') {
        setData(prev => prev.map(d => {
          const u = json.find((x: any) => x.ticker === d.ticker);
          return u ? { ...d, snapshot: u.snapshot ?? d.snapshot } : d;
        }));
      } else {
        setData(prev => prev.map(d => {
          const u = json.find((x: any) => x.ticker === d.ticker);
          return u ? { ...d, news: u.news?.length ? u.news : d.news } : d;
        }));
      }
      setLastUpdated(new Date());
      return true;
    } catch (e: any) {
      setError(e.message ?? 'שגיאה לא ידועה');
      return false;
    } finally {
      if (mode === 'all') setLoading(false);
    }
  }, []);

  // ── StockTwits ────────────────────────────────────────────
  const fetchTwits = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return;
    setTwitsLoading(true);
    setTwitsError(null);
    try {
      const res  = await fetch(`/api/twits?tickers=${tickers.join(',')}`);
      if (!res.ok) throw new Error('שגיאה בטעינת StockTwits');
      const json: TwitsResult[] = await res.json();
      const map: Record<string, StockTwit[]> = {};
      for (const item of json) map[item.ticker] = item.twits;
      setTwitsMap(prev => ({ ...prev, ...map }));
    } catch (e: any) {
      console.error('[twits] fetch error', e);
      setTwitsError(e.message ?? 'שגיאה בטעינת StockTwits');
    } finally {
      setTwitsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (watchlist.length > 0) {
      fetchData(watchlist);
      fetchTwits(watchlist);
    }
  }, [watchlist, fetchData, fetchTwits]);

  // Auto-refresh: prices
  useEffect(() => {
    const id = setInterval(() => { if (watchlist.length) fetchData(watchlist, 'prices'); }, PRICE_REFRESH_MS);
    return () => clearInterval(id);
  }, [watchlist, fetchData]);

  // Auto-refresh: news
  useEffect(() => {
    const id = setInterval(() => { if (watchlist.length) fetchData(watchlist, 'news'); }, NEWS_REFRESH_MS);
    return () => clearInterval(id);
  }, [watchlist, fetchData]);

  // Auto-refresh: twits (once a day)
  useEffect(() => {
    const id = setInterval(() => { if (watchlist.length) fetchTwits(watchlist); }, TWITS_REFRESH_MS);
    return () => clearInterval(id);
  }, [watchlist, fetchTwits]);

  async function manualRefresh() {
    if (refreshing || !watchlist.length) return;
    setRefreshing(true);
    setRefreshStatus('idle');
    const ok = await fetchData(watchlist, 'prices');
    setRefreshing(false);
    setRefreshStatus(ok ? 'ok' : 'err');
    setTimeout(() => setRefreshStatus('idle'), 2000);
  }

  function addTicker() {
    const t = input.trim().toUpperCase();
    if (!t || watchlist.includes(t)) { setInput(''); return; }
    setWatchlist(prev => [...prev, t]);
    setInput('');
    // Fetch twits immediately for the new ticker
    setTimeout(() => fetchTwits([t]), 100);
  }

  function removeTicker(ticker: string) {
    setWatchlist(prev => prev.filter(t => t !== ticker));
    setData(prev => prev.filter(d => d.ticker !== ticker));
    setTwitsMap(prev => { const m = { ...prev }; delete m[ticker]; return m; });
  }

  const dataMap = Object.fromEntries(data.map(d => [d.ticker, d]));

  return (
    <>
      <header>
        <Link href="/" className="logo" style={{ textDecoration: 'none' }}>NewsHUB</Link>
        <span className="header-center">תיק המניות שלי</span>
        <div className="header-right">
          {twitsLoading && (
            <span className="status-txt" style={{ fontSize: 10, color: '#7C3AED' }}>
              💬 טוען StockTwits...
            </span>
          )}
          <button
            className={`refresh-btn${refreshing ? ' refreshing' : ''}${refreshStatus === 'ok' ? ' refresh-ok' : ''}${refreshStatus === 'err' ? ' refresh-err' : ''}`}
            onClick={manualRefresh}
            disabled={refreshing || loading}
          >
            <span className="refresh-icon">
              {refreshStatus === 'ok' ? '✓' : refreshStatus === 'err' ? '✗' : '↻'}
            </span>
            <span className="refresh-label">
              {refreshing ? 'טוען...' : refreshStatus === 'ok' ? 'עודכן' : refreshStatus === 'err' ? 'שגיאה' : 'רענן'}
            </span>
          </button>
          {lastUpdated && (
            <span className="status-txt" style={{ fontSize: 10 }}>
              עודכן {lastUpdated.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </header>

      <main className="stocks-page">
        <div className="stocks-add-row">
          <input
            className="stocks-input"
            placeholder="הוסף טיקר — לדוגמה: MSFT"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addTicker()}
            maxLength={10}
            dir="ltr"
          />
          <button className="stocks-add-btn" onClick={addTicker}>+ הוסף</button>
        </div>

        {error && <div className="stocks-error">{error}</div>}

        {watchlist.length === 0 && (
          <div className="stocks-empty">
            <span style={{ fontSize: 32 }}>📈</span>
            <p>הוסף מניות לרשימת המעקב שלך</p>
            <span className="cat-empty-hint">לדוגמה: AAPL, TSLA, NVDA</span>
          </div>
        )}

        <div className="stocks-grid">
          {watchlist.map((ticker) => {
            const d = dataMap[ticker];
            if (!d && loading) {
              return (
                <div key={ticker} className="stock-card stock-card-skeleton">
                  <div className="stock-ticker">{ticker}</div>
                  <div className="skeleton-line" /><div className="skeleton-line short" />
                </div>
              );
            }
            if (!d) return null;
            return (
              <StockCard
                key={ticker}
                data={d}
                twits={twitsMap[ticker] ?? []}
                twitsLoading={twitsLoading}
                twitsError={twitsError}
                onRemove={removeTicker}
              />
            );
          })}
        </div>
      </main>
    </>
  );
}
