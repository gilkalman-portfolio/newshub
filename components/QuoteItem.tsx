import type { Quote } from '@/lib/types';
import { INVESTOR_CONFIG } from '@/lib/types';
import { isLatin } from '@/lib/text';

interface Props {
  quote: Quote;
  animationDelay?: string;
}

function relativeTimeHe(dateStr: string | null): string {
  if (!dateStr) return '';
  const now  = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diffMins  = Math.floor((now - then) / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays  = Math.floor(diffHours / 24);
  if (diffMins < 2)   return 'עכשיו';
  if (diffMins < 60)  return `לפני ${diffMins} דקות`;
  if (diffHours === 1) return 'לפני שעה';
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return 'אתמול';
  return `לפני ${diffDays} ימים`;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
}

export default function QuoteItem({ quote, animationDelay }: Props) {
  const config = INVESTOR_CONFIG[quote.author_handle];
  const color  = config?.color ?? '#4F6EF7';
  const tweetUrl = quote.tweet_id
    ? `https://x.com/${quote.author_handle}/status/${quote.tweet_id}`
    : `https://x.com/${quote.author_handle}`;

  return (
    <a
      className="quote-item item"
      href={tweetUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ '--d': animationDelay ?? '0s', '--cc': color } as React.CSSProperties}
    >
      <div className="quote-header">
        <div
          className="quote-avatar"
          style={{ background: color }}
          aria-hidden="true"
        >
          {initials(quote.author_name)}
        </div>
        <div className="quote-author">
          <span className="quote-name">{quote.author_name}</span>
          <span className="quote-handle">@{quote.author_handle}</span>
        </div>
        <span className="quote-x-badge" aria-label="X / Twitter">✕</span>
      </div>

      <div
        className="quote-text"
        dir={isLatin(quote.text) ? 'ltr' : undefined}
        style={isLatin(quote.text) ? { textAlign: 'left' } : undefined}
      >
        {quote.text}
      </div>

      <div className="item-footer">
        <span className="quote-firm">{quote.author_firm}</span>
        <span className="meta-time" suppressHydrationWarning>
          {relativeTimeHe(quote.tweeted_at ?? quote.fetched_at)}
        </span>
      </div>
    </a>
  );
}
