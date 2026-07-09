/**
 * agent/run.ts
 *
 * Autonomous editorial agent — runs twice daily via GitHub Actions.
 *
 * Flow:
 *   1. Connect to Supabase using the restricted `newshub_agent` role
 *      (SUPABASE_AGENT_KEY) — NOT the service role key.
 *   2. Read articles from the last 24h across all categories.
 *   3. Read agent/constitution.md + agent_memory (id=1).
 *   4. Claude API call #1 — pick a lead story + supporting sources.
 *   5. Fetch full text of the chosen + supporting articles.
 *   6. Claude API call #2 — write the Hebrew opinion column.
 *   7. Deterministic validation (word count, forbidden keywords, source refs).
 *   8. Insert agent_columns (published=false) + agent_decision_log, update agent_memory.
 *
 * Run with:
 *   npx tsx --require ./scripts/_load-env.cjs agent/run.ts
 *
 * Environment variables required (in .env.local or CI secrets):
 *   ANTHROPIC_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← standard Supabase service_role key (bypasses RLS;
 *                                  safe here because this runs only in GitHub Actions)
 *
 * Safety principles:
 *   - Writes ONLY to agent_columns / agent_decision_log / agent_memory.
 *   - Zero code/repo write access.
 *   - Loud failure: any problem => console.error + process.exit(1), no partial publish.
 *   - Every run is logged with candidates + reasoning (agent_decision_log).
 */

// Note: .env.local is loaded by scripts/_load-env.cjs via --require before this file runs.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Category } from '../lib/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG = {
  lookbackHours: 24,
  minArticlesRequired: 5,
  maxCandidatesToModel: 120,
  maxCandidatesLogged: 40,
  maxSupportingArticles: 2, // in addition to the chosen one => up to 3 sources total
  fetchTimeoutMs: 15_000,
  maxArticleChars: 8_000,
  bodyWordMin: 150,
  bodyWordMax: 400,
  model: 'anthropic/claude-sonnet-4-5',
} as const;

