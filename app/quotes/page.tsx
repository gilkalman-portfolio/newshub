import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import type { Quote } from '@/lib/types';
import { INVESTOR_CONFIG } from '@/lib/types';
import { cleanQuoteText, isDisplayableQuote } from '@/lib/quotes-display';
import { isLatin } from '@/lib/text';
import { relativeTimeHe } from '@/lib/time';
import { initials } from '@/lib/string';
import SiteHeader from '@/components/SiteHeader';

export const revalidate = 900; // 15 minutes

export const metadata: Metadata = {
  title: 'Quotes | NewsHUB',
  description: 'ציטוטים של משקיעים מובילים — NewsHUB',
};

async function fetchQuotes(): Promise<Quote[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .order('tweeted_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[quotes page] fetch error:', error.message);
    return [];
  }
  return (data as Quote[]).filter((q) => isDisplayableQuote(q.text));
}

export default async function QuotesPage() {
  const quotes = await fetchQuotes();

  return (
    <>
      <SiteHeader
        srTitle="ציטוטי משקיעים"
        center={
          <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--neon)' }}>
            💬 QUOTES
          </span>
        }
        right={
          <div className="status-pill">
            <div className="status-dot ok" />
            <span className="status-txt">{quotes.length} ציטוטים</span>
          </div>
        }
      />

      <main className="quotes-main">
        {quotes.length === 0 && (
          <p className="quotes-empty">
            אין ציטוטים עדיין — הרץ את ה-POST /api/quotes כדי לטעון מ-X
          </p>
        )}

        <div className="quotes-list">
          {quotes.map((quote) => {
            const config = INVESTOR_CONFIG[quote.author_handle];
            const color  = config?.color ?? '#4F6EF7';
            const tweetUrl = quote.tweet_id
              ? `https://x.com/${quote.author_handle}/status/${quote.tweet_id}`
              : `https://x.com/${quote.author_handle}`;

            return (
              <a
                key={quote.id}
                href={tweetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="quote-page-card"
                style={{
                  borderColor: `color-mix(in srgb, ${color} 20%, var(--border))`,
                }}
              >
                <div className="qp-head">
                  <div className="qp-avatar" style={{ background: color }}>
                    {initials(quote.author_name)}
                  </div>
                  <div className="qp-author">
                    <div className="qp-author-name">
                      {quote.author_name}
                    </div>
                    <div className="qp-author-handle">
                      @{quote.author_handle} · {quote.author_firm}
                    </div>
                  </div>
                  <span className="qp-x-badge">
                    ✕
                  </span>
                </div>

                <p
                  dir={isLatin(quote.text) ? 'ltr' : undefined}
                  className="qp-text"
                  style={isLatin(quote.text) ? { textAlign: 'left' } : undefined}
                >
                  {cleanQuoteText(quote.text)}
                </p>

                <div className="qp-footer">
                  <span className="qp-firm" style={{ color }}>{quote.author_firm}</span>
                  <span className="qp-time">
                    {relativeTimeHe(quote.tweeted_at ?? quote.fetched_at)}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      </main>
    </>
  );
}
