import type { Quote } from '@/lib/types';
import { INVESTOR_CONFIG } from '@/lib/types';
import { cleanQuoteText } from '@/lib/quotes-display';
import { isLatin } from '@/lib/text';
import { relativeTimeHe } from '@/lib/time';
import { initials } from '@/lib/string';

interface Props {
  quote: Quote;
  animationDelay?: string;
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
        {cleanQuoteText(quote.text)}
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
