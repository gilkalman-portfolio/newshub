'use client';

import { useState } from 'react';
import type { StockData } from '@/app/api/stocks/route';
import type { StockTwit } from '@/app/api/twits/route';

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 2)   return 'עכשיו';
  if (diff < 60)  return `לפני ${diff} דק׳`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `לפני ${h} שע׳`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

function SentimentDot({ s }: { s?: string | null }) {
  const color =
    s === 'positive' || s === 'Bullish' ? '#16A34A' :
    s === 'negative' || s === 'Bearish' ? '#DC2626' :
    '#9CA3AF';
  return (
    <span
      title={s ?? 'neutral'}
      style={{
        display: 'inline-block',
        width: 7, height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        marginTop: 5,
      }}
    />
  );
}

function TwitSentimentBadge({ s }: { s: 'Bullish' | 'Bearish' | null }) {
  if (!s) return null;
  const isBull = s === 'Bullish';
  return (
    <span className={`twit-badge ${isBull ? 'twit-badge-bull' : 'twit-badge-bear'}`}>
      {isBull ? '🐂 Bullish' : '🐻 Bearish'}
    </span>
  );
}

interface Props {
  data:  StockData;
  twits: StockTwit[];
  twitsLoading?: boolean;
  twitsError?: string | null;
  onRemove: (ticker: string) => void;
}

