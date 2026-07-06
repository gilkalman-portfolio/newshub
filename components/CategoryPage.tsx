'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { Article, Category } from '@/lib/types';
import { CATEGORY_LABELS, CATEGORY_COLORS, ALL_CATEGORIES } from '@/lib/types';
import NewsItem from './NewsItem';

interface Props {
  category: Category;
  label: string;
  color: string;
  articles: Article[];
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

function formatHebrewDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function CategoryPage({ category, label, color, articles }: Props) {
  const [scrollPct, setScrollPct] = useState(0);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  // Focus management for slide panel
  const panelCloseRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

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

  // Scroll progress bar
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

  return (
    <>
      {/* Reading progress bar */}
      <div
        id="prog"
        style={{
          transform: `scaleX(${scrollPct})`,
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
        aria-hidden="true"
      />

      {/* Header */}
      <header>
        <Link href="/" className="logo" style={{ textDecoration: 'none' }}>
          NewsHUB
        </Link>
        <span className="header-center">{formatHebrewDate(new Date())}</span>
        <div className="header-right">
          <div className="status-pill">
            <div className="status-dot ok" style={{ background: color }} />
            <span className="status-txt">{articles.length} כתבות</span>
          </div>
        </div>
      </header>

      <main className="cat-page">
        {/* Hero */}
        <div className="cat-hero" style={{ '--cc': color } as React.CSSProperties}>
          <Link href="/" className="cat-back">
            ראשי →
          </Link>
          <h1 className="cat-hero-title" style={{ color }}>
            {label}
          </h1>
          <p className="cat-hero-sub">
            {articles.length} כתבות אחרונות
          </p>
          <div className="cat-hero-line" style={{ background: color }} />
        </div>

        {/* Category tabs */}
        <nav className="cat-tabs">
          <span className="cat-tabs-label">קטגוריות:</span>
          {ALL_CATEGORIES.map((cat) => {
            const isActive = cat === category;
            const catColor = CATEGORY_COLORS[cat];
            return (
              <Link
                key={cat}
                href={`/category/${cat}`}
                className={`cat-tab${isActive ? ' active' : ''}`}
                style={
                  isActive
                    ? { color: catColor, borderColor: catColor, background: catColor + '18' }
                    : undefined
                }
              >
                {CATEGORY_LABELS[cat]}
              </Link>
            );
          })}
        </nav>

        {/* Cards grid */}
        {articles.length === 0 ? (
          <div className="cat-empty">
            <span>אין כתבות בקטגוריה זו עדיין</span>
            <span className="cat-empty-hint">הרץ את סקריפט ה-fetch כדי לאכלס</span>
          </div>
        ) : (
          <div
            className="cat-cards"
            style={{ '--cc': color } as React.CSSProperties}
          >
            {articles.map((article, idx) => (
              <NewsItem
                key={article.id}
                article={article}
                onClick={() => openPanel(article)}
                animationDelay={`${(idx * 0.03).toFixed(2)}s`}
              />
            ))}
          </div>
        )}
      </main>

      {/* Backdrop */}
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
          <span className="panel-cat" style={{ color }}>
            {label}
          </span>
          <button ref={panelCloseRef} className="panel-close" onClick={closePanel} aria-label="סגור">
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
              <span className="meta-source" style={{ color, fontWeight: 600 }}>
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
                borderColor: color,
                color: color,
                background: color + '18',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = color;
                el.style.color = '#000';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = color + '18';
                el.style.color = color;
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
