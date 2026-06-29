/**
 * lib/gemini.ts
 *
 * Gemini 2.5 Flash via OpenRouter — translates and summarises news articles into Hebrew.
 * Uses the existing OPENROUTER_API_KEY (no separate Gemini account needed).
 *
 * Exports:
 *   summarizeArticle(title, content, source) → { title_he, summary_he }
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  throw new Error(
    'Missing environment variable: OPENROUTER_API_KEY\n' +
      'Add it to your .env.local file.'
  );
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MODEL_ID = 'google/gemini-2.5-flash';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function buildPrompt(title: string, content: string, source: string): string {
  return `אתה עורך חדשות ישראלי עם קול חד וישיר. תפקידך: לתרגם ולסכם כתבות חדשות לעברית.

כתבה:
כותרת: ${title}
מקור: ${source}
תוכן: ${content}

החזר JSON בלבד עם שני שדות:
- title_he: תרגום קצר וחד של הכותרת לעברית (עד 10 מילים)
- summary_he: סיכום בעברית של 2-3 משפטים. כתוב בקול עיתונאי — ישיר, פעיל, עם זווית. לא "לפי הדיווח" ולא שפת הודעות לעיתונות. הבן מה חשוב כאן ואמור אותו בפתיחה.

דוגמה לסגנון summary_he: "המודל החדש לוקח משימות, מפרק אותן ומריץ כלים ללא השגחה. זה לא עוד assistant — זה agent שפועל. המירוץ על AGI הפרקטי מתחיל ברצינות."`;
}

function parseResponse(raw: string, fallbackTitle: string): HebrewSummary {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    if (
      typeof parsed.title_he === 'string' &&
      typeof parsed.summary_he === 'string'
    ) {
      return {
        title_he: parsed.title_he.trim(),
        summary_he: parsed.summary_he.trim(),
      };
    }

    throw new Error('Parsed object is missing required fields.');
  } catch (err) {
    console.warn('[gemini/openrouter] JSON parse failed, using fallback:', err);
    return {
      title_he: fallbackTitle,
      summary_he: 'לא ניתן היה לסכם את הכתבה.',
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Summarise a news article in Hebrew using Gemini 2.5 Flash (via OpenRouter).
 */
export async function summarizeArticle(
  title: string,
  content: string,
  source: string
): Promise<HebrewSummary> {
  const prompt = buildPrompt(title, content, source);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(
        `[gemini] Summarising (attempt ${attempt}): "${title.slice(0, 60)}…"`
      );

      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://newshub.vercel.app',
          'X-Title': 'NewsHUB',
        },
        body: JSON.stringify({
          model: MODEL_ID,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_tokens: 512,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error: ${response.status} ${await response.text()}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      const raw = data.choices[0]?.message?.content ?? '';

      return parseResponse(raw, title);
    } catch (err) {
      if (attempt === 1) {
        console.warn(
          `[gemini] Attempt ${attempt} failed for "${title.slice(0, 60)}…". Retrying in 2s…`,
          err
        );
        await sleep(2000);
      } else {
        console.error(
          `[gemini] Both attempts failed for "${title.slice(0, 60)}…". Using fallback.`,
          err
        );
        return {
          title_he: title,
          summary_he: 'לא ניתן היה לסכם את הכתבה.',
        };
      }
    }
  }

  return { title_he: title, summary_he: 'לא ניתן היה לסכם את הכתבה.' };
}

// ---------------------------------------------------------------------------
// Batch API
// ---------------------------------------------------------------------------

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

/**
 * Summarise a batch of articles in a single LLM call.
 * Returns a Map of id → HebrewSummary for successful items,
 * and a Map of id → reason string for failed items.
 */
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

    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://newshub.vercel.app',
        'X-Title': 'NewsHUB',
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: Math.min(300 * articles.length, 8192),
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      const reason = `HTTP ${response.status}: ${errText.slice(0, 120)}`;
      expectedIds.forEach((id) => failReasons.set(id, reason));
      return { results: new Map(), failReasons };
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const raw = data.choices[0]?.message?.content ?? '';

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
