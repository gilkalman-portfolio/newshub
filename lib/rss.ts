/**
 * lib/rss.ts
 *
 * All RSS source definitions and the feed-fetching utility.
 *
 * Exports:
 *   RSS_SOURCES   — full list of RssSource objects (all categories)
 *   fetchFeed()   — fetches and parses a single RSS source, returns ≤3 most recent items
 */

import Parser from 'rss-parser';
import type { RssSource } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A normalised item extracted from an RSS feed. */
export interface FeedItem {
  title: string;
  url: string;
  /** contentSnippet, summary, or title as last-resort fallback. */
  content: string;
  publishedAt: Date | null;
  imageUrl: string | null;
}

// ---------------------------------------------------------------------------
// RSS Sources
// ---------------------------------------------------------------------------

export const RSS_SOURCES: RssSource[] = [
  // ── AI & Builders ────────────────────────────────────────────────────────
  {
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    name: 'TechCrunch AI',
    category: 'ai-builders',
  },
  {
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    name: 'The Verge AI',
    category: 'ai-builders',
  },
  {
    url: 'https://hnrss.org/frontpage',
    name: 'Hacker News',
    category: 'ai-builders',
  },
  {
    url: 'https://venturebeat.com/category/ai/feed/',
    name: 'VentureBeat AI',
    category: 'ai-builders',
  },
  {
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    name: 'Ars Technica',
    category: 'ai-builders',
  },

  // ── Tech ─────────────────────────────────────────────────────────────────
  {
    url: 'https://www.theverge.com/rss/index.xml',
    name: 'The Verge',
    category: 'tech',
  },
  {
    url: 'https://9to5mac.com/feed/',
    name: '9to5Mac',
    category: 'tech',
  },
  {
    url: 'https://www.androidauthority.com/feed/',
    name: 'Android Authority',
    category: 'tech',
  },
  {
    url: 'https://www.engadget.com/rss.xml',
    name: 'Engadget',
    category: 'tech',
  },
  {
    url: 'https://www.wired.com/feed/rss',
    name: 'Wired',
    category: 'tech',
  },

  // ── Economy ──────────────────────────────────────────────────────────────
  {
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    name: 'BBC Business',
    category: 'economy',
  },
  {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml',
    name: 'NYT Economy',
    category: 'economy',
  },
  {
    url: 'https://feeds.reuters.com/reuters/businessNews',
    name: 'Reuters Business',
    category: 'economy',
  },
  {
    url: 'https://www.ft.com/rss/home',
    name: 'Financial Times',
    category: 'economy',
  },
  {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
    name: 'CNBC Markets',
    category: 'economy',
  },

  // ── News ─────────────────────────────────────────────────────────────────
  {
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    name: 'BBC World',
    category: 'news',
  },
  {
    url: 'https://feeds.reuters.com/reuters/topNews',
    name: 'Reuters',
    category: 'news',
  },
  {
    url: 'https://www.theguardian.com/world/rss',
    name: 'The Guardian',
    category: 'news',
  },
  {
    url: 'https://feeds.npr.org/1001/rss.xml',
    name: 'NPR News',
    category: 'news',
  },
  {
    url: 'https://apnews.com/rss',
    name: 'AP News',
    category: 'news',
  },

  // ── Sports ───────────────────────────────────────────────────────────────
  {
    url: 'https://www.espn.com/espn/rss/news',
    name: 'ESPN',
    category: 'sports',
  },
  {
    url: 'https://www.skysports.com/rss/12040',
    name: 'Sky Sports',
    category: 'sports',
  },
  {
    url: 'https://feeds.bbci.co.uk/sport/rss.xml',
    name: 'BBC Sport',
    category: 'sports',
  },
  {
    url: 'https://www.ynet.co.il/Integration/StoryRss2.xml',
    name: 'Ynet Sport',
    category: 'sports',
  },
  {
    url: 'https://www.sport5.co.il/rss.aspx',
    name: 'Sport5',
    category: 'sports',
  },
];

// ---------------------------------------------------------------------------
// Parser setup
// ---------------------------------------------------------------------------

/** How many items to return per source per run. */
const ITEMS_PER_SOURCE = 3;

/** Fetch timeout in milliseconds. */
const FEED_TIMEOUT_MS = 10_000;

/**
 * Custom fields we want rss-parser to surface from raw XML.
 * media:content and enclosure are the two most common image carriers.
 */
type CustomFeed = Record<string, never>;
type CustomItem = {
  'media:content'?: { $?: { url?: string } };
  enclosure?: { url?: string };
};

const parser = new Parser<CustomFeed, CustomItem>({
  timeout: FEED_TIMEOUT_MS,
  headers: {
    // Many feeds block the default axios/node-fetch UA; a realistic browser UA
    // reduces the chance of being blocked.
    'User-Agent':
      'Mozilla/5.0 (compatible; NewsHubBot/1.0; +https://github.com/your-org/newshub)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['enclosure', 'enclosure'],
    ],
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the best available image URL from an RSS item.
 * Priority: media:content → enclosure → null
 */
function extractImageUrl(item: Parser.Item & CustomItem): string | null {
  const mediaUrl = item['media:content']?.$?.url;
  if (mediaUrl) return mediaUrl;

  const enclosureUrl = item.enclosure?.url;
  if (enclosureUrl) return enclosureUrl;

  return null;
}

/**
 * Extract the best available text content from an RSS item.
 * Priority: contentSnippet → summary → title
 */
function extractContent(item: Parser.Item): string {
  return (
    item.contentSnippet?.trim() ||
    item.summary?.trim() ||
    item.title?.trim() ||
    ''
  );
}

/**
 * Parse a date string / ISO string from the feed, returning null on failure.
 */
function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch and parse a single RSS feed.
 *
 * Returns up to `ITEMS_PER_SOURCE` (3) of the most-recent items.
 * On any error, logs to stderr and returns an empty array — never throws.
 */
export async function fetchFeed(source: RssSource): Promise<FeedItem[]> {
  try {
    console.log(`[rss] Fetching: ${source.name} (${source.url})`);

    const feed = await parser.parseURL(source.url);

    // Sort descending by publication date; items without a date go last.
    const sorted = [...feed.items].sort((a, b) => {
      const da = parseDate(a.isoDate ?? a.pubDate)?.getTime() ?? 0;
      const db = parseDate(b.isoDate ?? b.pubDate)?.getTime() ?? 0;
      return db - da;
    });

    return sorted.slice(0, ITEMS_PER_SOURCE).map((item) => ({
      title: item.title?.trim() ?? '(no title)',
      url: item.link?.trim() ?? item.guid?.trim() ?? '',
      content: extractContent(item),
      publishedAt: parseDate(item.isoDate ?? item.pubDate),
      imageUrl: extractImageUrl(item),
    }));
  } catch (err) {
    console.error(`[rss] Failed to fetch "${source.name}": ${String(err)}`);
    return [];
  }
}
