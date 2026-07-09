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
 *   SUPABASE_AGENT_KEY   ← JWT signed for the newshub_agent Postgres role (see
 *                          supabase/migrations/003_editorial_agent.sql for how to mint it)
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
import Anthropic from '@anthropic-ai/sdk';
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
  model: 'claude-sonnet-5',
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
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const agentKey = process.env.SUPABASE_AGENT_KEY;

  if (!url) {
    fatal('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!anonKey) {
    fatal(
      'Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
        'The anon key is required as the gateway `apikey`; the restricted-role ' +
        'JWT alone is rejected before it ever reaches PostgREST.'
    );
  }
  if (!agentKey) {
    fatal(
      'Missing environment variable: SUPABASE_AGENT_KEY\n' +
        'This must be a JWT signed with {"role":"newshub_agent","iss":"supabase"} — ' +
        'see supabase/migrations/003_editorial_agent.sql for how to mint it. ' +
        'Do NOT use the service role key here.'
    );
  }

  // apikey = anon key (validated by the Supabase gateway); Authorization =
  // the newshub_agent JWT, whose `role` claim is what PostgREST uses to
  // SET ROLE — this is the documented pattern for custom Postgres roles.
  return createClient(url as string, anonKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${agentKey}` } },
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

const SELECTION_SCHEMA = {
  type: 'object',
  properties: {
    chosen: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    supporting_urls: {
      type: 'array',
      items: { type: 'string' },
    },
    runner_ups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['url', 'note'],
        additionalProperties: false,
      },
    },
    reasoning_he: { type: 'string' },
  },
  required: ['chosen', 'supporting_urls', 'runner_ups', 'reasoning_he'],
  additionalProperties: false,
} as const;

const COLUMN_SCHEMA = {
  type: 'object',
  properties: {
    title_he: { type: 'string' },
    body_he: { type: 'string' },
    source_refs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
    memory_update: { type: 'string' },
  },
  required: ['title_he', 'body_he', 'source_refs', 'memory_update'],
  additionalProperties: false,
} as const;

function extractTextBlock(response: Anthropic.Messages.Message): string {
  const textBlock = response.content.find(
    (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
  );
  if (!textBlock) {
    fatal('Claude response contained no text block to parse.');
  }
  return textBlock.text;
}

function checkStopReason(response: Anthropic.Messages.Message, label: string): void {
  if (response.stop_reason === 'refusal') {
    fatal(`Claude refused during ${label}.`);
  }
  if (response.stop_reason === 'max_tokens') {
    fatal(`Claude hit max_tokens during ${label} — response likely truncated.`);
  }
}

async function selectStory(
  client: Anthropic,
  constitution: string,
  memory: string,
  candidates: ArticleCandidate[]
): Promise<SelectionResult> {
  const capped = candidates.slice(0, CONFIG.maxCandidatesToModel);

  const system = `${constitution}\n\n---\n\nזיכרון מהרצות קודמות (אם קיים):\n${
    memory || '(אין זיכרון קודם — זו אחת ההרצות הראשונות)'
  }`;

  const userContent =
    `להלן ${capped.length} מועמדים לסיפור המוביל של היום, מתוך 24 השעות האחרונות. ` +
    `בחר סיפור אחד לכתיבת טור פרשנות, וכן עד 2 מאמרים תומכים (supporting_urls) ` +
    `שדנים באותו נושא ויכולים לשמש כמקור נוסף. הסבר את הבחירה בעברית (reasoning_he), ` +
    `ורשום גם כמה "מועמדים שכמעט נבחרו" (runner_ups) עם הערה קצרה לכל אחד.\n\n` +
    capped.map(candidateLine).join('\n\n---\n\n');

  const response = await client.messages.create({
    model: CONFIG.model,
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: userContent }],
    output_config: {
      format: { type: 'json_schema', schema: SELECTION_SCHEMA },
    },
  } as Anthropic.Messages.MessageCreateParamsNonStreaming);

  checkStopReason(response, 'story selection (call #1)');
  const text = extractTextBlock(response);

  let parsed: SelectionResult;
  try {
    parsed = JSON.parse(text) as SelectionResult;
  } catch (err) {
    fatal('Failed to parse JSON from story-selection response.', err);
  }
  return parsed!;
}

async function writeColumn(
  client: Anthropic,
  constitution: string,
  memory: string,
  chosen: ArticleCandidate,
  chosenFullText: string,
  supporting: { candidate: ArticleCandidate; fullText: string }[]
): Promise<ColumnResult> {
  const system = `${constitution}\n\n---\n\nזיכרון מהרצות קודמות (אם קיים):\n${
    memory || '(אין זיכרון קודם — זו אחת ההרצות הראשונות)'
  }`;

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

  const response = await client.messages.create({
    model: CONFIG.model,
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: userContent }],
    output_config: {
      format: { type: 'json_schema', schema: COLUMN_SCHEMA },
    },
  } as Anthropic.Messages.MessageCreateParamsNonStreaming);

  checkStopReason(response, 'column writing (call #2)');
  const text = extractTextBlock(response);

  let parsed: ColumnResult;
  try {
    parsed = JSON.parse(text) as ColumnResult;
  } catch (err) {
    fatal('Failed to parse JSON from column-writing response.', err);
  }
  return parsed!;
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

  if (!process.env.ANTHROPIC_API_KEY) {
    fatal('Missing environment variable: ANTHROPIC_API_KEY');
  }

  const supabase = createAgentSupabaseClient();
  const anthropic = new Anthropic();

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
    selection = await selectStory(anthropic, constitution!, memory, candidates);
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
      anthropic,
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
