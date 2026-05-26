import type { Article } from '@/lib/types';

interface Props {
  article: Article;
  onClick: () => void;
  animationDelay: string;
}

function relativeTimeHe(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';

  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 2) return 'עכשיו';
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours === 1) return 'לפני שעה';
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return 'אתמול';
  return `לפני ${diffDays} ימים`;
}

export default function NewsItem({ article, onClick, animationDelay }: Props) {
  return (
    <div
      className="item"
      style={{ '--d': animationDelay } as React.CSSProperties}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      {/* Card header: source indicator */}
      <div className="item-header">
        <span className="item-source-dot" aria-hidden="true" />
        <span className="meta-source">{article.source}</span>
      </div>

      {/* Card body: title */}
      <div className="item-title">
        {article.title_he ?? article.title}
      </div>

      {/* Card footer: time + open indicator */}
      <div className="item-footer">
        <span className="meta-time" suppressHydrationWarning>
          {relativeTimeHe(article.fetched_at)}
        </span>
        <span className="item-open" aria-hidden="true">↗</span>
      </div>
    </div>
  );
}