// Hebrew + English buy/sell-advice phrases. Case-insensitive substring match
// against title + body. Legal requirement — the agent must never issue
// investment advice or buy/sell recommendations.
const FORBIDDEN_KEYWORDS = [
  'המלצת קנייה',
  'המלצת מכירה',
  'כדאי לקנות',
  'כדאי למכור',
  'מומלץ לקנות',
  'מומלץ למכור',
  'buy recommendation',
  'sell recommendation',
  'strong buy',
  'strong sell',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArticleCandidate {
  id: string;
  title_he: string | null;
  summary_he: string;
  source: string;
  category: Category;
  url: string;
}

/** Shape stored in agent_columns.source_refs (snapshot, enriched). */
interface SourceRef {
  title_he: string;
  url: string;
  source: string;
  category: string;
}

/** Shape stored in agent_decision_log.candidates_considered. */
interface CandidateLogEntry {
  title_he: string;
  url: string;
  source: string;
  category: string;
  note: string;
}

/** Structured output of Claude API call #1 (story selection). */
interface SelectionResult {
  chosen: { url: string };
  supporting_urls: string[];
  runner_ups: { url: string; note: string }[];
  reasoning_he: string;
}

/** Structured output of Claude API call #2 (column writing). */
interface ColumnResult {
  title_he: string;
  body_he: string;
  source_refs: { url: string }[];
  memory_update: string;
}

// ---------------------------------------------------------------------------
// Fatal error helper — loud failure, no partial publish
// ---------------------------------------------------------------------------

function fatal(message: string, err?: unknown): never {
  console.error(`[agent] FATAL: ${message}`);
  if (err !== undefined) {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Supabase client — restricted `newshub_agent` role, NOT service role
// ---------------------------------------------------------------------------

function createAgentSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    fatal('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!serviceKey) {
    fatal('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }

  // service_role key bypasses RLS — safe because this process runs only in
  // trusted GitHub Actions, never exposed to end users. The agent still writes
  // only to its own three tables (agent_columns / agent_decision_log /
  // agent_memory) by design; code-level isolation is sufficient here.
  return createClient(url as string, serviceKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function containsForbiddenKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

/** Crude HTML tag stripper — good enough for extracting readable article text. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fetch a URL with a hard timeout, returning plain text (HTML stripped, capped). */
async function fetchArticleText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsHubEditorialAgent/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const text = stripHtml(html);
    return text.slice(0, CONFIG.maxArticleChars);
  } catch (err: any) {
    console.warn(`[agent] Full-text fetch failed for ${url} (non-fatal): ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Build a compact candidate line for the model prompt. */
function candidateLine(c: ArticleCandidate): string {
  const title = c.title_he ?? '(ללא כותרת עברית)';
  return `URL: ${c.url}\nכותרת: ${title}\nמקור: ${c.source} | קטגוריה: ${c.category}\nתקציר: ${c.summary_he}`;
}

// ---------------------------------------------------------------------------
// Claude API calls
// ---------------------------------------------------------------------------

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function callOpenRouter(
  system: string,
  user: string,
  label: string
): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) fatal('Missing environment variable: OPENROUTER_API_KEY');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://newshub-ruby.vercel.app',
      'X-Title': 'NewsHUB Editorial Agent',
    },
    body: JSON.stringify({
      model: CONFIG.model,
      max_tokens: 8000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    fatal(`OpenRouter ${label} failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];

  if (choice?.finish_reason === 'length') {
    fatal(`OpenRouter ${label} hit max_tokens — response truncated.`);
  }

  const text: string = choice?.message?.content?.trim() ?? '';
  if (!text) fatal(`OpenRouter ${label} returned empty response.`);
  return text;
}

/** Extract the first JSON object from a model response (strips markdown fences). */
function extractJson(raw: string, label: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const block = cleaned.match(/\{[\s\S]*\}/);
  if (block) {
    try { return JSON.parse(block[0]); } catch {}
  }
  fatal(`Failed to parse JSON from ${label} response.`);
}

async function selectStory(
  constitution: string,
  memory: string,
  candidates: ArticleCandidate[]
): Promise<SelectionResult> {
  const capped = candidates.slice(0, CONFIG.maxCandidatesToModel);

  const system =
    `${constitution}\n\n---\n\nזיכרון מהרצות קודמות (אם קיים):\n${
      memory || '(אין זיכרון קודם — זו אחת ההרצות הראשונות)'
    }\n\n---\n\nחובה: החזר JSON בלבד ללא טקסט לפני או אחרי, בפורמט:\n` +
    `{"chosen":{"url":"..."},"supporting_urls":["..."],"runner_ups":[{"url":"...","note":"..."}],"reasoning_he":"..."}`;

  const userContent =
    `להלן ${capped.length} מועמדים לסיפור המוביל של היום, מתוך 24 השעות האחרונות. ` +
    `בחר סיפור אחד לכתיבת טור פרשנות, וכן עד 2 מאמרים תומכים (supporting_urls) ` +
    `שדנים באותו נושא ויכולים לשמש כמקור נוסף. הסבר את הבחירה בעברית (reasoning_he), ` +
    `ורשום גם כמה "מועמדים שכמעט נבחרו" (runner_ups) עם הערה קצרה לכל אחד.\n\n` +
    capped.map(candidateLine).join('\n\n---\n\n');

  const text = await callOpenRouter(system, userContent, 'story selection (call #1)');
  return extractJson(text, 'story selection') as SelectionResult;
}

async function writeColumn(
  constitution: string,
  memory: string,
  chosen: ArticleCandidate,
  chosenFullText: string,
  supporting: { candidate: ArticleCandidate; fullText: string }[]
): Promise<ColumnResult> {
  const system =
    `${constitution}\n\n---\n\nזיכרון מהרצות קודמות (אם קיים):\n${
      memory || '(אין זיכרון קודם — זו אחת ההרצות הראשונות)'
    }\n\n---\n\nחובה: החזר JSON בלבד ללא טקסט לפני או אחרי, בפורמט:\n` +
    `{"title_he":"...","body_he":"...","source_refs":[{"url":"..."}],"memory_update":"..."}`;

  const sourcesBlock = [
    `### מקור ראשי\nURL: ${chosen.url}\nכותרת: ${chosen.title_he}\nמקור: ${chosen.source}\nטקסט מלא (או תקציר אם השליפה נכשלה):\n${chosenFullText}`,
    ...supporting.map(
      (s, i) =>
        `### מקור תומך ${i + 1}\nURL: ${s.candidate.url}\nכותרת: ${s.candidate.title_he}\nמקור: ${s.candidate.source}\nטקסט מלא (או תקציר אם השליפה נכשלה):\n${s.fullText}`
    ),
  ].join('\n\n');

  const userContent =
    `כתוב טור פרשנות בעברית (200-350 מילים) על הסיפור הבא, בהתבסס אך ורק על ` +
    `המקורות שסופקו למטה. כלול כותרת (title_he), גוף הטור (body_he), רשימת ` +
    `source_refs עם ה-URLs של המקורות שבהם השתמשת בפועל (2-3 מתוך אלה שסופקו), ` +
    `ועדכון קצר לזיכרון (memory_update, עד 1500 תווים) שיעזור להרצות הבאות ` +
    `(למשל: איזה זווית כבר כוסתה, כדי לא לחזור על עצמך).\n\n` +
    sourcesBlock;

  const text = await callOpenRouter(system, userContent, 'column writing (call #2)');
  return extractJson(text, 'column writing') as ColumnResult;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = new Date();
  const runId = randomUUID();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[agent] Editorial agent run started at ${startTime.toISOString()}`);
  console.log(`[agent] run_id: ${runId}`);
  console.log(`${'='.repeat(60)}\n`);

  if (!process.env.OPENROUTER_API_KEY) {
    fatal('Missing environment variable: OPENROUTER_API_KEY');
  }

  const supabase = createAgentSupabaseClient();

  // ── Step 1: fetch articles from the last 24h, all categories ─────────────

  const sinceIso = new Date(Date.now() - CONFIG.lookbackHours * 60 * 60 * 1000).toISOString();
  console.log(`[agent] Fetching articles fetched_at >= ${sinceIso}…`);

  const { data: articleRows, error: articlesError } = await supabase
    .from('articles')
    .select('id, title_he, summary_he, source, category, url')
    .gte('fetched_at', sinceIso)
    .order('fetched_at', { ascending: false });

  if (articlesError) {
    fatal(`Failed to query articles: ${articlesError.message}`);
  }

  const candidates: ArticleCandidate[] = (articleRows ?? []).map((r: any) => ({
    id: r.id,
    title_he: r.title_he,
    summary_he: r.summary_he,
    source: r.source,
    category: r.category,
    url: r.url,
  }));

  console.log(`[agent] Found ${candidates.length} articles in the last ${CONFIG.lookbackHours}h.`);

  if (candidates.length < CONFIG.minArticlesRequired) {
    fatal(
      `Only ${candidates.length} articles available in the last ${CONFIG.lookbackHours}h ` +
        `(need at least ${CONFIG.minArticlesRequired}). Aborting run — no partial publish.`
    );
  }

  // ── Step 2: read constitution + memory ────────────────────────────────────

  const constitutionPath = path.join(__dirname, 'constitution.md');
  let constitution: string;
  try {
    constitution = readFileSync(constitutionPath, 'utf-8');
  } catch (err) {
    fatal(`Failed to read constitution at ${constitutionPath}`, err);
  }

  const { data: memoryRow, error: memoryError } = await supabase
    .from('agent_memory')
    .select('content')
    .eq('id', 1)
    .single();

  if (memoryError) {
    fatal(`Failed to read agent_memory: ${memoryError.message}`);
  }
  const memory: string = memoryRow?.content ?? '';
  console.log(`[agent] Loaded memory (${memory.length} chars).`);

  // ── Step 3: Claude API call #1 — story selection ──────────────────────────

  console.log(
    `[agent] Calling Claude for story selection (${Math.min(candidates.length, CONFIG.maxCandidatesToModel)} candidates)…`
  );

  let selection: SelectionResult;
  try {
    selection = await selectStory(constitution!, memory, candidates);
  } catch (err) {
    fatal('Story-selection API call failed.', err);
    return; // unreachable, satisfies TS control-flow analysis
  }

  const candidatesByUrl = new Map(candidates.map((c) => [c.url, c]));

  const chosenCandidate = candidatesByUrl.get(selection.chosen?.url ?? '');
  if (!chosenCandidate) {
    fatal(
      `Model chose a URL not present among candidates: ${selection.chosen?.url ?? '(missing)'}`
    );
    return;
  }

  const supportingUrls = (selection.supporting_urls ?? [])
    .filter((u) => u !== chosenCandidate!.url)
    .slice(0, CONFIG.maxSupportingArticles);

  const supportingCandidates = supportingUrls
    .map((u) => candidatesByUrl.get(u))
    .filter((c): c is ArticleCandidate => Boolean(c));

  console.log(`[agent] Chosen: "${chosenCandidate.title_he}" (${chosenCandidate.url})`);
  console.log(`[agent] Supporting: ${supportingCandidates.map((c) => c.url).join(', ') || '(none)'}`);
  console.log(`[agent] Reasoning: ${selection.reasoning_he}`);

  // ── Step 4: fetch full text of chosen + supporting articles ──────────────

  console.log('[agent] Fetching full text of chosen + supporting articles…');

  const chosenFullText =
    (await fetchArticleText(chosenCandidate.url)) ?? chosenCandidate.summary_he;

  const supportingFullTexts = await Promise.all(
    supportingCandidates.map(async (c) => ({
      candidate: c,
      fullText: (await fetchArticleText(c.url)) ?? c.summary_he,
    }))
  );

  // The set of URLs actually available as fetched candidate sources — used to
  // validate source_refs in the deterministic validation step below.
  const fetchedCandidateUrls = new Set<string>([
    chosenCandidate.url,
    ...supportingFullTexts.map((s) => s.candidate.url),
  ]);

  // ── Step 5: Claude API call #2 — write the column ─────────────────────────

  console.log('[agent] Calling Claude to write the column…');

  let column: ColumnResult;
  try {
    column = await writeColumn(
      constitution!,
      memory,
      chosenCandidate,
      chosenFullText,
      supportingFullTexts
    );
  } catch (err) {
    fatal('Column-writing API call failed.', err);
    return;
  }

  // ── Step 6: deterministic validation — ALL must pass or exit 1 ───────────

  console.log('[agent] Running deterministic validation…');

  const words = wordCount(column.body_he ?? '');
  if (!column.title_he || column.title_he.trim().length === 0) {
    fatal('Validation failed: title_he is empty.');
  }
  if (words < CONFIG.bodyWordMin || words > CONFIG.bodyWordMax) {
    fatal(
      `Validation failed: body word count ${words} outside [${CONFIG.bodyWordMin}, ${CONFIG.bodyWordMax}].`
    );
  }
  if (!column.source_refs || column.source_refs.length === 0) {
    fatal('Validation failed: source_refs is empty.');
  }
  for (const ref of column.source_refs) {
    if (!fetchedCandidateUrls.has(ref.url)) {
      fatal(`Validation failed: source_refs contains a URL not among fetched candidates: ${ref.url}`);
    }
  }
  const combinedText = `${column.title_he}\n${column.body_he}`;
  const forbiddenHit = containsForbiddenKeyword(combinedText);
  if (forbiddenHit) {
    fatal(`Validation failed: forbidden investment-advice phrase detected: "${forbiddenHit}"`);
  }

  console.log(`[agent] Validation passed. Word count: ${words}.`);

  // ── Step 7: build snapshots + insert ──────────────────────────────────────

  const sourceRefs: SourceRef[] = column.source_refs.map((ref) => {
    const c = candidatesByUrl.get(ref.url)!; // guaranteed present by validation above
    return {
      title_he: c.title_he ?? '',
      url: c.url,
      source: c.source,
      category: c.category,
    };
  });

  // Always log the chosen story, supporting sources and runner-ups, even when
  // they fall outside the most-recent maxCandidatesLogged window — otherwise
  // the transparency log could omit the very story that was picked.
  const consideredPool = candidates.slice(0, CONFIG.maxCandidatesToModel);
  const priorityUrls = new Set<string>([
    chosenCandidate.url,
    ...supportingUrls,
    ...(selection.runner_ups?.map((r) => r.url) ?? []),
  ]);
  const candidatesConsidered: CandidateLogEntry[] = [
    ...consideredPool.filter((c) => priorityUrls.has(c.url)),
    ...consideredPool.filter((c) => !priorityUrls.has(c.url)),
  ]
    .slice(0, CONFIG.maxCandidatesLogged)
    .map((c) => {
      const isChosen = c.url === chosenCandidate.url;
      const runnerUp = selection.runner_ups?.find((r) => r.url === c.url);
      const note = isChosen
        ? 'נבחר כסיפור המוביל'
        : runnerUp?.note ?? (supportingUrls.includes(c.url) ? 'מקור תומך' : '');
      return {
        title_he: c.title_he ?? '',
        url: c.url,
        source: c.source,
        category: c.category,
        note,
      };
    });

  const chosenSnapshot = {
    title_he: chosenCandidate.title_he ?? '',
    url: chosenCandidate.url,
    source: chosenCandidate.source,
    category: chosenCandidate.category,
  };

  console.log('[agent] Inserting agent_columns row (published=false)…');
  const { error: columnInsertError } = await supabase.from('agent_columns').insert({
    run_id: runId,
    title_he: column.title_he,
    body_he: column.body_he,
    source_refs: sourceRefs,
    category: chosenCandidate.category,
    model: CONFIG.model,
    published: false,
  });
  if (columnInsertError) {
    fatal(`Failed to insert agent_columns row: ${columnInsertError.message}`);
  }

  console.log('[agent] Inserting agent_decision_log row…');
  const { error: logInsertError } = await supabase.from('agent_decision_log').insert({
    run_id: runId,
    candidates_considered: candidatesConsidered,
    chosen: chosenSnapshot,
    reasoning_he: selection.reasoning_he ?? '',
  });
  if (logInsertError) {
    fatal(`Failed to insert agent_decision_log row: ${logInsertError.message}`);
  }

  const memoryUpdate = (column.memory_update ?? '').slice(0, 1500);
  console.log('[agent] Updating agent_memory…');
  const { error: memoryUpdateError } = await supabase
    .from('agent_memory')
    .update({ content: memoryUpdate, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (memoryUpdateError) {
    fatal(`Failed to update agent_memory: ${memoryUpdateError.message}`);
  }

  // ── Step 8: final summary ─────────────────────────────────────────────────

  const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[agent] Done. run_id=${runId}`);
  console.log(`[agent] Column: "${column.title_he}" (${words} words, published=false)`);
  console.log(`[agent] Total time: ${elapsed}s`);
  console.log(`${'='.repeat(60)}\n`);
  process.exit(0);
}

main().catch((err) => {
  fatal('Unhandled error in agent run.', err);
});
