'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Article, AgentColumn, Category, Quote } from '@/lib/types';
import { refreshNews } from '@/app/actions';
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/types';
import { isDisplayableQuote } from '@/lib/quotes-display';
import { relativeTimeHe, formatHebrewDate } from '@/lib/time';
import NewsItem from './NewsItem';
import QuoteItem from './QuoteItem';
import SiteHeader from './SiteHeader';
import AgentColumnStrip from './AgentColumnStrip';

type RegionFilter = 'all' | 'israel' | 'world';

// Source names that belong to Israel — derived from lib/rss.ts region tags
const ISRAEL_SOURCES = new Set([
  'Ynet', 'Ynet Sport', 'Sport1',
  'Times of Israel', 'Jerusalem Post', 'Israel Hayom',
  'JPost Economy',
  'Geektime', 'NoCamels', 'Techtime',
]);

const REGION_TABS: { id: RegionFilter; label: string }[] = [
  { id: 'all',    label: 'הכל'   },
  { id: 'israel', label: 'ישראל' },
  { id: 'world',  label: 'עולם'  },
];

interface Props {
  articles: Record<Category, Article[]>;
  column?: AgentColumn | null;
}

// RTL column order: rightmost category first visually
const COLUMN_ORDER: Category[] = [
  'ai-builders',
  'tech',
  'economy',
  'news',
  'sports',
  'qa-testing',
];

// CSS custom-property variable names per category
const CAT_CSS_VAR: Record<Category, string> = {
  'ai-builders': 'var(--cat-ai)',
  'tech':        'var(--cat-tech)',
  'economy':     'var(--cat-eco)',
  'news':        'var(--cat-news)',
  'sports':      'var(--cat-sport)',
  'qa-testing':  'var(--cat-qa)',
};

// Animation delay per (column index, item index) — mimics prototype
function animDelay(colIdx: number, itemIdx: number): string {
  const base = (colIdx + 1) * 0.08;
  const perItem = itemIdx * 0.08;
  return `${(base + perItem).toFixed(2)}s`;
}

