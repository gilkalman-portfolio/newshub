import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY     = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Free Models Router — OpenRouter picks whichever free model is available; never goes stale
const OPENROUTER_FALLBACK_MODEL = 'openrouter/free';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('resource_exhausted')
  );
}

async function callGemini(
  prompt: string,
  model: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const m = genAI.getGenerativeModel({
    model,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  });
  const result = await m.generateContent(prompt);
  return result.response.text().trim();
}

async function callOpenRouter(
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set — no fallback available');
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://newshub-ruby.vercel.app',
      'X-Title': 'NewsHUB',
    },
    body: JSON.stringify({
      model: OPENROUTER_FALLBACK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

/**
 * Generate text — tries Gemini first, falls back to OpenRouter on quota error (429).
 */
export async function generateText(
  prompt: string,
  opts: {
    geminiModel: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const temperature = opts.temperature ?? 0.5;
  const maxTokens   = opts.maxTokens   ?? 400;

  if (GEMINI_API_KEY) {
    try {
      const result = await callGemini(prompt, opts.geminiModel, temperature, maxTokens);
      if (result) return result;
      console.warn('[llm] Gemini returned empty response — falling back to OpenRouter');
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn('[llm] Gemini quota exceeded — falling back to OpenRouter');
      } else {
        throw err;
      }
    }
  } else {
    console.warn('[llm] GEMINI_API_KEY not set — using OpenRouter directly');
  }

  return await callOpenRouter(prompt, temperature, maxTokens);
}
