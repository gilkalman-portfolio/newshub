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
  // ── AI & Builders — עולם ─────────────────────────────────────────────────
  {
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    name: 'TechCrunch AI',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    name: 'The Verge AI',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://hnrss.org/frontpage',
    name: 'Hacker News',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://venturebeat.com/category/ai/feed/',
    name: 'VentureBeat AI',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    name: 'Ars Technica',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://www.producthunt.com/feed',
    name: 'Product Hunt',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'http://stratechery.com/feed/',
    name: 'Stratechery',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://www.blog.google/rss/',
    name: 'Google Blog',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'http://www.aaronsw.com/2002/feeds/pgessays.rss',
    name: 'Paul Graham',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://www.inc.com/rss/',
    name: 'Inc.com',
    category: 'ai-builders',
    region: 'world',
  },
  // ── AI & Builders — ישראל ────────────────────────────────────────────────
  {
    url: 'https://www.geektime.co.il/feed/',
    name: 'Geektime',
    category: 'ai-builders',
    region: 'israel',
  },
  {
    url: 'https://nocamels.com/feed/',
    name: 'NoCamels',
    category: 'ai-builders',
    region: 'israel',
  },

  // ── Tech — ישראל ─────────────────────────────────────────────────────────
  {
    url: 'https://www.techtime.co.il/feed/',
    name: 'Techtime',
    category: 'tech',
    region: 'israel',
  },

  // ── Tech — עולם ──────────────────────────────────────────────────────────
  {
    url: 'https://www.theverge.com/rss/index.xml',
    name: 'The Verge',
    category: 'tech',
    region: 'world',
  },
  {
    url: 'https://9to5mac.com/feed/',
    name: '9to5Mac',
    category: 'tech',
    region: 'world',
  },
  {
    url: 'https://www.androidauthority.com/feed/',
    name: 'Android Authority',
    category: 'tech',
    region: 'world',
  },
  {
    url: 'https://www.engadget.com/rss.xml',
    name: 'Engadget',
    category: 'tech',
    region: 'world',
  },
  {
    url: 'https://www.wired.com/feed/rss',
    name: 'Wired',
    category: 'tech',
    region: 'world',
  },
  {
    url: 'https://www.cnet.com/rss/news/',
    name: 'CNET',
    category: 'tech',
    region: 'world',
  },
  {
    url: 'https://gizmodo.com/rss',
    name: 'Gizmodo',
    category: 'tech',
    region: 'world',
  },
  {
    url: 'https://thenextweb.com/feed/',
    name: 'The Next Web',
    category: 'tech',
    region: 'world',
  },

  // ── Economy — ישראל ──────────────────────────────────────────────────────
  {
    url: 'https://www.jpost.com/tags/israel-economy/rss',
    name: 'JPost Economy',
    category: 'economy',
    region: 'israel',
  },

  // ── Economy — עולם ───────────────────────────────────────────────────────
  {
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    name: 'BBC Business',
    category: 'economy',
    region: 'world',
  },
  {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml',
    name: 'NYT Economy',
    category: 'economy',
    region: 'world',
  },
  {
    url: 'https://www.ft.com/rss/home',
    name: 'Financial Times',
    category: 'economy',
    region: 'world',
  },
  {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
    name: 'CNBC Markets',
    category: 'economy',
    region: 'world',
  },
  {
    url: 'https://fortune.com/feed',
    name: 'Fortune',
    category: 'economy',
    region: 'world',
  },
  {
    url: 'https://www.forbes.com/business/feed/',
    name: 'Forbes Business',
    category: 'economy',
    region: 'world',
  },
  {
    url: 'https://seekingalpha.com/market_currents.xml',
    name: 'Seeking Alpha',
    category: 'economy',
    region: 'world',
  },
  {
    url: 'https://www.investing.com/rss/news.rss',
    name: 'Investing.com',
    category: 'economy',
    region: 'world',
  },

  // ── News — ישראל ─────────────────────────────────────────────────────────
  {
    url: 'https://www.ynet.co.il/Integration/StoryRss2.xml',
    name: 'Ynet',
    category: 'news',
    region: 'israel',
  },
  {
    url: 'https://www.timesofisrael.com/feed/',
    name: 'Times of Israel',
    category: 'news',
    region: 'israel',
  },
  {
    url: 'https://www.jpost.com/rss/rssfeedsheadlines.aspx',
    name: 'Jerusalem Post',
    category: 'news',
    region: 'israel',
  },
  {
    url: 'https://www.israelhayom.com/feed/',
    name: 'Israel Hayom',
    category: 'news',
    region: 'israel',
  },

  // ── News — עולם ──────────────────────────────────────────────────────────
  {
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    name: 'BBC World',
    category: 'news',
    region: 'world',
  },
  {
    url: 'https://www.theguardian.com/world/rss',
    name: 'The Guardian',
    category: 'news',
    region: 'world',
  },
  {
    url: 'https://feeds.npr.org/1001/rss.xml',
    name: 'NPR News',
    category: 'news',
    region: 'world',
  },
  {
    url: 'http://rss.cnn.com/rss/edition_world.rss',
    name: 'CNN World',
    category: 'news',
    region: 'world',
  },
  {
    url: 'https://news.google.com/rss',
    name: 'Google News',
    category: 'news',
    region: 'world',
  },
  {
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    name: 'Al Jazeera',
    category: 'news',
    region: 'world',
  },

  // ── AI — בלוגי חברות ─────────────────────────────────────────────────────
  {
    url: 'https://openai.com/blog/rss.xml',
    name: 'OpenAI Blog',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://www.anthropic.com/rss.xml',
    name: 'Anthropic Blog',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://deepmind.google/discover/blog/rss.xml',
    name: 'Google DeepMind',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://huggingface.co/blog/feed.xml',
    name: 'HuggingFace Blog',
    category: 'ai-builders',
    region: 'world',
  },
  {
    url: 'https://ai.meta.com/blog/rss/',
    name: 'Meta AI Blog',
    category: 'ai-builders',
    region: 'world',
  },

  // ── QA & Testing — ידני ──────────────────────────────────────────────────
  {
    url: 'https://www.ministryoftesting.com/feed',
    name: 'Ministry of Testing',
    category: 'qa-testing',
    region: 'world',
  },
  {
    url: 'https://www.softwaretestinghelp.com/feed/',
    name: 'Software Testing Help',
    category: 'qa-testing',
    region: 'world',
  },
  {
    url: 'https://www.satisfice.com/blog/feed',
    name: 'James Bach',
    category: 'qa-testing',
    region: 'world',
  },
  {
    url: 'https://lisacrispin.com/feed/',
    name: 'Lisa Crispin',
    category: 'qa-testing',
    region: 'world',
  },
  {
    url: 'https://www.eviltester.com/index.xml',
    name: 'Evil Tester',
    category: 'qa-testing',
    region: 'world',
  },

  // ── QA & Testing — אוטומציה ──────────────────────────────────────────────
  {
    url: 'https://automationpanda.com/feed/',
    name: 'Automation Panda',
    category: 'qa-testing',
    region: 'world',
  },
  {
    url: 'https://www.selenium.dev/blog/index.xml',
    name: 'Selenium Blog',
    category: 'qa-testing',
    region: 'world',
  },
  {
    url: 'https://applitools.com/blog/feed/',
    name: 'Applitools Blog',
    category: 'qa-testing',
    region: 'world',
  },
  {
    url: 'https://www.lambdatest.com/blog/feed/',
    name: 'LambdaTest Blog',
    category: 'qa-testing',
    region: 'world',
  },
  {
    url: 'https://www.browserstack.com/blog/feed/',
    name: 'BrowserStack Blog',
    category: 'qa-testing',
    region: 'world',
  },

  // ── Sports — ישראל ───────────────────────────────────────────────────────
  {
    url: 'https://www.ynet.co.il/Integration/StoryRss2.xml',
    name: 'Ynet Sport',
    category: 'sports',
    region: 'israel',
  },
  {
    url: 'https://sport1.maariv.co.il/feed/',
    name: 'Sport1',
    category: 'sports',
    region: 'israel',
  },

  // ── Sports — עולם ────────────────────────────────────────────────────────
  {
    url: 'https://www.espn.com/espn/rss/news',
    name: 'ESPN',
    category: 'sports',
    region: 'world',
  },
  {
    url: 'https://www.skysports.com/rss/12040',
    name: 'Sky Sports',
    category: 'sports',
    region: 'world',
  },
  {
    url: 'https://feeds.bbci.co.uk/sport/rss.xml',
    name: 'BBC Sport',
    category: 'sports',
    region: 'world',
  },
  {
    url: 'https://sports.yahoo.com/rss/',
    name: 'Yahoo Sports',
    category: 'sports',
    region: 'world',
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
