/**
 * app/column/[id]/page.tsx
 *
 * Single autonomous editorial column + its "how did it decide?" transparency
 * section. Unpublished columns 404 for anonymous visitors (RLS also enforces
 * this at the DB level — .eq('published', true) is belt-and-suspenders).
 */

import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { AgentColumn, AgentDecisionLog } from '@/lib/types';
import { formatHebrewDate, relativeTimeHe } from '@/lib/time';
import SiteHeader from '@/components/SiteHeader';

export const revalidate = 900; // 15 minutes — matches the archive page

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchColumn(id: string): Promise<AgentColumn | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('agent_columns')
    .select('*')
    .eq('id', id)
    .eq('published', true)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[column page] fetch error:', error.message);
    return null;
  }
  return data as AgentColumn;
}

async function fetchDecisionLog(runId: string): Promise<AgentDecisionLog | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('agent_decision_log')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[column page] decision log fetch error:', error.message);
    return null;
  }
  return data as AgentDecisionLog;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const column = await fetchColumn(id);
  if (!column) return {};

  return {
    title: `${column.title_he} | הטור של הסוכן | NewsHUB`,
    description: column.body_he.slice(0, 160),
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ColumnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const column = await fetchColumn(id);

  if (!column) notFound();

  const decisionLog = await fetchDecisionLog(column.run_id);
  const paragraphs = column.body_he.split(/\n\n+|\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <>
      <SiteHeader
        srTitle={column.title_he}
        center={
          <span style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--agent)' }}>
            🤖 AGENT COLUMN
          </span>
        }
        right={
          <Link href="/column" className="cat-back" style={{ marginBottom: 0 }}>
            ← כל הטורים
          </Link>
        }
      />

      <main className="agent-column-main">
        <Link href="/" className="cat-back">← בחזרה לדף הבית</Link>

        <span className="agent-badge">🤖 נכתב אוטונומית על ידי סוכן AI</span>

        <h1 className="agent-column-title">{column.title_he}</h1>

        <div className="agent-column-meta">
          <span>{formatHebrewDate(new Date(column.created_at))}</span>
          <span className="qp-time" suppressHydrationWarning>
            {relativeTimeHe(column.created_at)}
          </span>
        </div>

        <div className="agent-column-body">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {column.source_refs.length > 0 && (
          <section className="agent-sources">
            <h2 className="agent-section-title">מקורות</h2>
            <ul className="agent-sources-list">
              {column.source_refs.map((ref, i) => (
                <li key={i}>
                  <a href={ref.url} target="_blank" rel="noopener noreferrer" className="agent-source-link">
                    {ref.title_he}
                  </a>
                  <span className="agent-source-name">{ref.source}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {decisionLog && (
          <section id="decision" className="agent-decision">
            <h2 className="agent-section-title">איך הוא החליט?</h2>

            {decisionLog.reasoning_he && (
              <p className="agent-decision-reasoning">{decisionLog.reasoning_he}</p>
            )}

            {decisionLog.candidates_considered.length > 0 && (
              <ul className="agent-candidates-list">
                {decisionLog.candidates_considered.map((c, i) => {
                  const isChosen = decisionLog.chosen?.url === c.url;
                  return (
                    <li key={i} className={`agent-candidate${isChosen ? ' chosen' : ''}`}>
                      <div className="agent-candidate-head">
                        <span className="agent-candidate-title">{c.title_he}</span>
                        {isChosen && <span className="agent-candidate-badge">נבחר ✓</span>}
                      </div>
                      <div className="agent-candidate-meta">
                        <span>{c.source}</span>
                        {c.note && <span className="agent-candidate-note">{c.note}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}
