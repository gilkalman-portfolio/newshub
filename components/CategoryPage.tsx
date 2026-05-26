'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Article, Category } from '@/lib/types';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/lib/types';

interface Props {
  category: Category;
  label: string;
  color: string;
  articles: Article[];
}

const ALL_CATEGORIES: Category[] = [
  'ai-builders',
  'tech',
  'economy',
  'news',
  'sports',
];

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
            ← ראשי
          </Link>
          <h1 className="cat-hero-title" style={{ color }}>
            {label}
          </h1>
          <p className="cat-hero-sub">
            {articles.length} כתבות אחרונות
          </p>
          <div className="cat-hero-line" style={{ background: color }} />
        </div>

        {/* Article list */}
        <div className="cat-list">
          {articles.length === 0 ? (
            <div className="cat-empty">
              <span>אין כתבות בקטגוריה זו עדיין</span>
              <span className="cat-empty-hint">הרץ את סקריפט ה-fetch כדי לאכלס</span>
            </div>
          ) : (
            articles.map((article, idx) => (
              <article
                key={article.id}
                className="cat-article"
                style={{
                  '--cc': color,
                  '--d': `${(idx * 0.04).toFixed(2)}s`,
                } as React.CSSProperties}
              >
                {/* Left accent border + glow comes from CSS */}
                <div className="cat-article-inner">
                  <h2 className="cat-art-title">
                    {article.title_he ?? article.title}
                  </h2>
                  <p className="cat-art-summary">{article.summary_he}</p>
                  <div className="cat-art-footer">
                    <div className="cat-art-meta">
                      <span className="meta-source" style={{ color }}>
                        {article.source}
                      </span>
                      <span className="meta-sep" />
                      <span className="meta-time">
                        {relativeTimeHe(article.fetched_at)}
                      </span>
                    </div>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cat-art-cta"
                      style={{ color }}
                    >
                      פתח מקור ↗
                    </a>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        {/* Category tabs footer */}
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
      </main>
    </>
  );
}
