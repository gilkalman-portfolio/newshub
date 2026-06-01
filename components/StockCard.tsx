'use client';

import type { StockData } from '@/app/api/stocks/route';

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 2)   return 'עכשיו';
  if (diff < 60)  return `לפני ${diff} דק׳`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `לפני ${h} שע׳`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

function SentimentDot({ s }: { s?: string }) {
  const color =
    s === 'positive' ? '#16A34A' :
    s === 'negative' ? '#DC2626' :
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

interface Props {
  data: StockData;
  onRemove: (ticker: string) => void;
}

export default function StockCard({ data, onRemove }: Props) {
  const { ticker, snapshot, news } = data;
  const up   = (snapshot?.changePerc ?? 0) >= 0;
  const pct  = snapshot ? `${up ? '+' : ''}${snapshot.changePerc.toFixed(2)}%` : '—';
  const price = snapshot ? `$${snapshot.price.toFixed(2)}` : '—';
  const changeColor = up ? '#16A34A' : '#DC2626';
  const changeBg    = up ? '#DCFCE7' : '#FEE2E2';

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
          >
            ×
          </button>
        </div>

        <div className="stock-price-row">
          <span className="stock-price">{price}</span>
          {snapshot && (
            <span
              className="stock-badge"
              style={{ color: changeColor, background: changeBg }}
            >
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
      <div className="stock-news-list">
        {news.length === 0 && (
          <p className="stock-no-news">אין חדשות זמינות</p>
        )}
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
    </div>
  );
}