export default function NewsGrid({ articles, column = null }: Props) {
  const router = useRouter();
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [quotes, setQuotes] = useState<Quote[]>([]);

  // Sliding pill refs
  const switcherRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Focus management for slide panel
  const panelCloseRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const { refreshedAt } = await refreshNews();
      setLastRefresh(refreshedAt);
      router.refresh();
    } catch (err) {
      console.error('refreshNews failed:', err);
      setRefreshError('הרענון נכשל, נסה שוב');
      setTimeout(() => setRefreshError(null), 5000);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, router]);

  const openPanel = useCallback((article: Article) => {
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    setSelectedArticle(article);
    document.body.style.overflow = 'hidden';
  }, []);

  const closePanel = useCallback(() => {
    setSelectedArticle(null);
    document.body.style.overflow = '';
    lastFocusedRef.current?.focus();
  }, []);

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closePanel]);

  // Move focus to the close button when the panel opens
  useEffect(() => {
    if (selectedArticle) {
      panelCloseRef.current?.focus();
    }
  }, [selectedArticle]);

  // Animate sliding pill — runs on mount (no transition) and on every change (with transition)
  useEffect(() => {
    const idx = REGION_TABS.findIndex((t) => t.id === regionFilter);
    const btn = btnRefs.current[idx];
    const pill = pillRef.current;
    const switcher = switcherRef.current;
    if (!btn || !pill || !switcher) return;
    const sr = switcher.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    pill.style.left = `${br.left - sr.left}px`;
    pill.style.width = `${br.width}px`;
  }, [regionFilter]);

  // Suppress transition on first paint so pill doesn't animate from left:0
  useEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    pill.style.transition = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        pill.style.transition = '';
      });
    });
  }, []);

  // Filter articles by region
  const filteredArticles = useCallback(
    (cat: Category): Article[] => {
      if (regionFilter === 'all') return articles[cat];
      const isIsrael = regionFilter === 'israel';
      return articles[cat].filter((a) =>
        isIsrael ? ISRAEL_SOURCES.has(a.source) : !ISRAEL_SOURCES.has(a.source)
      );
    },
    [articles, regionFilter]
  );

  // Progress bar scroll tracking
  useEffect(() => {
    let raf = 0;
    const handler = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const pct =
          window.scrollY /
          Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        setScrollPct(Math.min(pct, 1));
      });
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => {
      window.removeEventListener('scroll', handler);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Fetch quotes on mount and every 15 minutes
  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const res = await fetch('/api/quotes?limit=5');
        if (res.ok) {
          const data: Quote[] = await res.json();
          setQuotes(data.filter((q) => isDisplayableQuote(q.text)));
        }
      } catch (err) {
        console.error('fetchQuotes failed:', err);
      }
    };
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const panelOpen = selectedArticle !== null;
  const catColor = selectedArticle
    ? CATEGORY_COLORS[selectedArticle.category]
    : 'var(--neon)';

  const totalArticles = COLUMN_ORDER.reduce(
    (sum, cat) => sum + filteredArticles(cat).length,
    0
  );

  return (
    <>
      {/* Reading progress bar */}
      <div
        id="prog"
        style={{ transform: `scaleX(${scrollPct})` }}
        aria-hidden="true"
      />

      {/* Header */}
      <SiteHeader
        srTitle="NewsHUB — חדשות יומיות בעברית"
        logoAsLink={false}
        center={formatHebrewDate(new Date())}
        right={
          <>
            <Link href="/stocks" className="refresh-btn" title="תיק המניות שלי">
              <span className="refresh-icon" style={{ fontSize: 14 }} aria-hidden="true">📈</span>
              <span className="refresh-label">מניות</span>
            </Link>
            <Link href="/column" className="refresh-btn" title="הטור של הסוכן">
              <span className="refresh-icon" style={{ fontSize: 14 }} aria-hidden="true">🤖</span>
              <span className="refresh-label">הטור</span>
            </Link>
            <button
              className={`refresh-btn${refreshing ? ' refreshing' : ''}${refreshError ? ' refresh-err' : ''}`}
              onClick={handleRefresh}
              disabled={refreshing}
              title={lastRefresh ? `עודכן: ${new Date(lastRefresh).toLocaleTimeString('he-IL')}` : 'רענן כתבות'}
              aria-label="רענן כתבות"
            >
              <span className="refresh-icon" aria-hidden="true">↻</span>
              <span className="refresh-label">{refreshing ? 'מרענן…' : 'רענן'}</span>
            </button>
            {refreshError && (
              <span className="refresh-error-msg" role="alert">{refreshError}</span>
            )}
            <div className="status-pill">
              <div className="status-dot ok" />
              <span className="status-txt">{totalArticles} כתבות</span>
            </div>
          </>
        }
      />

      {/* Region filter bar */}
      <nav className="region-nav" aria-label="סינון לפי אזור">
        <div className="region-switcher" ref={switcherRef}>
          <div className="region-pill" ref={pillRef} aria-hidden="true" />
          {REGION_TABS.map(({ id, label }, idx) => (
            <button
              key={id}
              ref={(el) => { btnRefs.current[idx] = el; }}
              className={`region-btn${regionFilter === id ? ' active' : ''}`}
              onClick={() => setRegionFilter(id)}
              aria-pressed={regionFilter === id}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Autonomous editorial agent — latest published column preview */}
      <AgentColumnStrip column={column} />

      {/* 5-column grid */}
      <main className="grid">
        {COLUMN_ORDER.map((cat, colIdx) => {
          const color = CATEGORY_COLORS[cat];
          const cssVar = CAT_CSS_VAR[cat];
          const label = CATEGORY_LABELS[cat];
          const icon  = CATEGORY_ICONS[cat];
          const items = filteredArticles(cat);

          return (
            <div
              key={cat}
              className="col"
              style={{ '--cc': cssVar } as React.CSSProperties}
            >
              {/* Sticky category header — links to full category page */}
              <div className="cat-head">
                <Link
                  href={`/category/${cat}`}
                  className="cat-label"
                  style={{ textDecoration: 'none' }}
                  title={`כל כתבות ${label}`}
                >
                  <span className="cat-icon" aria-hidden="true">{icon}</span>
                  {label} ›
                </Link>
                <div className="cat-line" />
              </div>

              {/* Article cards */}
              {items.map((article, itemIdx) => (
                <NewsItem
                  key={article.id}
                  article={article}
                  onClick={() => openPanel(article)}
                  animationDelay={animDelay(colIdx, itemIdx)}
                />
              ))}

              {/* Empty column placeholder */}
              {items.length === 0 && (
                <div
                  className="item"
                  style={{
                    '--d': '0.1s',
                    cursor: 'default',
                    opacity: 0.4,
                  } as React.CSSProperties}
                >
                  <div className="item-title" style={{ color: 'var(--text-muted)' }}>
                    אין כתבות עדיין
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* QUOTES column */}
        <div
          className="col"
          style={{ '--cc': 'var(--neon)' } as React.CSSProperties}
        >
          <div className="cat-head">
            <Link
              href="/quotes"
              className="cat-label"
              style={{ textDecoration: 'none' }}
              title="כל הציטוטים"
            >
              <span className="cat-icon" aria-hidden="true">💬</span>
              QUOTES ›
            </Link>
            <div className="cat-line" />
          </div>

          {quotes.map((quote, idx) => (
            <QuoteItem
              key={quote.id}
              quote={quote}
              animationDelay={`${(idx * 0.08).toFixed(2)}s`}
            />
          ))}

          {quotes.length === 0 && (
            <div
              className="item"
              style={{ '--d': '0.1s', cursor: 'default', opacity: 0.4 } as React.CSSProperties}
            >
              <div className="item-title" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                אין ציטוטים עדיין
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Backdrop overlay */}
      <div
        className={`overlay${panelOpen ? ' open' : ''}`}
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Slide panel */}
      <div
        className={`panel${panelOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="פרטי כתבה"
      >
        <div className="panel-top">
          <span
            className="panel-cat"
            style={{ color: catColor }}
          >
            {selectedArticle
              ? CATEGORY_LABELS[selectedArticle.category]
              : ''}
          </span>
          <button
            ref={panelCloseRef}
            className="panel-close"
            onClick={closePanel}
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        {selectedArticle && (
          <div className="panel-body">
            <div className="panel-title">
              {selectedArticle.title_he ?? selectedArticle.title}
            </div>
            <div className="panel-divider" />
            <p className="panel-summary">{selectedArticle.summary_he}</p>
            <div className="panel-meta">
              <span
                className="meta-source"
                style={{ color: catColor, fontWeight: 600 }}
              >
                {selectedArticle.source}
              </span>
              <span className="meta-sep" />
              <span className="meta-time" suppressHydrationWarning>
                {relativeTimeHe(selectedArticle.fetched_at)}
              </span>
            </div>
            <a
              className="panel-cta"
              href={selectedArticle.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                borderColor: catColor,
                color: catColor,
                background: `color-mix(in srgb, ${catColor} 9%, transparent)`,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = catColor;
                el.style.color = 'var(--text-hi)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = `color-mix(in srgb, ${catColor} 9%, transparent)`;
                el.style.color = catColor;
              }}
            >
              פתח מקור מלא &nbsp;↗
            </a>
          </div>
        )}
      </div>
    </>
  );
}
