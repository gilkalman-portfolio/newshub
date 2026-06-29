/**
 * scripts/fetch.ts
 *
 * Daily orchestration script — fetches RSS feeds, summarises articles in Hebrew
 * via Gemini, and inserts new articles into Supabase.
 *
 * Run with:
 *   npx tsx scripts/fetch.ts
 *
 * Environment variables required (in .env.local or CI secrets):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY
 */

// Note: .env.local is loaded by scripts/_load-env.cjs via --require before this file runs.
import { supabaseAdmin } from '../lib/supabase';
import { summarizeBatch, type BatchInput, type HebrewSummary } from '../lib/gemini';
import { RSS_SOURCES, fetchFeed, type FeedItem } from '../lib/rss';
import type { RssSource, Category, Region } from '../lib/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const CONFIG = {
  articlesPerSource: 3,   // fetch 3 articles per RSS source per run
  maxPerCategory: 40,     // store up to 40 articles per category per run
  maxNewPerRun: 30,        // hard cap on new articles to summarize per run — prevents backlog from causing 45-min timeouts
  llmConcurrency: 3,       // max parallel LLM batch calls — avoids hitting OpenRouter rate limits
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingArticle {
  source: RssSource;
  item: FeedItem;
}

interface ScraperItem {
  title: string;
  url: string;
  content: string;
  publishedAt: string | null;
  imageUrl: string | null;
  source: string;
  category: string;
  region: string;
}

