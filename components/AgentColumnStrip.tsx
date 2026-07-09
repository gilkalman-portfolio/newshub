import Link from 'next/link';
import type { AgentColumn } from '@/lib/types';
import { relativeTimeHe } from '@/lib/time';

interface Props {
  column: AgentColumn | null;
}

// Full-width strip shown between the region-nav and the main grid on the
// homepage, previewing the latest published autonomous editorial column.
// Server-component-friendly — no client hooks needed.
export default function AgentColumnStrip({ column }: Props) {
  if (!column) return null;

  return (
    <section className="agent-strip" aria-label="הטור של הסוכן">
      <div className="agent-strip-top">
        <Link href="/column" className="agent-strip-label">
          הטור של הסוכן ›
        </Link>
        <span className="agent-badge">🤖 נכתב אוטונומית על ידי סוכן AI</span>
      </div>

      <Link href={`/column/${column.id}`} className="agent-strip-card">
        <div className="agent-strip-head">
          <h2 className="agent-strip-title">{column.title_he}</h2>
          <span className="agent-strip-time" suppressHydrationWarning>
            {relativeTimeHe(column.created_at)}
          </span>
        </div>
        <p className="agent-strip-preview">{column.body_he}</p>
      </Link>

      <Link href={`/column/${column.id}#decision`} className="agent-strip-decision">
        איך הוא החליט? ←
      </Link>
    </section>
  );
}
