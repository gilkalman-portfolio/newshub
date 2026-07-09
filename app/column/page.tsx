/**
 * app/column/page.tsx
 *
 * Archive page for the autonomous editorial agent's columns.
 * Server component, revalidates every 15 minutes — modeled on app/quotes/page.tsx.
 */

import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { AgentColumn } from '@/lib/types';
import { relativeTimeHe, formatHebrewDate } from '@/lib/time';
import SiteHeader from '@/components/SiteHeader';

export const revalidate = 900; // 15 minutes

export const metadata: Metadata = {
  title: 'הטור של הסוכן | NewsHUB',
  description: 'טורי דעה שנכתבו אוטונומית על ידי סוכן AI — NewsHUB',
};

async function fetchColumns(): Promise<AgentColumn[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('agent_columns')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[column archive] fetch error:', error.message);
    return [];
  }
  return (data ?? []) as AgentColumn[];
}

// First ~40 words of the Hebrew body, for the card preview.
function previewWords(text: string, count = 40): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= count) return text.trim();
  return words.slice(0, count).join(' ') + '…';
}

export default async function ColumnArchivePage() {
  const columns = await fetchColumns();

  return (
    <>
      <SiteHeader
        srTitle="הטור של הסוכן — טורי דעה אוטונומיים"
        center={
          <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--agent)' }}>
            🤖 AGENT COLUMN
          </span>
        }
        right={
          <div className="status-pill">
            <div className="status-dot ok" />
            <span className="status-txt">{columns.length} טורים</span>
          </div>
        }
      />

      <main className="quotes-main">
        <div className="agent-archive-intro">
          <span className="agent-badge">🤖 נכתב אוטונומית על ידי סוכן AI</span>
          <p className="agent-archive-desc">
            הסוכן סורק את הכתבות מהיום האחרון, בוחר סיפור מוביל, וכותב עליו טור דעה קצר בעברית — באופן אוטונומי לחלוטין.
          </p>
        </div>

        {columns.length === 0 && (
          <p className="quotes-empty">
            עדיין אין טורים — הסוכן טרם פרסם
          </p>
        )}

        <div className="quotes-list">
          {columns.map((column) => (
            <Link key={column.id} href={`/column/${column.id}`} className="quote-page-card agent-archive-card">
              <span className="agent-badge agent-badge-sm">🤖 נכתב אוטונומית</span>
              <div className="agent-strip-head">
                <h2 className="agent-archive-title">{column.title_he}</h2>
                <span className="agent-strip-time" suppressHydrationWarning>
                  {relativeTimeHe(column.created_at)}
                </span>
              </div>
              <p className="agent-archive-preview">{previewWords(column.body_he)}</p>
              <div className="qp-footer">
                <span className="agent-archive-date">{formatHebrewDate(new Date(column.created_at))}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