interface ArticleRow {
  title: string;
  title_he: string;
  summary_he: string;
  url: string;
  source: string;
  category: Category;
  published_at: string | null;
  fetched_at: string;
  image_url: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch additional articles from the Scrapling microservice (non-RSS sources).
 * Returns an empty array if SCRAPER_SERVICE_URL is not set — fully optional.
 */
async function fetchFromScraper(): Promise<PendingArticle[]> {
  const scraperUrl = process.env.SCRAPER_SERVICE_URL;
  if (!scraperUrl) return [];

  try {
    console.log('[fetch] Fetching from Scraper Service…');
    const sources = [
      'reddit-investing', 'reddit-technology', 'reddit-artificial', 'reddit-worldnews',
      'github-trending', 'funder', 'n12',
    ].join(',');

    // Use explicit AbortController so we can clear the timer on success,
    // preventing a dangling timeout from causing unhandled rejections later.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    let res: Response;
    try {
      res = await fetch(`${scraperUrl}/scrape?sources=${sources}`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`Scraper returned HTTP ${res.status}`);

    const items: ScraperItem[] = await res.json();

    return items
      .filter(item => item.url && item.title)
      .map(item => ({
        source: {
          url: item.url,
          name: item.source,
          category: item.category as Category,
          region: item.region as Region,
        },
        item: {
          title: item.title,
          url: item.url,
          content: item.content || item.title,
          publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
          imageUrl: item.imageUrl ?? null,
        },
      }));
  } catch (err: any) {
    console.error('[fetch] Scraper service failed (non-fatal):', err.message);
    return [];
  }
}

/** Split an array into chunks of size `n`. */
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Limit concurrent async operations to `max` at a time. */
function makeLimit(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function <T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/**
 * Check which URLs from a given list already exist in the `articles` table.
 * Returns a Set of existing URLs for O(1) lookups.
 */
async function getExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();

  const batches = chunk(urls, 50);
  const existing = new Set<string>();

  for (const batch of batches) {
    const { data, error } = await supabaseAdmin
      .from('articles')
      .select('url')
      .in('url', batch);

    if (error) {
      console.error('[fetch] Failed to query existing URLs:', error.message);
      return new Set(); // Treat as empty — worst case we attempt re-insert (PK will reject)
    }

    for (const row of data ?? []) existing.add((row as { url: string }).url);
  }

  return existing;
}

/**
 * Insert a single article row into Supabase.
 * Returns true on success, false on failure.
 */
async function insertArticle(row: ArticleRow): Promise<boolean> {
  const { error } = await supabaseAdmin.from('articles').insert(row);

  if (error) {
    console.error(
      `[fetch] Insert failed for "${row.title.slice(0, 50)}…": ${error.message}`
    );
    return false;
  }

  return true;
}

/**
 * Call the Supabase RPC that prunes articles older than the retention window.
 */
async function pruneOldArticles(): Promise<void> {
  console.log('[fetch] Pruning old articles via prune_old_articles()…');

  const { error } = await supabaseAdmin.rpc('prune_old_articles');

  if (error) {
    console.error('[fetch] Prune RPC failed:', error.message);
  } else {
    console.log('[fetch] Prune completed successfully.');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = new Date();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[fetch] NewsHub fetch started at ${startTime.toISOString()}`);
  console.log(`[fetch] Total RSS sources: ${RSS_SOURCES.length}`);
  console.log(`[fetch] Scraper service: ${process.env.SCRAPER_SERVICE_URL ?? 'not configured (skipping)'}`);
  console.log(`${'='.repeat(60)}\n`);

  // ── Step 1: Fetch RSS feeds + Scraper Service in parallel ────────────────

  console.log('[fetch] Fetching all RSS feeds and Scraper Service in parallel…\n');

  const [feedResults, scraperCandidates] = await Promise.all([
    Promise.allSettled(
      RSS_SOURCES.map((source) =>
        fetchFeed(source).then((items) => ({ source, items }))
      )
    ),
    fetchFromScraper(),
  ]);

  // ── Step 2: Collect candidate items per source ───────────────────────────
  //
  // Strategy: take CONFIG.articlesPerSource most-recent items per source, then
  // cap each category at CONFIG.maxPerCategory to ensure diversity across outlets.

  const candidates: PendingArticle[] = [];

  // Track per-category counts so we respect maxPerCategory
  const categoryCount: Partial<Record<string, number>> = {};

  for (const result of feedResults) {
    if (result.status === 'rejected') {
      console.warn('[fetch] A feed promise rejected unexpectedly:', result.reason);
      continue;
    }

    const { source, items } = result.value;

    if (items.length === 0) {
      console.log(`[fetch] No items from "${source.name}" — skipping.`);
      continue;
    }

    // Take up to CONFIG.articlesPerSource most-recent items
    const topItems = items.slice(0, CONFIG.articlesPerSource);

    for (const item of topItems) {
      if (!item.url) {
        console.warn(`[fetch] Item from "${source.name}" has no URL — skipping.`);
        continue;
      }

      const catCount = categoryCount[source.category] ?? 0;
      if (catCount >= CONFIG.maxPerCategory) {
        console.log(`[fetch] Category "${source.category}" hit maxPerCategory (${CONFIG.maxPerCategory}) — skipping "${source.name}".`);
        break;
      }

      candidates.push({ source, item });
      categoryCount[source.category] = catCount + 1;
    }
  }

  // ── Step 1b: Add Scraper Service candidates (same category cap) ──────────
  for (const candidate of scraperCandidates) {
    if (!candidate.item.url) continue;
    const catCount = categoryCount[candidate.source.category] ?? 0;
    if (catCount < CONFIG.maxPerCategory) {
      candidates.push(candidate);
      categoryCount[candidate.source.category] = catCount + 1;
    }
  }
  if (scraperCandidates.length > 0) {
    console.log(`[fetch] Scraper service added ${scraperCandidates.length} candidates.`);
  }

  console.log(`\n[fetch] Candidate articles (RSS + scraper, max ${CONFIG.maxPerCategory}/category): ${candidates.length}`);

  // ── Step 3: Dedup against Supabase ───────────────────────────────────────

  const allUrls = candidates.map((c) => c.item.url);
  const existingUrls = await getExistingUrls(allUrls);

  const allNewCandidates = candidates.filter(
    ({ item }) => !existingUrls.has(item.url)
  );
  const skippedCount = candidates.length - allNewCandidates.length;

  // Cap per-run volume so a backlog never causes 30+ min LLM timeouts.
  // Deferred articles are picked up in the next scheduled run (4 hours later).
  const newCandidates = allNewCandidates.slice(0, CONFIG.maxNewPerRun);
  const deferredCount = allNewCandidates.length - newCandidates.length;

  console.log(
    `[fetch] After dedup: ${allNewCandidates.length} new, ${skippedCount} duplicates skipped.`
  );
  if (deferredCount > 0) {
    console.log(`[fetch] Capped at ${CONFIG.maxNewPerRun}/run — ${deferredCount} deferred to next run.\n`);
  } else {
    console.log('');
  }

  if (newCandidates.length === 0) {
    console.log('[fetch] Nothing new to insert — all candidates already in DB.');
    await pruneOldArticles();
    console.log('\n[fetch] Done. Inserted 0 articles, skipped all as duplicates.');
    process.exit(0);
  }

  // ── Step 4: Batch-summarise all new articles, then insert ─────────────────

  const BATCH_SIZE = 5;
  const fetchedAt = new Date().toISOString();
  let insertedCount = 0;

  // Assign a stable numeric ID to each candidate for tracking across retries
  const indexedCandidates = newCandidates.map((c, i) => ({ ...c, id: i }));

  const toBatchInput = (c: (typeof indexedCandidates)[0]): BatchInput => ({
    id: c.id,
    title: c.item.title,
    content: c.item.content,
    source: c.source.name,
  });

  // ── Attempt 1: batches with concurrency cap ──────────────────────────────
  // Large batches (10+) cause Gemini to truncate JSON mid-response. Batches of
  // 5 stay well within output token limits. Cap at llmConcurrency (3) parallel.

  const batches = chunk(indexedCandidates, BATCH_SIZE);
  const limit = makeLimit(CONFIG.llmConcurrency);
  console.log(
    `\n[fetch] Summarising ${newCandidates.length} articles in ${batches.length} batches (≤${CONFIG.llmConcurrency} parallel, attempt 1)…`
  );

  const attempt1Settled = await Promise.allSettled(
    batches.map((batch) => limit(() => summarizeBatch(batch.map(toBatchInput), 1)))
  );

  const allSummaries = new Map<number, HebrewSummary>();
  const attempt1FailReasons = new Map<number, string>();

  for (const result of attempt1Settled) {
    if (result.status === 'fulfilled') {
      result.value.results.forEach((s, id) => allSummaries.set(id, s));
      result.value.failReasons.forEach((r, id) => attempt1FailReasons.set(id, r));
    }
  }

  console.log(
    `[fetch] Attempt 1: ${allSummaries.size} succeeded, ${attempt1FailReasons.size} failed.`
  );

  // ── Attempt 2: retry all failed candidates as one batch ──────────────────

  const failedAfter1 = indexedCandidates.filter((c) => !allSummaries.has(c.id));

  if (failedAfter1.length > 0) {
    console.log(`[fetch] Retrying ${failedAfter1.length} failed articles (attempt 2)…`);

    const { results: retryResults, failReasons: attempt2FailReasons } =
      await summarizeBatch(failedAfter1.map(toBatchInput), 2);

    retryResults.forEach((s, id) => allSummaries.set(id, s));

    // Log anything still failing after both attempts
    for (const c of failedAfter1) {
      if (!allSummaries.has(c.id)) {
        console.warn(
          `[fetch] ✗ SKIP after 2 attempts: "${c.item.title.slice(0, 60)}…"\n` +
            `  source:    ${c.source.name}\n` +
            `  attempt 1: ${attempt1FailReasons.get(c.id) ?? 'unknown'}\n` +
            `  attempt 2: ${attempt2FailReasons.get(c.id) ?? 'unknown'}`
        );
      }
    }
  }

  // ── Insert all successfully summarised articles (parallel) ───────────────

  const summarizationFailures = indexedCandidates.filter(
    (c) => !allSummaries.has(c.id)
  ).length;

  const insertSettled = await Promise.allSettled(
    indexedCandidates
      .filter(({ id }) => allSummaries.has(id))
      .map(async ({ id, source, item }) => {
        const summary = allSummaries.get(id)!;
        const row: ArticleRow = {
          title: item.title,
          title_he: summary.title_he,
          summary_he: summary.summary_he,
          url: item.url,
          source: source.name,
          category: source.category,
          published_at: item.publishedAt ? item.publishedAt.toISOString() : null,
          fetched_at: fetchedAt,
          image_url: item.imageUrl,
        };
        const success = await insertArticle(row);
        if (success) console.log(`[fetch] ✓ Inserted: "${summary.title_he}"`);
        return success;
      })
  );
  insertedCount = insertSettled.filter((r) => r.status === 'fulfilled' && r.value).length;

  // ── Step 5: Prune old articles ────────────────────────────────────────────

  await pruneOldArticles();

  // ── Step 6: Final summary ─────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(
    `[fetch] Done. Inserted ${insertedCount} articles, skipped ${skippedCount} duplicates, dropped ${summarizationFailures} (summarization failed).`
  );
  console.log(`[fetch] Total time: ${elapsed}s`);
  console.log(`${'='.repeat(60)}\n`);
  process.exit(0);
}

// Entry point
main().catch((err) => {
  console.error('[fetch] Fatal error:', err);
  process.exit(1);
});
