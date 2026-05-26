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

// Load .env.local automatically when running via tsx outside of Next.js
import 'dotenv/config';

import { supabaseAdmin } from '../lib/supabase';
import { summarizeArticle } from '../lib/gemini';
import { RSS_SOURCES, fetchFeed, type FeedItem } from '../lib/rss';
import type { RssSource, Category } from '../lib/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Delay between consecutive Gemini API calls to avoid rate-limit errors. */
const GEMINI_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingArticle {
  source: RssSource;
  item: FeedItem;
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

/** Sleep for `ms` milliseconds. */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check which URLs from a given list already exist in the `articles` table.
 * Returns a Set of existing URLs for O(1) lookups.
 */
async function getExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();

  const { data, error } = await supabaseAdmin
    .from('articles')
    .select('url')
    .in('url', urls);

  if (error) {
    console.error('[fetch] Failed to query existing URLs:', error.message);
    return new Set(); // Treat as empty — worst case we attempt re-insert (PK will reject)
  }

  return new Set((data ?? []).map((row: { url: string }) => row.url));
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
  console.log(`${'='.repeat(60)}\n`);

  // ── Step 1: Fetch all RSS feeds in parallel ───────────────────────────────

  console.log('[fetch] Fetching all RSS feeds in parallel…\n');

  const feedResults = await Promise.allSettled(
    RSS_SOURCES.map((source) =>
      fetchFeed(source).then((items) => ({ source, items }))
    )
  );

  // ── Step 2: Collect the top-1 candidate item per source ──────────────────
  //
  // Strategy: take only the single most-recent item per source.
  // This keeps ~1 article per source (~25 total across 25 sources)
  // and ensures diversity across outlets.

  const candidates: PendingArticle[] = [];

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

    // Take only the single most-recent item
    const topItem = items[0];

    if (!topItem.url) {
      console.warn(`[fetch] Top item from "${source.name}" has no URL — skipping.`);
      continue;
    }

    candidates.push({ source, item: topItem });
  }

  console.log(`\n[fetch] Candidate articles (1 per source): ${candidates.length}`);

  // ── Step 3: Dedup against Supabase ───────────────────────────────────────

  const allUrls = candidates.map((c) => c.item.url);
  const existingUrls = await getExistingUrls(allUrls);

  const newCandidates = candidates.filter(
    ({ item }) => !existingUrls.has(item.url)
  );
  const skippedCount = candidates.length - newCandidates.length;

  console.log(
    `[fetch] After dedup: ${newCandidates.length} new, ${skippedCount} duplicates skipped.\n`
  );

  if (newCandidates.length === 0) {
    console.log('[fetch] Nothing new to insert.');
    await pruneOldArticles();
    console.log('\n[fetch] Done. Inserted 0 articles, skipped all as duplicates.');
    return;
  }

  // ── Step 4: Summarise and insert each new article ─────────────────────────

  let insertedCount = 0;
  const fetchedAt = new Date().toISOString();

  for (let i = 0; i < newCandidates.length; i++) {
    const { source, item } = newCandidates[i];

    console.log(
      `[fetch] Processing ${i + 1}/${newCandidates.length}: "${item.title.slice(0, 70)}"`
    );

    try {
      // Summarise via Gemini (includes its own retry logic)
      const { title_he, summary_he } = await summarizeArticle(
        item.title,
        item.content,
        source.name
      );

      // Build the database row
      const row: ArticleRow = {
        title: item.title,
        title_he,
        summary_he,
        url: item.url,
        source: source.name,
        category: source.category,
        published_at: item.publishedAt ? item.publishedAt.toISOString() : null,
        fetched_at: fetchedAt,
        image_url: item.imageUrl,
      };

      const success = await insertArticle(row);

      if (success) {
        insertedCount++;
        console.log(`[fetch]   ✓ Inserted: "${title_he}"`);
      }
    } catch (err) {
      // Catch any unexpected error so one bad article doesn't halt the run
      console.error(
        `[fetch]   ✗ Unexpected error for "${item.title.slice(0, 50)}…":`,
        err
      );
    }

    // Rate-limit guard between Gemini calls (skip delay after the last item)
    if (i < newCandidates.length - 1) {
      await sleep(GEMINI_DELAY_MS);
    }
  }

  // ── Step 5: Prune old articles ────────────────────────────────────────────

  await pruneOldArticles();

  // ── Step 6: Final summary ─────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(
    `[fetch] Done. Inserted ${insertedCount} articles, skipped ${skippedCount} duplicates.`
  );
  console.log(`[fetch] Total time: ${elapsed}s`);
  console.log(`${'='.repeat(60)}\n`);
}

// Entry point
main().catch((err) => {
  console.error('[fetch] Fatal error:', err);
  process.exit(1);
});
