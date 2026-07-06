import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import type { Quote } from '@/lib/types';
import { INVESTOR_CONFIG } from '@/lib/types';
import Link from 'next/link';

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
  return data as Quote[];
}

function relativeTimeHe(dateStr: string | null): string {
  if (!dateStr) return '';
  const now  = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diffMins  = Math.floor((now - then) / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays  = Math.floor(diffHours / 24);
  if (diffMins < 2)    return 'עכשיו';
  if (diffMins < 60)   return `לפני ${diffMins} דקות`;
  if (diffHours === 1) return 'לפני שעה';
  if (diffHours < 24)  return `לפני ${diffHours} שעות`;
  if (diffDays === 1)  return 'אתמול';
  return `לפני ${diffDays} ימים`;
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('');
}

export default async function QuotesPage() {
  const quotes = await fetchQuotes();

  return (
    <>
      <header>
        <h1 className="sr-only">ציטוטי משקיעים</h1>
        <Link href="/" className="logo" style={{ textDecoration: 'none' }}>
          NewsHUB
        </Link>
        <span className="header-center" style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--neon)' }}>
          💬 QUOTES
        </span>
        <div className="header-right">
          <div className="status-pill">
            <div className="status-dot ok" />
            <span className="status-txt">{quotes.length} ציטוטים</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px', direction: 'rtl' }}>
        {quotes.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 60, fontSize: 14 }}>
            אין ציטוטים עדיין — הרץ את ה-POST /api/quotes כדי לטעון מ-X
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: color, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 12, fontWeight: 700,
                    color: '#fff', flexShrink: 0,
                    fontFamily: 'var(--font-space-grotesk)',
                  }}>
                    {initials(quote.author_name)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-hi)' }}>
                      {quote.author_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ibm-plex-mono)' }}>
                      @{quote.author_handle} · {quote.author_firm}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, background: 'var(--text-hi)', color: 'var(--surface)', borderRadius: 3, padding: '2px 5px', fontWeight: 700 }}>
                    ✕
                  </span>
                </div>

                <p style={{ fontSize: 15, color: 'var(--text-body)', lineHeight: 1.6, marginBottom: 10 }}>
                  {quote.text}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: color, fontWeight: 600 }}>{quote.author_firm}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ibm-plex-mono)' }}>
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
