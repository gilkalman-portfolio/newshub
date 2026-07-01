import { generateText } from './llm';

const MODEL_ID = 'gemini-2.5-flash';
const LLM_TIMEOUT_MS        = 30_000; // attempt 1 — Gemini is fast
const LLM_TIMEOUT_MS_RETRY  = 60_000; // attempt 2 — OpenRouter free can be slow

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

  // 3. JSON truncated — extract individual result objects that parsed cleanly
  const recovered: Array<{ id?: number; title_he?: string; summary_he?: string }> = [];
  const itemRegex = /\{\s*"id"\s*:\s*(\d+)\s*,\s*"title_he"\s*:\s*"([^"\\]*)"\s*,\s*"summary_he"\s*:\s*"([^"\\]*)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(cleaned)) !== null) {
    recovered.push({ id: Number(m[1]), title_he: m[2], summary_he: m[3] });
  }
  if (recovered.length > 0) {
    console.warn(`[gemini] Partial JSON — recovered ${recovered.length} items via regex`);
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
