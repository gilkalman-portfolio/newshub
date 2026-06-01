'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { StockData } from '@/app/api/stocks/route';
import StockCard from '@/components/StockCard';

const STORAGE_KEY = 'newshub_watchlist';
const DEFAULT_TICKERS = ['AAPL', 'NVDA', 'TSLA'];
const REFRESH_MS = 60_000;

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
  const [loading, setLoading]         = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError]             = useState<string | null>(null);

  // Load watchlist from localStorage on mount
  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);

  // Persist watchlist
  useEffect(() => {
    if (watchlist.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
    }
  }, [watchlist]);

  const fetchData = useCallback(async (tickers: string[]) => {
    if (!tickers.length) { setData([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/stocks?tickers=${tickers.join(',')}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שגיאה בטעינה');
      setData(json);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e.message ?? 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on watchlist change
  useEffect(() => {
    if (watchlist.length > 0) fetchData(watchlist);
  }, [watchlist, fetchData]);

  // Auto-refresh every minute
  useEffect(() => {
    const id = setInterval(() => {
      if (watchlist.length > 0) fetchData(watchlist);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [watchlist, fetchData]);

  function addTicker() {
    const t = input.trim().toUpperCase();
    if (!t || watchlist.includes(t)) { setInput(''); return; }
    setWatchlist(prev => [...prev, t]);
    setInput('');
  }

  function removeTicker(ticker: string) {
    setWatchlist(prev => prev.filter(t => t !== ticker));
    setData(prev => prev.filter(d => d.ticker !== ticker));
  }

  // Map data by ticker for ordering
  const dataMap = Object.fromEntries(data.map(d => [d.ticker, d]));

  return (
    <>
      {/* Header */}
      <header>
        <Link href="/" className="logo" style={{ textDecoration: 'none' }}>
          NewsHUB
        </Link>
        <span className="header-center">תיק המניות שלי</span>
        <div className="header-right">
          <button
            className={`refresh-btn${loading ? ' refreshing' : ''}`}
            onClick={() => fetchData(watchlist)}
            disabled={loading}
          >
            <span className="refresh-icon">↻</span>
            <span className="refresh-label">{loading ? 'טוען...' : 'רענן'}</span>
          </button>
          {lastUpdated && (
            <span className="status-txt" style={{ fontSize: 10 }}>
              עודכן {lastUpdated.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </header>

      <main className="stocks-page">
        {/* Add ticker */}
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
          <button className="stocks-add-btn" onClick={addTicker}>
            + הוסף
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="stocks-error">{error}</div>
        )}

        {/* Empty state */}
        {watchlist.length === 0 && (
          <div className="stocks-empty">
            <span style={{ fontSize: 32 }}>📈</span>
            <p>הוסף מניות לרשימת המעקב שלך</p>
            <span className="cat-empty-hint">לדוגמה: AAPL, TSLA, NVDA</span>
          </div>
        )}

        {/* Cards grid */}
        <div className="stocks-grid">
          {watchlist.map((ticker) => {
            const d = dataMap[ticker];
            if (!d && loading) {
              return (
                <div key={ticker} className="stock-card stock-card-skeleton">
                  <div className="stock-ticker">{ticker}</div>
                  <div className="skeleton-line" />
                  <div className="skeleton-line short" />
                </div>
              );
            }
            if (!d) return null;
            return (
              <StockCard key={ticker} data={d} onRemove={removeTicker} />
            );
          })}
        </div>
      </main>
    </>
  );
}
