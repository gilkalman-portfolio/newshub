import { NextRequest, NextResponse } from 'next/server';
import { generateText } from '@/lib/llm';

const GEMINI_MODEL = 'gemini-2.0-flash';

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
    const summary_he = await generateText(prompt, {
      geminiModel: GEMINI_MODEL,
      temperature: 0.5,
      maxTokens:   600,
    }) || 'לא ניתן היה לסכם.';

    return NextResponse.json({ summary_he } satisfies TwitsSummaryResponse);
  } catch (err: any) {
    console.error('[twits-summary] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
