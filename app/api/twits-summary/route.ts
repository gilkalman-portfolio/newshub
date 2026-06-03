import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE    = 'https://openrouter.ai/api/v1';
const MODEL_ID           = 'google/gemini-2.5-flash';

export interface TwitsSummaryRequest {
  ticker: string;
  twits: Array<{
    body:      string;
    sentiment: 'Bullish' | 'Bearish' | null;
    createdAt: string;
    username:  string;
  }>;
}

export interface TwitsSummaryResponse {
  summary_he: string;
}

function buildPrompt(ticker: string, twits: TwitsSummaryRequest['twits']): string {
  const now = new Date();
  const lines = twits.map((t, i) => {
    const hoursAgo = Math.round((now.getTime() - new Date(t.createdAt).getTime()) / 3_600_000);
    const timeStr  = hoursAgo < 1 ? 'לפני פחות משעה' : `לפני ${hoursAgo} שעות`;
    const bull = t.sentiment === 'Bullish' ? '[Bullish]' : t.sentiment === 'Bearish' ? '[Bearish]' : '';
    return `${i + 1}. ${bull} @${t.username} (${timeStr}): ${t.body}`;
  }).join('\n');

  return `אתה אנליסט שוק הון ישראלי. קיבלת הודעות אחרונות מהקהילה ב-StockTwits על המניה ${ticker}.

הודעות:
${lines}

כתוב סיכום קצר בעברית (3-5 משפטים) שמתאר:
1. מה הסנטימנט הכללי של הקהילה כרגע (חיובי/שלילי/מעורב)
2. מה הנושאים העיקריים שעולים בדיון
3. האם יש טיעונים בולטים, יעדי מחיר, או חששות ספציפיים

כתוב בעברית ישירה, עיתונאית, ללא תחילית "לפי ניתוח" או "על פי הפוסטים". פשוט תאר מה קורה שם.`;
}

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY not set' }, { status: 500 });
  }

  let body: TwitsSummaryRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { ticker, twits } = body;
  if (!ticker || !twits?.length) {
    return NextResponse.json({ error: 'ticker and twits required' }, { status: 400 });
  }

  const prompt = buildPrompt(ticker, twits.slice(0, 20));

  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://newshub.vercel.app',
        'X-Title': 'NewsHUB',
      },
      body: JSON.stringify({
        model:       MODEL_ID,
        messages:    [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens:  400,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[twits-summary] OpenRouter error:', res.status, text);
      return NextResponse.json({ error: `OpenRouter ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const summary_he = data.choices[0]?.message?.content?.trim() ?? 'לא ניתן היה לסכם.';

    return NextResponse.json({ summary_he } satisfies TwitsSummaryResponse);
  } catch (err: any) {
    console.error('[twits-summary] fetch failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
