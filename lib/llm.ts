import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY     = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Free models that handle Hebrew well — tried first to save credits.
// Non-reasoning models only: reasoning models (nemotron-3, gpt-oss) burn the
// max_tokens budget on hidden thinking and return truncated Hebrew content.
const OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'google/gemma-4-26b-a4b-it:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
];

// Paid fallback — reached ONLY when every free model is rate-limited/unavailable.
// Cheapest-first; both handle Hebrew. Prices per 1M tokens (in/out), verified 2026-07.
const OPENROUTER_PAID_MODELS = [
  'deepseek/deepseek-v4-flash',    // $0.09 / $0.18 — cheapest reliable
  'google/gemini-3.1-flash-lite',  // $0.25 / $1.50 — strong Hebrew, reliable backstop
];
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function isFallbackError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('resource_exhausted') ||
    msg.toLowerCase().includes('service unavailable') ||
    msg.toLowerCase().includes('high demand')
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

/**
 * Try a list of OpenRouter models in order. Returns the first non-empty
 * completion, or null if all failed (so the caller can escalate to the next
 * tier). `tier` is used only for logging.
 */
async function tryOpenRouterTier(
  models: string[],
  tier: 'free' | 'PAID',
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<{ text: string | null; lastError: string }> {
  let lastError = '';
  for (const model of models) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://newshub-ruby.vercel.app',
        'X-Title': 'NewsHUB',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      lastError = await res.text();
      console.warn(`[llm] OpenRouter[${tier}] ${model} failed (${res.status}) — trying next`);
      continue;
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    const text = choice?.message?.content?.trim() ?? '';
    // Reasoning models can hit max_tokens mid-thought and return a stub like
    // "הקהילה ב-". Reject truncated output when reasoning ate the budget.
    const truncated =
      choice?.finish_reason === 'length' &&
      (choice?.message?.reasoning || text.length < 80);
    if (text && !truncated) {
      console.log(`[llm] OpenRouter[${tier}] success: ${model}`);
      return { text, lastError };
    }
    lastError = truncated ? `truncated output from ${model}` : lastError;
    console.warn(
      `[llm] OpenRouter[${tier}] ${model} returned ${truncated ? 'truncated' : 'empty'} output — trying next`
    );
  }
  return { text: null, lastError };
}

async function callOpenRouter(
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set — no fallback available');

  // Tier 1: free models (save credits).
  const free = await tryOpenRouterTier(OPENROUTER_FREE_MODELS, 'free', prompt, temperature, maxTokens);
  if (free.text) return free.text;

  // Tier 2: cheapest paid models — only when every free model is exhausted.
  console.warn('[llm] All free models exhausted — escalating to PAID models (cost incurred)');
  const paid = await tryOpenRouterTier(OPENROUTER_PAID_MODELS, 'PAID', prompt, temperature, maxTokens);
  if (paid.text) return paid.text;

  const lastError = paid.lastError || free.lastError;
  throw new Error(`All OpenRouter models (free + paid) failed. Last error: ${lastError.slice(0, 200)}`);
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
      if (isFallbackError(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[llm] Gemini unavailable (${msg.slice(0, 140)}) — falling back to OpenRouter`);
      } else {
        throw err;
      }
    }
  } else {
    console.warn('[llm] GEMINI_API_KEY not set — using OpenRouter directly');
  }

  return await callOpenRouter(prompt, temperature, maxTokens);
}
