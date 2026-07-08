import type { Article } from '@/lib/types';
import { relativeTimeHe } from '@/lib/time';

interface Props {
  article: Article;
  onClick: () => void;
  animationDelay: string;
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
