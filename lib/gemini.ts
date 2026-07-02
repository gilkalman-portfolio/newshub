import { generateText } from './llm';

const MODEL_ID = 'gemini-2.5-flash';
const LLM_TIMEOUT_MS        = 45_000; // attempt 1 — Gemini is fast, but a fallback to OpenRouter needs slack
const LLM_TIMEOUT_MS_RETRY  = 60_000; // attempt 2 — OpenRouter free/paid can be slow

export interface HebrewSummary {
  title_he: string;
  summary_he: string;
}

export interface BatchInput {
  id: number;
  title: string;
  content: string;
  source: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function isHebrew(text: string): boolean {
  const hebrewChars = (text.match(/[֐-׿]/g) ?? []).length;
  return hebrewChars / Math.max(text.length, 1) > 0.2;
}

function buildBatchPrompt(articles: BatchInput[]): string {
  const list = articles
    .map((a) => {
      const lang = isHebrew(a.title) ? '[עברית]' : '[EN]';
      return `[${a.id}]${lang} כותרת: ${a.title}\nמקור: ${a.source}\nתוכן: ${a.content.slice(0, 400)}`;
    })
    .join('\n\n');

  return `אתה עורך חדשות ישראלי עם קול חד וישיר.

${list}

לכל כתבה:
- [עברית]: קצר וסכם ב-2-3 משפטים בעברית, קול עיתונאי ישיר
- [EN]: תרגם וסכם לעברית ב-2-3 משפטים, קול עיתונאי ישיר

החזר JSON בלבד — ללא טקסט לפני או אחרי:
{"results":[{"id":<מספר>,"title_he":"<עד 10 מילים>","summary_he":"<2-3 משפטים>"}]}

חובה להחזיר תוצאה לכל ID.`;
}

/**
 * Recover complete result objects from a truncated/partial JSON response.
 * Scans char-by-char honouring JSON string escaping — so Hebrew gershayim
 * (e.g. צה"ל, ארה"ב) that appear escaped as \" inside a string do NOT break
 * extraction. Only the final incomplete object (if truncated) is dropped.
 */
function recoverResultObjects(text: string): unknown[] {
  const out: unknown[] = [];
  const resultsAt = text.indexOf('"results"');
  const from = resultsAt >= 0 ? text.indexOf('[', resultsAt) : 0;
  let i = from >= 0 ? from : 0;
  const n = text.length;

  while (i < n) {
    if (text[i] !== '{') { i++; continue; }

    let depth = 0, inStr = false, esc = false, j = i, closed = false;
    for (; j < n; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { j++; closed = true; break; } }
    }

    if (!closed) break; // truncated final object — stop
    try { out.push(JSON.parse(text.slice(i, j))); } catch {}
    i = j;
  }

  return out;
}

function extractItems(
  raw: string
): Array<{ id?: number; title_he?: string; summary_he?: string }> {
  // Strip code fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  // 1. Try full parse first
  try {
    const parsed = JSON.parse(cleaned) as { results?: unknown[] };
    if (Array.isArray(parsed.results)) return parsed.results as never[];
  } catch {}

  // 2. Model returned text before/after JSON — find the outermost {...}
  const jsonBlock = cleaned.match(/\{[\s\S]*\}/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[0]) as { results?: unknown[] };
      if (Array.isArray(parsed.results)) return parsed.results as never[];
    } catch {}
  }

  // 3. JSON truncated — recover complete objects via escaping-aware brace scan
  const recovered = recoverResultObjects(cleaned) as Array<{
    id?: number;
    title_he?: string;
    summary_he?: string;
  }>;
  if (recovered.length > 0) {
    console.warn(`[gemini] Partial JSON — recovered ${recovered.length} items via brace scan`);
    return recovered;
  }

  console.warn('[gemini] Batch parse failed — no usable JSON found in response');
  return [];
}

function parseBatchResponse(
  raw: string,
  expectedIds: number[]
): { results: Map<number, HebrewSummary>; missingIds: number[] } {
  const results = new Map<number, HebrewSummary>();

  for (const item of extractItems(raw)) {
    if (
      typeof item.id === 'number' &&
      typeof item.title_he === 'string' &&
      typeof item.summary_he === 'string' &&
      item.title_he.trim() &&
      item.summary_he.trim()
    ) {
      results.set(item.id, {
        title_he: item.title_he.trim(),
        summary_he: item.summary_he.trim(),
      });
    }
  }

  const missingIds = expectedIds.filter((id) => !results.has(id));
  return { results, missingIds };
}

export async function summarizeBatch(
  articles: BatchInput[],
  attempt: number
): Promise<{ results: Map<number, HebrewSummary>; failReasons: Map<number, string> }> {
  const failReasons = new Map<number, string>();

  if (articles.length === 0) return { results: new Map(), failReasons };

  const expectedIds = articles.map((a) => a.id);
  const prompt = buildBatchPrompt(articles);

  try {
    console.log(
      `[gemini] Batch attempt ${attempt}: ${articles.length} articles (ids: ${expectedIds.join(', ')})`
    );

    const raw = await withTimeout(
      generateText(prompt, {
        geminiModel: MODEL_ID,
        temperature: 0.4,
        maxTokens:   Math.min(500 * articles.length, 8192),
      }),
      attempt === 1 ? LLM_TIMEOUT_MS : LLM_TIMEOUT_MS_RETRY
    );

    const { results, missingIds } = parseBatchResponse(raw, expectedIds);

    missingIds.forEach((id) =>
      failReasons.set(id, `id=${id} missing or invalid in LLM response`)
    );

    return { results, failReasons };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    expectedIds.forEach((id) => failReasons.set(id, reason));
    return { results: new Map(), failReasons };
  }
}