export default function StockCard({ data, twits, twitsLoading, twitsError, onRemove }: Props) {
  const { ticker, snapshot, news } = data;
  const up   = (snapshot?.changePerc ?? 0) >= 0;
  const pct  = snapshot ? `${up ? '+' : ''}${snapshot.changePerc.toFixed(2)}%` : '—';
  const price = snapshot ? `$${snapshot.price.toFixed(2)}` : '—';
  const changeColor = up ? '#16A34A' : '#DC2626';
  const changeBg    = up ? '#DCFCE7' : '#FEE2E2';

  // StockTwits sentiment summary
  // Require at least 3 explicitly tagged posts — otherwise the bar is statistically misleading
  const bullCount = twits.filter(t => t.sentiment === 'Bullish').length;
  const bearCount = twits.filter(t => t.sentiment === 'Bearish').length;
  const totalSentiment = bullCount + bearCount;
  const bullPct = totalSentiment >= 3 ? Math.round((bullCount / totalSentiment) * 100) : null;

  // AI Summary state
  const [summary, setSummary]           = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen]   = useState(false);

  async function fetchSummary() {
    if (summaryLoading) return;
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryOpen(true);
    try {
      const res = await fetch('/api/twits-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, twits }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'שגיאה בסיכום');
      setSummary(json.summary_he);
    } catch (e: any) {
      setSummaryError(e.message ?? 'שגיאה');
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className="stock-card">
      {/* Card header */}
      <div className="stock-card-head">
        <div className="stock-card-ticker-row">
          <span className="stock-ticker">{ticker}</span>
          <button
            className="stock-remove-btn"
            onClick={() => onRemove(ticker)}
            title="הסר מניה"
          >×</button>
        </div>

        <div className="stock-price-row">
          <span className="stock-price">{price}</span>
          {snapshot && (
            <span className="stock-badge" style={{ color: changeColor, background: changeBg }}>
              {pct}
            </span>
          )}
          {!snapshot && (
            <span className="stock-badge" style={{ color: '#9CA3AF', background: '#F3F4F6' }}>
              אין נתונים
            </span>
          )}
        </div>
        {snapshot && (
          <div className="stock-prev-close">
            סגירה קודמת: ${snapshot.prevClose.toFixed(2)}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="stock-card-divider" />

      {/* News list */}
      <div className="stock-section-label">📰 חדשות</div>
      <div className="stock-news-list">
        {news.length === 0 && <p className="stock-no-news">אין חדשות זמינות</p>}
        {news.map((item) => (
          <a
            key={item.id}
            href={item.article_url}
            target="_blank"
            rel="noopener noreferrer"
            className="stock-news-item"
          >
            <SentimentDot s={item.sentiment} />
            <div className="stock-news-text">
              <span className="stock-news-title">{item.title}</span>
              <span className="stock-news-meta">
                {item.publisher.name} · {relTime(item.published_utc)}
              </span>
            </div>
          </a>
        ))}
      </div>

      {/* StockTwits section */}
      {twits.length > 0 && (
        <>
          <div className="stock-card-divider" />
          <div className="stock-section-label">
            💬 StockTwits
            {bullPct !== null && (
              <span className="twits-sentiment-bar-label">
                <span style={{ color: '#16A34A' }}>🐂 {bullPct}%</span>
                {' · '}
                <span style={{ color: '#DC2626' }}>🐻 {100 - bullPct}%</span>
              </span>
            )}
            {bullPct === null && totalSentiment > 0 && (
              <span className="twits-sentiment-bar-label" style={{ color: '#9CA3AF' }}>
                ({totalSentiment} תגיות — אין מספיק לבר)
              </span>
            )}
          </div>

          {/* Bull/Bear progress bar — only when ≥3 tagged posts */}
          {bullPct !== null && (
            <div className="twits-sentiment-bar">
              <div className="twits-bar-bull" style={{ width: `${bullPct}%` }} />
              <div className="twits-bar-bear" style={{ width: `${100 - bullPct}%` }} />
            </div>
          )}

          {/* AI Summary button */}
          <button
            className={`twits-summary-btn${summaryLoading ? ' loading' : ''}${summaryOpen && summary ? ' open' : ''}`}
            onClick={summaryOpen && summary ? () => setSummaryOpen(o => !o) : fetchSummary}
            disabled={summaryLoading}
          >
            {summaryLoading
              ? <><span className="twits-summary-spinner" /><span>Gemini מנתח...</span></>
              : summaryOpen && summary
                ? <><span>▲</span><span>הסתר סיכום</span></>
                : <><span>✦</span><span>סכם את הדיון בעברית</span></>}
          </button>

          {/* AI Summary panel */}
          {summaryOpen && (
            <div className="twits-summary-panel">
              {summaryLoading && (
                <div className="twits-summary-loading">
                  <span className="twits-summary-spinner large" />
                  <span>Gemini מנתח את הדיון...</span>
                </div>
              )}
              {summaryError && !summaryLoading && (
                <div className="twits-summary-error">⚠ {summaryError}</div>
              )}
              {summary && !summaryLoading && (
                <>
                  <div className="twits-summary-label">✦ סיכום AI</div>
                  <p className="twits-summary-text">{summary}</p>
                </>
              )}
            </div>
          )}

          <div className="stock-twits-list">
            {twits.map((twit, idx) => (
              <a
                key={`${twit.id}-${idx}`}
                href={twit.url}
                target="_blank"
                rel="noopener noreferrer"
                className="stock-twit-item"
              >
                <div className="twit-header">
                  <span className="twit-user">@{twit.username}</span>
                  <span className="twit-time">{relTime(twit.createdAt)}</span>
                </div>
                <p className="twit-body">{twit.body}</p>
                <div className="twit-footer">
                  <TwitSentimentBadge s={twit.sentiment} />
                  {twit.priceTarget && (
                    <span className="twit-price-target">🎯 ${twit.priceTarget}</span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {/* StockTwits loading/empty/error */}
      {twits.length === 0 && (
        <>
          <div className="stock-card-divider" />
          <div className="stock-section-label">💬 StockTwits</div>
          {twitsLoading && <p className="stock-no-news">טוען...</p>}
          {!twitsLoading && twitsError && (
            <p className="stock-no-news">⚠ שגיאה בטעינת StockTwits</p>
          )}
          {!twitsLoading && !twitsError && (
            <p className="stock-no-news">אין ציוצים</p>
          )}
        </>
      )}
    </div>
  );
}
