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
import type { RssSource, Category } from '../lib/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const CONFIG = {
  articlesPerSource: 3,   // fetch 3 articles per RSS source per run
  maxPerCategory: 40,     // store up to 40 articles per category per run
} as const;

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

/** Split an array into chunks of size `n`. */
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

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

  console.log(`\n[fetch] Candidate articles (${CONFIG.articlesPerSource} per source, max ${CONFIG.maxPerCategory}/category): ${candidates.length}`);

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

  // ── Step 4: Batch-summarise all new articles, then insert ─────────────────

  const BATCH_SIZE = 10;
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

  // ── Attempt 1: all batches in parallel ───────────────────────────────────

  const batches = chunk(indexedCandidates, BATCH_SIZE);
  console.log(
    `\n[fetch] Summarising ${newCandidates.length} articles in ${batches.length} parallel batches (attempt 1)…`
  );

  const attempt1Settled = await Promise.allSettled(
    batches.map((batch) => summarizeBatch(batch.map(toBatchInput), 1))
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

  // ── Insert all successfully summarised articles ───────────────────────────

  const summarizationFailures = indexedCandidates.filter(
    (c) => !allSummaries.has(c.id)
  ).length;

  for (const { id, source, item } of indexedCandidates) {
    const summary = allSummaries.get(id);
    if (!summary) continue;

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
    if (success) {
      console.log(`[fetch] ✓ Inserted: "${summary.title_he}"`);
      insertedCount++;
    }
  }

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
}

// Entry point
main().catch((err) => {
  console.error('[fetch] Fatal error:', err);
  process.exit(1);
});
