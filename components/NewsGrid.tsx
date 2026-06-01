'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Article, Category } from '@/lib/types';
import { refreshNews } from '@/app/actions';
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/types';
import NewsItem from './NewsItem';

interface Props {
  articles: Record<Category, Article[]>;
}

// RTL column order: rightmost category first visually
const COLUMN_ORDER: Category[] = [
  'ai-builders',
  'tech',
  'economy',
  'news',
  'sports',
];

// CSS custom-property variable names per category
const CAT_CSS_VAR: Record<Category, string> = {
  'ai-builders': 'var(--cat-ai)',
  'tech':        'var(--cat-tech)',
  'economy':     'var(--cat-eco)',
  'news':        'var(--cat-news)',
  'sports':      'var(--cat-sport)',
};

// Animation delay per (column index, item index) — mimics prototype
function animDelay(colIdx: number, itemIdx: number): string {
  const base = (colIdx + 1) * 0.08;
  const perItem = itemIdx * 0.08;
  return `${(base + perItem).toFixed(2)}s`;
}

function formatHebrewDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function relativeTimeHe(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diffMins = Math.floor((now - then) / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 2) return 'עכשיו';
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours === 1) return 'לפני שעה';
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return 'אתמול';
  return `לפני ${diffDays} ימים`;
}

export default function NewsGrid({ articles }: Props) {
  const router = useRouter();
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const { refreshedAt } = await refreshNews();
      setLastRefresh(refreshedAt);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, router]);

  const openPanel = useCallback((article: Article) => {
    setSelectedArticle(article);
    document.body.style.overflow = 'hidden';
  }, []);

  const closePanel = useCallback(() => {
    setSelectedArticle(null);
    document.body.style.overflow = '';
  }, []);

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closePanel]);

  // Progress bar scroll tracking
  useEffect(() => {
    const handler = () => {
      const pct =
        window.scrollY /
        Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setScrollPct(Math.min(pct, 1));
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const panelOpen = selectedArticle !== null;
  const catColor = selectedArticle
    ? CATEGORY_COLORS[selectedArticle.category]
    : 'var(--neon)';

  const totalArticles = COLUMN_ORDER.reduce(
    (sum, cat) => sum + articles[cat].length,
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
      <header>
        <span className="logo">NewsHUB</span>
        <span className="header-center">{formatHebrewDate(new Date())}</span>
        <div className="header-right">
          <Link href="/stocks" className="refresh-btn" title="תיק המניות שלי">
            <span className="refresh-icon" style={{ fontSize: 14 }}>📈</span>
            <span className="refresh-label">מניות</span>
          </Link>
          <button
            className={`refresh-btn${refreshing ? ' refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title={lastRefresh ? `עודכן: ${new Date(lastRefresh).toLocaleTimeString('he-IL')}` : 'רענן כתבות'}
            aria-label="רענן כתבות"
          >
            <span className="refresh-icon" aria-hidden="true">↻</span>
            <span className="refresh-label">{refreshing ? 'מרענן…' : 'רענן'}</span>
          </button>
          <div className="status-pill">
            <div className="status-dot ok" />
            <span className="status-txt">{totalArticles} כתבות</span>
          </div>
        </div>
      </header>

      {/* 5-column grid */}
      <main className="grid">
        {COLUMN_ORDER.map((cat, colIdx) => {
          const color = CATEGORY_COLORS[cat];
          const cssVar = CAT_CSS_VAR[cat];
          const label = CATEGORY_LABELS[cat];
          const icon  = CATEGORY_ICONS[cat];
          const items = articles[cat];

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
                  <span className="cat-icon">{icon}</span>
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
                background: catColor + '18',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = catColor;
                el.style.color = '#000';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = catColor + '18';
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
