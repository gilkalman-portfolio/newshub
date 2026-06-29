import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error(
    'Missing environment variable: GEMINI_API_KEY\n' +
      'Get one at https://aistudio.google.com'
  );
}

const MODEL_ID = 'gemini-2.5-flash';
const LLM_TIMEOUT_MS = 30_000;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

function buildBatchPrompt(articles: BatchInput[]): string {
  const list = articles
    .map(
      (a) =>
        `[${a.id}] כותרת: ${a.title}\nמקור: ${a.source}\nתוכן: ${a.content.slice(0, 400)}`
    )
    .join('\n\n');

  return `אתה עורך חדשות ישראלי עם קול חד וישיר. תרגם וסכם כל כתבה לעברית.

${list}

החזר JSON בפורמט הבא בלבד:
{
  "results": [
    { "id": <מספר>, "title_he": "<תרגום קצר עד 10 מילים>", "summary_he": "<סיכום 2-3 משפטים בקול עיתונאי>" }
  ]
}

חובה להחזיר תוצאה לכל ID. כתוב בקול עיתונאי — ישיר, פעיל, עם זווית.`;
}

function parseBatchResponse(
  raw: string,
  expectedIds: number[]
): { results: Map<number, HebrewSummary>; missingIds: number[] } {
  const results = new Map<number, HebrewSummary>();

  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(cleaned) as {
      results?: Array<{ id?: number; title_he?: string; summary_he?: string }>;
    };

    if (!Array.isArray(parsed.results)) {
      throw new Error('Response missing "results" array');
    }

    for (const item of parsed.results) {
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
  } catch (err) {
    console.warn('[gemini] Batch parse failed:', err);
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

    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: Math.min(500 * articles.length, 8192),
      },
    });

    const raw = await withTimeout(
      model.generateContent(prompt).then((r) => r.response.text()),
      LLM_TIMEOUT_MS
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
