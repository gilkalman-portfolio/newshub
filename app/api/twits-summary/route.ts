import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_ID = 'gemini-2.5-flash';

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
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
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig: { temperature: 0.5, maxOutputTokens: 400 },
    });

    const result = await model.generateContent(prompt);
    const summary_he = result.response.text().trim() || 'לא ניתן היה לסכם.';

    return NextResponse.json({ summary_he } satisfies TwitsSummaryResponse);
  } catch (err: any) {
    console.error('[twits-summary] Gemini error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
