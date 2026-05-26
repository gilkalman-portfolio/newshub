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
